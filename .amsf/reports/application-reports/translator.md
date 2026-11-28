# `services/translator` — 2026-11-27

Statut de release : **NOT VERIFIED**. Base : `dev` @ `467263ce24`, passe du 2026-11-27.

Aucune porte rejouée : le service demande PyTorch, Whisper et les modèles. Cinq jobs CI le couvrent (tests Python, pipeline audio, TTS et STT, API vocale, banc vocal).

Périmètre : FastAPI port 8000, ZeroMQ PULL 5555 et PUB 5558. Dépend de `packages/shared` par un fichier généré (`generated_languages.py`), tenu par `translator-languages:check`.

Constat : `test:translator`, `build:translator` et `dev:translator` à la racine ne lancent rien (#20732). Le répertoire porte une vingtaine de notes de correctifs datées à sa racine ; non trié.
