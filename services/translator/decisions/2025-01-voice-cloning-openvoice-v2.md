## 2025-01: Voice Cloning - OpenVoice V2
**Statut**: Accept
**Contexte**: Clonage vocal pour personnaliser le TTS
**Decision**: OpenVoice V2 se_extractor (embedding 256-dim), ToneColorConverter, cache fichier 90j, min 10s audio, max 20 chantillons
**Alternatives rejet**: XTTS seul (17 langues seulement), RVC (trop lent, GPU requis), So-VITS-SVC (optimis chant, pas parole)
**Cons**: Fonctionne sur CPU mais plus lent, 10s minimum d'audio ncessaire
**Scurit**: Srialisation JSON uniquement (pas de format binaire non scuris)
