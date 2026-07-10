# Iteration 163 — Analyse d'optimisation (2026-07-10)

## Protocole (démarrage)
`main` @ `a058abe` (dernier merge : story/composer — slide strip header row).
Branche `claude/brave-archimedes-dcjni0` recréée sur `origin/main` (0/0). Ce cycle prend **163**.

PRs ouvertes au démarrage (hors périmètre autonome) :
- #1814 — android/chat : per-message language explorer sheet (`apps/android` uniquement).

Fan-out : deux agents Explore parallèles — (a) `services/gateway/src`, (b) `apps/web` +
`packages/shared`. Consigne : **un** défaut de logique quasi-pure, haute confiance,
**actuellement en production**, non couvert par les tests, hors des périmètres verrouillés.
Priorité 1 = feed social / commentaires (évolution active).

Candidats non retenus ce cycle (consignés pour un futur cycle) :
- **web** — `friend_story_comment` route vers `/post` au lieu de `/story` dans
  `resolveContentRoute` (`apps/web/utils/notification-helpers.ts:165`). **Masqué en production** :
  la gateway persiste `metadata.postType='STORY'` sur ces notifs (NotificationService.ts:1635),
  donc la ligne 157 (`kind === 'STORY'`) court-circuite avant d'atteindre la branche buguée.
  Bug réel mais latent (ne se déclenche que si `metadata` est absent du payload client). Faible priorité.
- **web** — `computeStoryDurationMs` ignore l'alias legacy `content` des overlays texte
  (`apps/web/lib/story-transforms.ts:234` lit `t.text` seul alors que `parseTextObjects` lit
  `r.text ?? r.content`). Réel et non masqué (les stories legacy auto-avancent en 6 s au lieu du
  temps de lecture proportionnel). Bon candidat pour un prochain cycle.
- **gateway** — `PostCommentService.likeComment` (REST) contourne l'invariant « max 1 réaction/user »
  que le path socket applique. Caveat de reachability (le client built-in n'envoie que `❤️`).

---

## Cible retenue : F123 — `createStoryCommentNotificationsBatch` ne filtre PAS la visibilité du post → fuite d'un post restreint (existence + extrait de commentaire) vers des amis non autorisés

### Current state
`services/gateway/src/services/notifications/NotificationService.ts:1546` (`createStoryCommentNotificationsBatch`),
bucket amis `friend_story_comment` (l.1677-1694 avant ce cycle), résolution des destinataires
`getStoryNotificationRecipients` (l.1464-1534). Call site :
`services/gateway/src/routes/posts/comments.ts:247`.

La méthode fanout les commentaires top-level en 3 buckets prioritaires :
1. auteur → `STORY_NEW_COMMENT`
2. commentateurs/réacteurs antérieurs (thread) → `STORY_THREAD_REPLY`
3. **tous les amis de l'auteur** → `FRIEND_STORY_COMMENT` (extrait du commentaire dans le body)

Avant ce cycle la méthode n'avait **aucun** paramètre `visibility` / `visibilityUserIds` : le
bucket amis fanout à **tout** ami accepté de l'auteur, quel que soit le mode de visibilité du post.

### Problems identified
Ses deux siblings gatent pourtant sur la visibilité :
- broadcast temps réel `SocialEventsHandler.broadcastCommentAdded` filtre via
  `getVisibilityFilteredRecipients(...visibility, visibilityUserIds)` (SocialEventsHandler.ts:172-196) ;
- notification de nouveau contenu `createFriendContentNotificationsBatch` reçoit la visibilité
  (call site `routes/posts/core.ts`) et filtre COMMUNITY / ONLY / EXCEPT + retour anticipé PRIVATE
  (NotificationService.ts:1936-1970).

Le call site du fan-out commentaire (`comments.ts:247`) **sélectionne déjà** `visibility` /
`visibilityUserIds` (l.157) et les passe au **broadcast** (l.164), mais **PAS** à la notification.

Entrées → sorties fausses (auteur A ; amis F1, F2, F3) :
- **ONLY [F1]** : F1 (autorisé) commente → F2/F3, qui **ne peuvent pas voir le post**, reçoivent
  chacun `friend_story_comment` « F1 a commenté la publication de A » **avec l'extrait du commentaire**.
- **EXCEPT [F2]** : F2 (explicitement exclu du post) reçoit quand même la notification.
- **PRIVATE** : A commente son propre post privé → **tous** ses amis sont notifiés de l'existence
  du post privé (le retour anticipé PRIVATE du sibling n'existait pas ici).
- **COMMUNITY** : audience = amis de l'auteur au lieu des co-membres de la communauté (mauvaise
  cible ; le broadcast, lui, utilise `getCommunityCoMemberIds`).

### Root cause
La méthode n'a jamais implémenté le gate de visibilité que ses deux siblings appliquent. Le bucket
amis (et le bucket thread) sont matérialisés sans confronter la liste au périmètre ACL du post.

### Business impact
Feature feed social (Priorité 1). **Fuite de confidentialité** : l'existence d'un post restreint
(ONLY/EXCEPT/PRIVATE) **et le contenu du commentaire** sont poussés (in-app + push APN/FCM) à des
utilisateurs non autorisés à voir le post. Divergence entre l'audience notif et l'ACL du post /
l'audience du broadcast temps réel.

### Technical impact
Invariant « l'audience du fan-out ⊆ l'audience ACL du post » cassé, alors que le broadcast associé
(même route, l.164) le respecte. Incohérence notif/broadcast/ACL sur un même événement.

### Risk assessment
Faible. Deux nouveaux paramètres optionnels (`visibility` défaut `PUBLIC`, `visibilityUserIds`
défaut `[]`) → **rétro-compatible** : tous les appels/tests existants sans visibilité gardent un
comportement identique (PUBLIC ⇒ aucun filtrage). Logique quasi-pure (prédicat `canSeePost` + un
fetch co-membres pour COMMUNITY, déjà utilisé par le sibling). Aucune migration.

### Proposed improvements
Threader `visibility` + `visibilityUserIds` du call site route jusqu'à la méthode, et filtrer
**les deux** buckets fan-out (thread + amis) via un prédicat `canSeePost` miroir de
`getVisibilityFilteredRecipients` :
- `PRIVATE` → personne (hors auteur, exempt) ;
- `ONLY` → membres de `visibilityUserIds` ;
- `EXCEPT` → hors `visibilityUserIds` ;
- `COMMUNITY` → co-membres (`getCommunityCoMemberIds`), le bucket amis devenant les co-membres
  (buckets auteur/commenter/thread restant disjoints) ;
- `PUBLIC`/`FRIENDS` → inchangé.

### Expected benefits
Audience du fan-out = ACL du post = audience du broadcast. Plus de fuite d'existence/extrait de
post restreint. Cohérence notif ↔ broadcast ↔ ACL rétablie.

### Implementation complexity
Faible : ~40 lignes dans une méthode (prédicat + dérivation des deux audiences) + 2 lignes au
call site.

### Validation criteria
- RED : 5 des 6 nouveaux tests visibilité échouent contre l'impl neutralisée (vérifié).
- GREEN : 66/66 `NotificationService.storycomments`, 85/85 avec `SocialNotificationPrecision`,
  40/40 sur les tests de route commentaire, `tsc --noEmit` propre (0 erreur), rétro-compat intacte.
- Contrat de retour (`Promise<void>`) inchangé ; broadcast inchangé.
