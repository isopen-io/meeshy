import SwiftUI
import MeeshySDK

/// Floating inspector host for the unified timeline. Resolves the current
/// `selection.selectedClipId` — a bus shared by clips, keyframes and
/// transitions (`KeyframeMarkerView` and `TransitionBadge` both push their
/// own id through `selectClip(id:)`) — to exactly one inspector and renders
/// it. Extracted from the former Pro container so the single timeline view
/// surfaces the full editing feature set: selecting a clip, keyframe or
/// transition always opens its editor instead of dead-ending.
public struct TimelineInspectorHost: View {

    /// Identifies which inspector the overlay should surface for the current
    /// `selection.selectedClipId`. Resolution priority is clip → keyframe →
    /// transition, mirroring the lookup chain a tap on the underlying SwiftUI
    /// element would trigger.
    public enum SelectionKind: Equatable, Sendable, Identifiable {
        case clip(ClipInspector.ClipSnapshot)
        case keyframe(KeyframeInspector.KeyframeSnapshot, clipId: String)
        case transition(TransitionInspector.TransitionSnapshot)

        /// Identité de la SÉLECTION, jamais de ses valeurs.
        ///
        /// C'est ce qui pilote la présentation en sheet. La faire dépendre du
        /// volume, de la durée ou de la position d'un keyframe refermerait puis
        /// rouvrirait la sheet à chaque cran de curseur — sous les doigts de
        /// l'utilisateur en train de régler.
        ///
        /// Le préfixe de catégorie est nécessaire : clips, keyframes et
        /// transitions transitent par le MÊME bus (`selection.selectedClipId`)
        /// et peuvent porter le même identifiant brut ; sans lui, passer de
        /// l'un à l'autre ne changerait pas l'identité et la sheet garderait
        /// l'inspecteur précédent.
        public var id: String {
            switch self {
            case .clip(let snapshot):
                return "clip:\(snapshot.id)"
            case .keyframe(let snapshot, let clipId):
                return "keyframe:\(clipId):\(snapshot.id)"
            case .transition(let snapshot):
                return "transition:\(snapshot.id)"
            }
        }
    }

    @ObservedObject private var viewModel: TimelineViewModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    private let presentation: InspectorPresentation

    public init(viewModel: TimelineViewModel,
                presentation: InspectorPresentation = .popover) {
        self.viewModel = viewModel
        self.presentation = presentation
    }

    /// Sélection à présenter, gardes comprises. `nil` = rien à montrer.
    /// Extrait ici pour piloter une `sheet(item:)` depuis l'hôte.
    public static func presentedSelection(viewModel: TimelineViewModel) -> SelectionKind? {
        // La fiche ne s'ouvre QUE sur une intention explicite — double tap sur
        // une piste, tap sur un marqueur. Auparavant elle suivait
        // `selectedClipId` : surligner, c'était présenter, et le moindre tap
        // recouvrait la timeline qu'on était en train de lire.
        //
        // Les `resolve*Snapshot` ci-dessous lisent toujours `selectedClipId` :
        // c'est exact grâce à l'invariant d'ouverture
        // (`inspectedClipId != nil ⟹ inspectedClipId == selectedClipId`).
        guard viewModel.selection.inspectedClipId != nil else { return nil }
        switch resolveSelectionKind(viewModel: viewModel) {
        case .clip(let snapshot):
            // Un clip synthétique n'a rien d'éditable : ouvrir une sheet vide
            // serait pire que le survol, qu'on pouvait au moins ignorer.
            return shouldShowClipInspector(viewModel: viewModel) ? .clip(snapshot) : nil
        case .some(let kind):
            return kind
        case .none:
            return nil
        }
    }

    // MARK: - Static helpers (pure, testable)

    public static func shouldShowClipInspector(viewModel: TimelineViewModel) -> Bool {
        guard let id = viewModel.selection.selectedClipId else { return false }
        // Synthetic clips (e.g., the static background image lane) carry no
        // editable metadata — surfacing the inspector would expose Delete,
        // Add keyframe and Loop controls that have no effect, and risk the
        // user thinking they removed their background. The clip is still
        // tappable so the selection ring shows, but the inspector stays
        // hidden until they pick a real clip.
        return !StoryComposerViewModel.isSyntheticTimelineClipId(id)
    }

    /// Extrait les points d'automation du volume d'un jeu de keyframes, en
    /// temps ABSOLU.
    ///
    /// Les points sans volume — position, échelle, opacité — sont écartés :
    /// ils ne décrivent pas la courbe et les lister reviendrait à proposer de
    /// retirer un point qui ne règle aucun son.
    public static func volumePoints(
        keyframes: [StoryKeyframe]?,
        clipStart: Float
    ) -> [ClipInspector.ClipSnapshot.VolumePoint] {
        (keyframes ?? []).compactMap { kf in
            guard let volume = kf.volume else { return nil }
            return ClipInspector.ClipSnapshot.VolumePoint(
                id: kf.id, absoluteTime: clipStart + kf.time, volume: volume
            )
        }
    }

    /// `true` quand la slide porte un audio de FOND — la seule situation où
    /// l'atténuation automatique a quelque chose à atténuer.
    ///
    /// Sans lui, la fiche proposerait de couper une atténuation qui ne se
    /// déclenche jamais.
    public static func hasBackgroundAudio(project: TimelineProject) -> Bool {
        project.audioPlayerObjects.contains { $0.isBackground == true }
    }

    /// Fenêtre ANNONCÉE d'un clip, début et durée.
    ///
    /// Un clip permanent (`duration == nil`) court de son début jusqu'à la fin
    /// de la slide : c'est ce que la piste dessine
    /// (`TimelineGeometry.effectiveClipDuration`, même appel) et ce que le trim
    /// au doigt matérialise au premier geste. La fiche lisait `duration ?? 0`
    /// et annonçait « DÉBUT 0,0 · FIN 0,0 · DURÉE 0,0 » sur un texte de 16 s —
    /// trois valeurs fausses, et un piège : un appui sur « + » de la durée
    /// ramenait le clip à 0,1 s au lieu de l'allonger.
    private static func window(startTime: Float,
                               duration: Float?,
                               slideDuration: Float) -> (start: Float, duration: Float) {
        (startTime, TimelineGeometry.effectiveClipDuration(startTime: startTime,
                                                           duration: duration,
                                                           slideDuration: slideDuration))
    }

    /// Pure mapping from the current timeline selection to a `ClipSnapshot`.
    /// Returns `nil` when no clip is selected or when the selected id matches
    /// neither a media clip nor an audio player object.
    public static func resolveClipSnapshot(viewModel: TimelineViewModel) -> ClipInspector.ClipSnapshot? {
        guard let id = viewModel.selection.selectedClipId else { return nil }
        let slideDuration = viewModel.project.slideDuration
        if let media = viewModel.project.mediaObjects.first(where: { $0.id == id }) {
            // Media objects only carry image/video — audio lives in
            // `audioPlayerObjects`. An unrecognized mediaType (forward-compat)
            // defaults to .video so existing video-tuned controls remain
            // reachable rather than disappearing.
            let kind: ClipInspector.ClipSnapshot.Kind = {
                switch media.kind {
                case .some(.image): return .image
                case .some(.video): return .video
                case .none:         return .video
                }
            }()
            let win = window(startTime: Float(media.startTime ?? 0),
                             duration: media.duration.map { Float($0) },
                             slideDuration: slideDuration)
            return ClipInspector.ClipSnapshot(
                id: media.id,
                displayName: media.postMediaId,
                kind: kind,
                startTime: win.start,
                duration: win.duration,
                volume: media.volume,
                fadeInDuration: Float(media.fadeIn ?? 0),
                fadeOutDuration: Float(media.fadeOut ?? 0),
                isLooping: media.loop,
                isBackground: media.isBackground,
                name: media.name,
                transform: ClipTransform(x: media.x, y: media.y, scale: media.scale,
                                         rotation: media.rotation, zIndex: media.zIndex),
                volumeKeyframes: volumePoints(keyframes: media.keyframes,
                                              clipStart: Float(media.startTime ?? 0)),
                isDuckingDisabled: media.isDuckingDisabled ?? false,
                slideHasBackgroundAudio: hasBackgroundAudio(project: viewModel.project),
                isFollowingSlide: media.startTime == nil && media.duration == nil
            )
        }
        if let audio = viewModel.project.audioPlayerObjects.first(where: { $0.id == id }) {
            let win = window(startTime: audio.startTime ?? 0,
                             duration: audio.duration,
                             slideDuration: slideDuration)
            return ClipInspector.ClipSnapshot(
                id: audio.id,
                displayName: audio.postMediaId,
                kind: .audio,
                startTime: win.start,
                duration: win.duration,
                volume: audio.volume,
                fadeInDuration: audio.fadeIn ?? 0,
                fadeOutDuration: audio.fadeOut ?? 0,
                isLooping: audio.loop ?? false,
                isBackground: audio.isBackground ?? false,
                name: audio.name,
                volumeKeyframes: volumePoints(keyframes: audio.keyframes,
                                              clipStart: audio.startTime ?? 0),
                isFollowingSlide: audio.startTime == nil && audio.duration == nil
            )
        }
        // Le texte a aussi un début/durée/fondu (et un nom) éditables — sans
        // cette branche, un long-press sur un TEXTE n'ouvrirait aucun inspecteur.
        // Pas de volume ni de boucle pour le texte (slider masqué via
        // hasAudioAffordances(.text) == false).
        if let text = viewModel.project.textObjects.first(where: { $0.id == id }) {
            let win = window(startTime: Float(text.startTime ?? 0),
                             duration: text.duration.map { Float($0) },
                             slideDuration: slideDuration)
            return ClipInspector.ClipSnapshot(
                id: text.id,
                displayName: text.text,
                kind: .text,
                startTime: win.start,
                duration: win.duration,
                volume: 1.0,
                fadeInDuration: Float(text.fadeIn ?? 0),
                fadeOutDuration: Float(text.fadeOut ?? 0),
                isLooping: false,
                isBackground: false,
                name: text.name,
                transform: ClipTransform(x: text.x, y: text.y, scale: text.scale,
                                         rotation: text.rotation, zIndex: text.zIndex),
                isFollowingSlide: text.startTime == nil && text.duration == nil
            )
        }
        // Le sticker a une lane TAPABLE dans la timeline mais aucune branche
        // ici : la sélection résolvait `nil`, la sheet ne s'ouvrait jamais, et
        // le début / la durée / les keyframes du sticker restaient
        // inatteignables alors que le view model les gère tous.
        // Pas de nom persisté sur `StorySticker` — l'emoji EST son identité.
        if let sticker = viewModel.project.stickerObjects.first(where: { $0.id == id }) {
            let win = window(startTime: Float(sticker.startTime ?? 0),
                             duration: sticker.duration.map { Float($0) },
                             slideDuration: slideDuration)
            return ClipInspector.ClipSnapshot(
                id: sticker.id,
                displayName: sticker.emoji,
                kind: .sticker,
                startTime: win.start,
                duration: win.duration,
                volume: 1.0,
                fadeInDuration: Float(sticker.fadeIn ?? 0),
                fadeOutDuration: Float(sticker.fadeOut ?? 0),
                isLooping: false,
                isBackground: false,
                name: nil,
                isFollowingSlide: sticker.startTime == nil && sticker.duration == nil
            )
        }
        return nil
    }

    /// Pure mapping from the current selection to a `KeyframeSnapshot`.
    /// A keyframe id is searched across every clip's `keyframes` collection
    /// (media + text — audio has no keyframes). The owning clip's start time
    /// is added to the keyframe's relative `time` to produce an absolute
    /// timeline position so the inspector header reads correctly.
    public static func resolveKeyframeSnapshot(
        viewModel: TimelineViewModel
    ) -> (snapshot: KeyframeInspector.KeyframeSnapshot, clipId: String)? {
        guard let id = viewModel.selection.selectedClipId else { return nil }
        for media in viewModel.project.mediaObjects {
            guard let keyframes = media.keyframes,
                  let kf = keyframes.first(where: { $0.id == id }) else { continue }
            let clipStart = Float(media.startTime ?? 0)
            let snapshot = KeyframeInspector.KeyframeSnapshot(
                id: kf.id,
                absoluteTime: clipStart + kf.time,
                x: kf.x ?? 0.5,
                y: kf.y ?? 0.5,
                scale: kf.scale ?? 1.0,
                opacity: kf.opacity ?? 1.0
            )
            return (snapshot, media.id)
        }
        for text in viewModel.project.textObjects {
            guard let keyframes = text.keyframes,
                  let kf = keyframes.first(where: { $0.id == id }) else { continue }
            let clipStart = Float(text.startTime ?? 0)
            let snapshot = KeyframeInspector.KeyframeSnapshot(
                id: kf.id,
                absoluteTime: clipStart + kf.time,
                x: kf.x ?? 0.5,
                y: kf.y ?? 0.5,
                scale: kf.scale ?? 1.0,
                opacity: kf.opacity ?? 1.0
            )
            return (snapshot, text.id)
        }
        return nil
    }

    /// Pure mapping from the current selection to a `TransitionSnapshot`.
    /// The selected id is matched against `project.clipTransitions[].id`.
    public static func resolveTransitionSnapshot(
        viewModel: TimelineViewModel
    ) -> TransitionInspector.TransitionSnapshot? {
        guard let id = viewModel.selection.selectedClipId else { return nil }
        guard let transition = viewModel.project.clipTransitions.first(where: { $0.id == id }) else {
            return nil
        }
        return TransitionInspector.TransitionSnapshot(
            id: transition.id,
            fromClipId: transition.fromClipId,
            toClipId: transition.toClipId,
            kind: transition.kind,
            duration: transition.duration
        )
    }

    /// Maps a `KeyframeInspector.Easing` UI tag to the SDK-side `StoryEasing`
    /// used by the command stack. `spring` falls back to `easeInOut` since the
    /// SDK does not surface a dedicated spring case yet.
    public static func mapInspectorEasing(_ easing: KeyframeInspector.Easing) -> StoryEasing {
        switch easing {
        case .linear:    return .linear
        case .easeIn:    return .easeIn
        case .easeOut:   return .easeOut
        case .easeInOut: return .easeInOut
        case .spring:    return .easeInOut
        }
    }

    /// Per-clip mute resolution for the audio lane bar. A clip is rendered as
    /// muted when EITHER the global timeline mute is engaged (engine.isMuted)
    /// OR the clip volume is at or below zero — `StoryAudioPlayerObject` has
    /// no `isMuted` flag of its own, so volume 0 is the persistent silenced
    /// state the timeline can show without holding a separate boolean.
    public static func isMutedForAudio(globalMute: Bool, audio: StoryAudioPlayerObject) -> Bool {
        globalMute || audio.volume <= 0
    }

    /// Resolves the current selection to exactly one inspector kind, applying
    /// the clip → keyframe → transition priority. A clip lookup wins because
    /// media/audio/text object ids are the primary handle the playback engine
    /// reports via `onElementBecameActive`. Returns `nil` when no selection is
    /// active or the id matches none of the three categories.
    public static func resolveSelectionKind(
        viewModel: TimelineViewModel
    ) -> SelectionKind? {
        if let clip = resolveClipSnapshot(viewModel: viewModel) {
            return .clip(clip)
        }
        if let keyframe = resolveKeyframeSnapshot(viewModel: viewModel) {
            return .keyframe(keyframe.snapshot, clipId: keyframe.clipId)
        }
        if let transition = resolveTransitionSnapshot(viewModel: viewModel) {
            return .transition(transition)
        }
        return nil
    }

    // MARK: - Body

    public var body: some View {
        switch Self.resolveSelectionKind(viewModel: viewModel) {
        case .clip(let snapshot):
            if Self.shouldShowClipInspector(viewModel: viewModel) {
                clipInspectorOverlay(snapshot: snapshot)
            }
        case .keyframe(let snapshot, let clipId):
            keyframeInspectorOverlay(snapshot: snapshot, clipId: clipId)
        case .transition(let snapshot):
            transitionInspectorOverlay(snapshot: snapshot)
        case .none:
            EmptyView()
        }
    }

    // MARK: - Inspector overlays

    @ViewBuilder
    private func clipInspectorOverlay(snapshot: ClipInspector.ClipSnapshot) -> some View {
        let clipId = snapshot.id
        ClipInspector(
            presentation: presentation,
            clip: snapshot,
            onVolumeChanged: { [viewModel] volume in
                viewModel.setClipVolume(id: clipId, volume: volume)
            },
            onFadeInChanged: { [viewModel] fadeIn in
                viewModel.setClipFadeIn(id: clipId, fadeIn: fadeIn)
            },
            onFadeOutChanged: { [viewModel] fadeOut in
                viewModel.setClipFadeOut(id: clipId, fadeOut: fadeOut)
            },
            onLoopToggled: { [viewModel] loop in
                viewModel.setClipLoop(id: clipId, isLooping: loop)
            },
            onBackgroundToggled: { [viewModel] bg in
                viewModel.setClipBackground(id: clipId, isBackground: bg)
            },
            onAddKeyframe: { viewModel.addKeyframeAtPlayhead() },
            onDelete: { viewModel.deleteClip(id: clipId) },
            onFollowSlide: { [viewModel] in
                viewModel.followSlide(id: clipId)
            },
            // `splitSelectedAtPlayhead` lit `selectedClipId` : correct sans
            // changement, puisque `inspect(_:)` pose les deux identifiants.
            onSplit: { viewModel.splitSelectedAtPlayhead() },
            onClose: { viewModel.endInspection() },
            // Stepper de PRÉCISION, pas un geste : `dragClip` aurait fait
            // avaler le pas de 0,1 s par l'aimant magnétique (~0,16 s au zoom
            // par défaut).
            onStartAdjusted: { [viewModel] delta in
                viewModel.nudgeClipStart(id: clipId, by: delta)
            },
            onDurationAdjusted: { [viewModel] delta in
                viewModel.trimClipEnd(id: clipId, deltaTimeSeconds: delta)
            },
            onNameChanged: { [viewModel] name in
                viewModel.setClipName(id: clipId, name: name)
            },
            onEndAdjusted: { [viewModel] delta in
                viewModel.trimClipEnd(id: clipId, deltaTimeSeconds: delta)
            },
            onStartTrimmed: { [viewModel] delta in
                viewModel.trimClipStart(id: clipId, deltaTimeSeconds: delta)
            },
            slideDuration: viewModel.project.slideDuration,
            onStartSet: { [viewModel] seconds in
                viewModel.setClipStart(id: clipId, to: seconds)
            },
            onEndSet: { [viewModel] seconds in
                viewModel.setClipEnd(id: clipId, to: seconds)
            },
            onDurationSet: { [viewModel] seconds in
                viewModel.setClipDuration(id: clipId, to: seconds)
            },
            onTransformChanged: { [viewModel] field in
                viewModel.setClipTransform(id: clipId, field: field)
            },
            playheadTime: viewModel.currentTime,
            onAddVolumePoint: { [viewModel] volume in
                viewModel.addKeyframeAtPlayhead(volume: volume)
            },
            onRemoveVolumePoint: { [viewModel] keyframeId in
                viewModel.deleteKeyframe(clipId: clipId, keyframeId: keyframeId)
            },
            onDuckingDisabledChanged: { [viewModel] isDisabled in
                viewModel.setClipDuckingDisabled(id: clipId, isDisabled: isDisabled)
            },
            onToggleMute: { [viewModel] in
                viewModel.toggleClipMute(id: clipId)
            }
        )
        .padding(presentation == .popover ? 12 : 0)
        .transition(.opacity)
        .animation(reduceMotion ? .none : .easeInOut(duration: 0.15),
                   value: viewModel.selection.selectedClipId)
    }

    @ViewBuilder
    private func keyframeInspectorOverlay(snapshot: KeyframeInspector.KeyframeSnapshot,
                                          clipId: String) -> some View {
        let keyframeId = snapshot.id
        KeyframeInspector(
            keyframe: snapshot,
            // Advanced easings stay gated behind a future product flag.
            // Linear-only matches the launch surface of KeyframeInspector.
            isAdvancedEnabled: false,
            onPositionChanged: { [viewModel] newX, newY in
                viewModel.moveKeyframe(clipId: clipId,
                                       keyframeId: keyframeId,
                                       position: CGPoint(x: newX, y: newY))
            },
            onScaleChanged: { [viewModel] newScale in
                viewModel.moveKeyframe(clipId: clipId,
                                       keyframeId: keyframeId,
                                       scale: newScale)
            },
            onOpacityChanged: { [viewModel] newOpacity in
                viewModel.moveKeyframe(clipId: clipId,
                                       keyframeId: keyframeId,
                                       opacity: newOpacity)
            },
            onEasingChanged: { [viewModel] newEasing in
                viewModel.moveKeyframe(clipId: clipId,
                                       keyframeId: keyframeId,
                                       easing: Self.mapInspectorEasing(newEasing))
            },
            onTimeAdjusted: { [viewModel] delta in
                viewModel.nudgeKeyframeTime(clipId: clipId, keyframeId: keyframeId, by: delta)
            },
            onDelete: { [viewModel] in
                viewModel.deleteKeyframe(clipId: clipId, keyframeId: keyframeId)
            },
            onClose: { viewModel.endInspection() }
        )
        .padding(presentation == .popover ? 12 : 0)
        .transition(.opacity)
        .animation(reduceMotion ? .none : .easeInOut(duration: 0.15),
                   value: viewModel.selection.selectedClipId)
    }

    @ViewBuilder
    private func transitionInspectorOverlay(snapshot: TransitionInspector.TransitionSnapshot) -> some View {
        let transitionId = snapshot.id
        let currentEasing = viewModel.project.clipTransitions
            .first(where: { $0.id == transitionId })?.easing ?? .linear
        TransitionInspector(
            transition: snapshot,
            isAdvancedEnabled: true,
            onKindChanged: { [viewModel] kind in
                viewModel.changeTransition(transitionId: transitionId,
                                           kind: kind,
                                           duration: snapshot.duration)
            },
            onDurationChanged: { [viewModel] duration in
                viewModel.changeTransition(transitionId: transitionId,
                                           kind: snapshot.kind,
                                           duration: duration)
            },
            onDelete: { [viewModel] in
                viewModel.removeTransition(transitionId: transitionId)
            },
            onClose: { viewModel.endInspection() },
            onEasingChanged: { [viewModel] easing in
                viewModel.changeTransition(transitionId: transitionId,
                                           kind: snapshot.kind,
                                           duration: snapshot.duration,
                                           easing: easing)
            },
            easing: currentEasing
        )
        .padding(presentation == .popover ? 12 : 0)
        .transition(.opacity)
        .animation(reduceMotion ? .none : .easeInOut(duration: 0.15),
                   value: viewModel.selection.selectedClipId)
    }
}

// MARK: - Présentation en sheet

/// Présente l'inspecteur de timeline dans une **sheet** plutôt qu'en survol
/// flottant au-dessus des pistes (item 8, directive user 2026-07-25).
///
/// Le survol posait un panneau translucide par-dessus la zone qu'on était en
/// train d'éditer : il masquait les pistes, n'offrait aucune poignée de
/// redimensionnement, et se refermait par un bouton minuscule. La sheet donne
/// les affordances système — poignée, glisser pour fermer, paliers de hauteur —
/// et libère la timeline pendant le réglage.
private struct TimelineInspectorSheetModifier: ViewModifier {
    @ObservedObject var viewModel: TimelineViewModel

    func body(content: Content) -> some View {
        content.sheet(item: Binding(
            get: { TimelineInspectorHost.presentedSelection(viewModel: viewModel) },
            // Fermer la sheet DÉSÉLECTIONNE : sans ça, la sélection resterait
            // posée et la sheet se rouvrirait au prochain rendu.
            // Fermer la sheet referme l'INSPECTION, sans désélectionner : le
            // clip reste surligné, l'utilisateur retrouve où il en était.
            set: { if $0 == nil { viewModel.endInspection() } }
        )) { _ in
            TimelineInspectorHost(viewModel: viewModel, presentation: .sheet)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
                .sheetBackgroundIfAvailable()
        }
    }
}

private extension View {
    /// `presentationBackground` n'existe qu'à partir d'iOS 16.4 ; le paquet
    /// cible iOS 16.0. Sans la garde, la compilation casse sur le plancher.
    @ViewBuilder
    func sheetBackgroundIfAvailable() -> some View {
        if #available(iOS 16.4, *) {
            self.presentationBackground(.ultraThinMaterial)
        } else {
            self
        }
    }
}

public extension View {
    /// Attache l'inspecteur de timeline en sheet à la vue hôte.
    func timelineInspectorSheet(viewModel: TimelineViewModel) -> some View {
        modifier(TimelineInspectorSheetModifier(viewModel: viewModel))
    }
}
