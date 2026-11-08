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
