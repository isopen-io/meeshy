---
name: performance-audit
description: Mesurer et comparer la performance d'un projet du monorepo Meeshy (latence, mémoire, démarrage, poids de bundle, durée de build et de tests). À utiliser avant toute optimisation et pour établir ou rejouer une base de mesure.
---

# Mesurer avant d'optimiser

Déléguer à l'agent `ingenieur-performance`.

1. Lire `.amsf/benchmarks/` : ce qui est déjà mesuré, sur quelle machine, à quel SHA.
2. Mesurer la MÊME charge avant et après, au moins cinq passes, médiane et dispersion.
3. Outils du dépôt : `bun run measure` (poids du web), `services/gateway` `test:performance`, `tests/load`, `scripts/ios-perf-benchmark.sh` et `scripts/ios-instruments-trace.sh` (appareil réel), `explain()` MongoDB.
4. Consigner : commande exacte, SHA, machine, résultat. Un chiffre pris dans un conteneur de session ne se compare qu'à un autre chiffre du même conteneur.
5. Pas de cible inventée : un seuil de régression ne se pose que sur un banc reproductible.

Sortie : `.amsf/reports/performance-report.md` et un fichier daté dans `.amsf/benchmarks/`.
