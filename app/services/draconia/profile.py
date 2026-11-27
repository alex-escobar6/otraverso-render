from __future__ import annotations

from app.db import execute, get_setting, one, query

STATES = (
    "idle", "curious", "happy", "playing", "walking", "running",
    "resting", "sleeping", "flying", "interacting",
)

ANIMATIONS = (
    "idle", "breathe", "blink", "look", "walk", "run", "jump", "sit",
    "sleep", "happy", "curious", "flap", "fly", "pet", "play",
)

TRANSITIONS = {
    "idle": {"curious", "happy", "playing", "walking", "running", "resting", "sleeping", "flying", "interacting"},
    "curious": {"idle", "happy", "playing", "walking", "interacting"},
    "happy": {"idle", "curious", "playing", "walking", "resting", "interacting"},
    "playing": {"idle", "curious", "happy", "running", "resting", "interacting"},
    "walking": {"idle", "curious", "happy", "running", "resting", "interacting"},
    "running": {"idle", "happy", "playing", "walking", "resting", "interacting"},
    "resting": {"idle", "curious", "sleeping", "walking", "interacting"},
    "sleeping": {"idle", "curious", "resting", "interacting"},
    "flying": {"idle", "curious", "happy", "resting", "interacting"},
    "interacting": set(STATES) - {"interacting"},
}


def _flag(value: str) -> bool:
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def normalize_state(value: str) -> str:
    state = str(value or "").strip().lower()
    return state if state in STATES else "idle"


def can_transition(current: str, next_state: str) -> bool:
    return next_state in TRANSITIONS.get(normalize_state(current), TRANSITIONS["idle"])


def _defaults() -> tuple[str, bool, bool]:
    name = get_setting("draconia", "companion_default_name", "Luma").strip()[:40] or "Luma"
    sound = _flag(get_setting("draconia", "sound_default", "1"))
    reduced = _flag(get_setting("draconia", "reduced_motion_default", "0"))
    return name, sound, reduced


def ensure_profile(user_id: int) -> None:
    name, sound, reduced = _defaults()
    execute(
        "INSERT OR IGNORE INTO draconia_profiles"
        "(user_id,dragon_name,sound,reduced_motion,last_state) VALUES (?,?,?,?,?)",
        (user_id, name, int(sound), int(reduced), "idle"),
    )


def build(user_id: int) -> dict:
    ensure_profile(user_id)
    row = one(
        "SELECT dragon_name,sound,reduced_motion,last_state FROM draconia_profiles WHERE user_id=?",
        (user_id,),
    )
    if row is None:
        name, sound, reduced = _defaults()
        return {
            "dragon_name": name,
            "sound": sound,
            "reduced_motion": reduced,
            "last_state": "idle",
        }
    name = str(row["dragon_name"] or "").strip()[:40] or _defaults()[0]
    return {
        "dragon_name": name,
        "sound": bool(row["sound"]),
        "reduced_motion": bool(row["reduced_motion"]),
        "last_state": normalize_state(row["last_state"]),
    }


def set_name(user_id: int, name: str) -> str:
    cleaned = " ".join(str(name or "").split())
    if not 1 <= len(cleaned) <= 40:
        raise ValueError("El nombre debe tener entre 1 y 40 caracteres")
    ensure_profile(user_id)
    execute("UPDATE draconia_profiles SET dragon_name=?,updated_at=datetime('now') WHERE user_id=?",
            (cleaned, user_id))
    return cleaned


def set_preferences(user_id: int, *, sound: bool | None = None,
                    reduced_motion: bool | None = None) -> dict:
    ensure_profile(user_id)
    current = build(user_id)
    next_sound = current["sound"] if sound is None else bool(sound)
    next_reduced = current["reduced_motion"] if reduced_motion is None else bool(reduced_motion)
    execute(
        "UPDATE draconia_profiles SET sound=?,reduced_motion=?,updated_at=datetime('now') WHERE user_id=?",
        (int(next_sound), int(next_reduced), user_id),
    )
    return {"sound": next_sound, "reduced_motion": next_reduced}


def set_state(user_id: int, state: str, *, force: bool = False) -> str:
    cleaned = normalize_state(state)
    ensure_profile(user_id)
    if not force:
        current = normalize_state(build(user_id)["last_state"])
        if not can_transition(current, cleaned):
            cleaned = "idle"
    execute("UPDATE draconia_profiles SET last_state=?,updated_at=datetime('now') WHERE user_id=?",
            (cleaned, user_id))
    return cleaned


def summary() -> dict:
    total = query("SELECT COUNT(*) AS total FROM draconia_profiles")[0]["total"]
    recent = query(
        "SELECT u.name AS owner,p.dragon_name AS dragon,p.last_state AS state "
        "FROM draconia_profiles p JOIN users u ON u.id=p.user_id "
        "ORDER BY p.updated_at DESC LIMIT 8"
    )
    return {
        "total": total,
        "profiles": [
            {
                "owner": row["owner"],
                "dragon": row["dragon"] or "Luma",
                "state": normalize_state(row["state"]),
            }
            for row in recent
        ],
    }
