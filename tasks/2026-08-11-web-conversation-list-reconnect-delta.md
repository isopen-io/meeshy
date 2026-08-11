# Cycle 76 — Rattrapage de la LISTE de conversations web au reconnect socket

Instruit en tête de `tasks/todo.md` par le cycle 75. Dernière surface web sans rattrapage
sur une coupure purement socket.

## Plan

- [x] `apps/web/lib/conversations/delta-merge.ts` — règles PURES, miroir de
      `ConversationSyncEngine.mergeDeltaConversations` / `saveSorted` / `reconcileUnread`
      et de `SyncWatermark.advanced` (SDK iOS).
- [x] `apps/web/lib/conversations/infinite-cache.ts` — extraction de
      `updateInfiniteConversationCache` (aujourd'hui privée dans `use-socket-cache-sync.ts`)
      pour qu'il n'existe qu'UNE reconstruction de pages.
- [x] `apps/web/services/conversations/{types,crud.service}.ts` — passer `updatedSince`.
- [x] `apps/web/hooks/queries/use-conversations-delta-sync.ts` — front `false → true` de
      `isSocketConnected`, cooldown partagé, pagination bornée, repli invalidate.
- [x] Câblage dans `useInfiniteConversationsQuery` (le hook qui POSSÈDE l'entrée de cache).
- [x] Témoins : règles pures + hook.
- [x] Nommer le jumeau des DEUX côtés (Swift → TS), leçon 112 #5.

## Arbitrages

1. **Delta `updatedSince`, jamais `refetch()`.** Un refetch d'infinite query relit TOUTES les
   pages et REMPLACE le cache : il perd ce que le socket y a écrit et coûte N requêtes.
2. **Le curseur se CALCULE depuis le cache, il ne se persiste pas.** Un curseur persisté
   demanderait sa propre purge d'identité (leçon 112 #3) ; le max `updatedAt` des lignes en
   cache décrit exactement ce qu'on détient.
3. **Le delta peut TOUJOURS baisser un compteur de non-lus, il ne peut le monter que s'il
   apporte aussi un message plus récent.** Web n'a pas de `lastReadAt` local (iOS oui) : cette
   règle exprime la même intention avec les champs disponibles.
