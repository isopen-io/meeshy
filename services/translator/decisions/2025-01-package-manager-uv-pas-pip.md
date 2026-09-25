## 2025-01: Package Manager - uv (pas pip)
**Statut**: Accept
**Contexte**: pip prend 4.5 min pour installer PyTorch + deps
**Decision**: `uv` (Rust-based) - 10-100x plus rapide. `uv sync` (4s) vs `pip install` (4min 32s). `pyproject.toml` source de vrit
**Alternatives rejet**: pip (trop lent), poetry (3x seulement), pipenv (abandonn), conda (pas adapt Docker prod)
**Cons**: Moins mature que pip, ncessite binaire `uv` dans l'image Docker
