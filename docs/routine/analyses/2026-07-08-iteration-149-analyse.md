# Iteration 149 — Analyse d'optimisation (2026-07-08)

## Protocole (démarrage)
`main` @ `879e25de` (dernier merge : PR #1738 iter 148 — FIFO du drain memory-fallback).
Branche `claude/brave-archimedes-y37hsd` recréée depuis `origin/main`. PRs ouvertes au
démarrage : #1739 (iOS calls accessibility hint, autre session, hors périmètre autonome).
Ce cycle prend **149**.

Fan-out : deux agents Explore parallèles — (a) `services/gateway/src` (services/handlers récents :
présence, delivery queue, reactions, stats, **posts/views**), (b) `apps/web` + `packages/shared`
(présence, prisme, typing, reactions, mentions). Consigne : **un** défaut de logique quasi-pure,
haute confiance, **actuellement en production**, non couvert par les tests. Priorité 1 = features
récemment développées.

### Candidat web écarté (décision déjà tranchée)
L'agent web a proposé `formatPresenceLabel` (ignore le flag `isOnline`, ne dit « En ligne » que si
`minutesAgo < 1`, alors que le dot sœur `presenceColorClass` honore `isOnline` via
`getUserPresenceStatus`). **Écarté** : c'est exactement **F67**, déjà analysé et **délibérément
rejeté** à l'itération 101 (`docs/routine/analyses/2026-07-05-iteration-101-analyse.md:112-121`) —
le libellé est volontairement dérivé de la seule fraîcheur du timestamp pour **parité avec le
contrat iOS** `RelativeTimeFormatter.lastSeenString` (qui ne prend aucun flag `isOnline`). Honorer
`isOnline` côté web divergerait de ce contrat cross-plateforme. Ne pas re-litiger une décision
architecturale actée sans nouvelle justification (règle de continuité de la routine).

---

## Cible retenue : F116 — le re-fetch de broadcast du `POST /posts/:postId/view` omet le viewer → le filtre PUBLIC-seul écrase l'événement `story:viewed` temps-réel pour toutes les stories non-PUBLIC

### Current state
`services/gateway/src/routes/posts/interactions.ts:245-290` (route `POST /posts/:postId/view`,
utilisateurs **inscrits**). Le flux :

1. `postService.recordView(postId, viewerId, duration)` applique
   `buildVisibilityFilter(viewerId)` (audience = amis ∪ contacts DM), persiste le `PostView` et
   incrémente `viewCount`. C'est la moitié « persistante » du fix de synchro des vues (PR #1734 /
   `c15e90ef`).
2. Puis, pour émettre l'événement temps-réel `story:viewed` à l'auteur, le route **re-fetch** le
   post pour lire `type`/`authorId`/`viewCount` :

```ts
// AVANT correctif — interactions.ts:274
const post = await postService.getPostById(postId);   // ← aucun viewer
if (post && post.type === 'STORY' && post.authorId !== viewerId) {
  socialEvents.broadcastStoryViewed({ storyId: postId, viewerId, ..., viewCount: post.viewCount }, post.authorId);
}
```

### Problems identified
`getPostById(postId, viewerUserId?)` délègue à `buildVisibilityFilter(viewerUserId)`
(`PostService.ts:531-533`). Quand `viewerUserId === undefined`, ce filtre est
`{ visibility: PUBLIC }` — **PUBLIC-seul**. Le `findFirst` ne retrouve donc **jamais** une story
`FRIENDS` (le cas courant — les stories sont quasi jamais PUBLIC) : `post === null`, la garde
`if (post && …)` est fausse, et **`broadcastStoryViewed` n'est jamais appelé**.

Entrée concrète (cas nominal) :
1. B (ami/contact DM de A) ouvre une story A à visibilité `FRIENDS`.
2. `recordView` (filtre viewer B) → succès : `PostView` créé, `viewCount` incrémenté.
3. Re-fetch `getPostById(postId)` **sans viewer** → filtre PUBLIC-seul → `null`.
4. La garde échoue → **aucun `story:viewed` émis à A**.

- Sortie erronée : A ne reçoit **jamais** l'événement temps-réel de vue pour ses stories non-PUBLIC.
  La vue est bien persistée (visible après un refetch), mais l'indicateur live est silencieusement
  perdu — exactement la moitié « temps-réel » de la feature `c15e90ef` restée cassée.
- Attendu : A reçoit `story:viewed` en direct dès que B ouvre la story.

### Root causes
`recordView` a été aligné (commentaire `PostService.ts:538-545` : passe le viewer pour matcher le
feed et éviter qu'un contact DM voie une story sans pouvoir y enregistrer sa vue). Mais le **second**
consommateur du filtre de visibilité sur ce même chemin — le re-fetch de broadcast — n'a pas été
aligné : il appelle `getPostById(postId)` sans viewer (introduit en `72cee213`). Le viewer vient
pourtant de franchir ce même filtre dans `recordView` ; le lui repasser garantit que la story est
retrouvée ici aussi.

### Business impact
Sur les stories privées (la norme), l'auteur ne voit pas ses vues arriver en temps réel — le badge
« vu par » ne se met à jour qu'au prochain refetch complet non lié. Dégrade la feature phare de
synchro des vues juste livrée et donne l'impression d'un produit moins réactif que la concurrence
(Instagram/WhatsApp Stories affichent les vues live).

### Technical impact
Un seul chemin, en production : route inscrit-utilisateur `POST /posts/:postId/view`, hit à chaque
ouverture de story. `fastify.socialEvents` est câblé en prod. La garde `authorId !== viewer`
continue de bloquer l'auto-broadcast (l'auteur qui rouvre sa propre story).

### Risk assessment
Risque **très faible**. Correctif = passer le viewer déjà en scope (`viewerId`) à `getPostById`.
- Stories PUBLIC : comportement inchangé (le filtre viewer inclut toujours PUBLIC).
- Stories non-PUBLIC visibles par le viewer : désormais retrouvées → broadcast émis.
- Stories non visibles par le viewer : `recordView` aurait déjà renvoyé `false` en amont (vue non
  enregistrée), et `getPostById` renverra toujours `null` → pas de broadcast (correct).
Aucun changement de signature. Coût : le viewer-aware `getPostById` fait quelques requêtes
d'enrichissement inutiles ici (réactions/bookmark/repost non lus) — noté en amélioration future,
hors périmètre de ce correctif minimal.

### Proposed improvements
Passer le viewer :
```ts
// APRÈS — interactions.ts
const post = await postService.getPostById(postId, viewerId);
```

### Expected benefits
`story:viewed` temps-réel émis pour **toutes** les stories visibles par le viewer (dont FRIENDS/DM),
rétablissant la moitié temps-réel de la synchro des vues. Zéro régression sur PUBLIC / self-view.

### Implementation complexity
Triviale (1 ligne source + 1 test de régression).

### Validation criteria
- [x] Lecture directe confirmée : `buildVisibilityFilter(undefined)` → PUBLIC-seul
      (`PostService.ts:531-533`) ; `recordView` utilise `buildVisibilityFilter(userId)`
      (`PostService.ts:1002`).
- [x] Gap de test confirmé : les tests de broadcast (`interactions.test.ts:384`, `interactions2.test.ts`)
      mockent `getPostById` renvoyant une story quels que soient les args → le chemin
      viewer-manquant → PUBLIC-seul → null est invisible.
- [x] Test de régression ajouté : `interactions.test.ts` — assert
      `getPostById` appelé avec `(POST_ID, USER_ID)` (le viewer).
- [ ] CI verte après push.

## Candidats écartés ce cycle (documentés)
- **`formatPresenceLabel`** — voir supra (F67, rejeté iter 101, parité iOS).
- **`TranslationCache.findSimilarTranslations`** (`services/gateway/src/services/TranslationCache.ts`)
  et **`deepCleanTranslationOutput`** (`apps/web/utils/translation-cleaner.ts`) — code mort (déjà
  documenté iter 145).
- Audits confirmés corrects & couverts : `RedisDeliveryQueue` (FIFO+supersede, iter 148),
  `ReactionHandler` (dedupKey par reactor), `getUserPresenceStatus` (4 états),
  `ConversationMessageStatsService` (incrémental vs recompute), `MessageProcessor` (ordre de copie
  des pièces jointes forward).

## Améliorations futures (report)
- **F116b** (perf, LOW) : sur le chemin `POST /view`, le re-fetch viewer-aware effectue 3 requêtes
  d'enrichissement (réactions/bookmark/repost) inutiles pour le seul besoin `type`/`authorId`/`viewCount`.
  Envisager de faire retourner à `recordView` le minimum requis (type/authorId/viewCount) pour
  supprimer le second fetch — refactor de signature à isoler dans une itération dédiée.
