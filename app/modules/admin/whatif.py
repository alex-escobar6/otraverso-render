"""Panel administrativo de OTRAVERSO WHAT IF."""
from __future__ import annotations

import json
import re

from app.core.http import Request, Response
from app.core.render import esc, render
from app.db import execute, settings_group, transaction
from app.services.whatif import engine, provider

from . import admin_page, audit, csrf_input, go, int_or_none

WHATIF_FIELDS = [
    ("enabled", "Universo habilitado (1/0)", "text"),
    ("text_provider", "Proveedor de texto", "text"),
    ("text_model", "Modelo de texto", "text"),
    ("text_api_url", "URL de API de texto", "text"),
    ("image_provider", "Proveedor de imágenes", "text"),
    ("image_model", "Modelo de imágenes", "text"),
    ("image_api_url", "URL de API de imágenes", "text"),
    ("timeout_seconds", "Tiempo de espera en segundos", "number"),
    ("max_retries", "Reintentos", "number"),
    ("max_requests_hour", "Solicitudes por hora y sesión", "number"),
    ("max_chapter_chars", "Caracteres máximos por capítulo", "number"),
    ("max_idea_chars", "Caracteres máximos por idea", "number"),
    ("context_chapters", "Capítulos de contexto", "number"),
    ("moderation", "Moderación de entradas (1/0)", "text"),
    ("generate_images", "Generar imágenes por defecto (1/0)", "text"),
    ("default_genre", "Género sugerido", "text"),
    ("narrative_instructions", "Instrucciones narrativas globales", "textarea"),
    ("ideas_enabled", "Generador de ideas (1/0)", "text"),
    ("apocalypse_enabled", "Modo apocalipsis disponible (1/0)", "text"),
    ("crazy_enabled", "Modo loco disponible (1/0)", "text"),
    ("unlimited_enabled", "Modo Sin límites disponible (1/0)", "text"),
    ("visual_primary_color", "Color principal WHAT IF (#RRGGBB)", "text"),
    ("visual_secondary_color", "Color secundario WHAT IF (#RRGGBB)", "text"),
    ("visual_accent_color", "Color de acento WHAT IF (#RRGGBB)", "text"),
    ("visual_background_color", "Color de fondo WHAT IF (#RRGGBB)", "text"),
    ("visual_elements", "Elementos visuales (JSON)", "textarea"),
    ("narrative_templates", "Plantillas narrativas (JSON)", "textarea"),
    ("chapter_normal_words", "Palabras por capítulo normal", "number"),
    ("chapter_extended_words", "Palabras por capítulo extenso", "number"),
    ("chapter_cinematic_words", "Palabras por capítulo cinematográfico", "number"),
    ("max_chapter_words", "Máximo de palabras por capítulo", "number"),
    ("generation_blocks", "Bloques por capítulo", "number"),
    ("surprise_frequency", "Frecuencia de sorpresa (0-100)", "number"),
    ("randomness_level", "Nivel de aleatoriedad (1-4)", "number"),
    ("available_genres", "Géneros disponibles (separados por coma)", "text"),
    ("available_styles", "Estilos disponibles (separados por coma)", "text"),
    ("memory_cards_limit", "Límite de fichas de memoria", "number"),
    ("default_point_of_view", "Punto de vista predeterminado", "text"),
    ("default_ending", "Final predeterminado", "text"),
    ("initial_characters", "Personajes iniciales", "number"),
]

COLOR_FIELDS = (
    "visual_primary_color", "visual_secondary_color", "visual_accent_color", "visual_background_color",
)
JSON_DEFAULTS = {"visual_elements": "[]", "narrative_templates": "{}"}
SECRET_WORDS = ("key", "secret", "token", "password")


def register(router) -> None:
    router.get("/admin/what-if", page, permission="whatif.view", name="admin.whatif")
    router.post("/admin/what-if/settings", save_settings, permission="whatif.edit", name="admin.whatif.settings")
    router.post("/admin/what-if/jobs/{jid}/cancel", cancel_job, permission="whatif.edit", name="admin.whatif.job.cancel")
    router.post("/admin/what-if/jobs/purge", purge_jobs, permission="whatif.edit", name="admin.whatif.jobs.purge")


def _fields(values: dict[str, str], csrf: str) -> str:
    parts = []
    for key, label, kind in WHATIF_FIELDS:
        value = values.get(key, "")
        if kind == "textarea":
            control = f'<textarea name="{key}" rows="4">{esc(value)}</textarea>'
        else:
            control = f'<input type="{kind}" name="{key}" value="{esc(value)}">'
        parts.append(f'<div class="field{" full" if kind == "textarea" else ""}">'
                     f'<label>{esc(label)}</label>{control}</div>')
    return "".join(parts)


def page(request: Request) -> Response:
    stats = engine.admin_stats()
    config = stats["config"]
    values = settings_group("whatif")
    job_rows = []
    for job in stats["recent_jobs"]:
        status = esc(job["status"])
        css = "ok" if status == "done" else ("bad" if status in {"error", "canceled"} else "warn")
        action = ""
        if job["status"] in {"queued", "running"}:
            action = (
                f'<form method="post" action="/admin/what-if/jobs/{job["id"]}/cancel">{csrf_input(request)}'
                '<button class="btn btn-sm" type="submit">Cancelar</button></form>'
            )
        job_rows.append(
            f'<tr><td>{job["id"]}</td><td>{esc(job["kind"])}</td>'
            f'<td><span class="status-tag {css}">{status}</span></td>'
            f'<td>{esc(job["stage"])}</td><td>{esc(job["error"] or "")}</td>'
            f'<td>{esc(job["created_at"])}</td><td>{action}</td></tr>'
        )
    usage_rows = "".join(
        f'<tr><td>{esc(row["provider"])}</td><td>{esc(row["kind"])}</td>'
        f'<td>{row["ok"]}</td><td>{row["total"]}</td></tr>'
        for row in stats["usage"]
    ) or '<tr><td colspan="4">Sin actividad reciente.</td></tr>'
    counts = stats["counts"]
    content = render(
        "admin/whatif.html",
        CSRF=csrf_input(request),
        FIELDS=_fields(values, csrf_input(request)),
        CSRF_PURGE=(
            f'<form method="post" action="/admin/what-if/jobs/purge">{csrf_input(request)}'
            '<button class="btn btn-sm" type="submit">Limpiar tareas finalizadas</button></form>'
        ),
        REALITIES=counts["whatif_realities"],
        TIMELINES=counts["whatif_timelines"],
        CHAPTERS=counts["whatif_chapters"],
        INTERVENTIONS=counts["whatif_interventions"],
        MEMORY_CARDS=counts.get("whatif_memory_cards", 0),
        JOBS=counts["whatif_generation_jobs"],
        FAILURES=stats["failures"],
        TEXT_PROVIDER=esc(config["text_provider"] + (" · configurado" if config["text_configured"] else " · local o sin configurar")),
        IMAGE_PROVIDER=esc(config["image_provider"] + (" · configurado" if config["image_configured"] else " · esquemático o sin configurar")),
        JOB_ROWS="".join(job_rows) or '<tr><td colspan="7">Sin tareas registradas.</td></tr>',
        USAGE_ROWS=usage_rows,
    )
    return admin_page(request, "WHAT IF — Operación", content, "whatif")


def save_settings(request: Request) -> Response:
    updates: dict[str, str] = {}
    for key, _label, _kind in WHATIF_FIELDS:
        if key not in request.form or any(word in key.lower() for word in SECRET_WORDS):
            continue
        value = request.param(key)
        if key in COLOR_FIELDS:
            candidate = value.strip().lower()
            if not re.fullmatch(r"#[0-9a-f]{6}", candidate):
                return go("/admin/what-if", error=f"Color no válido en {key}: usa #RRGGBB")
            value = candidate
        if key in JSON_DEFAULTS:
            raw = value.strip() or JSON_DEFAULTS[key]
            try:
                json.loads(raw)
            except (TypeError, ValueError):
                return go("/admin/what-if", error=f"JSON no válido en {key}")
            value = raw
        updates[key] = value
    with transaction() as conn:
        for key, value in updates.items():
            conn.execute(
                "INSERT INTO settings(category,key,value) VALUES ('whatif',?,?) "
                "ON CONFLICT(category,key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP",
                (key, value),
            )
    audit(request, "update", "whatif_settings")
    return go("/admin/what-if", ok="Configuración de WHAT IF guardada")


def cancel_job(request: Request, jid: int) -> Response:
    job_id = int_or_none(jid)
    if not job_id:
        return go("/admin/what-if", error="Tarea no válida")
    updated = execute(
        "UPDATE whatif_generation_jobs SET status='canceled',stage='Cancelada por administración',updated_at=CURRENT_TIMESTAMP "
        "WHERE id=? AND status IN ('queued','running')", (job_id,)
    )
    if updated.rowcount:
        audit(request, "cancel", "whatif_job", job_id)
        return go("/admin/what-if", ok="Tarea cancelada")
    return go("/admin/what-if", error="La tarea ya estaba finalizada")


def purge_jobs(request: Request) -> Response:
    execute("DELETE FROM whatif_generation_jobs WHERE status IN ('done','error','canceled') AND created_at < datetime('now','-7 days')")
    audit(request, "delete", "whatif_jobs")
    return go("/admin/what-if", ok="Tareas finalizadas antiguas eliminadas")
