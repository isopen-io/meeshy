## 2025-01: Audio - Pipeline WebSocket-only
**Statut**: Accept
**Contexte**: Rsultats de traduction progressifs en temps rel
**Decision**: Audio uniquement via WS `message:send-with-attachments`, pipeline 3 tapes (Whisper -> NLLB -> Chatterbox), vnements progressifs
**Alternatives rejet**: REST (pas de streaming, ncessite polling), pipeline unique (pas de rsultats intermdiaires)
**Cons**: Traduction audio indisponible pour clients REST-only, connexion WS persistante requise
