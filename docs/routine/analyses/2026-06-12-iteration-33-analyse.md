# Iteration 33 — Analyse d'optimisation (2026-06-12)

## Contexte
Suite iter 32 (auto-delivery batché, service privacy partagé — mergé via PR #574/#575). Le plan
iter 32 désignait pour iter 33 : **F1 + F6** (API conversations : cap participants + gardes
pagination). Audit mené sur `GET /conversations/:id`, la pagination offset du gateway, et la
duplication des validateurs.

## Constats retenus pour iter 33

### 1. `GET /conversations/:id` — participants sans cap ni filtre `isActive` (F1, CRITIQUE)
`services/gateway/src/routes/conversations/core.ts:599-633`

L'`include.participants` du détail n'a **ni `take`, ni `where: { isActive: true }`, ni `orderBy`** :
- Un groupe de 500+ membres renvoie ~500 KB de participants hydratés (participant + user) à CHAQUE
  ouverture de conversation, alors que la liste (`GET /conversations`) est déjà capée à 5 et que
  l'endpoint dédié paginé `GET /conversations/:id/participants` existe (cursor, limit 100).
- Les participants **inactifs** (membres partis) sont renvoyés, contrairement à la liste et à
  l'endpoint dédié.

Vérification consommation clients (raison du report en iter 32, levée ici) :
- **Web** : `conversation-participants.tsx` n'affiche que les 3 premiers ; le modal settings utilise
  l'endpoint dédié (`participants.service.ts` → `getAllParticipants()` paginé) avec
  `conversation.participants` en simple fallback. Tolère une liste partielle.
- **iOS** : `APIConversation.participants` optionnel ; le SDK expose `listParticipants()` (cursor).
  Le titre DM requiert ≥2 participants — non affecté par un cap à 100. Tolère une liste partielle.
- État de l'art (WhatsApp/Telegram/Slack) : le détail d'une conversation ne transporte JAMAIS la
  liste complète des membres — un compteur exact + une liste paginée à la demande.

Mitigation du seul usage "compteur" (`conversation.participants.length` web) : exposer un
`memberCount` exact (count filtré `isActive`) — le champ est **déjà déclaré** dans
`conversationSchema` (`packages/shared/types/api-schemas.ts:1045`), il passe donc la sérialisation.

### 2. `meta.conversationStats` : payload mort + calcul mort sur le chemin chaud (NOUVEAU, HAUT)
`services/gateway/src/routes/conversations/core.ts:655-713`

Le handler calcule `conversationStatsService.getOrCompute(...)` puis renvoie
`meta: { conversationStats }` dans `data`. Or `conversationSchema` ne déclare **pas** de propriété
`meta` → `fast-json-stringify` la **strippe silencieusement du wire** (même classe de bug que le
strip historique `data.conversation` documenté dans `api-schemas.ts`). Conséquences :
- Aucun client ne reçoit ni ne lit ces stats par REST (web/iOS les consomment via l'event
  Socket.IO `conversation:stats` — vérifié : `presence.service.ts`, `MessageSocketManager.swift`).
- Le calcul à froid (`message.groupBy` sur TOUS les messages + scan participants, TTL 1h par
  conversation) est exécuté à chaque première ouverture de conversation de l'heure — **travail DB
  coûteux dont le résultat est jeté**.
- Le warm-up n'est pas requis ailleurs : `updateOnNewMessage` (chemin socket) se recompute seul si
  le cache est vide ; `getActiveConversationIds` n'est utilisé que par les tests.

Décision : supprimer l'appel + le bloc `meta` (zéro changement de wire — il était déjà strippé),
au lieu de "réparer" le strip en ajoutant au payload des données que personne ne consomme par REST.

### 3. `validatePagination` — offset non borné (F6, MOYEN) + 10 implémentations dupliquées (HAUT)
- `utils/pagination.ts:16` : `Math.max(0, parseInt(offset))` sans plafond — `offset=1e15` force un
  `skip` MongoDB massif (scan O(n)) sur `GET /conversations/:id/messages`. Vecteur d'abus trivial.
- **10 copies** de la même logique : `utils/pagination.ts`, `routes/admin/types.ts`,
  `routes/users/{devices,profile,preferences}.ts`, `routes/communities/types.ts`,
  `routes/communities.ts`, `routes/{conversation-preferences,community-preferences,friends}.ts`.
  Violation directe du principe Single Source of Truth du projet ; aucune copie ne borne l'offset,
  et les signatures divergent (`{offset,limit}` vs `{offsetNum,limitNum}`, 3e param `maxLimit` vs
  `defaultLimit`) — terrain à bug garanti.

## Constats consignés pour itérations futures (non traités ici)

| # | Constat | Localisation | Impact | Raison du report |
|---|---------|--------------|--------|------------------|
| F2 | `SOCKET_LANG_FILTER` OFF par défaut (infra B1+B3 complète, mesure de gain loggée) | `MessageHandler.ts:580` | HAUT (~75 % bande passante multilingue) | Flip = validation staging/produit requise (mesure `[lang-filter]` à activer en staging d'abord) |
| F3 | Stores Zustand `Map` sans selectors → re-renders globaux | `apps/web/stores/*` | ÉLEVÉ | Refactor web dédié |
| F4 | Pollings admin (10 s/30 s) → events Socket.IO | `apps/web/components/admin/agent/*` | HAUT (admin only) | Events serveur à créer |
| F5 | `recharts`/`mermaid` importés statiquement (bundle admin) | `RankingStats.tsx`, `MermaidDiagramImpl.tsx` | ÉLEVÉ | Itération web dédiée |
| F7 | `GET /conversations/:id` : `notification.findMany({userId, isRead:false})` complet puis filtre JSON client-side | `core.ts:682-692` | MOYEN | Limite Prisma/Mongo sur filtres JSON ; nécessite dénormalisation `conversationId` sur Notification |
| F8 | Champs participant du détail non trimés (include complet vs select T17 de la liste) | `core.ts:602-618` | MOYEN | Vérifier champs réellement lus par les vues détail avant trim |

## Décision iter 33
Traiter 1+2+3 (gateway uniquement, zéro changement de contrat consommé) :
- **A1** : cap participants détail (`isActive: true`, `orderBy joinedAt asc`, `take: 100`) +
  `memberCount` exact (count filtré) dans la réponse.
- **A2** : suppression du calcul stats mort + bloc `meta` strippé.
- **A3** : `validatePagination` unifié dans `utils/pagination.ts` (options object, clamp
  `maxOffset` 100 000 par défaut) ; suppression des 9 copies, migration des call sites.

**Gain estimé** : payload détail divisé par ~5 sur les gros groupes (cap 100 + plus d'inactifs) ;
-1 `message.groupBy` plein scan par ouverture de conversation à froid ; offset borné sur toutes les
routes paginées ; -9 implémentations dupliquées (~90 lignes), une seule source de vérité testée.
