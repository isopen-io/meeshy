import UIKit
import QuartzCore
import AVFoundation
import MeeshySDK

extension StoryCanvasUIView {

    func slideDidChange(from oldValue: StorySlide) {
        // Refresh the cached background media id BEFORE early return paths
        // so handlePan can branch correctly even mid-gesture.
        backgroundMediaObjectId = slide.effects.mediaObjects?
            .first(where: { $0.isBackground })?.id
        // Durée totale mémoïsée AVANT les early returns : le tick du
        // display-link la lisait via `computedTotalDuration()` (parcours de
        // tous les media/audio/text objects) à chaque frame — elle ne
        // change qu'à la réassignation de `slide`.
        cachedSlideTotalDuration = slide.computedTotalDuration()

        // Any real slide mutation while editing counts as user activity —
        // the single choke point through which every composer control
        // (color/font/filter panels, sticker add/remove, background
        // transform chips, gesture-driven drags) and every inline text
        // edit eventually mutate the model, deduped against spurious
        // SwiftUI re-renders by `StoryComposerCanvasView.slidesEqualForCanvas`
        // upstream. Wakes the idle-throttled edit clock immediately
        // (issue #3906) — see `noteEditInteraction()`.
        if mode == .edit { noteEditInteraction() }

        // Skip expensive full-layer rebuild while a gesture is actively
        // manipulating an item (pan/pinch/rotate). The gesture handlers
        // update the specific CALayer transform directly. A full rebuild
        // happens once the gesture ends (manipulatedItemId becomes nil).
        guard manipulatedItemId == nil else {
            updateManipulatedItemLayer()
            return
        }
        // Recalculer la couche active. Si la suppression d'un élément a
        // changé la couche (ex: dernier fg supprimé → repasse en
        // `.background` ou `.canvas`), notifie l'UI.
        updateManipulationLayer()
        // The captured filter source texture is content-dependent. Drop the
        // freshness token so the next `updateFilterLayer()` rebuilds it
        // against the new slide. Geometry-only changes (`layoutSubviews`)
        // already invalidate via `lastCapturedSize`.
        slideContentRevision &+= 1
        // L'audio ne se re-planifie que sur un changement de COMPOSITION.
        // Cf. `slideAudioRevision` : sans ce diff, taper une lettre suffisait
        // à repartir de zéro.
        let fingerprint = Self.structureFingerprint(of: slide)
        if fingerprint != slideStructureFingerprint {
            slideStructureFingerprint = fingerprint
            slideAudioRevision &+= 1
        }
        rebuildLayers()
        // Slide content (incl. audio model) changed — reload the mixer and
        // restart playback so the new slide's audio is heard. No-op outside
        // `.play` mode. `reconfigureAudioForPlayback()` guards on the
        // revision token, so this fires at most once per slide change.
        if mode == .play {
            // Reset le mute per-piste + le playhead uniquement quand
            // l'id de slide change (pas sur chaque mutation mineure
            // comme un keyframe). Sinon on perdrait l'état mute au
            // milieu de la lecture si la slide est dirty-mise-à-jour
            // (rare en `.play` mais le garde-fou est cheap).
            if oldValue.id != slide.id {
                StoryReaderAudioMuteRegistry.shared.clear()
                lastAppliedMutedSet.removeAll()
                StoryReaderPlayheadState.shared.reset()
            }
            reconfigureAudioForPlayback()
            startAudioPlayback()
        }
    }

    /// **En LECTURE, le canvas ne peint jamais hors de ses bornes** (directive
    /// porteur 2026-09-06 : le texte d'une scène débordait sur la tuile
    /// voisine).
    ///
    /// ## Deux questions, longtemps répondues par une seule valeur
    ///
    /// `masksToBounds` était asservi à `canvasCornerRadius > 0`. Or ce sont
    /// deux questions distinctes :
    ///
    /// - *ai-je des coins arrondis ?* — une affaire de forme, décidée par l'hôte ;
    /// - *ai-je le droit de peindre en dehors de mes bornes ?* — une affaire de
    ///   confinement, qui ne dépend pas du tout de la première.
    ///
    /// Une tuile de mosaïque arrondit côté SwiftUI et ne pose donc aucun rayon
    /// ici : le masque restait absent, et sur des tuiles de ~81 pt les textes
    /// des scènes se lisaient en travers de la rangée, chacun écrivant sur sa
    /// voisine.
    ///
    /// > **Un `.clipped()` ou un `.clipShape` SwiftUI ne masque PAS l'arbre de
    /// > CALayers d'un `UIViewRepresentable`** — le doc-comment de
    /// > `canvasCornerRadius` le dit quatre lignes plus haut, et c'est
    /// > pourtant par là qu'un premier correctif est passé. Seule la couche
    /// > UIKit peut se confiner elle-même.
    ///
    /// ## Pourquoi la lecture, et pas l'édition
    ///
    /// En `.edit`, une poignée de manipulation ou un objet en cours de
    /// glissement dépasse légitimement du cadre : confiner l'édition
    /// amputerait le geste. En `.play`, la scène se REGARDE — c'est le même
    /// raisonnement que le refus des gestes de transformation en lecture, sur
    /// le même objet.
    ///
    /// ## Pourquoi une méthode, et pas une ligne dans le `didSet`
    ///
    /// Un `didSet` ne tire pas quand la valeur assignée égale l'ancienne, ni à
    /// l'initialisation d'une propriété stockée. Faire dépendre le confinement
    /// d'une écriture de `canvasCornerRadius` le rendrait absent exactement là
    /// où il manquait : une tuile qui ne pose jamais de rayon.
    func applyReadingClip() {
        layer.masksToBounds = canvasCornerRadius > 0 || mode == .play
    }

    /// **Le site UNIQUE de la question « cet objet a-t-il un éditeur ? »**, lu
    /// par le menu visuel ET par les actions VoiceOver.
    ///
    /// Les deux avaient déjà DIVERGÉ : l'accessibilité restreignait à
    /// `kind == .text || kind == .media` en local, le menu visuel non — pendant
    /// que le doc-comment de l'accessibilité affirmait appliquer « la MÊME règle
    /// que le menu long-press ». Une règle déclarée partagée et écrite deux fois
    /// diverge sans que rien ne le voie : chaque copie reste cohérente avec
    /// elle-même.
    func hasEditor(for kind: CanvasItemKind) -> Bool {
        onItemDoubleTapped != nil && editableKinds.contains(kind)
    }

    func installLayerTree() {
        // Posé DÈS la naissance : une tuile de mosaïque ne pose jamais de rayon
        // d'arrondi, donc le `didSet` de `canvasCornerRadius` ne tirerait
        // jamais pour elle — et c'est précisément elle qui débordait.
        applyReadingClip()
        layer.addSublayer(rootLayer)
        rootLayer.insertSublayer(backgroundLayer, at: 0)
        rootLayer.addSublayer(itemsContainer)
        rootLayer.addSublayer(editOverlayLayer)
        editOverlayLayer.zPosition = 10_000  // always on top
        // `insertSublayer(_:above:)` plutôt qu'un `addSublayer` : l'ordre doit
        // rester déterministe quel que soit le moment où `inlineEditor` devient
        // sous-vue (première ouverture, ré-ouverture, bascule texte A → B), sa
        // calque étant alors ajoutée en fin de liste, donc au-dessus du scrim.
        inlineEditScrimLayer.backgroundColor = UIColor.black
            .withAlphaComponent(Self.inlineEditScrimAlpha).cgColor
        inlineEditScrimLayer.opacity = 0
        inlineEditScrimLayer.isHidden = true
        layer.insertSublayer(inlineEditScrimLayer, above: rootLayer)
        // `.clear` au lieu de `.black` : pendant les transitions (1st mount,
        // drop d'un élément foreground qui déclenche `slide.didSet → rebuildLayers`,
        // lancement preview / viewer avec un canvas fraîchement instancié)
        // UIKit composite le view AVANT que `backgroundLayer` ait son contenu
        // dessiné. Avec un fond noir, ces transitions flashent ~16ms de noir
        // perçu comme un scintillement. Avec `.clear`, on voit le parent
        // (typiquement le fond du composer / viewer, déjà du contenu utile)
        // pendant cette latence. Le fond cinema des stories est porté par
        // `backgroundLayer` (image / video / couleur de slide), pas par
        // cette view.
        backgroundColor = .clear
        isOpaque = false
        // Rounded-card clipping (when `canvasCornerRadius > 0`) uses a continuous
        // (squircle) curve to match the SwiftUI `RoundedRectangle(style: .continuous)`.
        layer.cornerCurve = .continuous
    }

    func wireBackgroundPlayerAttach() {
        // Attach différé du player vidéo de fond (cache froid : l'URL distante
        // est résolue/téléchargée par une Task async, le player n'existe pas
        // encore quand `scheduleContentReadyEvaluation` tourne). Ré-arme
        // l'observation de readiness à l'attach, sans fenêtre de temps —
        // c'est le seul pont fiable entre « download terminé » et
        // `contentReadyFired` (bug user 2026-06-11 : story vidéo figée sur
        // thumbnail, progression sans frames ni audio).
        backgroundLayer.onPlayerAttached = { [weak self] in
            guard let self, !self.contentReadyFired else { return }
            guard case .video = self.backgroundLayer.kind else { return }
            guard self.backgroundLayer.avPlayer != nil else { return }
            // `currentItem` volontairement optionnel : un AVQueuePlayer
            // loopé l'expose nil quelques runloops après l'attach.
            self.armBackgroundVideoReadinessObservation(item: self.backgroundLayer.avPlayer?.currentItem)
        }
    }
}
