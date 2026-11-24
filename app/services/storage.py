from __future__ import annotations

import mimetypes
import urllib.parse
import urllib.request
from urllib.error import HTTPError as UrlHTTPError

from app.config import UPLOAD_DIR, Config


class StorageError(Exception):
    pass


def _object_name(name: str) -> str:
    clean = urllib.parse.unquote(str(name)).lstrip("/")
    if not clean or "/" in clean or "\\" in clean or ".." in clean:
        raise StorageError("Nombre de archivo no permitido")
    return clean


def _url(name: str) -> str:
    return f"{Config.SUPABASE_URL}/storage/v1/object/{Config.SUPABASE_STORAGE_BUCKET}/{urllib.parse.quote(name, safe='')}"


def _headers(content_type: str = "") -> dict[str, str]:
    headers = {"Authorization": f"Bearer {Config.SUPABASE_SERVICE_ROLE_KEY}", "apikey": Config.SUPABASE_SERVICE_ROLE_KEY}
    if content_type:
        headers["Content-Type"] = content_type
    return headers


def _request(method: str, name: str, data: bytes | None = None, content_type: str = "") -> urllib.response.addinfourl:
    target = urllib.request.Request(_url(name), data=data, headers=_headers(content_type), method=method)
    if method == "POST":
        target.add_header("x-upsert", "true")
    try:
        return urllib.request.urlopen(target, timeout=30)
    except UrlHTTPError as exc:
        if exc.code == 404:
            raise FileNotFoundError(name) from exc
        raise StorageError(f"Error de almacenamiento ({exc.code})") from exc
    except OSError as exc:
        raise StorageError("No fue posible contactar el almacenamiento") from exc


def save_upload(name: str, data: bytes, content_type: str = "") -> str:
    clean = _object_name(name)
    if Config.STORAGE_BACKEND == "supabase":
        guessed = content_type or mimetypes.guess_type(clean)[0] or "application/octet-stream"
        _request("POST", clean, data, guessed).close()
    else:
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        (UPLOAD_DIR / clean).write_bytes(data)
    return f"/uploads/{urllib.parse.quote(clean)}"


def read_upload(name: str) -> tuple[bytes, str] | None:
    clean = _object_name(name)
    if Config.STORAGE_BACKEND == "supabase":
        try:
            with _request("GET", clean) as response:
                return response.read(), response.headers.get_content_type()
        except FileNotFoundError:
            return None
    path = UPLOAD_DIR / clean
    if not path.exists() or not path.is_file():
        return None
    return path.read_bytes(), mimetypes.guess_type(clean)[0] or "application/octet-stream"


def delete_upload(name: str) -> None:
    clean = _object_name(name)
    if Config.STORAGE_BACKEND == "supabase":
        try:
            _request("DELETE", clean).close()
        except FileNotFoundError:
            return
        return
    (UPLOAD_DIR / clean).unlink(missing_ok=True)
