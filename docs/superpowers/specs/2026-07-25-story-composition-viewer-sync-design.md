# Story — Synchronisation composition ↔ visualisation (design)

**Date** : 2026-07-25
**Périmètre** : iOS (`apps/ios/Meeshy`, `packages/MeeshySDK`) + une modification gateway
**Simulateur de validation** : `Meeshy-iOS26` — `C295B364-8CA6-4214-BC52-E411A97EBFE2` (iOS 26.1)

---

## 1. Problème

Le preview/play de la timeline du composer affiche les objets du canvas aux bons instants avec les bonnes animations. La lecture des stories par les utilisateurs ne les affiche pas au moment programmé dans la timeline.

### Ce que le code dit réellement

Le moteur de rendu est **déjà partagé**. `StoryRenderer.render(slide:into:at:mode:)` sert simultanément :

| Surface | Montage | Mode |
|---|---|---|
| Composer (édition) | `StoryCanvasRepresentable.swift:150` | `.edit` |
| Composer (preview timeline) | `StoryCanvasUIView+TimelinePreview.swift:32` | `.edit` + `renderMode = .play` |
| Viewer | `StoryReaderRepresentable.swift:128` | `.play` |
| Export MP4 | `StoryAVCompositor` | `.play` |

`shouldRender` (fenêtre `startTime`/`duration`, `StoryRenderer.swift:337`), `fadeOpacity` (`:897`), `applyKeyframes` (`:821`) et `clipTransitionOpacity` (`:772`) sont **un seul code**. Rien n'est à réécrire côté rendu.

De même, la publication est **RAW** : `StoryViewModel.runStoryUpload` (`StoryViewModel.swift:1313`) envoie `storyEffects` en JSON avec les `mediaIds`, jamais un composite. Aucun aplatissement ne court-circuite les animations.

### Cause racine — deux horloges non asservies

| Horloge | Pilote | Gates de départ | Fichier |
|---|---|---|---|
| `StoryReaderTimerController` (wall-clock) | barre de progression + auto-advance | `isActive`, failsafe 6 s | `StoryReaderTimerController.swift:120` |
| `StoryCanvasUIView.displayLink` (playhead) | visibilité, fades, keyframes, closing | `contentReadyFired`, failsafe 2 s | `StoryCanvasUIView+Playback.swift:167` |

Le SDK expose le pont exact pour les unifier — `onPlaybackTime`, documenté *« Source de vérité pour piloter la progress bar du viewer en sync EXACTE avec la timeline »* (`StoryReaderRepresentable.swift:55-61`), émis à `StoryCanvasUIView+Playback.swift:261`.

**Fait vérifié : aucun call-site applicatif ne le fournit.** Le viewer passe `mute`, `isPaused`, `onContentReady`, `onContentProgress`, `onPlaybackProgressing` — jamais `onPlaybackTime` (`StoryViewerView+Canvas.swift:932-972`).

Conséquence : la barre avance pendant que le playhead du canvas est encore à 0 ou en retard. Les éléments à `startTime > 0` apparaissent décalés, ou jamais si la story auto-avance avant que le playhead les atteigne.

### Défauts aggravants confirmés

| Id | Défaut | Preuve |
|---|---|---|
| D9 | `refreshPrefetchWindowAndTimer()` arme le timer avec la durée du slide **précédent** | appelé sur `onChange(currentStoryIndex)` `StoryViewerView.swift:571` et `currentGroupIndex` `:611`, **avant** `updateStoryDuration()` |
| D5 | Canvas sortant du cross-fade monté en `.edit` → `shouldRender` retourne `true` pour tout ; la slide sortante réaffiche **tous** ses éléments hors fenêtre pendant 350-400 ms | `StoryReaderRepresentable.swift:127`, monté `+Canvas.swift:889-894` |
| D1 | `applyOpening` jamais exécuté sur le canvas du viewer (appelé seulement sur transition edit→play, jamais atteinte car `.id(story.id)` recrée la vue) | `StoryCanvasUIView+Core.swift:133-137` vs `+Canvas.swift:973` |
| D2 | `closing` appliqué **deux fois** : rootLayer SDK + `closingScale` SwiftUI | `+Playback.swift:266` et `+Content.swift:425` |
| D3 | Paramètres de transition divergents entre SDK et viewer | SDK zoom 1.08 / slide horizontal 8 % / 0.5 s (`StoryRenderer.swift:562-570`) vs viewer zoom 0.88 / offset vertical 30 pt / 0.35-0.4 s (`+Content.swift:382-416`) |
| D7 | Parsing `gradient:` incohérent — viewer splitte sur **virgule**, la source de vérité sérialise avec **deux-points** → `LinearGradient` d'une seule couleur invalide | `+Canvas.swift:1636` vs `StoryBackgroundValue.swift:27-38` |

### Ce qui fonctionne déjà (à ne pas refaire)

- **Durée calculée dès la composition** : `computedTotalDuration()` (`StoryModels.swift:1111`) lit en priorité `effects.timelineDuration`, le pin auteur autoritaire écrit par le timeline editor (`StoryComposerViewModel+Slides.swift:42`). Fallback `contentDerivedDuration()`.
- **Ordre non-vues** : tri `moi → hasUnviewed → latestStory.createdAt desc` en deux sites jumeaux (`StoryModels.swift:2090`, `StoryViewModel.swift:1502`) ; départ sur la première non-vue à l'ouverture (`StoryViewerView.swift:439-444`, `startAtFirstUnviewed`) et au passage de groupe (`entryIndex`, `:385-390`, avec fallback index 0 si tout est vu).
- **Interlude** : `StoryGroupIntroOverlay` (`StoryViewerView.swift:1675-1866`) — bannière plein écran, voile, avatar 88 pt, nom, `@username`, présence, mood ; centré explicitement `.position(x: w/2, y: h/2)` `:1714` ; 2,6 s (`groupIntroDuration:127`) ; gel de lecture via `shouldPauseTimer || showGroupIntro` (`+Content.swift:543`).
- **Agrégat de pause** : `shouldPauseTimer` (`+Content.swift:514-544`) propagé au canvas via `isCanvasPlaybackPaused` → `StoryReaderRepresentable.isPaused` (`+Canvas.swift:943`).

---

## 2. Principe directeur

> **« La timeline EST la story » — une durée, une horloge, une pause.**

La durée vient de la composition (`effects.timelineDuration`, sinon contenu). L'horloge est le playhead du canvas. La pause gèle et reprend tout en phase, parce qu'il n'y a plus qu'une chose à geler.

---

## 3. Lots de travail

### WS0 — Horloge unique (fondation)

**Objectif** : la barre de progression suit la timeline, elle-même calculée dès la composition. Pause = arrêt de toutes les lectures ; reprise en phase, sans saut.

1. **Câbler `onPlaybackTime`** dans `StoryViewerView+Canvas.swift:932` → écrit `progress` depuis le playhead réel.
2. **`StoryReaderTimerController` devient esclave** : il conserve l'auto-advance et un failsafe si le canvas n'émet jamais (slide sans média, canvas détruit), mais n'intègre plus le wall-clock dès qu'un signal playhead arrive.
3. **Corriger D9** : `updateStoryDuration()` avant tout armement de timer.
4. **Pause unifiée** : vérifier que `isCanvasPlaybackPaused` gèle timer + canvas + vidéo + audio, et que la reprise repart du playhead figé.

> Vérifié et écarté : `preferredLanguages: []` dans `updateStoryDuration()` (`+Content.swift:630`) est correct. `contentDerivedDuration` compte les mots de `text.text`, le texte **brut** (`StoryModels.swift:1052-1054`), jamais le texte résolu par le Prisme. La langue n'influence pas la durée.

**Unité isolée à extraire** : `StoryPlaybackClock` — struct pure, sans UI.

```
entrées  : playheadSeconds: Double?, duration: TimeInterval,
           isPaused: Bool, hasCanvasSignal: Bool, wallClockElapsed: TimeInterval
sortie   : progress: Double (0...1), isComplete: Bool, source: .canvas | .fallback
```

Contrat : si `hasCanvasSignal`, `progress = playheadSeconds / duration` et `source == .canvas` ; sinon repli wall-clock. `isPaused` gèle `progress`. `duration <= 0` → `progress == 0`, jamais de division par zéro. Testable sans instancier `StoryViewerView` (qui n'est pas instanciable en test, cf. commentaires des guards existants).

### WS1 — Parité des transitions viewer ↔ SDK

1. **D5** — monter le canvas sortant en `.play` (`StoryReaderRepresentable.swift:127`), pour que la slide sortante respecte ses fenêtres temporelles pendant la transition.
2. **D2/D3** — une seule implémentation des transitions, avec un critère de décision explicite :
   - Le `closing` est appliqué deux fois (rootLayer SDK + SwiftUI). **Retirer la application SwiftUI** : le SDK la refait à chaque tick depuis le playhead, elle est donc la seule qui reste juste sous l'horloge unifiée.
   - Le cross-fade **inter-slides** (opacité entre canvas sortant et entrant) reste en SwiftUI : le SDK ne connaît qu'une slide à la fois et ne peut pas l'assurer.
   - Les constantes de l'`opening` divergent (zoom, direction, durée). **Aligner les valeurs SwiftUI sur les constantes SDK** (`StoryRenderer.swift:562-570`) plutôt que de dupliquer un second jeu de nombres.
3. **D1** — garantir que `applyOpening` s'exécute pour le canvas du viewer.
4. **D7** — parser `gradient:` via `StoryBackgroundValue` au lieu du split virgule.

### WS2 — Interlude et ordre non-vues

**Décision retenue** : l'interlude reste **inter-groupes uniquement**. Pas d'interlude à l'ouverture directe depuis le tray. Durée inchangée à 2,6 s (verrouillée par `StoryGroupIntroOverlayGuardTests.swift:47-53`).

1. **Marquage vue décalé** : aujourd'hui `markCurrentViewed()` est appelé dans `groupTransition` (`+Content.swift:462`), donc la première story du nouveau groupe est marquée vue pendant les 2,6 s où elle n'est pas encore visible. Décaler après la fin de l'interlude.
2. **Bannière sans aller-retour** : consommer `banner` depuis le payload stories (voir §4) au lieu du `GET /users/:id` par auteur.
3. **Fluidité** : le passage groupe → interlude → première non-vue doit être continu. Le playhead de la story sous-jacente ne démarre qu'à la fin de l'interlude, sans saut de progression.
4. **Tests manquants** : `entryIndex(of:)` et `sortStoryGroupsInPlace` n'ont **aucun** test aujourd'hui. Les verrouiller, y compris le cas « tout vu → index 0 ».

### WS3 — Sheet cohérente pour les inspecteurs timeline

`TimelineInspectorHost` est monté en `.overlay(alignment: .bottomTrailing)` (`StoryTimelineView.swift:358`) et `ClipInspector` fait jusqu'à 360 pt de large (`ClipInspector.swift:302`) — **il recouvre les pistes qu'il édite**. `InspectorPresentation` (`InspectorPresentation.swift:6`) déclare un style `.popover` derrière lequel il n'y a aucun `.popover()` SwiftUI.

1. **Créer `MeeshySheetStyle`** en promouvant `AudiencePickerPresentationStyle` (`Compatibility/AudiencePickerPresentation.swift:18`), qui porte déjà detents + dragIndicator + material + `presentationContentInteraction(.scrolls)` + gating iOS 16.4. Fusionner `StoryTimelinePresentationStyle` (`AdaptivePresentationStyle.swift:10`, orphelin, 0 call-site).
2. **Migrer Clip / Keyframe / Transition inspectors** vers cette sheet, avec un detent qui laisse le playhead et les pistes visibles pendant la configuration.

### WS4 — Validation

1. **TDD** sur la logique pure : `StoryPlaybackClock`, `entryIndex`, ordre des groupes, gating du marquage vue.
2. **Checklist E2E** sur `Meeshy-iOS26` : captures successives et courtes vidéos, notamment le diff preview de composition vs viewer sur une même story à éléments décalés dans le temps.

---

## 4. Modification gateway

`storyAuthorSelect` (`services/gateway/src/services/posts/postIncludes.ts:55-59` = `authorSelect` + `isOnline` + `lastActiveAt`) et `authorSelect` (`:35-40` = `id, username, displayName, avatar`) **n'incluent pas `banner`**. Le champ existe pourtant sur `User` (`schema.prisma:99`) et est déjà exposé par `publicUserSelect` (`routes/users/profile.ts:1053-1060`).

Ajouter `banner` à `storyAuthorSelect` supprime un `GET /users/:id` par auteur dans l'interlude.

`bannerThumbHash` n'existe **nulle part** côté gateway ni Prisma (0 occurrence repo-wide) ; `MeeshyUser.bannerThumbHash` décode donc toujours `nil`. Hors périmètre — l'interlude retombe sur son gradient avatar→noir pendant le chargement, ce qui est acceptable.

**Ordonnancement décidé** : le backend part **en premier**, commit + push sur `main` pour déclencher la CI, puis le travail iOS continue pendant que les images se construisent. Déploiement sur `root@meeshy.me` (`/opt/meeshy/production/`) quand les images sont prêtes. L'iOS reste fonctionnel sans ce changement grâce au fallback profil actuel.

---

## 5. Gestion des erreurs

- **Canvas muet** (jamais de `onPlaybackTime`) → `StoryPlaybackClock` bascule en `.fallback` wall-clock ; la story ne se bloque jamais.
- **Durée nulle ou négative** → `progress = 0`, auto-advance sur le failsafe existant.
- **Interlude annulé** (skip par tap, retour arrière) → le marquage vue ne doit pas fuiter : marquer la story réellement affichée, pas celle qu'on a traversée.
- **`banner` absent du payload** (backend pas encore déployé) → conserver le fallback `GET /users/:id`.

---

## 6. Critères de succès

1. Une story dont un texte a `startTime = 3 s` l'affiche à 3 s dans le viewer comme dans le preview du composer — vérifié par capture aux mêmes instants.
2. La barre de progression atteint 100 % exactement quand le playhead atteint `computedTotalDuration()`.
3. Une pause gèle barre, canvas, vidéo et audio ; la reprise repart de la position figée sans saut.
4. Passage d'un groupe à l'autre : interlude ~2,6 s centré avec avatar et bannière, puis première story non vue de l'auteur (ou la première si tout est vu).
5. La story affichée pendant l'interlude n'est marquée vue qu'après l'interlude.
6. Configurer une piste dans la timeline se fait dans une sheet qui laisse le playhead visible.
7. `./apps/ios/meeshy.sh test` passe.
