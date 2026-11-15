## Leçon 35 — F84c soldé : le durcissement `reactionSummary` était asymétrique entre les 3 services de réaction — vérifier l'état RÉEL de chaque jumeau avant de « propager » (2026-07-06, itération 115)

**Contexte** : F84c (reporté par l'itération 113) décrivait la carte `reactionSummary` des posts/commentaires
comme maintenue par delta read-modify-write et proposait de « propager le durcissement groupBy déjà
appliqué aux réactions de message ». En vérifiant l'état réel de `main`, les trois services étaient dans
**trois états différents** : `ReactionService` (message) recompute carte+total depuis `groupBy`
(le plus dur) ; `PostReactionService`/`CommentReactionService` recomputent le **total** via `count()`
(autoritaire) mais laissent la **carte par emoji** en delta. La PR ouverte #1560 (même numéro d'itération
114, session parallèle) « durcissait » au contraire `ReactionService` en le RAMENANT à un delta + `count()`
— soit une régression vis-à-vis du `groupBy` déjà présent sur `main` (patch écrit contre un `main` plus
ancien). **Règle** : ne jamais faire confiance à la description d'un backlog reporté sur « quel jumeau est
déjà durci » — `grep`/lire les 3 implémentations avant de choisir la cible et la direction. Ici la bonne
direction était d'aligner post/commentaire sur le `groupBy` du message (le meilleur patron), pas l'inverse.

**Fix** : `updatePostReactionSummary`/`updateCommentReactionSummary` réécrites sur
`groupBy({ by:['emoji'], where, _count:{emoji:true} })` → carte ET total autoritaires ; `likeCount`
conservé synchronisé sur le total. Signature privée simplifiée `(id)` (drop `emoji/action/count`), 4 sites
d'appel adaptés. Une requête de MOINS par mutation (`groupBy` remplace `findUnique + count`). 142/142 sur
les 2 suites, 352/352 sur 7 suites voisines, tsc vert. RED prouvé par `git stash` du seul source.

**Trouvaille annexe (env)** : `bun install` déclenche un postinstall `turbo run generate --filter=@meeshy/shared`
qui est resté **bloqué >35 min** sans jamais produire le client Prisma. `prisma generate --generator client`
lancé **directement** dans `packages/shared` a réussi en **643 ms**. Le blocage venait du daemon/orchestration
turbo, pas de Prisma. **Règle** : si le `generate` via turbo/bun postinstall traîne anormalement, le tuer et
lancer `npx prisma generate` + `bun run build` directement dans `packages/shared` (les 2 prérequis de parité
CI documentés dans CLAUDE.md) — beaucoup plus rapide et observable.
