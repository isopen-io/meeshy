# Story Export — les frames vidéo (fond + overlay) doivent apparaître dans le MP4

**Date** : 2026-07-25
**Statut** : Design proposé — en attente de revue utilisateur
**Type** : Correction de bug (2 causes racines) + robustesse arrière-plan
**Effort estimé** : 1 – 1.5 jour

---

## 1. Contexte & symptôme

L'export MP4 d'une story (`StoryExporter` + `StoryAVCompositor`, chemin auteur-only,
partage externe — **ne touche jamais le backend**, cf. `apps/ios/CLAUDE.md` §
« Story Architecture — RAW publish + author-only export ») produit un fichier
**avec le son mais l'image entièrement noire** quand la story contient une vidéo.

Symptôme rapporté par l'utilisateur : « il y a le son sur fond noir ».

L'utilisateur a demandé (a) que la vidéo soit conservée à l'export — **fond ET
overlay** — et (b) que l'enregistrement/export « poursuive même en arrière-plan »,
comme le chemin de publication du composer.

## 2. Causes racines (prouvées)

### Bug A — vidéo de FOND → écran noir, audio présent

`StoryExporter.export` insère bien la piste vidéo de fond dans l'`AVMutableComposition`
(`StoryExporter.swift:114-175`) et bake son audio dans une piste séparée
(`composeBackgroundVideoAudio`, `:317-383`) → **le son survit**.

Mais le compositor custom `StoryAVCompositor.startRequest`
(`StoryAVCompositor.swift:105-150`) :
- alloue un pixel buffer **vide** (`renderContext.newPixelBuffer()`, ligne 121) ;
- **n'appelle jamais** `request.sourceFrame(byTrackID:)` — la frame décodée de la
  piste vidéo n'est jamais récupérée ;
- `renderFrame`, case `.video` (`:262-265`), ne peint rien (« Substrate already
  carries video frames — nothing to overpaint »), en supposant à tort que le buffer
  contient déjà la frame source.

Avec un `customVideoCompositorClass`, **toute** frame de sortie doit être produite
par le compositor. La frame source étant ignorée, le buffer reste noir → **fond
noir + son**.

`StoryCompositionInstruction.requiredSourceTrackIDs == nil` (`:501`) = « toutes les
pistes source requises » : AVFoundation décode et fournit bien la frame ; il suffit
de la lire.

**Pattern de référence dans le repo** : `DissolveVideoCompositor.startRequest`
(`Timeline/Engine/DissolveVideoCompositor.swift:59-67`) lit correctement
`sourceTrackIDs` + `sourceFrame(byTrackID:)` et compose la frame source.

### Bug B — vidéo OVERLAY (foreground) → absente

Une vidéo posée en overlay (`isBackground == false`) n'est **jamais ajoutée à la
composition** (le prédicat `StoryExporter.swift:114-115` exige `isBackground`). En
live elle est rendue par `StoryMediaLayer.attachPlayer` via un `AVPlayerLayer`
(`StoryMediaLayer.swift:546-552`). À l'export, le compositor dessine l'arbre de
layers via `layer.render(in: cg)` (`StoryAVCompositor.swift:335`), et
**`CALayer.render(in:)` ne capture pas le contenu d'un `AVPlayerLayer`** → la vidéo
overlay est absente (au mieux le placeholder thumbHash figé).

### Pourquoi les tests ne l'ont pas vu

`StoryExporter_BackgroundVideoTests` vérifie la **durée** et la **présence d'une
piste vidéo**, jamais la couleur des pixels de sortie. Pire : la fixture
`BackgroundVideoFixture.makeVideo` génère une vidéo **entièrement noire**
(`memset(base, 0, …)`, `:314`). Sortie buguée (noire) == source (noire) → le bug
est invisible. Piège « vérifier le signal, pas son enveloppe »
(cf. mémoire `feedback_verify_generated_signal_not_just_its_envelope`).

## 3. Objectifs & non-objectifs

**Objectifs**
1. La vidéo de fond apparaît dans le MP4 exporté (Bug A).
2. La ou les vidéos overlay apparaissent dans le MP4 exporté (Bug B).
3. L'export continue si l'app passe en arrière-plan (parité avec le composer,
   niveau `beginBackgroundTask`).
4. Couverture de test qui vérifie les **pixels** (couleur), pas seulement la
   structure.

**Non-objectifs (YAGNI)**
- Aucune modification du chemin de publication RAW / backend. L'export reste
  local, auteur-only. La règle « `runStoryUpload` ne doit jamais invoquer
  `StoryExporter.export` » est préservée.
- Pas de file d'attente d'export persistante reprenable après kill (l'utilisateur a
  choisi « survie en arrière-plan », pas la file résiliente) — inadapté au partage
  externe qui ne peut pas se rouvrir seul.
- Optimisation extrême du décodage overlay (AVAssetReader séquentiel) : notée en
  suivi si l'export devient trop lent ; V1 privilégie la correction.

## 4. Conception

### Volet 1 — Bug A : composer la frame source du fond vidéo

Dans `StoryAVCompositor` :

- **`startRequest`** : après `newPixelBuffer()`, récupérer la frame source de la
  piste vidéo :
  ```swift
  let sourceFrame = request.sourceTrackIDs.first
      .flatMap { request.sourceFrame(byTrackID: $0.int32Value) }
  ```
  et la transmettre à `renderFrame` (nouveau paramètre
  `backgroundVideoFrame: CVPixelBuffer?`). Le buffer ne traverse aucune frontière
  d'isolation : tout reste dans le bloc `DispatchQueue.main.sync` existant
  (`:132-149`), conforme au commentaire `:127-130`.

- **`renderFrame`**, case `.video` : au lieu du `break`, dessiner la frame source :
  1. `CIImage(cvPixelBuffer:)` → `CGImage` via un `CIContext` partagé
     (`StoryRenderingContext` ou un CIContext dédié, comme
     `DissolveVideoCompositor.makeCIContext`).
  2. Appliquer la **`preferredTransform`** de la piste vidéo de fond (une vidéo
     caméra portrait est souvent stockée paysage + transform 90°). La transform est
     calculée dans `StoryExporter.export` (où l'asset est chargé) et passée via
     `StoryCompositionInstruction.backgroundVideoTransform: CGAffineTransform`
     (nouveau champ ; `.identity` si pas de fond vidéo).
  3. Dessiner via `paintAspectFill` / `paintAspectFit` selon
     `slide.effects.backgroundTransform?.videoFitMode` — **miroir exact du case
     `.image`** (`:307-332`), qui gère déjà letterbox + couleur de fond.

  Cas particulier « tail transparent » (no-loop, vidéo plus courte que le slide,
  `StoryExporter.swift:166-174`) : pendant le tail la frame source est transparente ;
  on peint d'abord la couleur de fond du slide (si présente) puis la frame — même
  logique que le letterbox image. Minor ; le cas principal (vidéo couvrant le slide)
  est couvert.

### Volet 2 — Bug B : injecter les frames overlay comme `contents` capturable

Réutiliser le pattern d'injection existant (`backdropProvider`) mais indexé
`(média, temps)` au lieu du rect, pour poser une frame décodée comme bitmap
capturable par `layer.render(in:)`.

**Nouveau composant SDK** — `StoryForegroundVideoFrameSource`
(`packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/`) :
- Construit une fois par export (comme `layerCache` / `backdropCapture`).
- Pour chaque `StoryMediaObject` foreground vidéo du slide, généralise
  `StoryMediaDecoder` en `frame(for media: StoryMediaObject, at time: CMTime) -> CGImage?` :
  - `AVAssetImageGenerator` avec `appliesPreferredTrackTransform = true`
    (orientation gérée gratuitement) et tolérance `.zero` (frame-exacte).
  - Décale par `media.startTime` (offset dans le clip), respecte la fenêtre de
    visibilité `[startTime, startTime+duration]` (retourne `nil` hors fenêtre → le
    layer reste masqué comme en live).
  - Cache la dernière frame par média (l'export est séquentiel) ; un
    `AVAssetImageGenerator` réutilisé par clip.
- Décodage `nonisolated` (hors MainActor) pour ne pas bloquer, résultat `CGImage`
  (Sendable) posé sur MainActor.

**`StoryRenderer.render`** : nouveau paramètre optionnel
`mediaFrameProvider: ((StoryMediaObject, CMTime) -> CGImage?)? = nil`. Dans
`renderItem` (`:373-397`), pour un média `kind == .video` foreground, calculer
`staticVideoFrame = mediaFrameProvider?(media, time)` et le passer à
`StoryMediaLayer.configure`. Nil en live (comportement inchangé) ; fourni à l'export.

**`StoryMediaLayer.configure`** : nouveau paramètre `staticVideoFrame: CGImage? = nil`.
Quand `media.kind == .video` **et** `staticVideoFrame != nil` : poser
`self.contents = staticVideoFrame`, `contentsGravity = .resizeAspectFill` (parité
avec `AVPlayerLayer.videoGravity` live, `:549`) et **ne pas** attacher d'`AVPlayer`
(inutile et coûteux à l'export). Géométrie inchangée. Sinon, comportement actuel.

**`StoryAVCompositor`** : instancier `foregroundVideoFrameSource` par export, et
passer `mediaFrameProvider: { media, t in source.frame(for: media, at: t) }` à
`StoryRenderer.render` (`:204-213`).

**Pourquoi injection de frame plutôt que multi-piste de composition** : ajouter les
vidéos overlay comme vraies pistes AVFoundation exigerait des layer-instructions +
transforms + gestion du z-order avec texte/stickers, hors du modèle `render(in:)`
actuel. L'injection de frame reste dans le pipeline de rendu existant, réutilise le
patron `backdropProvider`, et garde le z-order géré par `StoryRenderer` (tri
`zIndex`). Plus simple, moins de risque.

### Volet 3 — « poursuivre en arrière-plan »

Helper réutilisable `withBackgroundTask` (extrait du pattern privé de
`TusUploadManager.swift:181-195`, ou fonction libre dans le SDK). Envelopper
`StoryExporter.export` — **point commun** de tous les chemins d'enregistrement
(export viewer, export timeline, save Photos) :
```swift
public static func export(...) async throws {
    try await withUIBackgroundTask(named: "story-export") {
        // corps existant
    }
}
```
`beginBackgroundTask` accorde ~30 s en arrière-plan (largement au-dessus de la durée
d'un export de story) ; sur host sans UIApplication (tests) l'ID est `.invalid`,
géré comme dans `TusUploadManager`.

Placement SDK justifié : `beginBackgroundTask` est un mécanisme UIKit bas-niveau
(pas une décision UX produit) ; précédent établi par `TusUploadManager`. Conforme à
`packages/MeeshySDK/CLAUDE.md` (SDK Purity : building block, pas orchestration).

## 5. Stratégie de test (TDD — RED d'abord)

Leçon `feedback_verify_generated_signal_not_just_its_envelope` : **tester la
couleur des pixels**.

1. **Fixture colorée** : étendre `BackgroundVideoFixture.makeVideo` (ou nouvelle
   fixture) pour produire une vidéo d'une **couleur unie connue** (ex. rouge pur)
   au lieu du noir `memset(0)`.
2. **Test Bug A (RED→GREEN)** : exporter un slide à fond vidéo rouge, extraire un
   frame du MP4 de sortie (`AVAssetImageGenerator`), échantillonner un pixel central
   et vérifier qu'il est **rouge, pas noir** (tolérance par canal). Échoue sur le
   code actuel.
3. **Test Bug B (RED→GREEN)** : slide avec fond image (couleur A) + overlay vidéo
   (couleur B) placé en centre ; vérifier qu'un pixel dans la zone de l'overlay vaut
   **B**, et un pixel hors overlay vaut **A**. Échoue sur le code actuel.
4. **Non-régression** : `StoryExporterStaticOnlyTests`, image background, durée,
   audio lanes, progress — inchangés et verts.
5. **Test orientation** (Bug A) : fixture vidéo non carrée avec `preferredTransform`
   de rotation ; vérifier que l'image n'est pas déformée/tournée.
6. **Robustesse** : test que `StoryExporter.export` fonctionne toujours quand
   `UIApplication` renvoie un ID de background task `.invalid` (host de test).

Respecter `MEESHY_SKIP_EXPORT_TESTS` (skip CI des chemins Metal/AVFoundation lents).

## 6. Fichiers touchés

| Fichier | Changement |
|---|---|
| `MeeshyUI/Story/Canvas/StoryAVCompositor.swift` | `startRequest` lit `sourceFrame` ; `renderFrame` dessine la frame de fond (case `.video`) ; instancie + passe le frame provider overlay |
| `MeeshyUI/Story/Canvas/StoryAVCompositor.swift` (`StoryCompositionInstruction`) | nouveau champ `backgroundVideoTransform: CGAffineTransform` |
| `MeeshyUI/Story/Canvas/StoryExporter.swift` | calcule `preferredTransform` du fond, la passe à l'instruction ; enveloppe l'export dans `withUIBackgroundTask` |
| `MeeshyUI/Story/Canvas/StoryRenderer.swift` | param `mediaFrameProvider` ; branchement dans `renderItem` |
| `MeeshyUI/Story/Canvas/Layers/StoryMediaLayer.swift` | param `staticVideoFrame` dans `configure` ; pose `contents` au lieu de l'AVPlayer à l'export |
| `MeeshyUI/Story/Canvas/StoryForegroundVideoFrameSource.swift` | **nouveau** — extraction de frames overlay `(média, temps) → CGImage?` |
| `MeeshyUI/.../StoryMediaDecoder.swift` (ou le nouveau source) | généraliser `firstFrame` → `frame(at:)` |
| `MeeshySDK/Networking/TusUploadManager.swift` ou util SDK | extraire `withUIBackgroundTask` réutilisable |
| `MeeshyUITests/Story/Export/StoryExporter_BackgroundVideoTests.swift` | fixture colorée + assertions pixel |
| `MeeshyUITests/Story/Export/…` (nouveau) | test overlay + orientation + background-task-invalid |

## 7. Risques

- **Perf overlay** : `AVAssetImageGenerator.image(at:)` par frame peut ralentir
  l'export long. Mitigation V1 : cache dernière frame + tolérance `.zero`. Suivi :
  `AVAssetReader` séquentiel si nécessaire.
- **Orientation fond** : la `preferredTransform` mal appliquée déformerait/tournerait
  l'image → couvert par un test dédié.
- **Isolation Swift 6** : `CVPixelBuffer` non-Sendable ; garder le traitement dans le
  bloc `DispatchQueue.main.sync` existant, ne pas le faire traverser un `await`.
- **Parité live/export** : `contentsGravity = .resizeAspectFill` doit matcher le
  `videoGravity` live pour que le cadrage soit identique.

## 8. Séquencement (commits atomiques, build + tests verts à chaque étape)

1. Fixture colorée + test Bug A (RED).
2. Fix Bug A (`sourceFrame` + dessin fond + transform) → GREEN.
3. Test Bug B overlay (RED).
4. `StoryForegroundVideoFrameSource` + `mediaFrameProvider` + `staticVideoFrame` →
   GREEN.
5. Extraire `withUIBackgroundTask` + envelopper l'export + test background-invalid.
6. Non-régression complète (`./apps/ios/meeshy.sh test`) + revue.
