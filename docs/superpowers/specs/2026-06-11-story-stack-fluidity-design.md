# Story Stack Fluidity — Revue & Design d'amélioration

**Date** : 2026-06-11
**Statut** : Approuvé (approche B — lots incrémentaux priorisés)
**Périmètre** : iOS (`apps/ios/Meeshy`, `packages/MeeshySDK`) + optionnel gateway (pagination stories)

## Objectif produit

Une pile stories aussi fluide que le passage entre réels des applications de référence :
transitions instantanées, coordination audio/visuel sample-accurate, timeline respectée,
et accès aux stories **fonctionnel sur toutes les surfaces** : vue de conversation,
profil utilisateur, trail du feed, avatar auteur de publications.

## État des lieux (revue 2026-06-11)

### Ce qui est déjà au niveau SOTA (ne pas toucher)

- Cache 3-tier (NSCache → GRDB/disk → réseau) + placeholder ThumbHash frame-0
  (`StoryBackgroundLayer.configure`, cascade anti-flash `hasFinalContentStamped`).
- `StoryReaderPrefetcher` : fenêtre de canvas hors-écran `[N-1, N, N+1]` intra-groupe.
- Timer gated sur « contenu prêt » (`StoryReaderTimerController.markContentReady`).
- Canvas sortant monté en `.edit` (`isOutgoing: true`) → zéro bleed audio en transition.
- Session audio call-aware : source unique `MediaSessionCoordinator.activatePlaybackSync`,
  préemption via `PlaybackCoordinator` + `NSHashTable` weak des canvases actifs.
- Données : `StoryViewModel` singleton cache-first (`recent_tray_v2`), tri Instagram
  (moi > non-vues > récentes) ré-appliqué après chaque mutation socket, slides
  chronologiques ASC par auteur, markViewed optimiste monotone, Prisme Linguistique
  correctement résolu (`resolvedText(preferredLanguages:)`, variantes TTS, jamais de
  fallback `translations.first`).

### Problèmes structurels identifiés

#### S1 — Couverture des surfaces incomplète

| Surface | Problème | Localisation |
|---|---|---|
| Avatar expéditeur (bulles) | Infra complète (`SenderIdentity.storyRing`, `BubbleFooter` ring + menu « Voir la story ») jamais alimentée — ring toujours `.none` | `MessageListViewController.swift:505-543` |
| Avatar auteur de post (feed) | Aucun `storyState` ni `onViewStory` | `FeedPostCard.swift:349-362` |
| Profil utilisateur | Aucun accès story | `UserProfileSheet` |
| Recherche globale | Aucun ring | `GlobalSearchView.swift` |
| `ThemedAvatarButton` | Tristate écrasé en booléen → toujours « non-vu » | `ConversationHelperViews.swift:143-149` |
| Liste conversations | Fallback par `username` au lieu de `userId` | `ConversationListView.swift:810` |
| Deep link / push | `startAtFirstUnviewed` absent → ouvre à l'index 0 | `RootView.swift:553-556, 705-715` |
| MyStoryButton | Contourne `StoryViewerCoordinator` (état local) | `StoryTrayView.swift:119-129` |
| Commentaires | Calcul du ring dupliqué inline (×2) | `FeedCommentsSheet.swift:240`, `PostDetailView.swift:386` |
| `singleGroup` | Divergent selon surface sans règle produit | `ConversationView.swift` vs `RootView.swift` |

#### S2 — Deux horloges concurrentes sur la timeline

- `StoryProgressDisplayLinkProxy` (wall-clock `CACurrentMediaTime()`) pilote `progress`
  et `goToNext()` (`StoryViewerView+Content.swift:548-622`).
- `StoryReaderTimerController` (SDK, gated content-ready) tourne en parallèle avec
  `onCompletion`/`onProgressChange` câblés en **no-op** (`StoryViewerView.swift:633-641`).
- Le canvas publie un temps sample-accurate (`audioMixer.slideElapsedSeconds`,
  `StoryCanvasUIView.swift:2176`) que la barre ignore → dérive barre ↔ audio/vidéo,
  et un `CADisplayLink` gratuit en permanence.
- Resume post-interruption audio ignore l'état long-press pause
  (`StoryCanvasUIView.swift:1076-1093`).
- `stopHandler` passé à `StoryMediaCoordinator.activate` est vide
  (`StoryViewerView.swift:371-389`) : quand un autre player préempte, l'audio canvas
  s'arrête par chemin indirect mais le viewer n'est pas mis en pause (vidéo continue).
- `DefaultSDKAudioRecorder.startRecording()` configure `AVAudioSession` directement,
  hors `MediaSessionCoordinator` (risque pendant un appel).

#### S3 — Transitions auteur→auteur en-deçà des reels

- Prefetcher intra-groupe uniquement : le premier canvas du groupe suivant n'est pas
  bootstrappé → 50-120 ms de latence à la première frame après swipe.
- Transition non interruptible : lock `isTransitioning` + `asyncAfter(0.35)` — pas de
  snap-back réversible à mi-geste.
- Pseudo-cube : `rotation3DEffect` sur une seule carte
  (`StoryViewerView+Canvas.swift:1522-1526`) au lieu des deux cartes autour de l'arête.
- `toRenderableSlide` recalculé à chaque render body (backdrop flouté + loading overlay).
- `sortStoryGroupsInPlace()` O(N log N) main-thread à chaque event socket (mineur).

#### S4 — Robustesse & dette

- `ensureGroupAvailable` : écran noir 2,5 s sans loader puis erreur sèche
  (`StoryViewerContainer.swift:180-189`).
- Erreurs commentaires avalées (`catch {}`, `StoryViewerView+Content.swift:1631`) ;
  échec de fetch replies referme le thread ouvert (`:1419`).
- `StorySlideManager`/`StorySlideView` deprecated non supprimés (2 TODO).
- Pagination stories absente (client `cursor: nil` fixe, gateway `take: 50` sans cursor)
  → au-delà de 50 groupes, stories jamais chargées.
- Expiration purement passive (pas de purge pendant une session longue).

## Design retenu — Approche B : 4 lots incrémentaux

Chaque lot est livrable, testable et commitable indépendamment. TDD systématique,
`./apps/ios/meeshy.sh build` + tests verts avant chaque commit, worktree dédié
(environnement contendu par agents parallèles).

### Lot 1 — Couverture & cohérence des surfaces

1. **Helper unique** `StoryViewModel.storyRingState(forUserId:) -> StoryRingState`
   (source unique, remplace les calculs inline dupliqués).
2. **Bulles de conversation** : peupler `SenderIdentity.storyRing` + `onViewStory`
   dans `MessageListViewController` (infra `BubbleFooter` déjà câblée côté View).
3. **`FeedPostCard`** : ring + tap → reader (`singleGroup: true`), le tap avatar
   conserve l'ouverture du profil ; l'accès story passe par le ring/menu contextuel
   (pattern identique aux bulles).
4. **`UserProfileSheet`** : ring sur l'avatar + accès reader (`singleGroup: true`).
5. **Corrections** : `ThemedAvatarButton` tristate ; fallback username→userId supprimé ;
   `startAtFirstUnviewed: true` sur deep link + push ; `MyStoryButton` routé via
   `StoryViewerCoordinator`.
6. **Règle produit `singleGroup`** : contexte « personne précise » (bulle, header,
   profil, avatar post, commentaire) = `singleGroup: true` ; contexte « flux »
   (tray, liste de conversations) = navigation inter-groupes.
7. Recherche globale : ring sur les résultats utilisateurs (même helper).

### Lot 2 — Horloge unique + coordination audio

1. **Un seul display-link** : la progression est pilotée par
   `StoryReaderTimerController` ; suppression de `StoryProgressDisplayLinkProxy`.
   Les responsabilités du proxy legacy (auto-advance, seuil de prefetch 50 %/-5 s,
   `shouldPauseTimer` 9+ conditions) migrent vers les callbacks du controller.
2. **Asservissement sample-accurate** : la barre de progression consomme le temps
   publié par le canvas (`onPlaybackTime`, qui préfère `audioMixer.slideElapsedSeconds`)
   au lieu d'une horloge murale indépendante → zéro dérive barre ↔ audio/vidéo.
3. **`stopHandler` réel** : préemption par un autre player ⇒ pause complète du viewer
   (timer + canvas + UI), pas seulement l'audio.
4. **Resume post-interruption** : respecte l'état pause du viewer.
5. **`DefaultSDKAudioRecorder`** : passe par `MediaSessionCoordinator`.

### Lot 3 — Transitions niveau reels

1. **Prefetch inter-groupes** : étendre `StoryReaderPrefetcher` au premier slide du
   groupe suivant et précédent (fenêtre `[N-1, N, N+1]` + `[G+1 premier slide,
   G-1 slide courant]`), bornée mémoire (éviction inchangée).
2. **Transition cube interactive** : pendant le drag horizontal, rendre les deux
   cartes (sortante + entrante) transformées autour de l'arête commune
   (vrai cube), suivre le doigt, seuil + vélocité pour commit, snap-back spring
   réversible sinon. Remplace le lock `isTransitioning` + `asyncAfter`.
3. **Mémoïsation `toRenderableSlide`** par `story.id` + langue dans le render path.

### Lot 4 — Robustesse & nettoyage

1. Loader visible pendant `ensureGroupAvailable` (skeleton/spinner au lieu d'écran
   noir), timeout conservé avec retry.
2. Erreurs commentaires : état d'erreur inline, pas de fermeture punitive du thread.
3. Suppression `StorySlideManager`/`StorySlideView` deprecated (+ pbxproj).
4. (Optionnel — gateway) pagination cursor des stories ; côté iOS `loadMore` au
   scroll du tray.

## Hors périmètre

- Refonte du composer / timeline editor (déjà livrés, specs séparées).
- Adoption `MeeshyVideoCanvasLayer` dans le story canvas (Lot 4d/4e déféré existant).
- Export MP4 / publish-exporter wiring (spec 2026-05-12 séparée).

## Critères d'acceptation

1. Ring story visible et fonctionnel (tap → reader) sur : bulles de conversation,
   header de conversation, liste de conversations, tray, avatar auteur de post,
   commentaires, profil utilisateur, recherche. État vu/non-vu cohérent partout
   (source unique `storyRingState(forUserId:)`).
2. Un seul `CADisplayLink` de progression ; barre asservie au temps canvas/audio ;
   pause/resume cohérents (long-press, background, interruption, préemption, appel).
3. Swipe auteur→auteur : cube interactif réversible, première frame du groupe suivant
   sans rebuild perceptible (canvas pré-bootstrappé).
4. Aucune régression : suite de tests iOS verte, smoke test reader (image, vidéo,
   texte, audio overlay, story traduite) sur les surfaces principales.
5. Timeline respectée : slides chronologiques par auteur, ordre tray stable après
   mutations socket, expiration honorée au changement de slide.
