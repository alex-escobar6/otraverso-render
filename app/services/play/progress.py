from __future__ import annotations

import json
import re
from datetime import datetime, timezone

from app.db import one, query, transaction

PLAYER_ID_RE = re.compile(r"^PLAY-[0-9A-Z]{4,32}$")
GAME_RE = re.compile(r"^[a-z0-9][a-z0-9-]{1,39}$")
CODE_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{1,79}$")
ACHIEVEMENTS = {
    "first_game": "Primer juego",
    "score_1000": "Mil puntos",
    "gravity_clear": "Gravedad superada",
    "explorer_5": "Cinco hallazgos",
    "collector_10": "Diez coleccionables",
}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def normalize_player_id(value: object) -> str:
    text = str(value or "").strip().upper()
    return text if PLAYER_ID_RE.fullmatch(text) else ""


def normalize_game(value: object) -> str:
    text = str(value or "").strip().lower()
    return text if GAME_RE.fullmatch(text) else ""


def normalize_code(value: object) -> str:
    text = str(value or "").strip().lower()
    return text if CODE_RE.fullmatch(text) else ""


def level_for(xp: float) -> int:
    return max(1, int(float(xp or 0) // 500) + 1)


def _ensure_profile(conn, player_id: str) -> None:
    conn.execute(
        "INSERT OR IGNORE INTO play_profiles(player_id,xp,level,wins,total_score) VALUES (?,0,1,0,0)",
        (player_id,),
    )


def _unlock(conn, player_id: str, code: str) -> bool:
    cursor = conn.execute(
        "INSERT OR IGNORE INTO play_achievements(player_id,code) VALUES (?,?)",
        (player_id, code),
    )
    return cursor.rowcount > 0


def _count(conn, table: str, player_id: str) -> int:
    return int(conn.execute(
        f"SELECT COUNT(*) FROM {table} WHERE player_id=?", (player_id,)
    ).fetchone()[0])


def _achievement_result(conn, player_id: str, game: str, score: int, total_score: int,
                        success: bool, first: bool) -> list[str]:
    unlocked: list[str] = []
    rules = []
    if first:
        rules.append("first_game")
    if score >= 1000 or total_score >= 1000:
        rules.append("score_1000")
    if game == "gravity" and success:
        rules.append("gravity_clear")
    if _count(conn, "play_collectibles", player_id) >= 5:
        rules.append("explorer_5")
    if _count(conn, "play_collectibles", player_id) >= 10:
        rules.append("collector_10")
    for code in rules:
        if _unlock(conn, player_id, code):
            unlocked.append(code)
    return unlocked


def _profile_payload(row) -> dict:
    return {
        "player_id": row["player_id"],
        "id": row["player_id"],
        "xp": round(float(row["xp"]), 1),
        "level": int(row["level"]),
        "wins": int(row["wins"]),
        "total_score": int(row["total_score"]),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def _achievement_payload(rows) -> dict:
    return {row["code"]: {"code": row["code"], "label": ACHIEVEMENTS.get(row["code"], row["code"]),
                          "at": row["created_at"]} for row in rows}


def _collectible_payload(rows) -> dict:
    return {row["code"]: {"code": row["code"], "found": True, "note": row["note"],
                          "at": row["created_at"]} for row in rows}


def _result_payload(rows) -> list[dict]:
    results = []
    for row in rows:
        try:
            stats = json.loads(row["stats"] or "{}")
        except (TypeError, ValueError):
            stats = {}
        results.append({
            "id": row["id"],
            "game": row["game"],
            "score": int(row["score"]),
            "duration_ms": int(row["duration_ms"]),
            "success": bool(row["success"]),
            "stats": stats if isinstance(stats, dict) else {},
            "at": row["created_at"],
        })
    return results


def ensure_profile(player_id: str) -> dict | None:
    player = normalize_player_id(player_id)
    if not player:
        return None
    with transaction() as conn:
        _ensure_profile(conn, player)
    return get_profile(player)


def get_profile(player_id: str, limit: int = 20) -> dict | None:
    player = normalize_player_id(player_id)
    if not player:
        return None
    row = one("SELECT * FROM play_profiles WHERE player_id=?", (player,))
    if not row:
        return None
    results = query(
        "SELECT * FROM play_results WHERE player_id=? ORDER BY id DESC LIMIT ?",
        (player, max(1, min(int(limit or 20), 50))),
    )
    achievements = query(
        "SELECT code,created_at FROM play_achievements WHERE player_id=? ORDER BY created_at,code",
        (player,),
    )
    collectibles = query(
        "SELECT code,note,created_at FROM play_collectibles WHERE player_id=? ORDER BY created_at,code",
        (player,),
    )
    return {
        "profile": _profile_payload(row),
        "results": _result_payload(results),
        "achievements": _achievement_payload(achievements),
        "collectibles": _collectible_payload(collectibles),
    }


def submit_result(player_id: str, game: str, score: object, duration_ms: object,
                  success: bool = False, stats: object = None) -> dict | None:
    player = normalize_player_id(player_id)
    code = normalize_game(game)
    if not player or not code:
        return None
    try:
        points = max(0, min(int(float(score or 0)), 100_000_000))
    except (TypeError, ValueError):
        points = 0
    try:
        duration = max(0, min(int(float(duration_ms or 0)), 86_400_000))
    except (TypeError, ValueError):
        duration = 0
    clean_stats = stats if isinstance(stats, dict) else {}
    try:
        stats_text = json.dumps(clean_stats, ensure_ascii=False, separators=(",", ":"))
    except (TypeError, ValueError):
        stats_text = "{}"
    if len(stats_text) > 4000:
        stats_text = "{}"
    with transaction() as conn:
        _ensure_profile(conn, player)
        before = conn.execute(
            "SELECT xp,wins,total_score FROM play_profiles WHERE player_id=?", (player,)
        ).fetchone()
        first = _count(conn, "play_results", player) == 0
        conn.execute(
            "INSERT INTO play_results(player_id,game,score,duration_ms,success,stats) VALUES (?,?,?,?,?,?)",
            (player, code, points, duration, 1 if success else 0, stats_text),
        )
        xp_gain = round(points / 10, 1) + (100 if success else 0)
        total_score = int(before["total_score"]) + points
        wins = int(before["wins"]) + (1 if success else 0)
        xp = round(float(before["xp"]) + xp_gain, 1)
        conn.execute(
            "UPDATE play_profiles SET xp=?, level=?, wins=?, total_score=?, "
            "updated_at=CURRENT_TIMESTAMP WHERE player_id=?",
            (xp, level_for(xp), wins, total_score, player),
        )
        unlocked = _achievement_result(conn, player, code, points, total_score, success, first)
    payload = get_profile(player)
    if payload:
        payload["unlocked"] = unlocked
        payload["xp_gain"] = xp_gain
    return payload


def unlock_collectible(player_id: str, code: object, note: object = "") -> dict | None:
    player = normalize_player_id(player_id)
    collectible = normalize_code(code)
    if not player or not collectible:
        return None
    note_text = str(note or "").strip()[:240]
    with transaction() as conn:
        _ensure_profile(conn, player)
        before = conn.execute(
            "SELECT xp,total_score FROM play_profiles WHERE player_id=?", (player,)
        ).fetchone()
        cursor = conn.execute(
            "INSERT OR IGNORE INTO play_collectibles(player_id,code,note) VALUES (?,?,?)",
            (player, collectible, note_text),
        )
        created = cursor.rowcount > 0
        xp_gain = 25 if created else 0
        total_score = int(before["total_score"])
        xp = round(float(before["xp"]) + xp_gain, 1)
        if created:
            conn.execute(
                "UPDATE play_profiles SET xp=?, level=?, updated_at=CURRENT_TIMESTAMP WHERE player_id=?",
                (xp, level_for(xp), player),
            )
        unlocked = _achievement_result(conn, player, "", 0, total_score, False, False)
    payload = get_profile(player)
    if payload:
        payload["created"] = created
        payload["xp_gain"] = xp_gain
        payload["unlocked"] = unlocked
    return payload
