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
    public enum SelectionKind: Equatable, Sendable {
        case clip(ClipInspector.ClipSnapshot)
        case keyframe(KeyframeInspector.KeyframeSnapshot, clipId: String)
        case transition(TransitionInspector.TransitionSnapshot)
    }

    @ObservedObject private var viewModel: TimelineViewModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    public init(viewModel: TimelineViewModel) {
        self.viewModel = viewModel
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

    /// Pure mapping from the current timeline selection to a `ClipSnapshot`.
    /// Returns `nil` when no clip is selected or when the selected id matches
    /// neither a media clip nor an audio player object.
    public static func resolveClipSnapshot(viewModel: TimelineViewModel) -> ClipInspector.ClipSnapshot? {
        guard let id = viewModel.selection.selectedClipId else { return nil }
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
            return ClipInspector.ClipSnapshot(
                id: media.id,
                displayName: media.postMediaId,
                kind: kind,
                startTime: Float(media.startTime ?? 0),
                duration: Float(media.duration ?? 0),
                volume: media.volume,
                fadeInDuration: Float(media.fadeIn ?? 0),
                fadeOutDuration: Float(media.fadeOut ?? 0),
                isLooping: media.loop,
                isBackground: media.isBackground,
                name: media.name
            )
        }
        if let audio = viewModel.project.audioPlayerObjects.first(where: { $0.id == id }) {
            return ClipInspector.ClipSnapshot(
                id: audio.id,
                displayName: audio.postMediaId,
                kind: .audio,
                startTime: audio.startTime ?? 0,
                duration: audio.duration ?? 0,
                volume: audio.volume,
                fadeInDuration: audio.fadeIn ?? 0,
                fadeOutDuration: audio.fadeOut ?? 0,
                isLooping: audio.loop ?? false,
                isBackground: audio.isBackground ?? false,
                name: audio.name
            )
        }
        // Le texte a aussi un début/durée/fondu (et un nom) éditables — sans
        // cette branche, un long-press sur un TEXTE n'ouvrirait aucun inspecteur.
        // Pas de volume ni de boucle pour le texte (slider masqué via
        // hasAudioAffordances(.text) == false).
        if let text = viewModel.project.textObjects.first(where: { $0.id == id }) {
            return ClipInspector.ClipSnapshot(
                id: text.id,
                displayName: text.text,
                kind: .text,
                startTime: Float(text.startTime ?? 0),
                duration: Float(text.duration ?? 0),
                volume: 1.0,
                fadeInDuration: Float(text.fadeIn ?? 0),
                fadeOutDuration: Float(text.fadeOut ?? 0),
                isLooping: false,
                isBackground: false,
                name: text.name
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
            presentation: .popover,
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
            onClose: { viewModel.selectClip(id: nil) },
            onStartAdjusted: { [viewModel] delta in
                viewModel.dragClip(id: clipId, deltaTimeSeconds: delta, isCommitted: true)
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
            slideDuration: viewModel.project.slideDuration
        )
        .padding(12)
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
            onDelete: { [viewModel] in
                viewModel.deleteKeyframe(clipId: clipId, keyframeId: keyframeId)
            },
            onClose: { viewModel.selectClip(id: nil) }
        )
        .padding(12)
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
            onClose: { viewModel.selectClip(id: nil) },
            onEasingChanged: { [viewModel] easing in
                viewModel.changeTransition(transitionId: transitionId,
                                           kind: snapshot.kind,
                                           duration: snapshot.duration,
                                           easing: easing)
            },
            easing: currentEasing
        )
        .padding(12)
        .transition(.opacity)
        .animation(reduceMotion ? .none : .easeInOut(duration: 0.15),
                   value: viewModel.selection.selectedClipId)
    }
}
