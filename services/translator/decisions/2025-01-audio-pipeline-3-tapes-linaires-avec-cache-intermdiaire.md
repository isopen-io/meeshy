## 2025-01: Audio Pipeline - 3 tapes linaires avec cache intermdiaire
**Statut**: Accept
**Contexte**: Un audio transcrit une fois, traduit en N langues
**Decision**: Transcription (Whisper) -> Translation (NLLB) -> TTS (Chatterbox). Cache Redis par tape (`audio:transcription:{id}`, `audio:translation:{id}:{lang}`)
**Alternatives rejet**: Modle end-to-end (qualit infrieure, moins de langues), pipeline parallle (impossible, transcription requise avant traduction)
**Cons**: Latence cumule ~1.5s (500ms STT + 200ms MT + 800ms TTS)
