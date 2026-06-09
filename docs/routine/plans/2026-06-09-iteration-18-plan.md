# Iteration 18 — Plan d'implémentation (2026-06-09)

## Phase A — Gateway (1 call)
- [ ] `services/attachments/UploadProcessor.ts:309` → logger.error

## Phase B — Translator Python (4 fichiers)
- [ ] `src/main.py` — monter basicConfig avant dotenv, remplacer 8 print()
- [ ] `src/config/settings.py` — ajouter logger, remplacer 10 print()
- [ ] `src/services/translation_ml_service.py` — monter logger avant dotenv, remplacer 3 print()
- [ ] `src/services/tts/model_manager.py` — supprimer print doublon ligne 378

## Règles
- Translator CLAUDE.md : `logger = logging.getLogger(__name__)` + prefix `[TRANSLATOR]`
- Bootstrap prints (avant basicConfig) : monter basicConfig en haut du fichier
- settings.py : logger = INFO pour ensure_model_directories, DEBUG pour paths setup
- Pas de changement de comportement fonctionnel — uniquement routing des sorties
