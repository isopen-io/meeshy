---
"@meeshy/gateway": patch
---

Delivery queue hors-ligne : le rejeu mémoire respecte désormais l'ordre chronologique (FIFO) comme le chemin Redis.

`RedisDeliveryQueue.drain` triait les entrées par `enqueuedAt` uniquement sur le chemin Redis ; le repli mémoire (Redis indisponible) retournait les entrées dans l'ordre brut du tableau. Or une supersession en place (`edited`/`deleted`/`reaction-*`) conserve le slot d'origine — donc antérieur — tout en portant un `enqueuedAt` plus récent : l'ordre du tableau et l'ordre chronologique divergent. Un utilisateur hors-ligne dont tous les événements ont été mis en file mémoire (Redis KO) pouvait ainsi rejouer, par ex., une réaction ré-ajoutée AVANT le retrait intermédiaire, convergeant vers un état que l'expéditeur n'a jamais eu (réaction perdue). `drain` trie maintenant le repli mémoire par `enqueuedAt`, alignant les deux backends. Aucun changement de schéma, d'API ni de migration.
