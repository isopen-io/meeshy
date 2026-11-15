# Mesures de la routine d'appels

Chaque mesure est reproductible et donne ses chiffres bruts. Un gain qui n'est pas ici n'est pas annoncé.

## 2026-11-08 — prise en charge d'une tâche par un worker du traducteur (#16780)

- **Ce qu'on mesure** : le délai entre le dépôt d'une tâche et le moment où un worker de
  `TranslationPoolManager` la prend. La vraie boucle de worker tourne (`start_workers`), en vrai
  `asyncio`. `_process_task` est remplacé par un enregistreur : aucun modèle ML n'entre dans la
  mesure. La pool est au repos et chaque cas compte 20 essais.
- **Script** : la même mesure est faite par
  `services/translator/tests/test_call_caption_fast_lane.py::test_idle_workers_take_a_fast_lane_task_within_50_ms`.

| cas | avant (`origin/dev` @ `fa0281356`) | après |
|---|---|---|
| dépôt direct dans la voie rapide | p50 968,98 ms · max 970,26 ms | p50 0,15 ms · max 0,33 ms |
| sous-titre court (14 car.) via `enqueue_task` | p50 968,91 ms · max 970,11 ms | p50 0,14 ms · max 0,66 ms |
| sous-titre long (400 car.) via `enqueue_task` | p50 18,91 ms · max 20,56 ms (accumulateur de lots) | p50 0,15 ms · max 0,20 ms |

**Cause de l'ancien délai** : `_get_next_task` regardait la voie rapide une seule fois, sans
attendre, puis bloquait jusqu'à 1 s sur la file ordinaire. Une tâche courte arrivée au repos
attendait donc la fin de ce délai.

**Limite** : le temps d'inférence NLLB n'entre pas dans la mesure. Pour la chaîne complète, il
faut lire `call_caption_translation_seconds` sur le staging.

## Cycle 13 — 2026-11-08 — quota de voie rapide (#16782)

- **Ce qu'on mesure** : la voie rapide est maintenue à 40 sous-titres pendant 2 s. Chaque tâche
  coûte 2 ms de service simulé, sans modèle ML. 20 tâches normales attendent dès le départ.
  « Avant » est le comportement d'avant le lot, l'ordre strict, simulé par une rafale de 10^9.
  Deux passes par ligne.
- **Script** : hors dépôt (`bench_fast_lane_quota.py`, scratchpad du cycle 13). Les témoins
  `tests/test_fast_lane_quota*.py` en reprennent la propriété.

| workers | quota | p50 / p95 sous-titre | régulières prises (sur 20) | 1ʳᵉ régulière | dernière régulière |
|---|---|---|---|---|---|
| 2 | aucun | 47,11 / 48,55 ms | **0** | jamais | – |
| 2 | N=8 | 47,77 / 51,58 ms | **20** | 19,35 ms | 436,58 ms |
| 4 | aucun | 23,19 / 24,13 ms | **0** | jamais | – |
| 4 | N=8 | 23,27 / 25,53 ms | **20** | 19,39 ms | 153,78 ms |

**Lecture** : sans quota, aucune tâche ordinaire n'est servie tant que la voie rapide est
saturée. Avec N=8, toutes le sont. Côté sous-titre, cela coûte de 0 à 1 ms au p50 et de 1 à 3 ms
au p95.
