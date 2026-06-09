# Iteration 18 — Analyse d'optimisation (2026-06-09)

## Contexte
Suite iter 17 (PR #433 mergée). Gateway presque propre. Focus : dernier console.* gateway + print() Python translator.

## Fichiers ciblés

### Groupe A — Gateway (1 call)
| Fichier | Count | Note |
|---------|-------|------|
| `services/attachments/UploadProcessor.ts` | 1 | Manqué en iter17, ligne 309 |

### Groupe B — Translator Python (15 calls)
| Fichier | Count | Note |
|---------|-------|------|
| `src/main.py` | 8 | Bootstrap prints avant basicConfig + 1 doublon |
| `src/config/settings.py` | 10 | Paths models + env vars, pas de logger |
| `src/services/translation_ml_service.py` | 3 | Dotenv bootstrap + ML import |
| `src/services/tts/model_manager.py` | 1 | Doublon print après logger.warning |

## Exclusions justifiées
- `src/services/tts/voice_params_analyzer.py` — CLI tool (if __name__ == '__main__')
- `__tests__/` — spies et benchmarks intentionnels
- `services/AttachmentEncryptionService.ts:138` — string literal (inchangé depuis iter16)

## Contexte technique Python
- `logging.basicConfig` se configure au bas de main.py (ligne ~114). Problème bootstrap.
- Fix : monter basicConfig avant l'import dotenv → remplacer tous les print() par logger calls
- settings.py : ajouter `import logging; logger = logging.getLogger(__name__)`
- translation_ml_service.py : logger déjà défini ligne 83, monter avant le bloc dotenv
- model_manager.py : logger déjà défini, print ligne 378 est un doublon inutile

## Prochaines itérations
- **Iter 19** : Standardisation response format (reply.send → sendSuccess/sendError) — 1373 calls, 40+ fichiers, à tacler file par file
- **Iter 20** : Socket.IO handler pattern (try/catch manquants dans handlers async)
