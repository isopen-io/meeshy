## 2025-01: Config - ~50 env vars centralises
**Statut**: Accept
**Contexte**: Configuration flexible pour diffrents environnements (dev/docker/prod, CPU/GPU)
**Decision**: Classe `Settings` unique avec Pydantic Settings, 50+ env vars avec dfauts, proprits calcules
**Alternatives rejet**: Fichiers YAML/JSON (moins flexible Docker/K8s), hardcod (impossible multi-env), multiple classes (dcouverte difficile)
**Cons**: 50+ vars intimidant pour les nouveaux dveloppeurs
