## 2025-01: TTS - Multi-backend routing par langue
**Statut**: Accept
**Contexte**: Aucun moteur TTS ne couvre toutes les langues avec qualit acceptable
**Decision**: 5 backends avec LanguageRouter auto-select: Chatterbox (primaire, Apache 2.0), Higgs V2 (qualit SOTA), XTTS v2 (legacy), MMS (1100+ langues), VITS (spcifique)
**Alternatives rejet**: Google/Amazon TTS (cot, latence, vendor lock-in), Coqui TTS seul (licence MPL 2.0), engine unique (couverture insuffisante)
**Cons**: 5 engines = image Docker ~8GB, routing complexe
**Attention**: Conflit Chatterbox `transformers==4.46.3` vs traduction `transformers>=5.0.0` - Chatterbox rendu optionnel
