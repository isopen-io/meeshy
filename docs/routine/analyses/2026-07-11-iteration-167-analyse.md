# Iteration 167 — Analyse d'optimisation (2026-07-11)

## Protocole (démarrage)
`main` @ `14fcb3b`. Branche `claude/brave-archimedes-wr6r21` sur `origin/main` (0/0). Ce cycle prend **167**.

Fan-out : deux agents Explore parallèles — (a) `services/gateway/src`, (b) `apps/web` +
`packages/shared`. Consigne : **un** défaut de logique quasi-pure, haute confiance,
**actuellement en production**, non couvert par les tests, hors des périmètres verrouillés.
Priorité 1 = features récemment développées (feed social / stories / traduction).

Périmètres verrouillés (itér. 162-166 + PRs ouvertes autres sessions) : mentions autocomplete,
stats participant / online-users, posts/story watch-time, realtime delivery/receipts +
`message:new` language filter, notifications story-comment visibility,
`PostCommentService.deleteComment`/`likeComment`, `PostService.getPostInteractions`,
calls / signaling, typing suppression, translator queue, presence label, message-edit
empty-content, attachment-reaction offline replay, notification:read badge,
`useMessageStatusDetails` cache key, `computeStoryDurationMs`, `resolveContentRoute`,
`formatContentPublishedAt` DST, socketio room-join retry (#1850), android settings privacy
sync (#1844), ios/calls (#1852, #1802).

Candidats web consignés (non pris ce cycle, pour un futur cycle) :
- **web** — `TranslationToggle` (`apps/web/components/v2/TranslationToggle.tsx:59`) gèle la
  langue résolue au montage via un initialiseur `useState` paresseux : un changement ultérieur
  de `userLanguage` (ou l'arrivée async d'une traduction préférée via `*:translation-updated`)
  n'est jamais re-résolu. Le Prisme n'est pas réactif. Bon candidat prochain cycle.
- **web** — Reels comment overlay : `CommentList` rendu sans `likedCommentIds`, `CommentItem`
  décide like/unlike du seul prop `isLiked` (défaut vide) → `likeCount + 1` inconditionnel,
  re-like infini. (`ReelsFeedScreen.tsx:251`, `use-comment-mutations.ts:207`).
- **web** — `reactionSummary[emoji] = Math.max(0, (summary[emoji] ?? 1) - 1)` laisse un
  `{ emoji: 0 }` résiduel quand l'emoji était absent (chip « 0 »). (`use-comment-mutations.ts:279`,
  miroir `use-post-mutations.ts:374`).

---

## Cible retenue : F126 — `StoryTextObjectTranslationService.resolveBroadcastRecipients` ne gère PAS la visibilité `PRIVATE` → fuite du texte traduit d'une story PRIVÉE (brouillon / auteur uniquement) vers TOUS les amis de l'auteur

### Current state
`services/gateway/src/services/posts/StoryTextObjectTranslationService.ts:123-154`
(`resolveBroadcastRecipients`), appelée par `handleTranslationCompleted` (l.109-112) qui émet
`SERVER_EVENTS.STORY_TRANSLATION_UPDATED` — soit le **texte réellement traduit** des overlays de
la story (`{ postId, textObjectIndex, translations }`) — vers `ROOMS.feed(userId)` de chaque
destinataire résolu.

```ts
const recipients = new Set<string>([authorId]);
if (visibility === 'ONLY')     { /* + visibilityUserIds */ return [...recipients]; }
if (visibility === 'COMMUNITY'){ /* + co-membres */        return [...recipients]; }

try {
  // friend lookup → recipients += tous les amis acceptés (moins EXCEPT)
} catch { /* fallback author-only */ }
return [...recipients];
```

Le doc-comment de la méthode affirme : « Mirrors the broadcast logic of
`SocialEventsHandler.getVisibilityFilteredRecipients` ». Ce jumeau retourne explicitement `[]`
(fan-out auteur-seul) pour `PostVisibility.PRIVATE` (`SocialEventsHandler.ts:191`,
`case 'PRIVATE': return []`).

### Problems identified
`PostVisibility.PRIVATE` (`schema.prisma:2776` — « Brouillon / seulement l'auteur ») n'est ni
`ONLY`, ni `COMMUNITY` ; `excluded` n'est peuplé que pour `EXCEPT`. Une story PRIVÉE **tombe donc
dans la branche friend-lookup** et ajoute **tous les amis acceptés** de l'auteur au set de
destinataires.

`PostService.triggerStoryTextObjectTranslation` (`PostService.ts:222`) déclenche la traduction
pour toute story portant `storyEffects.textObjects`, **sans aucun gate de visibilité**. À la
complétion, le texte traduit part vers les feed-rooms de tous les amis.

### Root cause
Cascade de visibilité incomplète : le cas `PRIVATE` n'a jamais été implémenté, contrairement au
jumeau `SocialEventsHandler` dont la méthode se réclame explicitement.

### Business impact
Feature stories + Prisme linguistique (Priorité 1). **Fuite de confidentialité** : le contenu
(traduit) d'une story marquée privée/brouillon est poussé en temps réel à tous les amis, alors
qu'il est (correctement) masqué du feed REST et du fan-out `story:created`. Incohérence directe
entre l'intention « auteur uniquement » et le comportement réel.

### Technical impact
Invariant « une story PRIVATE ne fan-out qu'à l'auteur » cassé sur le seul chemin
`story:translation-updated`. Divergence avec le jumeau censé être la source de vérité.

### Risk assessment
Très faible. Guard additif de 3 lignes, isolé, en amont de la branche friend-lookup. Aucune
migration, contrat de retour inchangé. Ne restreint le fan-out que pour `PRIVATE` — toutes les
autres visibilités (ONLY/COMMUNITY/EXCEPT/FRIENDS/PUBLIC) restent identiques.

### Proposed improvements
Insérer, après le bloc `COMMUNITY`, avant le friend-lookup :
```ts
if (visibility === 'PRIVATE') {
  return [...recipients]; // author only — no friend fan-out
}
```
`recipients` contient déjà `authorId` (l'auteur reçoit sa propre prévisualisation de traduction),
ce qui est correct et cohérent avec le jumeau (qui délègue l'ajout auteur en amont).

### Expected benefits
Story PRIVATE → fan-out auteur-seul rétabli ; plus de fuite du texte traduit vers les amis ;
alignement complet avec `SocialEventsHandler.getVisibilityFilteredRecipients`.

### Implementation complexity
Triviale : 3 lignes de prod + 1 test.

### Validation criteria
- RED : nouveau test PRIVATE échoue contre l'ancien code (vérifié : `friendRequest.findMany`
  appelé, `toArgs` = `[feed(author-1), feed(friend-A), feed(friend-B)]`).
- GREEN : 22/22 `StoryTextObjectTranslationService`, 192/192 suites `src/services/posts`,
  `tsc --noEmit` propre.
- Contrat de retour et broadcast inchangés pour toutes les autres visibilités.
