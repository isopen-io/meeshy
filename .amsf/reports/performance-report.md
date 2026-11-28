# Rapport de performance (2026-11-28)

**Aucune optimisation n'a été faite, donc aucune comparaison avant/après n'est revendiquée.**

Mesuré : durées de build et de tests (`../benchmarks/2026-11-28-durees.md`), une passe, sous charge parallèle — ordre de grandeur seulement.

Non mesuré (NOT VERIFIED) : latence p50/p95/p99 de l'API, débit, mémoire, requêtes MongoDB, démarrage, rendu web, fluidité iOS/Android. Le conteneur de session n'a ni MongoDB, ni Redis, ni charge reproductible, ni appareil.

Aucun SLO n'est posé ici : le dépôt en fixe par issue et par dimension (CLAUDE.md, treize dimensions), et les mesures sur appareil passent par l'agent `lecture-media` et les scripts `scripts/ios-*`.

Piste relevée, à mesurer avant d'agir : isolation des workers vitest de `packages/shared`.
