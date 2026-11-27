---
name: performance-audit
description: Audit de performance de Meeshy sur preuve : mesure avant, changement, mesure après. À utiliser quand on soupçonne ou qu'on veut prouver une lenteur.
---
# Audit de performance

1. Nommer le parcours et la mesure : p50, p95, p99, débit, mémoire, poids, démarrage.
2. Mesurer AVANT, avec une commande rejouable. Sans mesure, pas de lot.
3. Trouver le goulot réel (profil, plan de requête, trace), pas le suspect habituel.
4. Changer une chose.
5. Mesurer APRÈS, même charge, même matériel.
6. Ranger le banc dans `.amsf/benchmarks/` et poser un seuil de régression s'il est stable.

Ne pas inventer de cible. Budgets existants : poids du web (`measure-weight`), bancs de traduction (`translation-benchmark.yml`).
