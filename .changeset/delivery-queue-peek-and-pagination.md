---
"@meeshy/gateway": patch
"@meeshy/shared": patch
---

Deux corrections de robustesse alignant le code sur son contrat documenté.

**`RedisDeliveryQueue.peek()` — ordre de rejeu (gateway).** Le chemin rapide de
`peek()` (aucune entrée en repli mémoire) renvoyait la tranche Redis dans l'ordre
brut de la liste (ordre de slot), sans le tri `byEnqueuedAt` qu'appliquent
`drain()` et le chemin mixte de `peek()`. Or `ENQUEUE_DEDUP_LUA` remplace un
événement mutable **sur place** — il conserve le slot FIFO d'origine tout en
estampillant un `enqueuedAt` plus récent — donc l'ordre de slot peut diverger de
l'ordre chronologique. L'aperçu remontait alors un ordre de rejeu que le client
en reconnexion ne verra jamais (p. ex. une édition avant le message qu'elle cible),
violant l'invariant « order by enqueuedAt exactly like drain() » de `peek()`
lui-même. Correction : lecture complète `(0, -1)` puis tri par `enqueuedAt` **avant**
d'appliquer la limite (un `lrange(0, limit-1)` borné découpe en ordre de slot et
peut écarter l'entrée chronologiquement la plus ancienne).

**`CommonSchemas.pagination` — coercion défensive (shared).** Les transforms
`limit`/`offset` appliquaient `|| défaut` à la chaîne brute **avant** `parseInt`,
ne rattrapant donc que `undefined`/`''` : `'abc'` produisait `NaN` et `'-5'` passait
tel quel, l'un comme l'autre pouvant fuiter dans un `take`/`skip` Prisma. Le repli
est désormais appliqué **après** `parseInt`, avec bornage (`limit` 1..100,
`offset` ≥ 0), à l'image du `validatePagination` de la gateway. Couvre `pagination`
et `messagePagination`. Aucun changement de schéma, d'API ni de migration.
