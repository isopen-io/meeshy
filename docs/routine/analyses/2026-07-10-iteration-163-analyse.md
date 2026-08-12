# Itération 163 — `PUT /messages/:messageId` : le fix « caption vide » reste mort en prod (AJV `minLength: 1`)

## Current state
Le commit `8fcdc13` (#1803, « allow empty content on message edit for attachment
caption removal ») a apporté la parité REST/socket pour la suppression de légende :
un edit à contenu vide est autorisé quand le message porte des pièces jointes.

Côté REST (`PUT /conversations/:id/messages/:messageId`,
`services/gateway/src/routes/conversations/messages-advanced.ts`), le fix a :
- relâché le schéma **Zod** `EditMessageBodySchema` (`z.string().max(10000)`, plus de `.min(1)`) ;
- déplacé la décision de vacuité dans le handler via le garde
  `hasAttachments` (`if ((!content || content.trim().length === 0) && !hasAttachments)`).

Mais le schéma **Fastify AJV** `schema.body` de la route est resté inchangé, avec
`content: { type: 'string', minLength: 1 }`.

## Problems identified
Dans le cycle de vie d'une requête Fastify, la validation de schéma AJV s'exécute
**avant** `preHandler`/handler (`preValidation → validation → preHandler → handler`).
Un edit de suppression de légende (contenu vide sur un message avec pièce jointe)
est donc rejeté par un **400 AJV** au niveau du schéma, et le handler — avec son
garde `hasAttachments` et le re-parse Zod permissif — n'est **jamais atteint**.

La fonctionnalité que le commit `8fcdc13` voulait activer sur REST **reste morte
en production**.

## Root cause
Le fix a relâché la couche Zod (re-parse *à l'intérieur* du handler) mais a oublié
la couche AJV `schema.body`, qui est la **première** barrière de validation et
s'applique en amont. C'est exactement la classe de bug que ce même commit a corrigée
côté socket (le `.min(1)` de `SocketMessageEditSchema` masquait la branche
`hasAttachments`) — répétée une couche plus haut sur le chemin REST.

## Business impact
Feature messagerie (Priorité 1). Sur web/mobile via REST, effacer la légende d'une
photo/audio/fichier tout en gardant le média échoue avec une erreur de validation
opaque. La parité socket/REST annoncée par #1803 n'existe pas sur le chemin REST.

## Technical impact
Branche `hasAttachments` du handler REST **inaccessible** pour un contenu vide.
Divergence silencieuse socket ↔ REST. Le re-parse Zod permissif (`safeParse`) devient
du code mort pour la casse « contenu vide ».

## Risk assessment
Faible. Le changement retire une contrainte de longueur minimale et conserve la
borne max (10 000) plus `required: ['content']`. La vacuité reste gardée par le
handler (`hasAttachments`) — un message SANS pièce jointe et à contenu vide reste
rejeté par un 400 explicite (« Message content cannot be empty »). Aucun élargissement
de surface d'attaque : la longueur max et la présence de la clé restent imposées.

## Why the tests didn't catch it
La suite `conversation-messages-advanced.test.ts` invoque la **fonction handler
directement** (`getHandler(...)`), ce qui court-circuite la validation AJV
`schema.body` de Fastify. Les cas « empty content succeeds when the message has
attachments » passaient donc au niveau handler alors que la production rejetait la
requête une couche au-dessus — un faux vert, la même faille « le schéma au bord
masque la branche » que #1803 avait pointée pour le socket.

## Proposed improvements
1. Extraire le schéma AJV du body dans une constante exportée
   `editMessageBodyJsonSchema` (source unique référencée par la route ET les tests).
2. Corriger `content: { minLength: 1 }` → `content: { maxLength: 10000 }` pour
   refléter fidèlement `EditMessageBodySchema` (`z.string().max(10000)`).
3. Ajouter une régression **fidèle** via un vrai Fastify + `inject()`
   (`edit-message-body-schema.test.ts`) qui applique réellement la couche AJV.

## Expected benefits
- Parité socket/REST rétablie pour la suppression de légende.
- Branche `hasAttachments` du handler REST enfin atteignable.
- Garde-fou de régression au niveau du bord AJV (impossible de re-figer `.min(1)`).

## Implementation complexity
Très faible : ~15 lignes (extraction schéma + une contrainte), + un fichier de test
inject de ~65 lignes.

## Validation criteria
- RED : avec `minLength: 1`, le test inject « accepts empty content » échoue
  (400 au lieu de 200) — **vérifié** (2 cas en échec dont la borne max).
- GREEN : `edit-message-body-schema.test.ts` 5/5, `conversation-messages-advanced`
  101/101, `tsc --noEmit` propre — **vérifié**.
- Contrat inchangé côté handler : contenu vide sans pièce jointe toujours rejeté.

## Notes / hors périmètre
- La route sœur `PATCH /messages/:messageId` garde `minLength: 1` : elle fait un
  `content.trim()` inconditionnel sans garde `hasAttachments`, donc sa contrainte
  reste cohérente avec son contrat (pas de chemin « légende vide »). Non modifiée.
- `PostCommentService.deleteComment` laisse des lignes `CommentReaction` orphelines
  sur les commentaires soft-deleted (n'appelle pas `deleteCommentReactions`). Faible
  impact (pas de casse d'invariant `commentCount`) — candidat pour une itération future.
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
