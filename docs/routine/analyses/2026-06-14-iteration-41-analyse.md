# Iteration 41 — Analyse d'optimisation (2026-06-14)

## Contexte
Suite iter 40 (lot « Pureté schéma & agrégation côté base », mergé dans `main` —
vérifié : `isDeleted` absent du schéma, `aggregateRaw` présent dans
`admin/languages.ts`). Le plan iter 40 désigne pour la suite : F17 (contrat API
users), F19 (spinner dashboard vs cache), F18 (helpers de formatage dupliqués),
F2/F10 (fenêtre staging requise). Audit fraîchement relancé du spectre récent → ancien
sur les trois surfaces testables sur ce runner Linux (gateway, web, shared) ; l'iOS/SDK
n'est pas testable ici.

Gates CI bloquantes vérifiées : seuls **shared** et **agent** bloquent réellement (le
job `test` met `web` et `gateway` en `continue-on-error`, et `quality` est
`continue-on-error`). Baseline mesurée sur ce runner : shared **553/553** vert ;
gateway 3528 passants / 23 échecs **préexistants** (hors périmètre, surface inchangée).

## Audit — constats vérifiés

### 1. Fan-out de notifications d'invitation séquentiel (latence création de conversation)
`services/gateway/src/routes/conversations/core.ts:1001-1012` : à la création d'une
conversation, les notifications d'invitation sont émises **une par une** dans une boucle
`for … await` :
```ts
for (const participantId of uniqueParticipantIds) {
  await notificationService.createConversationInviteNotification({ … });
}
```
Chaque appel fait des écritures DB + émissions socket + mise en file push. Pour un
groupe de N participants, c'est N allers-retours **séquentiels** sur le chemin de
réponse de l'endpoint. L'état de l'art (déjà appliqué ailleurs dans ce fichier pour les
compteurs non-lus) est `Promise.all(map(...))` : les invitations étant mutuellement
indépendantes, la latence passe de O(N) à O(1) en parallélisme. Impact HAUT,
gateway-only, testable.

### 2. Requête `user.findUnique` redondante à la création de conversation (1 aller-retour DB évitable)
Toujours dans `core.ts` : `allUsers` est chargé l.837-841 (`select` = `id`,
`displayName`, `username`) et indexé dans `userMap` (l.841). Plus loin, l.990-997, le
créateur est **re-chargé** via un second `prisma.user.findUnique` uniquement pour son
`avatar`. Le créateur (`userId`) est déjà dans `allUserIds` donc dans `userMap`. En
ajoutant `avatar: true` au `select` de l.838 et en réutilisant `userMap.get(userId)`,
on supprime un aller-retour DB **à chaque création de conversation**. Impact
FAIBLE-MOYEN, déduplication propre, gateway-only.

### 3. Spinner du dashboard ignorant le cache (F19 — UX cache-first)
`apps/web/hooks/use-dashboard-data.ts` n'expose qu'un seul booléen `isLoading`,
`true` aussi bien au cold-start (aucune donnée) qu'au **re-fetch d'arrière-plan** (cache
de 30 s présent). `apps/web/app/dashboard/page.tsx:155` rend un **spinner plein écran**
dès que `isLoading` est `true` — donc il **masque les données en cache** pendant chaque
rafraîchissement, en violation directe du principe « Cache-First, Network-Second / pas
de spinner quand le cache a des données ». L'état de l'art React Query distingue
`isPending` (jamais eu de données → squelette légitime) de `isFetching` (données
présentes, rafraîchissement silencieux). Le hook étant maison (pas `useQuery`), il faut
exposer les deux dérivés explicitement. Impact HAUT (UX), sûr (logique de rendu pure).
Au passage : `console.error('Error loading dashboard:', err)` (l.43) → `logger`
(cohérence avec iter 40 sur `use-ranking-data`).

### 4. `formatTimeAgo` en français codé en dur dans l'admin agent (correctness i18n)
`apps/web/components/admin/agent/AgentConversationsTab.tsx:42-50` et
`AgentMessagesModal.tsx:29-...` définissent un `formatTimeAgo` qui retourne des chaînes
**françaises codées en dur** (`'maintenant'`, `min`, `h`, `j`) sans passer par `t()`,
alors que les variantes voisines (`AgentOverviewTab`, `AgentLiveTab`, `ScanLogTable`)
acceptent `t`. Un admin anglophone/hispanophone voit du français. Impact MOYEN
(correction de bug), sûr.

### 5. Types `any` dans la couche de chiffrement partagée (pureté — gate bloquante)
`packages/shared/encryption/encryption-utils.ts` :
- l.175 `validateMetadata(metadata: any)` — devrait être `unknown` (le corps fait déjà
  la validation runtime ; c'est précisément le cas d'usage de `unknown` selon CLAUDE.md).
- l.193 `prepareForStorage(...) : { encryptionMetadata: Record<string, any> }` — la
  valeur est `payload.metadata: EncryptionMetadata`, donc typable strictement.
- l.207 `reconstructPayload(encryptionMetadata: any)` — `unknown` (narrowé par
  `validateMetadata`).

`packages/shared/encryption/encryption-service.ts` :
- l.500 `processReceivedMessage({ encryptionMetadata?: any })` → `unknown`.
- l.527 `prepareForStorage(...) : { encryptionMetadata: Record<string, any> }` →
  `EncryptionMetadata`.

CLAUDE.md (racine + shared) interdit `any` : « No `any` — use `unknown` with
validation ». Ces sites sont au **trust boundary** du chiffrement (désérialisation de
métadonnées stockées) — exactement là où `unknown` + validation a le plus de valeur.
Couvert par `encryption-utils.test.ts` (26 tests verts au baseline). Impact MOYEN
(pureté), **dans la gate bloquante shared** donc le plus haut niveau de garantie.

### Faux positifs / reportés (vérifiés pendant l'audit)
- **`isActive` + `deletedAt` sur User/Community** (suggéré par l'audit shared) : **NON
  retenu**. Sur `User`, `isActive` / `deactivatedAt` / `deletedAt` encodent **trois
  états distincts** (actif / désactivé volontairement / supprimé) — ce n'est pas une
  paire booléen-miroir-de-timestamp interdite par la règle. La fusion serait un
  changement de modèle de données touchant des dizaines de sites de requête + backfill ;
  trop risqué pour une passe autonome. Reporté (F21) avec audit sémantique dédié.
- **F18 (unification `formatTime`/`formatDuration`/`formatTimeAgo` → shared)** : réel et
  de forte valeur (« unification » demandée), mais 12+ fichiers aux signatures
  hétérogènes (secondes vs ms vs `Date`) → churn et risque élevés pour un seul trait
  autonome. Reporté en tête de file (F18) ; iter 41 traite la correction i18n ponctuelle
  (constat 4) comme premier pas.
- **F17 (`getAllUsers`)** : l'endpoint repéré est un stub sans consommateur — l'item
  d'origine visait `users.service.getAllUsers` ; à re-cibler avant d'agir. Reporté.
- `MessageHandler` auto-deliver / unread fan-out : déjà `Promise.all` ; passer en
  batch par room serait du churn sans gain mesurable à volumes courants. Reporté (F22).

## Décision iter 41 — lot « Fluidité du fan-out, cache-first & pureté des types »

| Lot | Quoi | Impact |
|-----|------|--------|
| A | `core.ts` : boucle d'invitations → `Promise.all` ; suppression du 2ᵉ `findUnique` créateur (réutilisation `userMap`) | Latence — fan-out O(N)→O(1) ; un aller-retour DB en moins par création |
| B | `use-dashboard-data.ts` expose `isPending`/`isFetching` ; `dashboard/page.tsx` ne spinne plus que sur `isPending` ; `console.error`→`logger` | UX cache-first — plus de spinner masquant le cache au refetch |
| C | `AgentConversationsTab` + `AgentMessagesModal` : `formatTimeAgo` via `t()` | Correction i18n |
| D | `encryption-utils.ts` + `encryption-service.ts` : `any` → `unknown`/`EncryptionMetadata` (+ test de rejet de métadonnées malformées) | Pureté — gate bloquante shared |

## Consignés pour itérations futures

| # | Constat | Impact | Raison du report |
|---|---------|--------|------------------|
| F2 | `SOCKET_LANG_FILTER` OFF par défaut (`MessageHandler.ts:580`) | HAUT (~75 % BP multilingue) | Validation staging requise |
| F10 | `conversationId` scalaire + index sur `Notification` | MOYEN | Dual-write + backfill ; fenêtre de maintenance |
| F18 | Unifier `formatTime`/`formatDuration`/`formatTimeAgo` → `packages/shared` (12+ fichiers) | MOYEN (pureté/unification) | Signatures hétérogènes ; refactor à faire d'un bloc avec revue locales |
| F17 | Re-cibler le vrai `getAllUsers` consommé (pagination/sélection) | MOYEN (BP) | Endpoint repéré = stub ; re-cibler |
| F21 | Sémantique `isActive`/`deactivatedAt`/`deletedAt` (User/Community) | MOYEN | États distincts ; audit sémantique + backfill dédiés |
| F22 | Batch des émissions socket par room (auto-deliver/unread) | FAIBLE | Déjà parallélisé ; gain marginal |

## Gain estimé global
Création de conversation : latence du fan-out de notifications divisée par N (groupes)
et un aller-retour DB supprimé par requête. Dashboard réellement cache-first (aucun
spinner masquant des données fraîches en cache au refetch). Admin agent correctement
localisé. Couche de chiffrement partagée 100 % `any`-free aux trust boundaries, couverte
par la gate bloquante shared.
