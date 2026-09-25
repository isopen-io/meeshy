## 2025-01: Translation - NLLB-200
**Statut**: Accept
**Contexte**: 200+ langues avec un seul modle, support langues africaines critique
**Decision**: NLLB-200-Distilled-600M (basic/medium), NLLB-200-Distilled-1.3B (premium)
**Alternatives rejet**: Opus-MT (600+ modles spars), M2M-100 (dprc par Meta), GPT-3.5/4 API (cot prohibitif  100k+ msg/s), mBART (qualit infrieure)
**Cons**: 600M-1.3B params = haute mmoire, infrence CPU lente (mitig par worker pool + batching)
