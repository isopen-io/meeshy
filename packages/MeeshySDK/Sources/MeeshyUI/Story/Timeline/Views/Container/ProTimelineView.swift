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
        // Clés DÉDIÉES aux groupes de pistes — la réutilisation des clés de
        // tuiles du composer affichait « STORY.COMPOSER.EMPTY.TILE.FILTERS »
        // brut sur le groupe Texte (clé sans entrée) et mentait sémantiquement
        // (le groupe contient les TEXTES, pas les filtres).
        return [
            TrackGroup(section: .media, titleKey: "story.timeline.group.media", tracks: media),
            TrackGroup(section: .son,   titleKey: "story.timeline.group.sound", tracks: son),
            TrackGroup(section: .filters, titleKey: "story.timeline.group.text", tracks: filters)
        ]
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

    private var hoistedKeyframeMarkers: [KeyframeMarker] {
        KeyframeMarkerResolver.resolve(project: viewModel.project)
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

    /// Contrepartie du pin Quick : le Pro conserve le readout chiffré,
    /// indispensable au calage précis des clips.
    public static let transportShowsTimeReadout = true

    private var transportRow: some View {
        TransportBar(
            isPlaying: viewModel.isPlaying,
            currentTime: viewModel.currentTime,
            duration: viewModel.project.slideDuration,
            zoomScale: viewModel.zoomScale,
            isMuted: viewModel.isMuted,
            showsTimeReadout: Self.transportShowsTimeReadout,
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
            VStack(spacing: 0) {
                TransitionChromeLane(
                    openingEffect: viewModel.project.openingEffect,
                    closingEffect: viewModel.project.closingEffect,
                    slideDuration: viewModel.project.slideDuration,
                    geometry: geometry,
                    isDark: colorScheme == .dark
                )
                TimelineScrubArea(
                    totalDuration: viewModel.project.slideDuration,
                    geometry: geometry,
                    currentTime: viewModel.currentTime,
                    isDark: colorScheme == .dark,
                    minLaneWidth: 320,
                    rulerHeight: 22,
                    isPlaying: viewModel.isPlaying,
                    onZoomScaleChanged: { viewModel.zoomScale = $0 },
                    onSlideDurationChanged: { viewModel.setSlideDuration($0) },
                    snapGuideTime: viewModel.selection.activeDrag.flatMap {
                        $0.snappedTo != nil ? $0.currentStartTime : nil
                    },
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
                                                LaneKeyframeOverlays(
                                                    markers: KeyframeMarkerResolver.markers(
                                                        for: track.clipIds, in: hoistedKeyframeMarkers),
                                                    selectedId: viewModel.selection.selectedClipId,
                                                    geometry: geometry,
                                                    laneHeight: 40,
                                                    onSelect: { viewModel.selectClip(id: $0) }
                                                )
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

    private var inspectorOverlay: some View {
        // Resolution + rendering extracted to TimelineInspectorHost so the
        // unified (Quick-design) timeline shares the exact same inspectors.
        TimelineInspectorHost(viewModel: viewModel)
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
            // Un FOND couvre toute la slide (fenêtre ignorée en lecture) —
            // verrouillé sur la lane ; l'inspecteur « Fond » le libère.
            let isImmovableBackground = isSynthetic || media.isBackground == true
            // Image clips get a single bitmap stretched across the strip;
            // video clips self-extract their filmstrip from `videoURL`
            // (VideoFilmstrip, cached).
            let mediaFrames: [UIImage] = {
                if media.kind == .image, let img = viewModel.loadedImage(for: media.id) {
                    return [img]
                }
                return []
            }()
            let mediaStartTime = Float(media.startTime ?? 0)
            let mediaNativeDuration = TimelineGeometry.effectiveClipDuration(
                startTime: mediaStartTime,
                duration: media.duration.map { Float($0) },
                slideDuration: viewModel.project.slideDuration)
            VideoClipBar(
                clipId: media.id,
                title: QuickTimelineView.clipTitle(for: media, isSynthetic: isSynthetic),
                startTime: mediaStartTime,
                duration: mediaNativeDuration,
                fadeIn: Float(media.fadeIn ?? 0),
                fadeOut: Float(media.fadeOut ?? 0),
                isSelected: viewModel.selection.selectedClipId == media.id,
                isLocked: isImmovableBackground,
                isDark: colorScheme == .dark,
                geometry: geometry,
                laneHeight: laneHeight,
                frames: mediaFrames,
                videoURL: media.kind == .video ? viewModel.loadedURL(for: media.id) : nil,
                imageURL: (media.kind == .image && mediaFrames.isEmpty)
                    ? CacheCoordinator.imageLocalFileURL(for: media.postMediaId)
                    : nil,
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
            // A looping background clip plays on repeat to fill the slide
            // (StoryBackgroundLayer wires AVPlayerLooper) — without this, a
            // short bg clip rendered as one short bar followed by dead track.
            if isImmovableBackground, media.loop == true {
                LoopRepeatOverlay(
                    nativeDuration: mediaNativeDuration,
                    clipStartTime: mediaStartTime,
                    slideDuration: viewModel.project.slideDuration,
                    tint: MeeshyColors.success,
                    geometry: geometry,
                    laneHeight: laneHeight
                )
            }
        } else if let audio = viewModel.project.audioPlayerObjects.first(where: { $0.id == clipId }) {
            let audioStartTime = Float(audio.startTime ?? 0)
            let audioNativeDuration = TimelineGeometry.effectiveClipDuration(
                startTime: audio.startTime ?? 0,
                duration: audio.duration,
                slideDuration: viewModel.project.slideDuration)
            AudioClipBar(
                clipId: audio.id,
                // postMediaId is a UUID — unusable as a user-facing label.
                // Show a localised type tag instead; the lane label
                // already provides the per-track index ("Audio 1").
                title: String(localized: "story.timeline.clip.audio",
                              defaultValue: "Audio", bundle: .module),
                startTime: audioStartTime,
                duration: audioNativeDuration,
                volume: audio.volume,
                isMuted: TimelineInspectorHost.isMutedForAudio(globalMute: viewModel.isMuted, audio: audio),
                isSelected: viewModel.selection.selectedClipId == audio.id,
                isLocked: false,
                isDark: colorScheme == .dark,
                geometry: geometry,
                laneHeight: laneHeight,
                waveformSamples: audio.waveformSamples,
                audioURL: viewModel.loadedURL(for: audio.id),
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
                },
                onTrimStartDelta: { delta in
                    viewModel.trimClipStart(id: audio.id,
                                            deltaTimeSeconds: Float(delta) / Float(geometry.pixelsPerSecond))
                },
                onTrimEndDelta: { delta in
                    viewModel.trimClipEnd(id: audio.id,
                                          deltaTimeSeconds: Float(delta) / Float(geometry.pixelsPerSecond))
                }
            )
            .equatable()
            if audio.isBackground == true, audio.loop == true {
                LoopRepeatOverlay(
                    nativeDuration: audioNativeDuration,
                    clipStartTime: audioStartTime,
                    slideDuration: viewModel.project.slideDuration,
                    tint: MeeshyColors.warning,
                    geometry: geometry,
                    laneHeight: laneHeight
                )
            }
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
                },
                onTrimStartDelta: { delta in
                    viewModel.trimClipStart(id: text.id,
                                            deltaTimeSeconds: Float(delta) / Float(geometry.pixelsPerSecond))
                },
                onTrimEndDelta: { delta in
                    viewModel.trimClipEnd(id: text.id,
                                          deltaTimeSeconds: Float(delta) / Float(geometry.pixelsPerSecond))
                }
            )
            .equatable()
        }
    }

}
