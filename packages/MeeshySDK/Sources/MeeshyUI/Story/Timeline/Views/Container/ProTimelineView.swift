import SwiftUI
import MeeshySDK

/// Landscape multi-track editor. Preview left (~30%), timeline + grouped
/// tracks right (~70%), floating inspector bottom-leading.
public struct ProTimelineView: View {

    public static let previewWidthFraction: CGFloat = 0.30

    public enum Section: Equatable, Hashable { case contenu, audio, effets }

    public struct TrackGroup: Equatable {
        public let section: Section
        public let titleKey: String
        public let tracks: [QuickTimelineView.CompactTrack]
    }

    @Bindable private var viewModel: TimelineViewModel
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
        let contenu = all.filter {
            switch $0.kind {
            case .bgVideo, .video, .bgImage, .image: return true
            default: return false
            }
        }
        let audio = all.filter {
            switch $0.kind {
            case .bgAudio, .audio: return true
            default: return false
            }
        }
        let effets = all.filter {
            switch $0.kind {
            case .text: return true
            default: return false
            }
        }
        return [
            TrackGroup(section: .contenu, titleKey: "story.timeline.section.contenu", tracks: contenu),
            TrackGroup(section: .audio,   titleKey: "story.timeline.section.audio",   tracks: audio),
            TrackGroup(section: .effets,  titleKey: "story.timeline.section.effets",  tracks: effets)
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

    // MARK: - Hoisted computed properties (MEDIUM 7)
    // Keyed only on viewModel.project — stable when currentTime / zoomScale change.

    private var hoistedTrackGroups: [TrackGroup] {
        Self.resolveTrackGroups(project: viewModel.project)
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
            rulerRow
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
            isMuted: false,
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

    private var rulerRow: some View {
        let geometry = TimelineGeometry(zoomScale: viewModel.zoomScale)
        return RulerView(
            totalDuration: viewModel.project.slideDuration,
            geometry: geometry,
            isDark: colorScheme == .dark,
            height: 22,
            onTapTime: { _ in }
        )
        .equatable() // HIGH 3: short-circuit body re-evaluation during playhead scrubbing
    }

    @ViewBuilder
    private var tracksScroll: some View {
        let geometry = TimelineGeometry(zoomScale: viewModel.zoomScale)
        let laneWidth = max(geometry.width(for: viewModel.project.slideDuration), 320)
        if hoistedTrackGroups.allSatisfy({ $0.tracks.isEmpty }) {
            ProTimelineEmptyState(isDark: colorScheme == .dark)
                .padding(.vertical, 24)
        } else {
            ScrollView([.horizontal, .vertical]) {
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
                                    laneHeight: 40
                                ) {
                                    ZStack(alignment: .leading) {
                                        ForEach(track.clipIds, id: \.self) { clipId in
                                            clipBar(for: clipId, geometry: geometry, laneHeight: 40)
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                .padding(.vertical, 8)
                .padding(.horizontal, 12)
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
            rulerRow
            tracksScroll
        }
    }

    @ViewBuilder
    private var inspectorOverlay: some View {
        if Self.shouldShowClipInspector(viewModel: viewModel),
           let snapshot = currentClipSnapshot() {
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
                duration: Float(media.duration ?? 0),
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
                title: audio.postMediaId,
                startTime: Float(audio.startTime ?? 0),
                duration: Float(audio.duration ?? 0),
                volume: audio.volume,
                isMuted: false,
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
                duration: Float(text.duration ?? 0),
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
        guard let id = viewModel.selection.selectedClipId else { return nil }
        if let media = viewModel.project.mediaObjects.first(where: { $0.id == id }) {
            return ClipInspector.ClipSnapshot(
                id: media.id,
                // No `url` on StoryMediaObject — use postMediaId as display name
                displayName: media.postMediaId,
                kind: media.mediaType == "audio" ? .audio : .video,
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
}
