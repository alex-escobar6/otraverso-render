# Núcleo HTTP minimalista compatible WSGI, sin dependencias externas.
from __future__ import annotations

import re
import urllib.parse
import uuid
from dataclasses import dataclass, field
from email.parser import BytesParser
from email.policy import default as email_policy
from typing import Any, Callable

from app.config import Config
from app.core.render import esc


class HTTPError(Exception):
    def __init__(self, status: int, message: str, code: str = ""):
        super().__init__(message)
        self.status = status
        self.message = message
        self.code = code


@dataclass
class UploadedFile:
    field: str
    filename: str
    content_type: str
    data: bytes


@dataclass
class Request:
    environ: dict[str, Any]
    method: str = ""
    path: str = ""
    query: dict[str, str] = field(default_factory=dict)
    headers: dict[str, str] = field(default_factory=dict)
    cookies: dict[str, str] = field(default_factory=dict)
    form: dict[str, str] = field(default_factory=dict)
    files: list[UploadedFile] = field(default_factory=list)
    user: Any = None
    session: Any = None
    permission_codes: set[str] = field(default_factory=set)
    csrf_token: str = ""
    renew_session: bool = False
    request_id: str = ""

    @classmethod
    def from_environ(cls, environ: dict[str, Any]) -> "Request":
        method = environ.get("REQUEST_METHOD", "GET").upper()
        raw_path = environ.get("SCRIPT_NAME", "") + environ.get("PATH_INFO", "")
        path = urllib.parse.unquote(raw_path or "/")
        if len(path) > 1 and path.endswith("/"):
            path = path.rstrip("/")
        query = {
            k: v[-1] for k, v in urllib.parse.parse_qs(
                environ.get("QUERY_STRING", ""), keep_blank_values=True
            ).items()
        }
        headers = {
            k.replace("HTTP_", "").replace("_", "-").lower(): v
            for k, v in environ.items() if k.startswith("HTTP_")
        }
        cookies = {}
        for chunk in headers.get("cookie", "").split(";"):
            if "=" in chunk:
                key, value = chunk.strip().split("=", 1)
                cookies[key] = value
        request_id = headers.get("x-request-id", "").strip()[:64] or uuid.uuid4().hex[:16]
        req = cls(environ=environ, method=method, path=path, query=query,
                  headers=headers, cookies=cookies, request_id=request_id)
        if method in {"POST", "PUT", "PATCH"}:
            req._parse_body()
        return req

    def _parse_body(self) -> None:
        try:
            length = int(self.environ.get("CONTENT_LENGTH") or 0)
        except ValueError:
            length = 0
        if length <= 0:
            return
        body = self.environ["wsgi.input"].read(length)
        content_type = self.environ.get("CONTENT_TYPE", "")
        if content_type.startswith("application/x-www-form-urlencoded"):
            parsed = urllib.parse.parse_qs(body.decode("utf-8", "replace"), keep_blank_values=True)
            self.form = {k: v[-1] for k, v in parsed.items()}
        elif content_type.startswith("multipart/form-data"):
            self._parse_multipart(body, content_type)

    def _parse_multipart(self, body: bytes, content_type: str) -> None:
        header = (
            f"Content-Type: {content_type}\r\nMIME-Version: 1.0\r\n\r\n".encode("utf-8")
        )
        message = BytesParser(policy=email_policy).parsebytes(header + body)
        for part in message.iter_parts():
            name = part.get_param("name", header="content-disposition") or ""
            filename = part.get_filename()
            payload = part.get_payload(decode=True) or b""
            if filename:
                self.files.append(UploadedFile(
                    field=name, filename=filename,
                    content_type=part.get_content_type(), data=payload,
                ))
            elif name:
                charset = part.get_content_charset() or "utf-8"
                self.form[name] = payload.decode(charset, "replace")

    def param(self, name: str, default: str = "") -> str:
        return self.form.get(name, self.query.get(name, default))

    def int_param(self, name: str, default: int = 0) -> int:
        value = self.param(name, "")
        try:
            return int(value)
        except (TypeError, ValueError):
            return default

    @property
    def ip(self) -> str:
        forwarded = self.environ.get("HTTP_X_FORWARDED_FOR", "") if Config.TRUST_PROXY else ""
        return (forwarded or self.environ.get("REMOTE_ADDR") or "").split(",")[0].strip()[:64]

    @property
    def scheme(self) -> str:
        forwarded = self.headers.get("x-forwarded-proto", "") if Config.TRUST_PROXY else ""
        return (forwarded.split(",")[0].strip() or self.environ.get("wsgi.url_scheme", "http")).lower()

    @property
    def user_agent(self) -> str:
        return self.headers.get("user-agent", "")

    @property
    def referrer(self) -> str:
        return self.headers.get("referer", "")


@dataclass
class Response:
    body: str | bytes = ""
    status: int = 200
    content_type: str = "text/html; charset=utf-8"
    headers: dict[str, str] = field(default_factory=dict)

    def __call__(self, environ: dict, start_response: Callable) -> list[bytes]:
        payload = self.body.encode("utf-8") if isinstance(self.body, str) else self.body
        headers = dict(self.headers)
        headers.setdefault("Content-Type", self.content_type)
        headers["Content-Length"] = str(len(payload))
        headers.setdefault("X-Content-Type-Options", "nosniff")
        headers.setdefault("X-Frame-Options", "SAMEORIGIN")
        headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        headers.setdefault("Content-Security-Policy", (
            "default-src 'self'; base-uri 'self'; frame-ancestors 'self'; object-src 'none'; "
            "img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; "
            "form-action 'self' https://wa.me"
        ))
        start_response(f"{self.status} {STATUS.get(self.status, 'Unknown')}", list(headers.items()))
        return [payload]


STATUS = {
    200: "OK", 201: "Created", 204: "No Content", 303: "See Other",
    400: "Bad Request", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found",
    405: "Method Not Allowed", 413: "Payload Too Large", 429: "Too Many Requests",
    500: "Internal Server Error", 502: "Bad Gateway", 503: "Service Unavailable",
}


def redirect(location: str, status: int = 303) -> Response:
    return Response("", status=status, headers={"Location": location})


def json_response(data: Any, status: int = 200) -> Response:
    import json
    return Response(json.dumps(data, ensure_ascii=False), status, "application/json; charset=utf-8")


def error_page(status: int, message: str) -> Response:
    from app.core.render import render_page
    title = f"Error {status}"
    content = f"""
    <section class="error-page"><div class="error-code">{status}</div>
      <h1>{esc(message)}</h1>
      <p><a class="btn btn-primary" href="/">Volver al inicio</a></p>
    </section>"""
    return Response(render_page(title, content, body_class="mode-shop"), status)


class Router:
    def __init__(self) -> None:
        self.routes: list[dict[str, Any]] = []

    def add(self, method: str, pattern: str, handler: Callable, *, permission: str | None = None, name: str = "") -> None:
        parts = re.split(r"(\{\w+\})", pattern)
        regex = ""
        for part in parts:
            if part.startswith("{") and part.endswith("}"):
                regex += f"(?P<{part[1:-1]}>[^/]+)"
            else:
                regex += re.escape(part)
        self.routes.append({
            "method": method, "regex": re.compile(f"^{regex}$"), "handler": handler,
            "permission": permission, "name": name or f"{method}:{pattern}",
        })

    def get(self, pattern: str, handler: Callable, **kwargs) -> None:
        self.add("GET", pattern, handler, **kwargs)

    def post(self, pattern: str, handler: Callable, **kwargs) -> None:
        self.add("POST", pattern, handler, **kwargs)

    def match(self, method: str, path: str) -> tuple[Callable, dict[str, str], str | None]:
        for route in self.routes:
            if route["method"] != method:
                continue
            matched = route["regex"].match(path)
            if matched:
                return route["handler"], matched.groupdict(), route["permission"]
        raise HTTPError(404, "Página no encontrada")
