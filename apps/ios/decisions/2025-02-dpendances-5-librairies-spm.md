## 2025-02: Dpendances - 5 librairies SPM
**Statut**: Accept (rvis 2026-05 — Kingfisher retir ; 2026-07 — WhisperKit retir, jamais import)
**Contexte**: Dpendances minimales, Swift Package Manager natif
**Decision**: Firebase 12.12+, Socket.IO 16.1+, WebRTC 141.0+ ; reconnaissance vocale on-device via Apple Speech framework (SFSpeechRecognizer), pas de dpendance tierce
**Alternatives rejet**: CocoaPods (ncessite Ruby, pas natif)
**Cons**: Firebase + WebRTC ajoutent ~30MB au binaire, vendor lock-in Firebase
