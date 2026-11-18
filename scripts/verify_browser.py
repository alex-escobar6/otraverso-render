from __future__ import annotations

import base64
import json
import os
import socket
import struct
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHROME = "/usr/bin/google-chrome"


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def recv_exact(sock: socket.socket, size: int) -> bytes:
    data = b""
    while len(data) < size:
        chunk = sock.recv(size - len(data))
        if not chunk:
            raise RuntimeError("websocket cerrado")
        data += chunk
    return data


class WebSocket:
    def __init__(self, url: str) -> None:
        rest = url.split("://", 1)[1]
        authority, path = rest.split("/", 1)
        host, port = authority.split(":")
        self.sock = socket.create_connection((host, int(port)), timeout=15)
        key = base64.b64encode(os.urandom(16)).decode()
        request = (
            f"GET /{path} HTTP/1.1\r\nHost: {authority}\r\nUpgrade: websocket\r\n"
            f"Connection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n"
        )
        self.sock.sendall(request.encode())
        header = b""
        while b"\r\n\r\n" not in header:
            header += self.sock.recv(1)
        if b" 101 " not in header.split(b"\r\n", 1)[0]:
            raise RuntimeError("handshake websocket fallido")

    def send(self, payload: str, opcode: int = 1) -> None:
        data = payload.encode()
        size = len(data)
        if size < 126:
            head = bytes([0x80 | opcode, 0x80 | size])
        elif size < 65536:
            head = bytes([0x80 | opcode, 0x80 | 126]) + struct.pack("!H", size)
        else:
            head = bytes([0x80 | opcode, 0x80 | 127]) + struct.pack("!Q", size)
        mask = os.urandom(4)
        masked = bytes(byte ^ mask[index % 4] for index, byte in enumerate(data))
        self.sock.sendall(head + mask + masked)

    def receive(self) -> str:
        while True:
            first, second = recv_exact(self.sock, 2)
            opcode = first & 0x0F
            size = second & 0x7F
            if size == 126:
                size = struct.unpack("!H", recv_exact(self.sock, 2))[0]
            elif size == 127:
                size = struct.unpack("!Q", recv_exact(self.sock, 8))[0]
            mask = recv_exact(self.sock, 4) if second & 0x80 else None
            payload = recv_exact(self.sock, size)
            if mask:
                payload = bytes(byte ^ mask[index % 4] for index, byte in enumerate(payload))
            if opcode == 8:
                raise RuntimeError("websocket cerrado por el servidor")
            if opcode == 9:
                self.send("", 10)
                continue
            if opcode == 1:
                return payload.decode()

    def close(self) -> None:
        self.sock.close()


class CDP:
    def __init__(self, ws: WebSocket) -> None:
        self.ws = ws
        self.seq = 0
        self.events: list[dict] = []

    def send(self, method: str, params: dict | None = None) -> dict:
        self.seq += 1
        ident = self.seq
        self.ws.send(json.dumps({"id": ident, "method": method, "params": params or {}}))
        end = time.monotonic() + 15
        while time.monotonic() < end:
            message = json.loads(self.ws.receive())
            if message.get("id") == ident:
                if "error" in message:
                    raise RuntimeError(f"{method}: {message['error']}")
                return message.get("result", {})
            self.events.append(message)
        raise TimeoutError(method)

    def evaluate(self, expression: str) -> object:
        result = self.send("Runtime.evaluate", {
            "expression": expression,
            "returnByValue": True,
            "awaitPromise": True,
        })
        if "exceptionDetails" in result:
            raise RuntimeError(result["exceptionDetails"].get("text", "evaluation error"))
        return result.get("result", {}).get("value")

    def navigate(self, base: str, path: str = "/") -> None:
        self.send("Page.navigate", {"url": base + path + "?r=" + str(int(time.time() * 1000))})
        time.sleep(1.8)

    def errors(self) -> list[str]:
        found = []
        for event in self.events:
            method = event.get("method")
            params = event.get("params", {})
            if method == "Runtime.exceptionThrown":
                found.append(params.get("exceptionDetails", {}).get("text", "exception"))
            elif method == "Log.entryAdded":
                entry = params.get("entry", {})
                if entry.get("level") in ("error", "warning"):
                    found.append(entry.get("text", "log"))
            elif method == "Network.loadingFailed":
                found.append(params.get("errorText", "network"))
        return found


STATE = """(() => {
  const ui = document.querySelector('.galaxy-ui');
  const intro = document.querySelector('.galaxy-intro');
  const rect = intro.getBoundingClientRect();
  const cs = getComputedStyle(ui);
  return {
    camX: parseFloat(cs.getPropertyValue('--cam-x')) || 0,
    camY: parseFloat(cs.getPropertyValue('--cam-y')) || 0,
    camZ: parseFloat(cs.getPropertyValue('--cam-z')) || 1,
    introX: +rect.x.toFixed(2),
    introY: +rect.y.toFixed(2),
    objects: document.querySelectorAll('.explore-object').length,
    controls: document.querySelectorAll('[data-camera]').length,
    progress: document.querySelector('[data-discovery-progress]').textContent,
    live: document.querySelector('[data-discovery-live]').textContent,
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth
  };
})()"""

EMPTY_POINT = """(() => {
  for (const y of [180, 280, 380, 480, 560]) {
    for (const x of [1180, 1320, 980, 760]) {
      const el = document.elementFromPoint(x, y);
      if (!el || el.closest('a,button,.galaxy-intro,.galaxy-index,.galaxy-controls,.world-detail')) continue;
      return { x: x, y: y };
    }
  }
  return { x: 1180, y: 480 };
})()"""

FRAME_SAMPLE = """new Promise(resolve => {
  let frames = 0;
  const start = performance.now();
  function tick() {
    frames += 1;
    if (frames >= 40) resolve(performance.now() - start);
    else requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})"""


def wait_http(url: str, timeout: float = 12) -> None:
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        try:
            urllib.request.urlopen(url, timeout=0.5).read(1)
            return
        except Exception:
            time.sleep(0.2)
    raise RuntimeError("servidor no disponible: " + url)


def main() -> int:
    if not Path(CHROME).exists():
        print(json.dumps({"error": "Chrome no disponible en " + CHROME}, indent=2))
        return 2
    port = free_port()
    debug = free_port()
    base = f"http://127.0.0.1:{port}"
    profile = f"/tmp/opencode/chrome-verify-{os.getpid()}"
    server = subprocess.Popen(["python3", "scripts/serve.py"], cwd=str(ROOT),
                              env={**os.environ, "PORT": str(port)},
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    chrome = subprocess.Popen([
        CHROME, "--headless=new", f"--remote-debugging-port={debug}", f"--user-data-dir={profile}",
        "--no-first-run", "--disable-default-apps", "--disable-extensions", "--no-proxy-server",
        "--window-size=1440,900", "about:blank",
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    ws = None
    report: dict = {}
    try:
        wait_http(base + "/")
        wait_http(f"http://127.0.0.1:{debug}/json/version")
        targets = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{debug}/json").read())
        page = next(item for item in targets if item["type"] == "page")
        ws = WebSocket(page["webSocketDebuggerUrl"])
        cdp = CDP(ws)
        for domain in ("Runtime.enable", "Log.enable", "Page.enable", "Network.enable"):
            cdp.send(domain)
        cdp.send("Network.setCacheDisabled", {"cacheDisabled": True})
        cdp.navigate(base)

        initial = cdp.evaluate(STATE)
        point = cdp.evaluate(EMPTY_POINT)
        cdp.send("Input.dispatchMouseEvent", {"type": "mousePressed", "x": point["x"], "y": point["y"], "button": "left", "buttons": 1, "clickCount": 1})
        for step in range(1, 6):
            cdp.send("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": point["x"] + step * 24, "y": point["y"] + step * 6, "button": "left", "buttons": 1})
            time.sleep(0.05)
        cdp.send("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": point["x"] + 120, "y": point["y"] + 30, "button": "left", "buttons": 0, "clickCount": 1})
        time.sleep(0.6)
        after_drag = cdp.evaluate(STATE)

        cdp.send("Input.dispatchMouseEvent", {"type": "mouseWheel", "x": 720, "y": 420, "deltaX": 0, "deltaY": -360})
        time.sleep(0.6)
        after_wheel = cdp.evaluate(STATE)

        cdp.evaluate("document.querySelector('[data-camera=reset]').click()")
        time.sleep(0.8)
        after_reset = cdp.evaluate(STATE)

        cdp.evaluate("document.querySelector('.explore-object[data-object=beacon]').click()")
        time.sleep(0.25)
        after_discovery = cdp.evaluate(STATE)
        stored = cdp.evaluate("localStorage.getItem('otraverso.discoveries.v1')")

        cdp.evaluate("document.querySelector('.galaxy-index__item[data-dialog=whatif]').click()")
        time.sleep(0.5)
        dialog_open = cdp.evaluate("""(() => {
          const dialog = document.querySelector('.world-detail[data-dialog=whatif]');
          const trigger = document.querySelector('.galaxy-index__item[data-dialog=whatif]');
          return {
            hidden: dialog.hidden,
            expanded: trigger.getAttribute('aria-expanded'),
            focused: document.activeElement.className,
            camZ: parseFloat(getComputedStyle(document.querySelector('.galaxy-ui')).getPropertyValue('--cam-z')) || 1
          };
        })()""")
        cdp.send("Input.dispatchKeyEvent", {"type": "keyDown", "key": "Escape", "code": "Escape", "windowsVirtualKeyCode": 27})
        cdp.send("Input.dispatchKeyEvent", {"type": "keyUp", "key": "Escape", "code": "Escape", "windowsVirtualKeyCode": 27})
        time.sleep(0.6)
        dialog_closed = cdp.evaluate("""(() => {
          const dialog = document.querySelector('.world-detail[data-dialog=whatif]');
          const trigger = document.querySelector('.galaxy-index__item[data-dialog=whatif]');
          return { hidden: dialog.hidden, expanded: trigger.getAttribute('aria-expanded') };
        })()""")

        cdp.send("Emulation.setEmulatedMedia", {"features": [{"name": "prefers-reduced-motion", "value": "reduce"}]})
        time.sleep(0.3)
        reduced = cdp.evaluate("""(() => ({
          animation: getComputedStyle(document.querySelector('.galaxy-eyebrow')).animationName,
          introTransform: getComputedStyle(document.querySelector('.galaxy-intro')).transform
        }))()""")
        cdp.send("Emulation.setEmulatedMedia", {"features": []})

        cdp.send("Emulation.setDeviceMetricsOverride", {"width": 390, "height": 844, "deviceScaleFactor": 1, "mobile": True})
        cdp.evaluate("window.dispatchEvent(new Event('resize'))")
        time.sleep(1)
        mobile = cdp.evaluate(STATE)
        mobile_target = cdp.evaluate("Math.round(document.querySelector('.galaxy-index__item').getBoundingClientRect().height)")
        cdp.send("Emulation.clearDeviceMetricsOverride")

        frame_ms = cdp.evaluate(FRAME_SAMPLE)
        errors = cdp.errors()
        report = {
            "initial": initial,
            "after_drag": after_drag,
            "after_wheel": after_wheel,
            "after_reset": after_reset,
            "after_discovery": after_discovery,
            "stored": stored,
            "dialog_open": dialog_open,
            "dialog_closed": dialog_closed,
            "reduced": reduced,
            "mobile": mobile,
            "mobile_index_target": mobile_target,
            "frame_ms_40": round(frame_ms, 2),
            "errors": errors,
        }
        checks = {
            "objects_created": initial["objects"] == 4,
            "controls_created": initial["controls"] == 3,
            "identity_static_on_pointer": initial["introX"] == after_drag["introX"] and initial["introY"] == after_drag["introY"],
            "drag_moves_galaxy": abs(after_drag["camX"]) > 20,
            "wheel_zooms": after_wheel["camZ"] > 1.1,
            "reset_restores": abs(after_reset["camZ"] - 1) < 0.05 and abs(after_reset["camX"]) < 5,
            "discovery_persisted": after_discovery["progress"] == "1/4 hallazgos" and "beacon" in (stored or ""),
            "dialog_focused": dialog_open["hidden"] is False and dialog_open["expanded"] == "true" and dialog_open["focused"] == "world-detail__close",
            "dialog_focus_zooms": dialog_open["camZ"] > 1.02,
            "dialog_escape_closes": dialog_closed["hidden"] is True and dialog_closed["expanded"] == "false",
            "reduced_motion": reduced["animation"] == "none" and reduced["introTransform"] == "none",
            "mobile_no_overflow": mobile["scrollW"] == mobile["clientW"],
            "mobile_target_size": mobile_target >= 44,
            "frame_budget": frame_ms < 4000,
            "no_console_errors": not errors,
        }
        report["checks"] = checks
        report["failures"] = [name for name, passed in checks.items() if not passed]
    finally:
        if ws:
            ws.close()
        server.terminate()
        chrome.terminate()
        try:
            server.wait(timeout=5)
            chrome.wait(timeout=5)
        except Exception:
            server.kill()
            chrome.kill()
    print(json.dumps(report, indent=2, ensure_ascii=False))
    return 1 if report.get("failures") else 0


if __name__ == "__main__":
    sys.exit(main())
