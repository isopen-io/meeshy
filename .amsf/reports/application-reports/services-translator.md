# services/translator — `@meeshy/translator` 1.97.0

**Rôle** : transcription (Whisper), traduction (NLLB-200), synthèse vocale (Chatterbox, MMS-TTS). FastAPI sur 8000, serveur ZMQ (PULL 5555, PUB 5558).

| | |
|---|---|
| Entrée | `src/main.py` ; image `isopen/meeshy-translator` (cibles CPU et GPU) ; sonde `/live` côté compose |
| Dépend de | Redis ; aucun paquet du workspace ; `generated_languages.py` généré par `packages/shared` |
| Sécurité | aucune authentification HTTP ni ZMQ, CORS `*` — frontière = réseau Docker (décision documentée) ; gardes de chemins et d'URL sur ce qui arrive par ZMQ |
| Tests | pytest, ≈ 154 fichiers sous `tests/` ; quatre jobs CI en Python 3.10 |

## Vérification (2026-11-28)
- Ici : **BLOCKED** — `uv sync` échoue, `download.pytorch.org` est refusé par le proxy du conteneur.
- CI : PASS dans le run complet 46071858083 (@ 7e0ba3f7).
- Image : PASS (`docker.yml` 46095849454).

Aucun changement dans cette session.

## Risques restants
- **B4** : l'image tourne en Python 3.11, la CI teste en 3.10, `pyproject.toml` exige `<3.11`.
- B2b : contrat ZMQ avec la passerelle tenu à la main des deux côtés.
- B11 : noms de variables de ports divergents entre Dockerfile et `main.py` (sans effet tant que les défauts coïncident).
- B8 : `grpcio` épinglé et port 50051 exposé, sans code gRPC.
- Licences : NLLB-200 et MMS-TTS restent tant que Meeshy est gratuit (#9227).
