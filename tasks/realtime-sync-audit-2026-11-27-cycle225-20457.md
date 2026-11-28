# Cycle 225 — `story:viewed` ne marque plus la story de l'auteur comme lue (#20457)

**Date** : 2026-11-27 · **Branche** : `claude/exciting-planck-bh5fer` · **Issue** : #20457

## Le défaut

`StoryTrayRules.applyViewed` posait, à chaque `story:viewed` reçu :

```swift
updatedStories[j].viewCount = viewedData.viewCount
updatedStories[j].isViewed = true          // ← la ligne
```

Cet événement **ne part jamais pour soi** : son producteur l'abandonne quand le
viewer est l'auteur (`services/gateway/src/routes/social/events.ts` —
`post.authorId === actor.userId` ⇒ `return`), et son unique destinataire est la
feed room de l'**auteur**. Il annonce donc la vue d'un **tiers**.

Conséquence vécue : dès qu'une autre personne ouvrait la story de l'auteur, la
bulle de l'auteur se marquait « vue » dans son propre plateau, sortait des
fraîches (`hasUnviewed`) et descendait au tri — alors qu'il ne l'avait lui-même
jamais ouverte. Le sink enchaînait `sortStoryGroupsInPlace()` juste après, donc
la descente était immédiate et visible.

`viewCount`, sur la ligne au-dessus, est parfaitement légitime : c'est le total
autoritatif, et il reste.

## Le correctif n'était PAS de comparer le viewer à soi

Il faut le dire, parce que c'est la réparation qui vient à l'esprit. #20443 a
retiré l'identité du viewer de la charge (chaîne vide depuis), mais même AVANT
ce lot le test aurait été **toujours vrai** : le serveur n'émet jamais vers
l'auteur. **La ligne n'était pas mal gardée, elle n'avait pas lieu d'être.**

`isViewed` dit « MOI, le lecteur, j'ai vu cette story ». Ça se dérive de la
lecture locale (`StoryViewedLedger`, `markViewed`), et d'elle seule.

## Ce que le retrait a entraîné en aval

Le re-tri du sink **est devenu mort au même instant**, et c'est la moitié du
lot. `StoryTrayRules.sort` ne décide que sur `currentUserId`, `hasUnviewed` et
`latestStory.createdAt` ; `applyViewed` ne touche plus aucun des trois. Le tri
qui vivait là n'était légitime que **du temps du défaut** : son commentaire
(« `hasUnviewed` may flip when the last unviewed story is consumed ») décrivait
exactement la ligne qu'on vient de retirer. Le laisser aurait laissé derrière le
correctif un doc-comment qui le contredit — et un re-tri dont personne n'aurait
plus su pourquoi il était là.

## Le témoin existait, et il figeait le défaut en invariant

`test_socketStoryViewed_dropsAllViewedGroupBelowUnviewedPeers` (ex
`StoryViewModelTrayPresentationTests.swift:368`) assertait **noir sur blanc** que
le groupe d'Alice devient entièrement vu après un `story:viewed`, et passe sous
Bob. Il était vert. Il gardait un invariant **juste** — un groupe tout-vu descend
sous ses pairs non vus — par un **déclencheur faux**.

> **Un témoin garde un invariant ET une cause, et seule la première est relue.**
> C'est la forme du cycle 224 (« deux lois gouvernent la même donnée, un témoin
> ne connaît que celle qu'on lui a nommée ») déplacée du côté de la CAUSE : ici
> la loi était la bonne, c'est le fait qui la déclenchait qui n'existait pas.
> Il a donc été **retourné, jamais supprimé** : l'invariant de tri est gardé par
> `test_sortPass_dropsAllViewedGroupBelowUnviewedPeers`, qui flippe `isViewed`
> comme `markViewed` le fait, et le nouveau témoin
> `test_socketStoryViewed_keepsAuthorStoryUnviewedAndRanked` exige qu'un
> `story:viewed` applique le compteur **et rien d'autre**.

Le nouveau témoin assert sur le **rang** autant que sur le drapeau : c'est le
rang que l'auteur voyait bouger, et un drapeau seul laisserait repasser un
re-tri qui ferait descendre la bulle pour une autre raison.

## Les deux autres clients : mesurés, pas supposés

La troisième ligne du critère de fin (#20457) demandait de vérifier qu'aucun
autre site ne dérive une marque de lecture d'un événement annonçant la lecture
de quelqu'un d'autre.

| client | ce que `story:viewed` écrit | verdict |
|---|---|---|
| web | `applyStoryViewedEvent` (`apps/web/src/lib/api/publication-views-realtime.ts`) pose `viewCount` sur deux caches et invalide `storyViewersQueryKey` ; le « vu par moi » vit dans `storyViewedStore`, dont l'unique écrivain est `markStoryViewedAction` (`lib/api/query.ts:168`, geste local) | propre |
| Android | `StoryRealtimeFold.viewed` (`core/model/.../StoryRealtimeFold.kt:14`) ne rend qu'un `copy(viewCount:)` ; la marque de lecture passe par `OutboxKind.MARK_STORY_VIEWED` | propre |
| iOS | `isViewed = true` existe à huit endroits : trois dérivent du registre local, deux préservent la monotonie d'une vue locale, deux posent la vue de sa PROPRE publication — et **un seul** dérivait d'un événement tiers | le site corrigé |

iOS était donc le seul, et c'est la seule famille des huit du cycle 220 qui
porte une marque de lecture côté client.

## Preuve

- gardes de texte iOS : `check_house_rules.sh` (42 règles), `check_test_registration.sh`
  (2 076 fichiers), `check_cohesion_budget.sh` (gain verrouillé — la fonction
  `subscribeToSocketEvents` passe de 199 à 198 lignes), `check-accent-color-hardcoding.mjs`.
- `ios.yml` par `workflow_dispatch` (la CI des PR est compile-only), suites
  `StoryViewModelTrayPresentationTests` et `StoryViewModelRealtimeTests`.

## Ce que ce lot n'a pas pu vérifier

Aucun Xcode dans ce conteneur : la compilation et les deux témoins sont prouvés
par la CI, pas en local. Et le plateau n'a pas été regardé sur un appareil — la
descente de bulle est raisonnée depuis `StoryTrayRules.sort`, pas filmée.

## Ce que ce lot ouvre, et ne corrige pas

- **#20453** — le retrait des deux clés anonymes du fil (`viewerId`,
  `viewerUsername`) attend une mesure de parc, pas un cycle. Intact.
- **#20414**, **#20415** — les deux suivis du cycle 221, intacts.
