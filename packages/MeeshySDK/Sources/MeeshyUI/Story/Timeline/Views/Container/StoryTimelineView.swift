import SwiftUI
import MeeshySDK

/// The single story timeline (ex-Quick design, carrying the full editing
/// feature set since the Simple/Pro merge). Compact state shows max
/// 3 tracks; deployed state (toggled by user) shows them all.
public struct StoryTimelineView: View {

    public static let compactMaxTracks: Int = 3

    @ObservedObject private var viewModel: TimelineViewModel
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var isExpanded: Bool = false

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

    // MARK: - Static helpers (testable, pure)

    public struct CompactTrack: Equatable {
        public let id: String
        public let title: String
        public let kind: Kind
        public let clipIds: [String]
        public enum Kind: Equatable {
            case video, audio, text, image
            case bgVideo, bgAudio, bgImage
        }
        public var isEmpty: Bool { clipIds.isEmpty }
        public func containsClipId(_ id: String) -> Bool { clipIds.contains(id) }
    }

    public static func resolveCompactTracks(project: TimelineProject,
                                            selectedClipId: String?,
                                            maxCount: Int) -> [CompactTrack] {
        var allTracks: [CompactTrack] = []
        // Split media by underlying kind so the compact strip labels images
        // as "Image" and videos as "Vidéo" — collapsing both under a single
        // "Vidéo" track was the bug surfaced when a slide had only photos.
        let videoClips = project.mediaObjects.filter { $0.mediaType == StoryMediaKind.video.rawValue }
        let imageClips = project.mediaObjects.filter { $0.mediaType == StoryMediaKind.image.rawValue }
        if !videoClips.isEmpty {
            allTracks.append(CompactTrack(
                id: "video-1",
                title: String(format: String(localized: "story.timeline.track.section.video", bundle: .module), 1),
                kind: .bgVideo,
                clipIds: videoClips.map { $0.id }
            ))
        }
        if !imageClips.isEmpty {
            allTracks.append(CompactTrack(
                id: "image-1",
                title: String(format: String(localized: "story.timeline.track.section.image", bundle: .module), 1),
                kind: .bgImage,
                clipIds: imageClips.map { $0.id }
            ))
        }
        let audioClips = project.audioPlayerObjects
        if !audioClips.isEmpty {
            allTracks.append(CompactTrack(
                id: "audio-1",
                title: String(format: String(localized: "story.timeline.track.section.audio", bundle: .module), 1),
                kind: .audio,
                clipIds: audioClips.map { $0.id }
            ))
        }
        let textClips = project.textObjects
        if !textClips.isEmpty {
            allTracks.append(CompactTrack(
                id: "text-1",
                title: String(format: String(localized: "story.timeline.track.section.text", bundle: .module), 1),
                kind: .text,
                clipIds: textClips.map { $0.id }
            ))
        }
        let nonEmpty = allTracks.filter { !$0.isEmpty }
        var picked: [CompactTrack] = []
        if let selectedId = selectedClipId,
           let selectedTrack = nonEmpty.first(where: { $0.containsClipId(selectedId) }) {
            picked.append(selectedTrack)
        }
        for track in nonEmpty where !picked.contains(track) {
            if picked.count >= maxCount { break }
            picked.append(track)
        }
        return picked
    }

    public static func resolveAllTracks(project: TimelineProject) -> [CompactTrack] {
        var tracks: [CompactTrack] = []
        // Group by media kind first so per-kind numbering ("Image 1", "Image 2",
        // "Vidéo 1") matches what the user dropped onto the slide. Pre-fix this
        // method lumped every non-audio media into the "Vidéo" bucket, so adding
        // two photos surfaced as "Vidéo 1, Vidéo 2".
        let videoClips = project.mediaObjects.filter { $0.mediaType == StoryMediaKind.video.rawValue }
        let imageClips = project.mediaObjects.filter { $0.mediaType == StoryMediaKind.image.rawValue }
        for (index, clip) in videoClips.enumerated() {
            tracks.append(CompactTrack(
                id: "video-\(index + 1)",
                title: String(format: String(localized: "story.timeline.track.section.video", bundle: .module), index + 1),
                kind: index == 0 ? .bgVideo : .video,
                clipIds: [clip.id]
            ))
        }
        for (index, clip) in imageClips.enumerated() {
            tracks.append(CompactTrack(
                id: "image-\(index + 1)",
                title: String(format: String(localized: "story.timeline.track.section.image", bundle: .module), index + 1),
                kind: index == 0 ? .bgImage : .image,
                clipIds: [clip.id]
            ))
        }
        for (index, audio) in project.audioPlayerObjects.enumerated() {
            tracks.append(CompactTrack(
                id: "audio-\(index + 1)",
                title: String(format: String(localized: "story.timeline.track.section.audio", bundle: .module), index + 1),
                kind: index == 0 ? .bgAudio : .audio,
                clipIds: [audio.id]
            ))
        }
        for (index, text) in project.textObjects.enumerated() {
            tracks.append(CompactTrack(
                id: "text-\(index + 1)",
                title: String(format: String(localized: "story.timeline.track.section.text", bundle: .module), index + 1),
                kind: .text,
                clipIds: [text.id]
            ))
        }
        return tracks.filter { !$0.isEmpty }
    }

    /// Friendly clip-bar title. Synthetic background clips keep their
    /// "Image de fond" copy; real clips fall back to a localized type tag
    /// ("Image", "Vidéo") since `postMediaId` is a UUID and would surface
    /// in the bar as raw hex — unhelpful and noisy.
    public static func clipTitle(for media: StoryMediaObject, isSynthetic: Bool) -> String {
        if isSynthetic {
            return String(localized: "story.timeline.clip.backgroundImage",
                          defaultValue: "Image de fond", bundle: .module)
        }
        switch media.kind {
        case .image:
            return String(localized: "story.timeline.clip.image",
                          defaultValue: "Image", bundle: .module)
        case .video:
            return String(localized: "story.timeline.clip.video",
                          defaultValue: "Vidéo", bundle: .module)
        case .none:
            return media.postMediaId
        }
    }

    public static func footerLabelKey(isExpanded: Bool) -> String {
        isExpanded ? "story.timeline.toolbar.collapseTracks" : "story.timeline.toolbar.deployTracks"
    }

    public static func previewHeightFraction(isExpanded: Bool) -> CGFloat {
        isExpanded ? 0.30 : 0.60
    }

    // MARK: - Hoisted computed properties (MEDIUM 7)
    // Keyed only on viewModel.project — stable when currentTime / zoomScale change.

    private var hoistedAllTracks: [CompactTrack] {
        Self.resolveAllTracks(project: viewModel.project)
    }

    private var hoistedCompactTracks: [CompactTrack] {
        Self.resolveCompactTracks(
            project: viewModel.project,
            selectedClipId: viewModel.selection.selectedClipId,
            maxCount: Self.compactMaxTracks
        )
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

    public var body: some View {
        VStack(spacing: 0) {
            if let previewSlot {
                GeometryReader { proxy in
                    previewSlot()
                        .frame(height: proxy.size.height * Self.previewHeightFraction(isExpanded: isExpanded))
                }
                .frame(height: isExpanded ? 220 : 360)
                .animation(reduceMotion ? .none : .spring(response: 0.4, dampingFraction: 0.8), value: isExpanded)
            }
            transport
            scrubRegion
            footerTrigger
        }
        // Parent StoryTimelineHost already paints the sheet with
        // .ultraThinMaterial. We only add a faint indigo tint here so the
        // editor still feels branded in light mode where the material is
        // close to white.
        .background(
            colorScheme == .dark
                ? MeeshyColors.indigo950.opacity(0.18)
                : MeeshyColors.indigo50.opacity(0.32)
        )
        .gesture(swipeUpExpand)
        // Full editing surface: selecting a clip, keyframe or transition
        // floats its inspector over the tracks — same host the Pro layout
        // used, so selection is never a dead end in the unified timeline.
        .overlay(alignment: .bottomTrailing) {
            TimelineInspectorHost(viewModel: viewModel)
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(String(localized: "story.timeline.container", defaultValue: "Timeline", bundle: .module))
    }

    // MARK: - Sub-views

    /// Le readout temps est AFFICHÉ en Quick : masqué un temps (vague modale
    /// allégée), il a été redemandé à chaud — « remet le time dans la vue
    /// simple ! » (user, 2026-07-11). Le paramètre TransportBar reste : c'est
    /// le point de bascule si le produit retranche à nouveau.
    public static let transportShowsTimeReadout = true

    private var transport: some View {
        TransportBar(
            isPlaying: viewModel.isPlaying,
            currentTime: viewModel.currentTime,
            duration: viewModel.project.slideDuration,
            zoomScale: viewModel.zoomScale,
            isMuted: viewModel.isMuted,
            showsTimeReadout: Self.transportShowsTimeReadout,
            // Vue unifiée : undo/redo ET snap vivent dans le transport —
            // il n'y a plus de TimelineToolbar dédiée.
            canUndo: viewModel.canUndo,
            canRedo: viewModel.canRedo,
            isSnapEnabled: viewModel.isSnapEnabled,
            onPlayToggle: { viewModel.togglePlayback() },
            onMuteToggle: { viewModel.toggleMute() },
            onZoomIn: { viewModel.zoomScale = min(4.0, viewModel.zoomScale * 1.25) },
            onZoomOut: { viewModel.zoomScale = max(0.25, viewModel.zoomScale / 1.25) },
            onZoomReset: { viewModel.zoomScale = 1.0 },
            onUndo: { viewModel.undo() },
            onRedo: { viewModel.redo() },
            onSnapToggle: { viewModel.toggleSnap() }
        )
    }

    /// Ruler + lanes + playhead in ONE horizontal scroller (TimelineScrubArea)
    /// so the ticks stay aligned with the clips and the playhead is draggable
    /// across the full lane height. The ruler doubles as a scrub strip.
    @ViewBuilder
    private var scrubRegion: some View {
        let tracks: [CompactTrack] = isExpanded ? hoistedAllTracks : hoistedCompactTracks
        if tracks.isEmpty {
            TimelineEmptyState(isDark: colorScheme == .dark)
                .padding(.vertical, 28)
                .padding(.horizontal, 16)
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
                    minLaneWidth: 200,
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
                    trackRows(tracks: tracks, laneWidth: laneWidth, geometry: geometry)
                }
            }
            .frame(maxHeight: isExpanded ? .infinity : CGFloat(tracks.count) * 40 + 8 + 22 + 18)
            .animation(reduceMotion ? .none : .spring(response: 0.4, dampingFraction: 0.8), value: isExpanded)
        }
    }

    @ViewBuilder
    private func trackRows(tracks: [CompactTrack], laneWidth: CGFloat,
                           geometry: TimelineGeometry) -> some View {
        let rows = VStack(spacing: 4) {
            ForEach(tracks, id: \.id) { track in
                TrackBarView(
                    title: track.title,
                    isLocked: false,
                    isSelected: track.containsClipId(viewModel.selection.selectedClipId ?? ""),
                    tintHex: tint(for: track.kind),
                    isDark: colorScheme == .dark,
                    laneWidth: laneWidth,
                    laneHeight: 36,
                    iconName: Self.iconName(for: track.kind)
                ) {
                    ZStack(alignment: .leading) {
                        ForEach(track.clipIds, id: \.self) { clipId in
                            clipBar(for: clipId, geometry: geometry, laneHeight: 36)
                        }
                        LaneKeyframeOverlays(
                            markers: KeyframeMarkerResolver.markers(
                                for: track.clipIds, in: hoistedKeyframeMarkers),
                            selectedId: viewModel.selection.selectedClipId,
                            geometry: geometry,
                            laneHeight: 36,
                            onSelect: { viewModel.selectClip(id: $0) }
                        )
                        LaneTransitionOverlays(
                            junctions: TransitionJunctionResolver.junctions(
                                for: track.clipIds, in: hoistedJunctions),
                            selectedId: viewModel.selection.selectedClipId,
                            isDark: colorScheme == .dark,
                            geometry: geometry,
                            laneHeight: 36,
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
        if isExpanded {
            ScrollView(.vertical, showsIndicators: true) { rows }
        } else {
            rows
        }
    }

    @ViewBuilder
    private var footerTrigger: some View {
        let hidden = max(0, allTrackCount - Self.compactMaxTracks)
        // Hide the deploy button when there are no extra tracks to reveal —
        // showing "+ 0 track(s)" is noise that distracts from the empty state.
        if hidden > 0 || isExpanded {
            HStack {
                Button {
                    withAnimation(reduceMotion ? .none : .spring(response: 0.4, dampingFraction: 0.8)) {
                        isExpanded.toggle()
                    }
                } label: {
                    let key = Self.footerLabelKey(isExpanded: isExpanded)
                    let raw = String(localized: String.LocalizationValue(key), bundle: .module)
                    Text(isExpanded ? raw : String(format: raw, hidden))
                        .font(.caption2.weight(.semibold))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(.ultraThinMaterial, in: Capsule())
                        .background(Capsule().fill(MeeshyColors.indigo500.opacity(0.18)))
                        .foregroundStyle(MeeshyColors.indigo700)
                }
                .buttonStyle(.plain)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .opacity(collapsedFooterOpacity)
        }
    }

    private var collapsedFooterOpacity: Double { isExpanded ? 0.4 : 1.0 }

    private var swipeUpExpand: some Gesture {
        DragGesture(minimumDistance: 24)
            .onEnded { value in
                guard value.translation.height < -36 else { return }
                withAnimation(reduceMotion ? .none : .spring(response: 0.4, dampingFraction: 0.8)) {
                    isExpanded = true
                }
            }
    }

    private func tint(for kind: CompactTrack.Kind) -> String {
        switch kind {
        case .bgVideo, .video: return "6366F1"
        case .bgImage, .image: return "8B5CF6"
        case .bgAudio, .audio: return "818CF8"
        case .text:            return "A5B4FC"
        }
    }

    /// Type icon for the sticky lane label — gives each track row a modern,
    /// instantly recognisable marker (waveform = audio, photo = image,
    /// video = video, textformat = text). Pure helper, mirrored by the Pro
    /// timeline so both modes carry the same visual language.
    static func iconName(for kind: CompactTrack.Kind) -> String {
        switch kind {
        case .bgVideo, .video: return "video.fill"
        case .bgImage, .image: return "photo.fill"
        case .bgAudio, .audio: return "waveform"
        case .text:            return "textformat"
        }
    }

    @ViewBuilder
    private func clipBar(for clipId: String, geometry: TimelineGeometry, laneHeight: CGFloat) -> some View {
        if let media = viewModel.project.mediaObjects.first(where: { $0.id == clipId }) {
            let isSynthetic = StoryComposerViewModel.isSyntheticTimelineClipId(media.id)
            // Un FOND couvre toute la slide : sa fenêtre début/durée est
            // ignorée en lecture. Le verrouiller sur la timeline évite le
            // mensonge « je déplace le début mais rien ne change » (retour
            // user 2026-07-11) — l'inspecteur permet de désactiver « Fond »
            // pour rendre la fenêtre effective.
            let isImmovableBackground = isSynthetic || media.isBackground == true
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
                title: Self.clipTitle(for: media, isSynthetic: isSynthetic),
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
                    // Cumulative translation from drag start — origin must be
                    // captured once in selection.activeDrag.originalStartTime
                    // (rereading media.startTime here drifts because
                    // applyClipPosition has already mutated it).
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
            let audioStartTime = audio.startTime ?? 0
            let audioNativeDuration = TimelineGeometry.effectiveClipDuration(
                startTime: audioStartTime,
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

    private var allTrackCount: Int {
        var c = 0
        if !viewModel.project.mediaObjects.filter({ !($0.mediaType == "audio") }).isEmpty { c += 1 }
        if !viewModel.project.audioPlayerObjects.isEmpty { c += 1 }
        if !viewModel.project.textObjects.isEmpty { c += 1 }
        return c
    }
}
