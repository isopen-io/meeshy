## 2025-01: STT - Faster-Whisper (pas OpenAI Whisper)
**Statut**: Accept
**Contexte**: Transcription rapide pour pipeline audio temps rel
**Decision**: Faster-Whisper (CTranslate2), modle `distil-large-v3`, compute type `float16`
**Alternatives rejet**: OpenAI Whisper officiel (3-5x plus lent, plus de mmoire), WhisperX (complexit diarization), MMS-ASR (qualit moindre pour langues europennes)
**Cons**: Dpendance CTranslate2 (compilation), installation spare dans Docker
