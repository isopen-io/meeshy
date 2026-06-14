# Iteration 41 — Plan d'implémentation (2026-06-14)

## Objectif
Lot « Fluidité du fan-out, cache-first & pureté des types » : paralléliser le fan-out
de notifications d'invitation et supprimer un aller-retour DB redondant à la création de
conversation ; rendre le dashboard réellement cache-first (spinner sur `isPending`
uniquement) ; corriger l'i18n de l'admin agent ; éliminer les `any` de la couche de
chiffrement partagée (gate bloquante shared).

## Étapes (TDD : RED → GREEN)

### Phase A — Gateway : fan-out parallèle + déduplication DB (`routes/conversations/core.ts`)
- [ ] Ajouter `avatar: true` au `select` de `allUsers` (l.838).
- [ ] Remplacer le 2ᵉ `prisma.user.findUnique` (l.990-997) par `userMap.get(userId)` ;
      conserver le garde `if (creator)`.
- [ ] Remplacer la boucle `for … await createConversationInviteNotification` (l.1001)
      par `await Promise.all(uniqueParticipantIds.map(participantId => …))`.
- [ ] Vérifier non-régression des suites conversation (`conversation-create-block`,
      `conversation-detail-include`, `conversation-list-participant-select`).

### Phase B — Web : dashboard cache-first (`hooks/use-dashboard-data.ts`, `app/dashboard/page.tsx`)
- [ ] `use-dashboard-data.ts` : exposer `isPending` (`isLoading && !data`) et
      `isFetching` (`isLoading && !!data`) en plus de `isLoading` (rétro-compat) ;
      `console.error` → `logger` (`@/utils/logger`).
- [ ] `dashboard/page.tsx:56` : récupérer `isPending` ; l.155 : ne spinner que si
      `isPending` (rendre les données en cache pendant le refetch).
- [ ] Suites web touchées vertes (ou inchangées vs baseline).

### Phase C — Web : i18n admin agent
- [ ] `AgentConversationsTab.tsx` : `formatTimeAgo` utilise `t()` (clés existantes du
      namespace agent ; fallback identique aux variantes `AgentOverviewTab`/`AgentLiveTab`).
- [ ] `AgentMessagesModal.tsx` : idem.

### Phase D — Shared : pureté des types chiffrement (gate bloquante)
- [ ] RED : ajouter à `encryption-utils.test.ts` un test « `validateMetadata` rejette
      des métadonnées malformées / non-objet » (couvre le narrowing `unknown`).
- [ ] GREEN `encryption-utils.ts` : `validateMetadata(metadata: unknown)` (narrowing via
      `Record<string, unknown>`) ; `prepareForStorage` retourne
      `{ encryptionMetadata: EncryptionMetadata }` ; `reconstructPayload(encryptionMetadata: unknown)`.
- [ ] GREEN `encryption-service.ts` : `processReceivedMessage({ encryptionMetadata?: unknown })` ;
      `prepareForStorage` retourne `{ encryptionMetadata: EncryptionMetadata }`.
- [ ] `pnpm --filter @meeshy/shared build` + tests shared **553+** verts.

### Phase E — Vérification & livraison
- [ ] Build shared ; tests shared verts ; tests gateway sans nouvelle régression vs
      baseline (23 échecs préexistants).
- [ ] Commit + push `claude/blissful-cannon-t8a2o4`.
- [ ] PR vers `main`, CI verte (shared + agent), merge ; résolution de conflits si besoin.

## Hors périmètre (consigné dans l'analyse)
F2 (staging), F10 (dual-write/backfill), F17 (re-cibler), F18 (unification formatage),
F21 (sémantique isActive/deletedAt), F22 (batch socket).

## Continuité
Iter 42+ : F18 (unification des helpers de formatage → shared) est le meilleur candidat
autonome de forte valeur (« unification » demandée) une fois le risque de signatures
hétérogènes cadré ; F21 en audit sémantique dédié ; F2/F10 dès qu'une fenêtre staging
existe.

## Statut (mis à jour en fin d'itération)
- [x] Phase A — fan-out parallèle + dédup DB (`core.ts` : `Promise.all`, `userMap.get` ;
      suites conversation vertes, seul échec = baseline préexistant `conversation-deleted-broadcast`)
- [x] Phase B — dashboard cache-first (`use-dashboard-data` expose `isPending`/`isFetching` ;
      `dashboard/page` spinne sur `isPending` ; `console.error`→`logger` ; test page 36/36)
- [x] Phase C — i18n admin agent (`AgentConversationsTab` + `AgentMessagesModal` via `t()`)
- [x] Phase D — pureté types chiffrement (`any`→`unknown`/`EncryptionMetadata` ;
      shared **555/555**, +2 tests ; agent **249/249** intact)
- [ ] Phase E — CI verte, mergé dans main
