# Iteration 241 — la pagination par curseur du listing « membres les plus actifs » redémarrait à la page 1 sur un curseur périmé

## Protocole (démarrage)
`main` @ `b9304247` (dernier merge : PR #3301, balayage `{ type: 'object' }`). Branche
`claude/brave-archimedes-qizmsm` alignée sur `origin/main` au départ.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable = TypeScript
(web/shared/gateway). Parité : `bun install --ignore-scripts` (3863 paquets), puis
`npx prisma generate --generator client` + `bun run build` dans `packages/shared`. Runners
vérifiés verts au départ : `services/gateway` (jest — `call-schemas` 78/78), `packages/shared`
(vitest — `duration-format` 10/10).

**Audit anti-doublon** (≈21 PRs ouvertes) : les PRs en vol touchent `use-webrtc-p2p` (web calls,
#3307/#3306/#3263), `routes/communities/*` (#3305/#3298), et une dizaine d'utilitaires purs partagés
(#3299/#3280/#3275/#3270/#3266/#3262/#3259/#3253/#3249), plus des clamps de `limit` de query-schemas
(#3289/#3255). **Aucune ne touche `services/gateway/src/routes/conversations/participants.ts` ni
`services/gateway/src/utils/pagination.ts`.** Zéro chevauchement de fichier.

## Sélection : **Priorité 1 — défaut de justesse dans une fonctionnalité récente (listing restreint des participants), zéro couverture**

Deux agents de chasse au défaut ont balayé en parallèle la surface TS (gateway ; shared/web). Le
défaut retenu est le plus grave et le mieux prouvé : une pagination par curseur qui, sur un curseur
absent de la liste recalculée, ne se termine pas mais **redémarre à la page 1**.

## Current state (avant correctif)

`GET /conversations/:id/participants` a deux régimes de pagination :

- **Non restreint** (admin de conversation/communauté, admin plateforme) : curseur keyset Prisma
  natif (`cursor: { id }, skip: 1`, `orderBy: { id: 'asc' }`). Robuste — un curseur inconnu n'y
  redémarre jamais la page 1.
- **Restreint** (`loadMostActiveParticipants` — un simple membre, ou un anonyme, d'un salon de
  groupe/communauté) : liste **recalculée à chaque requête** depuis le classement vivant
  (`ConversationMessageStats.participantStats` → messageCount puis lastMessageAt) complété par les
  présents, puis filtrée (`onlineOnly`/`role`/`search`), puis découpée en mémoire par un curseur
  `Participant.id`.

Le découpage en mémoire (`participants.ts:138`) :

```ts
const startIndex = cursor ? filtered.findIndex((p) => p.id === cursor) + 1 : 0;
const page = filtered.slice(startIndex, startIndex + pageLimit);
const hasMore = startIndex + page.length < filtered.length;
```

## Problems identified

Quand le `cursor` fourni **n'est plus** dans `filtered`, `Array.prototype.findIndex` rend `-1`, donc
`startIndex = -1 + 1 = 0` : la fonction **re-sert la première page** au lieu de reprendre après le
curseur (ou de terminer).

## Root causes

`findIndex` collapse « introuvable » et « avant le premier élément » sur la même valeur (`-1` →
`startIndex 0`). Sur une liste **stable** (keyset DB), un curseur pointe toujours une ligne
existante, donc le bug est invisible. Sur cette liste **recalculée à chaque appel**, un curseur périmé
est un événement NORMAL, pas une anomalie de client :

- `onlineOnly=true` et le membre du curseur est passé hors ligne entre deux pages ;
- un autre membre a envoyé un message et a rebattu le top-N, éjectant le membre du curseur ;
- un curseur client obsolète ou fabriqué.

## Business impact

Régime restreint = le cas COURANT pour les salons publics/communautaires (tout membre qui n'est pas
admin). Page 2 demandée avec un curseur périmé re-sert la page 1 : **lignes déjà vues dupliquées**, et
le défilement infini **ne se termine jamais** (chaque page « suivante » est de nouveau non vide, avec
un nouveau `nextCursor` lui aussi susceptible d'être périmé). Symptôme utilisateur : liste de membres
qui boucle / se répète pour toute la population non-admin des groupes actifs.

## Technical impact

Découpage par curseur en mémoire faux ; `hasMore`/`nextCursor` dérivés d'un `startIndex` faux. Aucun
autre site du gateway ne porte ce patron (`grep 'findIndex(...) + 1'` → 1 seul résultat, celui-ci).
Pas de jumelle : le listing des membres de communauté n'a pas de pagination en mémoire par curseur.

## Risk assessment

- **Défaut** : certain, prouvé par entrée concrète (`filtered=[a,b,c,d,e]`, `cursor='z'` → page
  `[a,b]` au lieu de `[]`).
- **Correctif** : refactor préservant le comportement pour le cas valide + terminaison propre sur
  curseur périmé. Extraction en fonction pure (SSOT) testée directement. Risque négligeable : les
  autres consommateurs de `pagination.ts` ne voient qu'un export ajouté.

## Proposed improvements

Extraire le fenêtrage par curseur `id` en mémoire dans une fonction pure **source unique**
`sliceByIdCursor` (`utils/pagination.ts`, à côté de `validatePagination`/`buildCursorPaginationMeta`),
qui **termine** sur un curseur introuvable (`startIndex = items.length` → page vide, `hasMore=false`,
`nextCursor=null`) au lieu de redémarrer. `loadMostActiveParticipants` la consomme.

## Expected benefits

- Terminaison propre du défilement infini pour tout membre non-admin d'un groupe actif.
- Plus de lignes dupliquées.
- Invariant rendu explicite et gardé par 7 cas de test unitaires (dont la terminaison sur curseur
  périmé, la garde qui tombait au ROUGE avant correctif).

## Implementation complexity

Faible. +1 export pur (~15 lignes) + 1 import + remplacement d'un bloc de 8 lignes par 2. Aucun
changement de contrat réseau, de schéma, d'API.

## Validation criteria

- [x] RED : `sliceByIdCursor` absent → suite `pagination.test.ts` ROUGE (TS2305).
- [x] GREEN : 7 nouveaux cas verts (16/16 dans `pagination.test.ts`).
- [x] Non-régression : `participants.test.ts` 110/110 ; suite `conversation*` 66 suites / 1379 tests.
- [x] `tsc --noEmit` gateway : 0 erreur.
- [ ] CI verte sur la PR (gate lint/bun réel).

## Améliorations futures (hors périmètre)
- **`normalizeMessage` — repli mort sur `senderId`** (`packages/shared/types/migration-utils.ts:201`)
  : `String(raw.senderId || raw.senderId || '')` est un self-OR (opérande dupliquée), donc le repli
  voulu est du code mort ; une forme portant l'auteur via `sender` sans `senderId` de premier niveau
  sort `senderId: ''`. Défaut certain, MAIS le champ de repli exact (`raw.userId` ? `raw.sender.id`
  ?) relève de l'intention et demande un arbitrage — candidat propre pour une itération dédiée avec
  test sur `migration-utils.ts` (aucun aujourd'hui).
- **`truncateText` trime le blanc de TÊTE contre son contrat** (`apps/web/utils/truncate.ts:82`) : le
  docstring promet « espace de FIN trimé », `.trim()` retire aussi celui de tête. Faible impact,
  déviation de contrat réelle — `.replace(/\s+$/, '')`.
