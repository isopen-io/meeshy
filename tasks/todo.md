# Cycle 14 — Les réactions faites en REST n'atteignent jamais les participants hors ligne

## Contexte
Le cycle 13 avait fermé ce trou pour les **éditions/suppressions** (`broadcastMessageMutation`,
PR #2619) en nommant les trois audiences d'une mutation de message. Son docstring prévient :
« collapsing them here means a sixth transport cannot silently reopen it ». Le trou n'a pas
été rouvert pour les messages — il n'avait jamais été fermé pour les **réactions**.

## Constats

### D1 (racine) — sept écrivains de réaction, deux seulement rejouent hors ligne
| # | Site | room emit | file d'attente hors ligne |
|---|------|-----------|---------------------------|
| 1 | `ReactionHandler.handleReactionAdd` (socket) | ✅ | ✅ |
| 2 | `ReactionHandler.handleReactionRemove` (socket) | ✅ | ✅ |
| 3 | `routes/reactions.ts` `POST /reactions` | ✅ | ❌ |
| 4 | `routes/reactions.ts` `DELETE /reactions/:id/:emoji` | ✅ | ❌ |
| 5 | `messages-advanced.ts` `POST .../reactions` | ✅ | ❌ |
| 6 | `messages-advanced.ts` `DELETE .../reactions` | ✅ | ❌ |
| 7 | `MeeshySocketIOManager` réaction d'agent | ✅ | ❌ |

### D2 (portée) — REST est le transport PRIMAIRE des réactions sur iOS
`packages/MeeshySDK/Sources/MeeshySDK/Services/ReactionService.swift` : `POST /reactions`,
`DELETE /reactions/{messageId}/{emoji}`. Le web, lui, réagit en socket
(`use-reactions-query.ts`) — donc couvert. Toute réaction posée depuis un iPhone est
**définitivement perdue** pour un pair hors ligne à cet instant : son compte de réactions
en cache reste faux jusqu'à un refetch complet non lié.

### D3 (pourquoi ça a survécu) — un docstring affirme la garantie que le code ne tient pas
`MeeshySocketIOManager.enqueueOfflineMessageMutation` se décrit comme « the REST-side
counterpart of the offline-replay guarantee `MessageHandler` gives the socket edit/delete
path **and `ReactionHandler` gives reactions** ». C'est une affirmation sur le SYSTÈME,
fausse pour cinq des sept sites. Récidive exacte de la leçon 2026-08-07 #1.

### D4 — la duplication cache l'asymétrie (leçon 2026-08-07 #2)
Cinq blocs « `io.to(room).emit(REACTION_*)` » recopiés, aucun ne citant les autres : rien
ne signalait qu'un second canal existait ailleurs. Le correctif utile n'est pas la ligne
d'enqueue recopiée cinq fois, mais le point unique qui NOMME les deux audiences.

### D5 — le `dedupKey` fait partie de l'invariant, pas du détail
`RedisDeliveryQueue` dédoublonne par (messageId, eventType) : sans le `dedupKey`
`(messageId, réacteur, emoji)` que le chemin socket porte déjà, deux réacteurs
différents sur le même message s'effondrent en une seule entrée et tous sauf le premier
sont perdus pour le pair hors ligne. Toute implémentation partagée doit le porter.

## Plan
- [x] T1 — RED : comportement lu via l'API publique (routes REST + helper), pas via les mocks
- [x] T2 — GREEN : `enqueueOfflineReactionEvent` (implémentation unique partagée)
- [x] T3 — GREEN : `broadcastReactionMutation` (point unique nommant les deux audiences)
- [x] T4 — brancher les 5 sites orphelins ; `ReactionHandler` délègue à l'implémentation unique
- [x] T5 — gates : suite gateway complète (592/592, 15443 tests) + `tsc --noEmit` propre
- [x] T6 — changeset + CHANGELOG + lessons
- [ ] T7 — PR, CI vert, merge sur main

## Revue

Le correctif n'est pas « ajouter l'enqueue aux quatre routes REST » : recopié cinq fois,
il reproduirait exactement la structure qui a rendu l'asymétrie invisible. Il consiste à
extraire l'implémentation que `ReactionHandler` détenait **en privé** — donc qu'aucun autre
écrivain ne POUVAIT appeler — et à la placer derrière un diffuseur qui NOMME les deux
audiences, comme le cycle 13 l'avait fait pour les trois audiences d'une mutation de message.

**Deux audiences, pas trois** — c'est la seule divergence assumée avec le sibling message.
Une réaction ne modifie aucun champ de l'aperçu de conversation (dernier message, auteur,
horodatage inchangés), donc `emitConversationPreviewUpdate` n'aurait rien à rafraîchir ;
l'appeler quand même coûterait une lecture DB par réaction pour un événement que les clients
appliqueraient à vide. Le docstring l'énonce pour qu'un lecteur ne prenne pas l'absence pour
un oubli.

**Le `dedupKey` a voyagé avec le code.** C'est le point où ce refactor pouvait discrètement
régresser : `RedisDeliveryQueue` dédoublonne par (messageId, eventType), donc une extraction
qui l'aurait laissé derrière aurait passé tous les tests « une réaction arrive » en perdant
systématiquement le deuxième réacteur d'un même message. Un test dédié le verrouille.

**Le chemin d'agent est inclus** bien qu'il ne soit pas REST : c'est le même défaut (room
comme unique audience), et le laisser dehors aurait recréé le septième écrivain orphelin que
le module existe pour empêcher.

Vérification par mutation : 3 assertions d'enqueue observées ROUGES (« Number of calls: 0 »)
avant le correctif, sur les trois chemins REST distincts (ajout, swap 1-réaction-par-user,
retrait). Les tests des no-op idempotents étaient verts avant comme après — ce sont les
verrous qui garantissent qu'une re-réaction identique ou le retrait d'une réaction déjà
absente n'enfilent toujours rien.
