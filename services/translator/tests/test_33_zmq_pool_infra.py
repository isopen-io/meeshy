#!/usr/bin/env python3
"""
Test 33 — ZMQ pool infrastructure
Targeted files (all ≥92% line+branch):
  src/services/zmq_models.py
  src/services/zmq_pool/worker_pool.py
  src/services/zmq_voice_handler.py

Covers the gaps left after test_20 + test_28:
  - zmq_models: long-text LOW priority assignment
  - worker_pool: decrement_active, record_task_*, get_utilization(0),
                  shutdown, neutral-metrics (no-scale) branch
  - zmq_voice_handler: is_voice_api_request paths, no-pub-socket paths,
                        _on_translation_job_completed branches,
                        set_voice_api_services full branch matrix
"""
import asyncio
import json
import sys
import time
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))


# ─── zmq_models ──────────────────────────────────────────────────────────────


class TestTranslationTaskPriority:
    """Priority auto-assignment in TranslationTask.__post_init__"""

    def _task(self, text: str = "hello", priority: int = 2, **kw):
        from services.zmq_models import TranslationTask
        return TranslationTask(
            task_id="t1",
            message_id="m1",
            text=text,
            source_language="en",
            target_languages=["fr"],
            conversation_id="c1",
            priority=priority,
            **kw,
        )

    def test_short_text_gets_high_priority(self):
        from utils.performance import Priority
        task = self._task("hi")
        assert task.priority == Priority.HIGH.value

    def test_medium_length_text_gets_medium_priority(self):
        from utils.performance import Priority
        task = self._task("a" * 200)
        assert task.priority == Priority.MEDIUM.value

    def test_long_text_gets_low_priority(self):
        from utils.performance import Priority
        task = self._task("x" * 500)
        assert task.priority == Priority.LOW.value

    def test_explicit_non_default_priority_is_preserved(self):
        task = self._task("hi", priority=1)
        assert task.priority == 1

    def test_created_at_defaults_to_current_time(self):
        before = time.time()
        task = self._task()
        after = time.time()
        assert before <= task.created_at <= after

    def test_explicit_created_at_is_preserved(self):
        fixed = 1_000_000.0
        task = self._task(created_at=fixed)
        assert task.created_at == fixed


# ─── zmq_pool/worker_pool ────────────────────────────────────────────────────


class TestWorkerPool:
    """WorkerPool lifecycle, counters, scaling, shutdown."""

    def _pool(self, **overrides):
        from services.zmq_pool.worker_pool import WorkerPool
        defaults = dict(
            pool_name="normal",
            default_workers=2,
            min_workers=1,
            max_workers=10,
            max_scaling_workers=5,
            enable_dynamic_scaling=True,
        )
        defaults.update(overrides)
        return WorkerPool(**defaults)

    def test_initial_state(self):
        pool = self._pool()
        assert pool.current_workers == 2
        assert pool.workers_active == 0
        assert not pool.workers_running

    # — active worker counter ——————————————————————————————————————————————————

    def test_increment_active_updates_counter_and_stats(self):
        pool = self._pool()
        pool.increment_active()
        assert pool.workers_active == 1
        assert pool.stats["workers_active"] == 1

    def test_decrement_active_decrements_counter(self):
        pool = self._pool()
        pool.increment_active()
        pool.decrement_active()
        assert pool.workers_active == 0
        assert pool.stats["workers_active"] == 0

    def test_decrement_active_does_not_go_below_zero(self):
        pool = self._pool()
        pool.decrement_active()
        assert pool.workers_active == 0

    # — task stats ─────────────────────────────────────────────────────────────

    def test_record_task_processed_increments_counter(self):
        pool = self._pool()
        pool.record_task_processed()
        pool.record_task_processed()
        assert pool.stats["tasks_processed"] == 2

    def test_record_task_failed_increments_counter(self):
        pool = self._pool()
        pool.record_task_failed()
        assert pool.stats["tasks_failed"] == 1

    # — utilization ────────────────────────────────────────────────────────────

    def test_get_utilization_returns_zero_when_no_workers(self):
        pool = self._pool(default_workers=0)
        assert pool.get_utilization() == 0.0

    def test_get_utilization_ratio(self):
        pool = self._pool(default_workers=4)
        pool.increment_active()
        pool.increment_active()
        assert pool.get_utilization() == 0.5

    # — shutdown ───────────────────────────────────────────────────────────────

    def test_shutdown_does_not_raise(self):
        pool = self._pool()
        pool.shutdown()

    # — get_stats ──────────────────────────────────────────────────────────────

    def test_get_stats_contains_required_keys(self):
        pool = self._pool()
        stats = pool.get_stats()
        assert stats["pool_name"] == "normal"
        assert "current_workers" in stats
        assert "utilization" in stats
        assert "min_workers" in stats
        assert "max_workers" in stats

    # — scaling ────────────────────────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_check_scaling_disabled_returns_false(self):
        pool = self._pool(enable_dynamic_scaling=False)
        result = await pool.check_scaling(queue_size=200, utilization=0.95)
        assert result is False

    @pytest.mark.asyncio
    async def test_check_scaling_within_interval_returns_false(self):
        pool = self._pool()
        pool.last_scaling_check = time.time()
        result = await pool.check_scaling(queue_size=200, utilization=0.95)
        assert result is False

    @pytest.mark.asyncio
    async def test_check_scaling_neutral_metrics_no_action(self):
        """Neither scale-up nor scale-down triggered → covers 172->187 False branch."""
        pool = self._pool()
        pool.last_scaling_check = 0
        result = await pool.check_scaling(queue_size=50, utilization=0.5)
        assert result is False

    @pytest.mark.asyncio
    async def test_check_scaling_up(self):
        pool = self._pool(default_workers=2)
        pool.last_scaling_check = 0
        result = await pool.check_scaling(queue_size=150, utilization=0.9)
        assert result is True
        assert pool.current_workers > 2

    @pytest.mark.asyncio
    async def test_check_scaling_down(self):
        pool = self._pool(default_workers=5, min_workers=1)
        pool.last_scaling_check = 0
        result = await pool.check_scaling(queue_size=2, utilization=0.1)
        assert result is True
        assert pool.current_workers < 5

    @pytest.mark.asyncio
    async def test_check_scaling_any_pool_scale_up(self):
        pool = self._pool(pool_name="any", default_workers=2, max_scaling_workers=5)
        pool.last_scaling_check = 0
        result = await pool.check_scaling(queue_size=60, utilization=0.9)
        assert result is True

    # — start/stop workers ─────────────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_start_workers_creates_tasks(self):
        pool = self._pool(default_workers=2)

        async def dummy_worker(name):
            pass

        tasks = await pool.start_workers(dummy_worker)
        assert len(tasks) == 2
        assert pool.workers_running
        await pool.stop_workers()
        assert not pool.workers_running

    @pytest.mark.asyncio
    async def test_stop_workers_when_no_tasks(self):
        pool = self._pool()
        pool.workers_running = True
        await pool.stop_workers()
        assert not pool.workers_running

    # — module-level helpers ───────────────────────────────────────────────────

    def test_calculate_optimal_workers_normal(self):
        from services.zmq_pool.worker_pool import calculate_optimal_workers
        assert calculate_optimal_workers("normal") >= 4

    def test_calculate_optimal_workers_any(self):
        from services.zmq_pool.worker_pool import calculate_optimal_workers
        assert calculate_optimal_workers("any") >= 2

    def test_configure_pytorch_threads_does_not_raise(self):
        from services.zmq_pool.worker_pool import configure_pytorch_threads
        configure_pytorch_threads(total_workers=4)


# ─── zmq_voice_handler ───────────────────────────────────────────────────────


def _voice_handler(pub_socket=None):
    """Create a VoiceHandler; override handlers afterward as needed."""
    from services.zmq_voice_handler import VoiceHandler
    return VoiceHandler(pub_socket=pub_socket)


class TestIsVoiceApiRequest:
    """is_voice_api_request() — three possible code paths."""

    def test_returns_false_when_voice_api_handler_is_none(self):
        handler = _voice_handler(pub_socket=MagicMock())
        handler.voice_api_handler = None
        assert handler.is_voice_api_request("voice_translate") is False

    def test_returns_false_when_handler_lacks_method(self):
        handler = _voice_handler(pub_socket=MagicMock())
        handler.voice_api_handler = MagicMock(spec=[])
        assert handler.is_voice_api_request("voice_translate") is False

    def test_delegates_to_handler_and_returns_result(self):
        handler = _voice_handler(pub_socket=MagicMock())
        api = MagicMock()
        api.is_voice_api_request = MagicMock(return_value=True)
        handler.voice_api_handler = api
        assert handler.is_voice_api_request("voice_translate") is True
        api.is_voice_api_request.assert_called_once_with("voice_translate")


class TestHandleVoiceApiRequestNoPubSocket:
    """_handle_voice_api_request() — no-pub-socket paths (success + exception)."""

    @pytest.mark.asyncio
    async def test_success_path_logs_error_when_no_pub_socket(self):
        handler = _voice_handler(pub_socket=None)
        api = MagicMock()
        api.handle_request = AsyncMock(return_value={"type": "voice_ok", "taskId": "t1"})
        handler.voice_api_handler = api
        await handler._handle_voice_api_request({"type": "voice_health", "taskId": "t1"})
        api.handle_request.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_exception_path_does_not_raise_when_no_pub_socket(self):
        handler = _voice_handler(pub_socket=None)
        api = MagicMock()
        api.handle_request = AsyncMock(side_effect=RuntimeError("boom"))
        handler.voice_api_handler = api
        await handler._handle_voice_api_request({"type": "voice_health", "taskId": "t2"})


class TestHandleVoiceApiRequestLongRunning:
    """_handle_voice_api_request() — dedup (is_long_running=True) paths.

    The dedup set is also exercised by test_28_zmq_voice_handler_dedup.py; these
    tests make the slice self-contained and document the branch explicitly.
    """

    @pytest.mark.asyncio
    async def test_long_running_type_adds_and_clears_task_id(self):
        """Happy path: voice_translate enters and exits the in-flight set."""
        handler = _voice_handler(pub_socket=MagicMock())
        handler.pub_socket.send = AsyncMock()
        api = MagicMock()
        api.handle_request = AsyncMock(return_value={"type": "voice_api_success", "taskId": "vt-1"})
        handler.voice_api_handler = api

        await handler._handle_voice_api_request({"type": "voice_translate", "taskId": "vt-1"})

        api.handle_request.assert_awaited_once()
        assert "vt-1" not in handler._in_flight_voice_translates

    @pytest.mark.asyncio
    async def test_duplicate_long_running_task_id_is_dropped(self):
        """Duplicate in-flight taskId must skip handle_request entirely."""
        handler = _voice_handler(pub_socket=MagicMock())
        api = MagicMock()
        api.handle_request = AsyncMock(return_value={"type": "ok", "taskId": "vt-dup"})
        handler.voice_api_handler = api

        handler._in_flight_voice_translates.add("vt-dup")
        await handler._handle_voice_api_request({"type": "voice_translate", "taskId": "vt-dup"})

        api.handle_request.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_long_running_exception_releases_task_id(self):
        """Exception during voice_translate must still discard the taskId (finally)."""
        handler = _voice_handler(pub_socket=None)
        api = MagicMock()
        api.handle_request = AsyncMock(side_effect=RuntimeError("pipeline error"))
        handler.voice_api_handler = api

        await handler._handle_voice_api_request({"type": "voice_translate", "taskId": "vt-err"})

        assert "vt-err" not in handler._in_flight_voice_translates


class TestHandleVoiceProfileRequestNoPubSocket:
    """_handle_voice_profile_request() — no-pub-socket paths (success + exception)."""

    @pytest.mark.asyncio
    async def test_success_path_logs_error_when_no_pub_socket(self):
        handler = _voice_handler(pub_socket=None)
        profile = MagicMock()
        profile.handle_request = AsyncMock(return_value={"type": "profile_ok", "request_id": "r1"})
        handler.voice_profile_handler = profile
        await handler._handle_voice_profile_request({"request_id": "r1"})
        profile.handle_request.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_exception_path_does_not_raise_when_no_pub_socket(self):
        handler = _voice_handler(pub_socket=None)
        profile = MagicMock()
        profile.handle_request = AsyncMock(side_effect=RuntimeError("profile error"))
        handler.voice_profile_handler = profile
        await handler._handle_voice_profile_request({"request_id": "r2", "user_id": "u1"})


class TestOnTranslationJobCompleted:
    """_on_translation_job_completed() — completed, failed, no-pub, exception paths."""

    def _job(self, status: str, result=None, error=None, error_code=None):
        return SimpleNamespace(
            id="job-1",
            status=SimpleNamespace(value=status),
            user_id="user-1",
            result=result,
            error=error,
            error_code=error_code,
        )

    @pytest.mark.asyncio
    async def test_publishes_completed_job_with_result(self):
        pub = MagicMock()
        pub.send = AsyncMock()
        handler = _voice_handler(pub_socket=pub)

        job = self._job("completed", result={"translatedAudio": "/audio.mp3"})
        await handler._on_translation_job_completed(job)

        pub.send.assert_awaited_once()
        payload = json.loads(pub.send.call_args[0][0].decode())
        assert payload["type"] == "voice_translation_completed"
        assert "result" in payload

    @pytest.mark.asyncio
    async def test_publishes_failed_job_with_error(self):
        pub = MagicMock()
        pub.send = AsyncMock()
        handler = _voice_handler(pub_socket=pub)

        job = self._job("failed", error="model crashed", error_code="MODEL_ERROR")
        await handler._on_translation_job_completed(job)

        pub.send.assert_awaited_once()
        payload = json.loads(pub.send.call_args[0][0].decode())
        assert payload["type"] == "voice_translation_failed"
        assert payload["error"] == "model crashed"
        assert payload["errorCode"] == "MODEL_ERROR"

    @pytest.mark.asyncio
    async def test_completed_without_result_does_not_add_result_key(self):
        pub = MagicMock()
        pub.send = AsyncMock()
        handler = _voice_handler(pub_socket=pub)

        job = self._job("completed", result=None)
        await handler._on_translation_job_completed(job)

        payload = json.loads(pub.send.call_args[0][0].decode())
        assert "result" not in payload

    @pytest.mark.asyncio
    async def test_no_pub_socket_logs_error_without_raising(self):
        handler = _voice_handler(pub_socket=None)
        job = self._job("completed", result={"audio": "path"})
        await handler._on_translation_job_completed(job)

    @pytest.mark.asyncio
    async def test_pub_socket_send_exception_is_caught(self):
        pub = MagicMock()
        pub.send = AsyncMock(side_effect=RuntimeError("send failed"))
        handler = _voice_handler(pub_socket=pub)
        job = self._job("completed", result={})
        await handler._on_translation_job_completed(job)


class TestSetVoiceApiServices:
    """set_voice_api_services() — full branch matrix."""

    @pytest.mark.asyncio
    async def test_noop_when_no_voice_api_handler_and_no_pipeline(self):
        """Covers 237->269 (no handler) and 274->exit (no profile handler)."""
        handler = _voice_handler(pub_socket=None)
        handler.voice_api_handler = None
        handler.voice_profile_handler = None
        handler.set_voice_api_services(transcription_service=MagicMock())

    @pytest.mark.asyncio
    async def test_configures_voice_api_handler_services(self):
        handler = _voice_handler(pub_socket=None)
        api = MagicMock(spec=[
            "transcription_service", "translation_service", "voice_clone_service",
            "tts_service", "voice_analyzer", "translation_pipeline", "analytics_service",
        ])
        handler.voice_api_handler = api
        handler.voice_profile_handler = None

        svc = MagicMock()
        handler.set_voice_api_services(transcription_service=svc, translation_service=svc)
        assert api.transcription_service == svc

    @pytest.mark.asyncio
    async def test_skips_operation_and_system_handlers_when_absent(self):
        """Covers 247->257 and 257->266 False branches (no sub-handler attrs)."""
        handler = _voice_handler(pub_socket=None)
        api = MagicMock(spec=[
            "transcription_service", "translation_service", "voice_clone_service",
            "tts_service", "voice_analyzer", "translation_pipeline", "analytics_service",
        ])
        handler.voice_api_handler = api
        handler.voice_profile_handler = None
        handler.set_voice_api_services()

    @pytest.mark.asyncio
    async def test_configures_operation_handlers_when_present(self):
        """Covers 247->True branch (operation_handlers present)."""
        handler = _voice_handler(pub_socket=None)
        op = MagicMock()
        api = MagicMock()
        api.operation_handlers = op
        del api.system_handlers
        handler.voice_api_handler = api
        handler.voice_profile_handler = None

        svc = MagicMock()
        handler.set_voice_api_services(transcription_service=svc)
        assert op.transcription_service == svc

    @pytest.mark.asyncio
    async def test_configures_system_handlers_when_present(self):
        """Covers 257->True branch (system_handlers present)."""
        handler = _voice_handler(pub_socket=None)
        sys_h = MagicMock()
        api = MagicMock()
        del api.operation_handlers
        api.system_handlers = sys_h
        handler.voice_api_handler = api
        handler.voice_profile_handler = None

        svc = MagicMock()
        handler.set_voice_api_services(transcription_service=svc)
        assert sys_h.transcription_service == svc

    @pytest.mark.asyncio
    async def test_wires_translation_pipeline_callback(self):
        """Covers lines 270-271 (pipeline.on_job_completed = callback)."""
        handler = _voice_handler(pub_socket=None)
        handler.voice_api_handler = None
        handler.voice_profile_handler = None

        pipeline = MagicMock()
        pipeline.on_job_completed = None
        handler.set_voice_api_services(translation_pipeline=pipeline)

        # Bound methods aren't cached — compare via __self__ and __func__
        assert pipeline.on_job_completed.__self__ is handler
        assert pipeline.on_job_completed.__func__.__name__ == "_on_translation_job_completed"

    @pytest.mark.asyncio
    async def test_configures_voice_profile_handler_when_present(self):
        """Covers line 274 True branch (voice_profile_handler present)."""
        handler = _voice_handler(pub_socket=None)
        handler.voice_api_handler = None

        profile = MagicMock()
        handler.voice_profile_handler = profile

        svc = MagicMock()
        handler.set_voice_api_services(voice_clone_service=svc, transcription_service=svc)
        assert profile.voice_clone_service == svc
        assert profile.transcription_service == svc
