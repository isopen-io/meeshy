import SwiftUI
import MeeshySDK

/// Landscape multi-track editor. Preview left (~30%), timeline + grouped
/// tracks right (~70%), floating inspector bottom-leading.
public struct ProTimelineView: View {

    public static let previewWidthFraction: CGFloat = 0.30

    public enum Section: Equatable, Hashable { case media, son, filters, timeline }

    public struct TrackGroup: Equatable {
        public let section: Section
        public let titleKey: String
        public let tracks: [QuickTimelineView.CompactTrack]
    }

    /// Identifies which inspector the bottom-leading overlay should surface
    /// for the current `selection.selectedClipId`. Resolution priority is
    /// clip → keyframe → transition, mirroring the lookup chain a tap on the
    /// underlying SwiftUI element would trigger (KeyframeMarkerView and
    /// TransitionBadge both call `selectClip(id:)` with their own id, which
    /// would otherwise route through the wrong inspector).
    public enum SelectionKind: Equatable, Sendable {
        case clip(ClipInspector.ClipSnapshot)
        case keyframe(KeyframeInspector.KeyframeSnapshot, clipId: String)
        case transition(TransitionInspector.TransitionSnapshot)
    }

    @ObservedObject private var viewModel: TimelineViewModel
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass

    private let previewSlot: (() -> AnyView)?

    public init(viewModel: TimelineViewModel,
                @ViewBuilder previewSlot: @escaping () -> some View) {
        self.viewModel = viewModel
        self.previewSlot = { AnyView(previewSlot()) }
    }

    public init(viewModel: TimelineViewModel) {
        self.viewModel = viewModel
        self.previewSlot = nil
    }

    // MARK: - Static helpers

    public static func resolveTrackGroups(project: TimelineProject) -> [TrackGroup] {
        let all = QuickTimelineView.resolveAllTracks(project: project)
        let media = all.filter {
            switch $0.kind {
            case .bgVideo, .video, .bgImage, .image: return true
            default: return false
            }
        }
        let son = all.filter {
            switch $0.kind {
            case .bgAudio, .audio: return true
            default: return false
            }
        }
        let filters = all.filter {
            switch $0.kind {
            case .text: return true
            default: return false
            }
        }
        return [
            TrackGroup(section: .media, titleKey: "story.composer.empty.tile.media", tracks: media),
            TrackGroup(section: .son,   titleKey: "story.composer.empty.tile.son",   tracks: son),
            TrackGroup(section: .filters,  titleKey: "story.composer.empty.tile.filters",  tracks: filters)
        ]
    }

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
    ///
    /// Exposed as a static helper so the `kind` resolution (image vs video vs
    /// audio) is testable through the public surface without driving SwiftUI
    /// view bodies. The instance wrapper below reads `viewModel.project` and
    /// `viewModel.selection` directly, which would otherwise require routing
    /// tests through gestures.
    ///
    /// Returns `nil` when no clip is selected or when the selected id matches
    /// neither a media clip nor an audio player object.
    public static func resolveClipSnapshot(viewModel: TimelineViewModel) -> ClipInspector.ClipSnapshot? {
        guard let id = viewModel.selection.selectedClipId else { return nil }
        if let media = viewModel.project.mediaObjects.first(where: { $0.id == id }) {
            // Map StoryMediaKind → ClipSnapshot.Kind. Media objects only carry
            // image/video — audio lives in `audioPlayerObjects`. An unrecognized
            // mediaType (forward-compat) defaults to .video so existing
            // video-tuned controls remain reachable rather than disappearing.
            let kind: ClipInspector.ClipSnapshot.Kind = {
                switch media.kind {
                case .some(.image): return .image
                case .some(.video): return .video
                case .none:         return .video
                }
            }()
            return ClipInspector.ClipSnapshot(
                id: media.id,
                // No `url` on StoryMediaObject — use postMediaId as display name
                displayName: media.postMediaId,
                kind: kind,
                startTime: Float(media.startTime ?? 0),
                duration: Float(media.duration ?? 0),
                volume: media.volume,
                fadeInDuration: Float(media.fadeIn ?? 0),
                fadeOutDuration: Float(media.fadeOut ?? 0),
                isLooping: media.loop,
                isBackground: media.isBackground
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
                isBackground: audio.isBackground ?? false
            )
        }
        return nil
    }

    /// Pure mapping from the current selection to a `KeyframeSnapshot`,
    /// mirroring `resolveClipSnapshot` so test code can exercise the
    /// keyframe-inspector routing without driving a SwiftUI render tree.
    ///
    /// A keyframe id is searched across every clip's `keyframes` collection
    /// (media + text — audio has no keyframes). The owning clip's start time
    /// is added to the keyframe's relative `time` to produce an absolute
    /// timeline position so the inspector header reads correctly.
    ///
    /// Returns `nil` when no selection is active or when the selected id does
    /// not match any keyframe.
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

    /// Pure mapping from the current selection to a `TransitionSnapshot`,
    /// mirroring `resolveClipSnapshot`. The selected id is matched against
    /// `project.clipTransitions[].id`. Returns `nil` when no selection is
    /// active or when the id is not a transition.
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
    /// SDK does not surface a dedicated spring case yet (the inspector picker
    /// keeps it visible behind the advanced flag so the data model is the only
    /// thing to update when product unlocks it).
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

    // MARK: - Hoisted computed properties (MEDIUM 7)
    // Keyed only on viewModel.project — stable when currentTime / zoomScale change.

    private var hoistedTrackGroups: [TrackGroup] {
        Self.resolveTrackGroups(project: viewModel.project)
    }

    private var hoistedJunctions: [TransitionJunction] {
        TransitionJunctionResolver.resolve(
            project: viewModel.project,
            slideDuration: viewModel.project.slideDuration
        )
    }

    // MARK: - Body

    /// True when the host environment is a portrait phone (or any compact
    /// horizontal class). The 30/70 HStack split is reserved for landscape /
    /// iPad — in compact contexts we collapse to a fully vertical layout so
    /// the transport row and tracks both get the full sheet width.
    private var isCompactLayout: Bool { horizontalSizeClass == .compact }

    public var body: some View {
        Group {
            if isCompactLayout {
                compactLayout
            } else {
                regularLayout
            }
        }
        // Parent TimelineContainerSwitcher already paints the sheet with
        // .ultraThinMaterial. The tint here just nudges the surface back
        // toward the indigo brand in both schemes.
        .background(
            colorScheme == .dark
                ? MeeshyColors.indigo950.opacity(0.18)
                : MeeshyColors.indigo50.opacity(0.32)
        )
        .accessibilityElement(children: .contain)
        .accessibilityLabel(String(localized: "story.timeline.mode.pro", bundle: .module))
    }

    // MARK: - Layout variants

    /// Portrait phone — vertical stack, no preview column (canvas of the parent
    /// composer is visible behind the sheet). Toolbar + transport on top so
    /// they're always reachable above the keyboard, tracks scroll below.
    private var compactLayout: some View {
        VStack(spacing: 0) {
            proToolbarRow
            transportRow
            tracksScroll
        }
        .overlay(alignment: .bottomTrailing) { inspectorOverlay }
    }

    /// Landscape / iPad — preview left (~30%), timeline right (~70%) with the
    /// transport tucked under the preview column. Inspector floats bottom-leading
    /// so it doesn't overlap the timeline tracks.
    private var regularLayout: some View {
        GeometryReader { proxy in
            HStack(spacing: 0) {
                previewColumn
                    .frame(width: proxy.size.width * Self.previewWidthFraction)
                regularTimelineColumn
                    .frame(width: proxy.size.width * (1 - Self.previewWidthFraction))
            }
            .overlay(alignment: .bottomLeading) { inspectorOverlay }
        }
    }

    // MARK: - Shared rows

    private var transportRow: some View {
        TransportBar(
            isPlaying: viewModel.isPlaying,
            currentTime: viewModel.currentTime,
            duration: viewModel.project.slideDuration,
            zoomScale: viewModel.zoomScale,
            isMuted: viewModel.isMuted,
            onPlayToggle: { viewModel.togglePlayback() },
            onMuteToggle: { viewModel.toggleMute() },
            onZoomIn: { viewModel.zoomScale = min(4.0, viewModel.zoomScale * 1.25) },
            onZoomOut: { viewModel.zoomScale = max(0.25, viewModel.zoomScale / 1.25) },
            onZoomReset: { viewModel.zoomScale = 1.0 }
        )
    }

    private var proToolbarRow: some View {
        TimelineToolbar(
            canUndo: viewModel.canUndo,
            canRedo: viewModel.canRedo,
            isSnapEnabled: viewModel.isSnapEnabled,
            rulerResolutionSeconds: rulerResolution(for: viewModel.zoomScale),
            onUndo: { viewModel.undo() },
            onRedo: { viewModel.redo() },
            onSnapToggle: { viewModel.toggleSnap() }
        )
    }

    /// Ruler + grouped lanes + playhead in ONE horizontal scroller
    /// (TimelineScrubArea) so ticks stay aligned with clips and the playhead
    /// is draggable across the full lane height. Vertical overflow scrolls
    /// inside the area (under the pinned ruler).
    @ViewBuilder
    private var tracksScroll: some View {
        if hoistedTrackGroups.allSatisfy({ $0.tracks.isEmpty }) {
            ProTimelineEmptyState(isDark: colorScheme == .dark)
                .padding(.vertical, 24)
        } else {
            let geometry = TimelineGeometry(zoomScale: viewModel.zoomScale)
            TimelineScrubArea(
                totalDuration: viewModel.project.slideDuration,
                geometry: geometry,
                currentTime: viewModel.currentTime,
                isDark: colorScheme == .dark,
                minLaneWidth: 320,
                rulerHeight: 22,
                onScrub: { viewModel.scrub(to: $0) },
                onScrubBegan: { viewModel.beginScrub() },
                onScrubEnded: { viewModel.endScrub() }
            ) { laneWidth in
                ScrollView(.vertical, showsIndicators: true) {
                    VStack(alignment: .leading, spacing: 10) {
                        ForEach(hoistedTrackGroups, id: \.section) { group in
                            if !group.tracks.isEmpty {
                                groupHeader(key: group.titleKey)
                                ForEach(group.tracks, id: \.id) { track in
                                    TrackBarView(
                                        title: track.title,
                                        isLocked: false,
                                        isSelected: track.containsClipId(viewModel.selection.selectedClipId ?? ""),
                                        tintHex: tint(for: track.kind),
                                        isDark: colorScheme == .dark,
                                        laneWidth: laneWidth,
                                        laneHeight: 40,
                                        iconName: QuickTimelineView.iconName(for: track.kind)
                                    ) {
                                        ZStack(alignment: .leading) {
                                            ForEach(track.clipIds, id: \.self) { clipId in
                                                clipBar(for: clipId, geometry: geometry, laneHeight: 40)
                                            }
                                            LaneTransitionOverlays(
                                                junctions: TransitionJunctionResolver.junctions(
                                                    for: track.clipIds, in: hoistedJunctions),
                                                selectedId: viewModel.selection.selectedClipId,
                                                isDark: colorScheme == .dark,
                                                geometry: geometry,
                                                laneHeight: 40,
                                                onSelect: { viewModel.selectClip(id: $0) },
                                                onCreate: { junction in
                                                    if let id = viewModel.addTransition(
                                                        fromClipId: junction.fromClipId,
                                                        toClipId: junction.toClipId,
                                                        kind: .crossfade,
                                                        duration: 0.5) {
                                                        viewModel.selectClip(id: id)
                                                    }
                                                }
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                    .padding(.vertical, 8)
                }
            }
        }
    }

    // MARK: - Regular-only sub-views

    /// Preview column for the regular (landscape / iPad) layout. When no
    /// preview slot is provided we leave the column transparent so the parent
    /// composer's canvas shows through instead of rendering a black void.
    private var previewColumn: some View {
        VStack(spacing: 0) {
            if let previewSlot {
                previewSlot()
            } else {
                Color.clear
            }
            transportRow
        }
    }

    private var regularTimelineColumn: some View {
        VStack(spacing: 0) {
            proToolbarRow
            tracksScroll
        }
    }

    @ViewBuilder
    private var inspectorOverlay: some View {
        // The selection bus is shared across clips, keyframes and transitions —
        // KeyframeMarkerView and TransitionBadge both push their own id through
        // `selectClip(id:)`. We dispatch to the right inspector by attempting
        // each resolver in priority order (clip wins, then keyframe, then
        // transition); the catch-all returns nothing so no overlay floats over
        // the tracks when the selection is empty or stale.
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
            onDelete: { viewModel.deleteClip(id: clipId) }
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
            }
        )
        .padding(12)
        .transition(.opacity)
        .animation(reduceMotion ? .none : .easeInOut(duration: 0.15),
                   value: viewModel.selection.selectedClipId)
    }

    @ViewBuilder
    private func transitionInspectorOverlay(snapshot: TransitionInspector.TransitionSnapshot) -> some View {
        let transitionId = snapshot.id
        TransitionInspector(
            transition: snapshot,
            isAdvancedEnabled: false,
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
            }
        )
        .padding(12)
        .transition(.opacity)
        .animation(reduceMotion ? .none : .easeInOut(duration: 0.15),
                   value: viewModel.selection.selectedClipId)
    }

    private func groupHeader(key: String) -> some View {
        HStack(spacing: 8) {
            Rectangle()
                .fill(MeeshyColors.indigo400.opacity(0.7))
                .frame(width: 3, height: 12)
                .clipShape(Capsule())
            Text(String(localized: String.LocalizationValue(key), bundle: .module))
                .font(.system(size: 11, weight: .semibold))
                .textCase(.uppercase)
                .tracking(0.4)
                .foregroundStyle(.secondary)
            Spacer()
        }
        .padding(.top, 4)
    }

    private func tint(for kind: QuickTimelineView.CompactTrack.Kind) -> String {
        switch kind {
        case .bgVideo, .video: return "6366F1"
        case .bgImage, .image: return "8B5CF6"
        case .bgAudio, .audio: return "818CF8"
        case .text:            return "A5B4FC"
        }
    }

    private func rulerResolution(for zoom: CGFloat) -> Float {
        let pps = TimelineGeometry(zoomScale: zoom).pixelsPerSecond
        if pps >= 100 { return 0.1 }
        if pps >= 50  { return 0.5 }
        if pps >= 25  { return 1.0 }
        return 2.0
    }

    @ViewBuilder
    private func clipBar(for clipId: String, geometry: TimelineGeometry, laneHeight: CGFloat) -> some View {
        if let media = viewModel.project.mediaObjects.first(where: { $0.id == clipId }) {
            let isSynthetic = StoryComposerViewModel.isSyntheticTimelineClipId(media.id)
            // Image clips get a single bitmap stretched across the strip;
            // VideoClipBar's framesStrip divides `width / frames.count` so
            // a one-element array fills the bar. Video clips still receive
            // an empty array — extracting per-zoom video frames is the next
            // wave (would call `VideoFrameExtractor` keyed on URL + duration).
            let mediaFrames: [UIImage] = {
                if media.kind == .image, let img = viewModel.loadedImage(for: media.id) {
                    return [img]
                }
                return []
            }()
            VideoClipBar(
                clipId: media.id,
                title: QuickTimelineView.clipTitle(for: media, isSynthetic: isSynthetic),
                startTime: Float(media.startTime ?? 0),
                duration: TimelineGeometry.effectiveClipDuration(
                    startTime: Float(media.startTime ?? 0),
                    duration: media.duration.map { Float($0) },
                    slideDuration: viewModel.project.slideDuration),
                fadeIn: Float(media.fadeIn ?? 0),
                fadeOut: Float(media.fadeOut ?? 0),
                isSelected: viewModel.selection.selectedClipId == media.id,
                isLocked: isSynthetic,
                isDark: colorScheme == .dark,
                geometry: geometry,
                laneHeight: laneHeight,
                frames: mediaFrames,
                onTap: { viewModel.selectClip(id: media.id) },
                onDoubleTap: {
                    viewModel.selectClip(id: media.id)
                    viewModel.splitSelectedAtPlayhead()
                },
                onLongPress: { viewModel.selectClip(id: media.id) },
                onTrimStartDelta: { delta in
                    viewModel.trimClipStart(id: media.id,
                                            deltaTimeSeconds: Float(delta) / Float(geometry.pixelsPerSecond))
                },
                onTrimEndDelta: { delta in
                    viewModel.trimClipEnd(id: media.id,
                                          deltaTimeSeconds: Float(delta) / Float(geometry.pixelsPerSecond))
                },
                onMoveDelta: { delta in
                    // SwiftUI's DragGesture.onChanged passes a CUMULATIVE
                    // translation from gesture start, not a frame delta. The
                    // origin we add it to therefore must be captured ONCE
                    // (in selection.activeDrag.originalStartTime) and reused
                    // every frame — reading `media.startTime` here drifts
                    // because applyClipPosition has already mutated it.
                    let mediaId = media.id
                    if viewModel.selection.activeDrag?.clipId != mediaId {
                        viewModel.beginClipDrag(clipId: mediaId)
                    }
                    guard let drag = viewModel.selection.activeDrag else { return }
                    viewModel.dragClipMoved(
                        rawTime: drag.originalStartTime + Float(delta) / Float(geometry.pixelsPerSecond),
                        snapCandidates: []
                    )
                },
                onMoveEnded: {
                    viewModel.endClipDrag()
                }
            )
            .equatable()
        } else if let audio = viewModel.project.audioPlayerObjects.first(where: { $0.id == clipId }) {
            AudioClipBar(
                clipId: audio.id,
                // postMediaId is a UUID — unusable as a user-facing label.
                // Show a localised type tag instead; the lane label
                // already provides the per-track index ("Audio 1").
                title: String(localized: "story.timeline.clip.audio",
                              defaultValue: "Audio", bundle: .module),
                startTime: Float(audio.startTime ?? 0),
                duration: TimelineGeometry.effectiveClipDuration(
                    startTime: audio.startTime ?? 0,
                    duration: audio.duration,
                    slideDuration: viewModel.project.slideDuration),
                volume: audio.volume,
                isMuted: Self.isMutedForAudio(globalMute: viewModel.isMuted, audio: audio),
                isSelected: viewModel.selection.selectedClipId == audio.id,
                isLocked: false,
                isDark: colorScheme == .dark,
                geometry: geometry,
                laneHeight: laneHeight,
                waveformSamples: audio.waveformSamples,
                onTap: { viewModel.selectClip(id: audio.id) },
                onDoubleTap: { viewModel.selectClip(id: audio.id) },
                onLongPress: { viewModel.selectClip(id: audio.id) },
                onMoveDelta: { delta in
                    // Snowball-drift guard mirrors VideoClipBar above: only call
                    // beginClipDrag once per gesture (when activeDrag is absent
                    // or belongs to another clip), then compute rawTime from
                    // drag.originalStartTime — NOT audio.startTime, which has
                    // already been mutated by the previous frame's applyClipPosition.
                    let audioId = audio.id
                    if viewModel.selection.activeDrag?.clipId != audioId {
                        viewModel.beginClipDrag(clipId: audioId)
                    }
                    guard let drag = viewModel.selection.activeDrag else { return }
                    viewModel.dragClipMoved(
                        rawTime: drag.originalStartTime + Float(delta) / Float(geometry.pixelsPerSecond),
                        snapCandidates: []
                    )
                },
                onMoveEnded: {
                    viewModel.endClipDrag()
                }
            )
            .equatable()
        } else if let text = viewModel.project.textObjects.first(where: { $0.id == clipId }) {
            TextClipBar(
                clipId: text.id,
                content: text.text,
                startTime: Float(text.startTime ?? 0),
                duration: TimelineGeometry.effectiveClipDuration(
                    startTime: Float(text.startTime ?? 0),
                    duration: text.duration.map { Float($0) },
                    slideDuration: viewModel.project.slideDuration),
                isSelected: viewModel.selection.selectedClipId == text.id,
                isLocked: false,
                isDark: colorScheme == .dark,
                geometry: geometry,
                laneHeight: laneHeight,
                onTap: { viewModel.selectClip(id: text.id) },
                onDoubleTap: { viewModel.selectClip(id: text.id) },
                onLongPress: { viewModel.selectClip(id: text.id) },
                onMoveDelta: { delta in
                    // Snowball-drift guard mirrors VideoClipBar above: only call
                    // beginClipDrag once per gesture (when activeDrag is absent
                    // or belongs to another clip), then compute rawTime from
                    // drag.originalStartTime — NOT text.startTime, which has
                    // already been mutated by the previous frame's applyClipPosition.
                    let textId = text.id
                    if viewModel.selection.activeDrag?.clipId != textId {
                        viewModel.beginClipDrag(clipId: textId)
                    }
                    guard let drag = viewModel.selection.activeDrag else { return }
                    viewModel.dragClipMoved(
                        rawTime: drag.originalStartTime + Float(delta) / Float(geometry.pixelsPerSecond),
                        snapCandidates: []
                    )
                },
                onMoveEnded: {
                    viewModel.endClipDrag()
                }
            )
            .equatable()
        }
    }

    private func currentClipSnapshot() -> ClipInspector.ClipSnapshot? {
        Self.resolveClipSnapshot(viewModel: viewModel)
    }
}
