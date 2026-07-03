# Iteration 89 — Analyse d'optimisation (2026-07-03)

## Protocole (démarrage)
`main` @ `018750c` (« story view receipts durable via the outbox — R6 », HEAD au démarrage).
Branche de travail `claude/brave-archimedes-eihm6t` recréée à neuf depuis `origin/main` (working
tree propre, aucun commit non-mergé à préserver).

PR ouvertes au démarrage : #1413 (iOS bubble — debounce sending clock), #1412 (iOS calls — TURN
refresh retry + busy feedback), #1410 (iOS a11y — Dynamic Type). **Les trois sont iOS/SwiftUI** ;
cet environnement Linux n'a ni toolchain Swift ni MongoDB live. Cible retenue **backend gateway
purement vérifiable en jest** (assertion de la FORME de la clause `where`), **hors de tous ces
fichiers** — aucun conflit de merge attendu.

Méthode : fan-out de 2 agents d'exploration parallèles sur des clusters disjoints (social/posts vs
messaging/conversations), chacun chargé de trouver le motif récurrent « garde/règle appliquée à UNE
méthode mais pas à ses siblings structurellement identiques ». Cible retenue = la plus haute
sévérité **et** confiance parmi les candidats, confirmée par lecture directe du code.

## Cible iter 89 — Fuite de contenu supprimé dans les previews « dernier message »

### Current state
La liste de conversations canonique (`GET /conversations`, `routes/conversations/core.ts:364-367`)
filtre les messages soft-deleted hors de la preview « dernier message » :
```ts
messages: {
  where: { deletedAt: null },            // ← garde soft-delete présente (SSOT)
  orderBy: { createdAt: 'desc' },
  take: 1,
  select: { … },
}
```
C'est la source de vérité : quand le dernier message d'une conversation est supprimé, la preview
recule correctement sur le message précédent non-supprimé.

**Deux siblings servent la MÊME preview `messages[0]` sans cette garde :**

1. **`GET /conversations/search`** (`routes/conversations/search.ts:120-144`) — la recherche de
   conversations. Le bloc `messages` faisait `orderBy: { createdAt: 'desc' }, take: 1` **sans**
   `where: { deletedAt: null }`. Le commentaire du code (l.181-186) dit pourtant explicitement
   « Mirror exactly what `core.ts` does » — mais la garde soft-delete n'a jamais été mirrorée.
   `messages[0]` est émis tel quel comme `lastMessage` (content + attachments).

2. **`GET /users/me/dashboard-stats`** (`routes/users/preferences.ts:155-170`) — les conversations
   récentes du dashboard. Le bloc `messages` avait le même trou. Ironie : le `participant.count`
   **une ligne au-dessus** (l.128-135, comptage des conversations « actives sur 24h ») applique
   déjà `deletedAt: null` dans son `messages.some` — la garde était donc présente et disponible dans
   le MÊME handler, juste pas répliquée sur la preview.

### Problems identified
1. **FUITE DE CONTENU SUPPRIMÉ (correction + confidentialité)** : quand le dernier message d'une
   conversation est soft-deleted, il continue d'apparaître comme preview « dernier message » dans
   deux surfaces — la recherche de conversations et le dashboard — alors qu'il a disparu de la liste
   principale. Le contenu (et pour la recherche, les pièces jointes) d'un message que
   l'utilisateur/modérateur a explicitement supprimé reste exposé.
2. **INCOHÉRENCE INTER-SURFACES** : la même conversation affiche deux « derniers messages »
   différents selon qu'on la voie dans la liste (correct) ou via la recherche/dashboard (message
   fantôme). Régression fonctionnelle directe.

### Root cause
Motif récurrent « fix/règle appliqué à un sous-ensemble de siblings, pas audité sur tous »
(leçons #40/#42/#45/#50/#55/#56/#57). La garde `deletedAt: null` vit dans `core.ts` (la liste
principale, écrite/optimisée en premier et la plus testée). `search.ts` et `dashboard-stats` ont
copié la **structure** du bloc `messages` (`orderBy`/`take`/`select`) sans copier le **filtre** —
exactement comme la leçon #56 (`getFeed` avait divergé de `buildVisibilityFilter`) et la leçon #57
(`routes/messages.ts` DELETE était le sibling REST oublié du curseur `lastMessageAt`).

### Business impact
- Un message supprimé (par pudeur, erreur, ou modération) qui reste visible en preview = brèche de
  confiance produit réelle. Sur la recherche, les pièces jointes du message supprimé fuitent aussi.
- Incohérence visible : la liste dit « dernier message = X », la recherche dit « = Y (supprimé) ».

### Technical impact
Ajout de `where: { deletedAt: null }` au bloc `messages` dans les deux siblings, mirror exact de
`core.ts`. Zéro changement de signature, zéro nouvelle requête, zéro impact perf (le filtre est
appliqué par le query engine sur un `take: 1` déjà indexé sur `createdAt`).

### Risk assessment
Très faible. Le changement RESTREINT le jeu de messages considéré pour la preview (exclut les
supprimés) — comportement déjà en production sur la liste principale depuis toujours. Aucun chemin
ne dépend de voir un message supprimé en preview. Les tests existants qui passent une preview de
message **non-supprimé** (fixtures sans `deletedAt`) restent verts (le filtre ne les exclut pas).

## Audit d'exhaustivité (toutes les previews « dernier message » énumérées)
`grep` sur `messages: { … take: 1 … orderBy: createdAt desc }` dans `routes/`, `services/`,
`socketio/` : **exactement 3 sites** servent une preview « dernier message d'une conversation » :
- `core.ts:364` — **HAS** la garde (SSOT) ✓
- `search.ts:120` — **MISSING** → corrigé
- `preferences.ts:155` — **MISSING** → corrigé

Aucun autre sibling (les autres `take: 1` sont des previews d'attachments/média, hors périmètre ;
tous les comptages `unread`/`stats`/`recompute` appliquent déjà `deletedAt: null` — confirmé par
l'agent d'exploration messaging). Le sweep est **complet**.

## Candidats écartés ce cycle (documentés, pas silencieusement abandonnés)
- **`PostFeedService.getReels` curseur non-monotone vs `getFeed`** (agent social, candidat 1) : bug
  réel de pagination (reels dupliqués/sautés en scroll infini) mais **plus risqué à corriger** (la
  dérivation du curseur touche la sémantique de pagination) et **sévérité moindre** que la fuite de
  contenu supprimé. Reporté à une itération dédiée.
- **`PostService.buildVisibilityFilter` n'inclut pas les contacts DM** vs les feed methods (agent
  social, candidat 2) : sur-restrictif (une story visible dans le tray renvoie 404 à l'ouverture
  pour un contact DM non-ami) — direction SAFE (pas une fuite), reporté.
- **`recordEngagementBatch` double-incrément sous course** (agent social, candidat 3) : dérive
  d'agrégats dénormalisés uniquement (la row `PostEngagement` reste idempotente) — famille
  compteurs déjà largement traitée (iter 79→87), rendement décroissant, reporté.

## Validation criteria
1. `where: { deletedAt: null }` présent dans le bloc `messages` de `search.ts` ET `preferences.ts`,
   forme identique à `core.ts`.
2. Test RED→GREEN dans `search.test.ts` : assert `findMany.mock.calls[0][0].include.messages.where`
   === `{ deletedAt: null }`.
3. Test RED→GREEN dans `preferences-dashboard.test.ts` : assert
   `findMany.mock.calls[0][0].select.messages.where` === `{ deletedAt: null }`.
4. Suites existantes `search.test.ts` + `preferences-dashboard.test.ts` vertes (aucune régression).
