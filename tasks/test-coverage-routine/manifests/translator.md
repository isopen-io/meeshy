# Coverage Manifest — Translator (FastAPI/ML)

> Exhaustive list of **every** source file, grouped by feature/domain. `[~]` = a same-named test exists today (heuristic — may be shallow); `[ ]` = no obvious test. The routine must bring each to **92% line+branch** and flip to `[x]` once reviewer-approved.

- Source files: **110**
- With a same-named test today (heuristic): **24** (22%)
- Needing tests / verification: **86**

Heuristic note: a `[~]` only means a similarly-named test file exists — it does NOT mean 92% coverage. Every file, `[~]` included, must be verified to 92%.

## (root)  (0/4 have a test)

- [ ] `services/translator/src/__init__.py`
- [ ] `services/translator/src/main.py`
- [ ] `services/translator/src/translation_pb2.py`
- [ ] `services/translator/src/translation_pb2_grpc.py`

## api  (3/6 have a test)

- [ ] `services/translator/src/api/__init__.py`
- [ ] `services/translator/src/api/audio_api.py`
- [ ] `services/translator/src/api/health.py`
- [~] `services/translator/src/api/translation_api.py`
- [~] `services/translator/src/api/tts_models_api.py`
- [~] `services/translator/src/api/voice_api.py`

## config  (1/5 have a test)

- [ ] `services/translator/src/config/__init__.py`
- [~] `services/translator/src/config/message_limits.py`
- [ ] `services/translator/src/config/settings.py`
- [ ] `services/translator/src/config/voice_clone_defaults.py`
- [ ] `services/translator/src/config/voice_cloning_config.py`

## services  (12/28 have a test)

- [ ] `services/translator/src/services/__init__.py`
- [~] `services/translator/src/services/analytics_service.py`
- [~] `services/translator/src/services/audio_fetcher.py`
- [ ] `services/translator/src/services/audio_message_pipeline.py`
- [~] `services/translator/src/services/database_service.py`
- [x] `services/translator/src/services/diarization_service.py`
- [ ] `services/translator/src/services/diarization_speechbrain.py`
- [x] `services/translator/src/services/language_capabilities.py`
- [ ] `services/translator/src/services/model_manager.py`
- [~] `services/translator/src/services/redis_service.py`
- [~] `services/translator/src/services/segment_serialization.py`
- [x] `services/translator/src/services/transcribe_gap_filler.py`
- [~] `services/translator/src/services/transcription_service.py`
- [~] `services/translator/src/services/translation_ml_service.py`
- [~] `services/translator/src/services/translation_pipeline_service.py`
- [ ] `services/translator/src/services/tts_service.py`
- [ ] `services/translator/src/services/voice_analyzer_service.py`
- [~] `services/translator/src/services/voice_api_handler.py`
- [~] `services/translator/src/services/voice_clone_service.py`
- [~] `services/translator/src/services/voice_profile_handler.py`
- [ ] `services/translator/src/services/zmq_audio_handler.py`
- [x] `services/translator/src/services/zmq_models.py`
- [ ] `services/translator/src/services/zmq_pool_manager.py`
- [~] `services/translator/src/services/zmq_server.py`
- [ ] `services/translator/src/services/zmq_server_core.py`
- [ ] `services/translator/src/services/zmq_transcription_handler.py`
- [ ] `services/translator/src/services/zmq_translation_handler.py`
- [x] `services/translator/src/services/zmq_voice_handler.py`

## services/audio_pipeline  (2/8 have a test)

- [ ] `services/translator/src/services/audio_pipeline/__init__.py`
- [ ] `services/translator/src/services/audio_pipeline/audio_message_pipeline.py`
- [ ] `services/translator/src/services/audio_pipeline/multi_speaker_processor.py`
- [ ] `services/translator/src/services/audio_pipeline/retranscription_service.py`
- [~] `services/translator/src/services/audio_pipeline/transcription_guards.py`
- [ ] `services/translator/src/services/audio_pipeline/transcription_stage.py`
- [ ] `services/translator/src/services/audio_pipeline/translation_stage.py`
- [~] `services/translator/src/services/audio_pipeline/tts_language_policy.py`

## services/audio_processing  (0/2 have a test)

- [ ] `services/translator/src/services/audio_processing/__init__.py`
- [ ] `services/translator/src/services/audio_processing/diarization_cleaner.py`

## services/translation_ml  (0/7 have a test)

- [ ] `services/translator/src/services/translation_ml/__init__.py`
- [ ] `services/translator/src/services/translation_ml/model_loader.py`
- [ ] `services/translator/src/services/translation_ml/nllb_translator.py`
- [ ] `services/translator/src/services/translation_ml/seq2seq_translator.py`
- [ ] `services/translator/src/services/translation_ml/translation_cache.py`
- [ ] `services/translator/src/services/translation_ml/translation_service.py`
- [ ] `services/translator/src/services/translation_ml/translator_engine.py`

## services/tts  (1/16 have a test)

- [ ] `services/translator/src/services/tts/__init__.py`
- [ ] `services/translator/src/services/tts/audio_postprocessor.py`
- [ ] `services/translator/src/services/tts/backends/__init__.py`
- [ ] `services/translator/src/services/tts/backends/chatterbox_backend.py`
- [ ] `services/translator/src/services/tts/backends/higgs_backend.py`
- [ ] `services/translator/src/services/tts/backends/mms_backend.py`
- [ ] `services/translator/src/services/tts/backends/vits_backend.py`
- [ ] `services/translator/src/services/tts/backends/xtts_backend.py`
- [ ] `services/translator/src/services/tts/base.py`
- [ ] `services/translator/src/services/tts/language_router.py`
- [ ] `services/translator/src/services/tts/model_manager.py`
- [ ] `services/translator/src/services/tts/models.py`
- [~] `services/translator/src/services/tts/synth_watchdog.py`
- [ ] `services/translator/src/services/tts/synthesizer.py`
- [ ] `services/translator/src/services/tts/tts_service.py`
- [ ] `services/translator/src/services/tts/voice_params_analyzer.py`

## services/voice_api  (1/5 have a test)

- [ ] `services/translator/src/services/voice_api/__init__.py`
- [ ] `services/translator/src/services/voice_api/operation_handlers.py`
- [ ] `services/translator/src/services/voice_api/request_handler.py`
- [ ] `services/translator/src/services/voice_api/system_handlers.py`
- [~] `services/translator/src/services/voice_api/voice_api_handler.py`

## services/voice_clone  (1/11 have a test)

- [ ] `services/translator/src/services/voice_clone/__init__.py`
- [ ] `services/translator/src/services/voice_clone/voice_analyzer.py`
- [ ] `services/translator/src/services/voice_clone/voice_clone_audio.py`
- [ ] `services/translator/src/services/voice_clone/voice_clone_cache.py`
- [ ] `services/translator/src/services/voice_clone/voice_clone_init.py`
- [ ] `services/translator/src/services/voice_clone/voice_clone_model_creation.py`
- [ ] `services/translator/src/services/voice_clone/voice_clone_model_improvement.py`
- [ ] `services/translator/src/services/voice_clone/voice_clone_multi_speaker.py`
- [ ] `services/translator/src/services/voice_clone/voice_fingerprint.py`
- [ ] `services/translator/src/services/voice_clone/voice_metadata.py`
- [~] `services/translator/src/services/voice_clone/voice_quality_analyzer.py`

## services/zmq_pool  (0/5 have a test)

- [ ] `services/translator/src/services/zmq_pool/__init__.py`
- [x] `services/translator/src/services/zmq_pool/connection_manager.py`
- [x] `services/translator/src/services/zmq_pool/translation_processor.py`
- [x] `services/translator/src/services/zmq_pool/worker_pool.py`
- [x] `services/translator/src/services/zmq_pool/zmq_pool_manager.py`

## tests  (0/1 have a test)

- [ ] `services/translator/src/tests/__init__.py`

## tests/integration  (0/2 have a test)

- [ ] `services/translator/src/tests/integration/__init__.py`
- [ ] `services/translator/src/tests/integration/debug_embedding.py`

## utils  (3/10 have a test)

- [~] `services/translator/src/utils/audio_format.py`
- [ ] `services/translator/src/utils/audio_format_converter.py`
- [x] `services/translator/src/utils/audio_utils.py`
- [~] `services/translator/src/utils/model_utils.py`
- [ ] `services/translator/src/utils/performance.py`
- [x] `services/translator/src/utils/pipeline_cache.py`
- [x] `services/translator/src/utils/segment_splitter.py`
- [x] `services/translator/src/utils/smart_segment_merger.py`
- [~] `services/translator/src/utils/text_segmentation.py`
- [ ] `services/translator/src/utils/warning_filters.py`
