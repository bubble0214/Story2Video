from __future__ import annotations

from celery import Celery
from kombu import Queue

from app.core.config import settings

celery_app = Celery(
    "story2video",
    broker=settings.celery_broker,
    backend=settings.celery_result,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,
    task_default_queue="default",
    task_default_exchange="story2video",
    task_default_exchange_type="direct",
    task_default_routing_key="default",
    task_queue_max_priority=10,
    task_default_priority=5,
    task_queues=(
        Queue("default", routing_key="default", max_priority=10),
        Queue("novel_generation", routing_key="novel_generation", max_priority=10),
        Queue("script_generation", routing_key="script_generation", max_priority=10),
        Queue("lyrics_generation", routing_key="lyrics_generation", max_priority=10),
        Queue("music_generation", routing_key="music_generation", max_priority=10),
        Queue("image_generation", routing_key="image_generation", max_priority=10),
        Queue("video_generation", routing_key="video_generation", max_priority=10),
        Queue("dead_letter", routing_key="dead_letter", max_priority=10),
    ),
    task_routes={
        "workflow_generate_novel": {
            "queue": "novel_generation",
            "routing_key": "novel_generation",
            "priority": 6,
        },
        "workflow_generate_outline_only": {
            "queue": "novel_generation",
            "routing_key": "novel_generation",
            "priority": 6,
        },
        "workflow_generate_volume_outline_only": {
            "queue": "novel_generation",
            "routing_key": "novel_generation",
            "priority": 6,
        },
        "workflow_generate_novel_with_outline": {
            "queue": "novel_generation",
            "routing_key": "novel_generation",
            "priority": 6,
        },
        "workflow_generate_novel_with_volume_outline": {
            "queue": "novel_generation",
            "routing_key": "novel_generation",
            "priority": 6,
        },
        "workflow_generate_character_rules_only": {
            "queue": "novel_generation",
            "routing_key": "novel_generation",
            "priority": 6,
        },
        "workflow_generate_novel_with_character_rules": {
            "queue": "novel_generation",
            "routing_key": "novel_generation",
            "priority": 6,
        },
        "workflow_generate_script": {
            "queue": "script_generation",
            "routing_key": "script_generation",
            "priority": 6,
        },
        "workflow_generate_analyze_novel": {
            "queue": "script_generation",
            "routing_key": "script_generation",
            "priority": 6,
        },
        "workflow_generate_lyrics": {
            "queue": "lyrics_generation",
            "routing_key": "lyrics_generation",
            "priority": 6,
        },
        "workflow_generate_song": {
            "queue": "music_generation",
            "routing_key": "music_generation",
            "priority": 7,
        },
        "workflow_generate_image": {
            "queue": "image_generation",
            "routing_key": "image_generation",
            "priority": 6,
        },
        "workflow_generate_video": {
            "queue": "video_generation",
            "routing_key": "video_generation",
            "priority": 8,
        },
    },
    task_soft_time_limit=3600,
    task_time_limit=4200,
    task_annotations={
        "workflow_generate_novel": {"rate_limit": "5/m"},
        "workflow_generate_script": {"rate_limit": "5/m"},
        "workflow_generate_lyrics": {"rate_limit": "10/m"},
        "workflow_generate_song": {"rate_limit": "5/m"},
        "workflow_generate_image": {"rate_limit": "5/m"},
        "workflow_generate_video": {"rate_limit": "2/m"},
    },
    result_expires=24 * 60 * 60,
)

# Auto-discover tasks from registered modules
celery_app.autodiscover_tasks(["app.worker"])
