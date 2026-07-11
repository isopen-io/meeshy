# Iteration 166 — Analyse d'optimisation (2026-07-11)

## Protocole (démarrage)
`main` @ `448a17a` (dernier merge : iOS conversation header — call button sizing).
Branche `claude/brave-archimedes-d7bre9` en phase avec `origin/main` (0/0).

Aucune PR autonome ouverte à traiter au démarrage. Ce cycle prend **166**.

Cible choisie parmi le **backlog explicitement reporté** des itérations 163 et 165
(« candidats non retenus, consignés pour un futur cycle ») :

> **web** — `friend_story_comment` route vers `/post` au lieu de `/story` dans
> `resolveContentRoute` (`apps/web/utils/notification-helpers.ts:165`). **Masqué en production** :
> la gateway persiste `metadata.postType='STORY'` sur ces notifs, donc la branche `kind === 'STORY'`
> court-circuite avant d'atteindre la dérivation par type. Bug réel mais latent. Faible priorité.

Confirmé toujours présent (aucune itération 164/165 ne l'a touché). Le second candidat backlog
(réaction cross-session : Participant ID vs User ID) est écarté ce cycle : il est cross-couche
(type partagé + gateway + web), non validable en runtime dans cet environnement (pas de build web),
et reste consigné.

---

## Cible retenue : F125 — `resolveContentRoute` route `friend_story_comment` (et toute variante de type story préfixée) vers `/post` au lieu de `/story`

### Current state
`apps/web/utils/notification-helpers.ts`. `resolveContentRoute(notification)` résout la route de
base d'un contenu social. En l'absence du discriminant `metadata.contentType`/`metadata.postType`,
elle dérive la route du **type** de notification :

```ts
const type = notification.type;
if (typeof type === 'string') {
  if (type === NotificationTypeEnum.STATUS_REACTION || type === NotificationTypeEnum.FRIEND_NEW_MOOD) return '/mood';
  if (type === NotificationTypeEnum.FRIEND_NEW_STORY || type.startsWith('story')) return '/story';   // ← startsWith
}
return '/post';
```

Les types « story » de l'enum (`packages/shared/types/notification.ts`) :
- `STORY_REACTION = 'story_reaction'` → `startsWith('story')` ✓ `/story`
- `STORY_NEW_COMMENT = 'story_new_comment'` → `startsWith('story')` ✓ `/story`
- `STORY_THREAD_REPLY = 'story_thread_reply'` → `startsWith('story')` ✓ `/story`
- `FRIEND_NEW_STORY = 'friend_new_story'` → match explicite ✓ `/story`
- `FRIEND_STORY_COMMENT = 'friend_story_comment'` → **ne commence pas par `story`**, pas
  `FRIEND_NEW_STORY` → tombe dans le `return '/post'` final ✗

### Problems identified
Une notification `friend_story_comment` **sans** `metadata.contentType`/`postType` est routée vers
`/post/{postId}#comment-{commentId}` au lieu de `/story/{postId}#comment-{commentId}`. L'utilisateur
qui tape la notif « commentaire sur la story d'un ami » atterrit sur une route post inexistante /
incohérente pour un contenu story.

Entrée → sortie fausse :
- `{ type: 'friend_story_comment', context: { postId: 's3', commentId: 'c3' } }` (metadata vide)
  → `getNotificationLink` renvoie `/post/s3#comment-c3` au lieu de `/story/s3#comment-c3`.

### Root causes
La dérivation par type utilise `startsWith('story')`, qui rate la seule variante de type story
dont le préfixe n'est pas `story_` mais `friend_`. Le contrat implicite « tout type contenant
`story` vise une story » n'était pas exprimé fidèlement.

### Business impact
Faible mais réel : navigation cassée depuis une notification récente (commentaire de story d'ami,
feature social Phase 4F). Dégrade la découvrabilité et la confiance dans le centre de notifications.

### Technical impact
Nul en dehors du chemin de résolution de route. Fonction pure, pas d'état, pas d'API.

### Risk assessment
Très faible. `type.includes('story')` élargit la couverture aux types story préfixés sans
sur-matcher : aucun type de l'enum ne contient `story` sans être une story (vérifié :
`story_reaction`, `story_new_comment`, `friend_story_comment`, `story_thread_reply`,
`friend_new_story`). Les branches metadata (`STORY`/`MOOD`/`REEL`/`POST`) et mood
(`STATUS_REACTION`/`FRIEND_NEW_MOOD`) sont évaluées avant et restent prioritaires.

### Proposed improvements
Remplacer `type === FRIEND_NEW_STORY || type.startsWith('story')` par `type.includes('story')`
(qui couvre `friend_new_story` et `friend_story_comment` de façon homogène, éliminant aussi la
condition redondante explicite).

### Expected benefits
- `friend_story_comment` (et toute future variante `*_story_*`) route correctement vers `/story`.
- Simplification : une seule condition au lieu de deux.

### Implementation complexity
Triviale — 1 ligne de prod, 3 tests ajoutés.

### Validation criteria
- Nouveau test `friend_story_comment` sans metadata → `/story/s3#comment-c3` (RED avant, GREEN après).
- Tests de non-régression : `story_new_comment`, `story_thread_reply` → `/story#comment`.
- Suite `notification-helpers.test.ts` verte (81 → 84 tests) + consumer
  `use-notifications-manager-rq.test.tsx` vert.

---

## Suivis (backlog, non traités ce cycle)
- **web** — réaction cross-session : mauvaise identité comparée (Participant ID vs User ID),
  `apps/web/hooks/queries/use-reactions-query.ts:411,444`. Correctif propre = enrichir
  `ReactionUpdateEventData` du `userId` du réacteur (type partagé + `createUpdateEvent` gateway +
  consommateur web). Cross-couche, non validable en runtime ici — reporté.
- **gateway** — `PostCommentService.likeComment` (REST) contourne l'invariant « max 1 réaction/user »
  appliqué par le path socket. Caveat de reachability (le client built-in n'envoie que `❤️`).
