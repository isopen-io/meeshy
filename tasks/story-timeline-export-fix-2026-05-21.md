# Story Editor — Export + Timeline Refonte

Branche : `claude/amazing-bell-wtDQ6`

Corrige les 4 points remontés sur l'éditeur de stories :
1. Export cassé quand pas de vidéo (image + texte)
2. Durée déterministe couvrant TOUS les éléments + leurs animations
3. Barre de progression corrélée à la durée réelle
4. Timeline éditable plein écran avec drag ms-précis des éléments

## Diagnostic du bug d'export (point 1)

`StoryAVCompositor.resolveBackgroundImage(for:)` ne lit que
`slide.effects.mediaObjects.first(where: isBackground && kind == .image)`.

Deux cas concrets qui cassent :

- **Export depuis le viewer** (`StoryExportShareViewModel.startExport`) :
  `StoryItem.toRenderableSlide` pose `slide.mediaURL = media.first?.url` mais
  N'INJECTE PAS de `StoryMediaObject` avec `isBackground=true`. Le compositor ne
  trouve donc rien → substrat reste transparent → encodé en noir H.264 → la
  story affichée est "fond noir + texte" au lieu de "image + texte".

- **Export depuis le composer** (futur direct-export ou flow brouillon) :
  l'image vit dans `viewModel.slideImages[slideId]`, totalement hors des
  effects. Même résultat : fond noir.

`renderBackground` lui-même a déjà un fallback `slide.mediaURL` (ligne 378 de
`StoryRenderer.swift`) mais le compositor ne consomme ce signal qu'à moitié :
il sait que c'est `.image` mais sa fonction `resolveBackgroundImage` ne lit
toujours que `mediaObjects`. Asymétrie entre rendu live et rendu export.

Bonus : URL distante (https://) → `UIImage(contentsOfFile:)` retourne nil. Il
faut un chemin synchrone via `CacheCoordinator.images` pour les URL réseau.

## Diagnostic du calcul de durée (point 2)

`StorySlide.computedTotalDuration()` (StoryModels.swift:922) couvre déjà :
- `slide.duration` (plancher utilisateur)
- Média foreground + bg non-loop : `startTime + (duration ?? intrinsicDuration)`
- Audio non-loop : `startTime + duration`
- Texte avec duration explicite
- Transitions (defensive)
- Round-up à un cycle complet de loop bg vidéo

**Gaps identifiés** :
- Stickers complètement ignorés (`stickerObjects` non itéré) → un sticker qui
  apparaît à t=8s sur une slide de 5s sera coupé
- `fadeOut` non comptabilisé : un texte `start=2, duration=5, fadeOut=0.5`
  termine sa fade à t=7s mais reste audible/visible jusqu'à 7s — OK ici, mais
  audio avec fadeOut qui dépasse `start+duration` ? À vérifier
- Durée min plancher : si aucune élément, `bound = slide.duration` qui peut
  être `0` → export 0-frame qui crashe. Forcer un floor à 0.5s ou 1s

## Diagnostic barre de progression (point 3)

`StoryReaderTimerController` reçoit `duration` via `setCurrentSlide(id:duration:)`.
Le caller doit lui passer `computedTotalDuration()`, pas `slide.duration`.

`TransportBar` dans `ProTimelineView` lit `viewModel.project.slideDuration`
qui est seeded depuis `computedTotalDuration()` (déjà fait dans commit 175e74b).

**À vérifier** :
- Le caller de `setCurrentSlide` dans `StoryReaderRepresentable` / `StoryViewerView`
  passe-t-il la bonne durée ?
- Lors d'un edit timeline qui étend la durée (drag d'un élément au-delà du
  bound courant), la barre de progression doit refléter la nouvelle durée
  IMMÉDIATEMENT (`applyClipPosition` doit propager).

## Diagnostic timeline UI (point 4)

L'infra Timeline est SOLIDE :
- `ProTimelineView` : multi-pistes (contenu / audio / effets)
- `VideoClipBar`, `AudioClipBar`, `TextClipBar` : drag/trim/longpress par clip
- `TimelineViewModel` : commandes undo/redo (Add/Delete/Move/Trim/Split)
- `applyClipPosition` : auto-étend `project.slideDuration`
- Keyframes : `[StoryKeyframe]` sur media + text avec interpolation
- `ClipInspector`, `KeyframeInspector`, `TransitionInspector` : popovers

**Ce qui manque** pour répondre au point 4 :
- Mode plein écran (toggle) : actuellement sheet à `.fraction(0.45)` ou `.large`.
  Le user veut `fullScreenCover` quand on entre en "mode édition timeline"
- Précision ms dans le drag : la conversion `Float(delta) / pixelsPerSecond`
  est continue, mais l'inspector n'expose pas de champ numérique au ms. Ajouter
  champ "Start time" + "Duration" éditables en `0.001`s dans `ClipInspector`
- Snap engine : `SnapEngine.swift` existe. Vérifier qu'il propose des points
  de snap "fin du clip précédent", "début du clip suivant", "playhead"

## Plan d'implémentation (un seul PR)

### Phase A — Fix export bug (point 1)

- [ ] **A1** `StoryAVCompositor.resolveBackgroundImage(for:)` : lit aussi
  `slide.mediaURL` si aucun mediaObject `isBackground` trouvé. Si l'URL est
  réseau, tente une lecture synchrone via `CacheCoordinator.imageLocalFileURL`
  puis `UIImage(contentsOfFile:)`. Cache miss → retourne nil (substrat noir,
  comportement actuel pour les URL non résolues).

- [ ] **A2** `StoryComposerViewModel` : exposer une méthode
  `slideForExport(_ slide: StorySlide) -> StorySlide` qui injecte un
  `StoryMediaObject` `isBackground=true, kind=.image, mediaURL=<file URL temp>`
  quand `slideImages[slideId]` existe. Le caller de l'export (ex: bouton
  "Exporter brouillon") l'utilise pour passer un slide complet au exporter
  sans toucher au modèle persistant.

- [ ] **A3** Test export `bg_image + text` (nouveau dans
  `StoryExporterStaticOnlyTests`) : monte un fichier image temp, l'attache
  comme bg, exporte, vérifie via SSIM qu'au moins 5% des pixels d'une frame
  midpoint ne sont pas noirs.

- [ ] **A4** Test toRenderableSlide : ajouter une assertion que pour un
  `StoryItem` avec image, le slide résultant produit un export non-noir.

### Phase B — Durée déterministe (point 2)

- [ ] **B1** `computedTotalDuration()` : itérer `stickerObjects` avec la même
  formule que les textes (`start + duration`).

- [ ] **B2** `computedTotalDuration()` : floor minimum à 0.5s si `bound == 0`
  (slide vide). Évite l'export 0-frame.

- [ ] **B3** Audit du fadeOut : ajouter helpers `endTimeIncludingFadeOut()`
  sur chaque RenderableItem pour clarifier que `fadeOut` se déroule À
  L'INTÉRIEUR de la fenêtre `[start, start+duration]` (pas après). Documenter
  dans le commit que c'est intentionnel — pas un bug.

- [ ] **B4** Test : un sticker à `startTime=8, duration=2` sur slide
  `duration=5` produit `computedTotalDuration() >= 10`.

### Phase C — Progress bar sync (point 3)

- [ ] **C1** Audit des call sites de `StoryReaderTimerController.setCurrentSlide`
  pour confirmer qu'ils passent `computedTotalDuration()`. Si un caller passe
  encore `slide.duration` brut, le corriger.

- [ ] **C2** `TimelineViewModel.applyClipPosition` : si le drag étend la
  durée, propager au `StoryReaderTimerController` parent (via callback ou
  binding) pour que la barre de progression suive en temps réel.

- [ ] **C3** Test : drag d'un clip texte au-delà de `slideDuration` produit
  un `project.slideDuration` mis à jour et un tick `progress` qui ne saute
  pas à `1.0` prématurément.

### Phase D — Timeline plein écran + précision ms (point 4)

- [ ] **D1** `StoryComposerView` : remplacer le `.sheet(isPresented: $viewModel.isTimelineVisible)`
  par un `.fullScreenCover` (ligne 425). Ajouter une bouton "Sortir du mode édition"
  en top-bar pour fermer.

- [ ] **D2** `ProTimelineView` : ajouter un mode "Edition complète" qui :
  - Affiche un previewSlot mini (canvas live) en haut
  - Affiche toutes les pistes (contenu, audio, effets) avec zoom plus permissif
  - Réserve l'inspector latéral en permanence (pas overlay popover)

- [ ] **D3** `ClipInspector` : ajouter champs numériques `Start time (s)` et
  `Duration (s)` éditables avec précision 0.001s (TextField + .keyboardType(.decimalPad)).
  Brancher sur `viewModel.setClipStartTime(id:start:)` et `viewModel.setClipDuration(id:duration:)`.

- [ ] **D4** `TimelineViewModel` : exposer `setClipStartTime(id:start:)`,
  `setClipDuration(id:duration:)` qui passent par le `CommandStack` (undo/redo
  compatible).

- [ ] **D5** Précision ms du drag : vérifier dans `dragClipMoved` que la
  conversion floue par `pixelsPerSecond` ne perd pas la précision. Si oui,
  ajouter un quantize à `0.001` avant `applyClipPosition`. Snap engine reste
  désactivable via toolbar.

- [ ] **D6** Test : ouverture du mode plein écran, drag d'un texte de 0s à 2.347s,
  vérifier que `text.startTime == 2.347` (pas `2.34` ni `2.35`).

### Phase E — Verification finale

- [ ] **E1** `./apps/ios/meeshy.sh build` passe sans warning
- [ ] **E2** `./apps/ios/meeshy.sh test` passe (tests Phase A/B/C/D)
- [ ] **E3** Test manuel sur simulateur :
  - Composer story avec image + texte → exporter → MP4 contient l'image
  - Composer story avec image + sticker à t=8s sur slide 5s → durée ext à 10s
  - Mode timeline plein écran : drag d'un clip texte avec précision ms
- [ ] **E4** Commit + push sur `claude/amazing-bell-wtDQ6`

## Notes de scope

- Pas de refactor en dehors des fichiers listés
- Pas de migration de schéma — `slideImages` reste séparé (l'injection se fait
  uniquement au moment de l'export, pas en persistance)
- Pas de nouvelle dépendance externe
- Tests : suite XCTest existante uniquement, pas de framework neuf
