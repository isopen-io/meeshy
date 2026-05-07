import SwiftUI
import MeeshySDK

/// Portrait-first composition of the timeline. Compact state shows max
/// 3 tracks; deployed state (toggled by user) shows them all.
public struct QuickTimelineView: View {

    public static let compactMaxTracks: Int = 3

    @Bindable private var viewModel: TimelineViewModel
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
        public enum Kind: Equatable { case video, audio, text, bgVideo, bgAudio }
        public var isEmpty: Bool { clipIds.isEmpty }
        public func containsClipId(_ id: String) -> Bool { clipIds.contains(id) }
    }

    public static func resolveCompactTracks(project: TimelineProject,
                                            selectedClipId: String?,
                                            maxCount: Int) -> [CompactTrack] {
        var allTracks: [CompactTrack] = []
        let videoClips = project.mediaObjects.filter { !($0.mediaType == "audio") }
        if !videoClips.isEmpty {
            allTracks.append(CompactTrack(
                id: "video-1",
                title: String(format: String(localized: "story.timeline.track.section.video", bundle: .module), 1),
                kind: .bgVideo,
                clipIds: videoClips.map { $0.id }
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
        let videoClips = project.mediaObjects.filter { !($0.mediaType == "audio") }
        for (index, _) in videoClips.enumerated() {
            tracks.append(CompactTrack(
                id: "video-\(index + 1)",
                title: String(format: String(localized: "story.timeline.track.section.video", bundle: .module), index + 1),
                kind: index == 0 ? .bgVideo : .video,
                clipIds: [videoClips[index].id]
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
            rulerStrip
            tracksRegion
            footerTrigger
        }
        .background(colorScheme == .dark ? MeeshyColors.indigo950.opacity(0.4) : MeeshyColors.indigo50.opacity(0.4))
        .gesture(swipeUpExpand)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(String(localized: "story.timeline.mode.quick", bundle: .module))
    }

    // MARK: - Sub-views

    private var transport: some View {
        TransportBar(
            isPlaying: viewModel.isPlaying,
            currentTime: viewModel.currentTime,
            duration: viewModel.project.slideDuration,
            zoomScale: viewModel.zoomScale,
            mode: viewModel.mode,
            isMuted: false,
            onPlayToggle: { viewModel.togglePlayback() },
            onMuteToggle: { viewModel.toggleMute() },
            onZoomIn: { viewModel.zoomScale = min(4.0, viewModel.zoomScale * 1.25) },
            onZoomOut: { viewModel.zoomScale = max(0.25, viewModel.zoomScale / 1.25) },
            onZoomReset: { viewModel.zoomScale = 1.0 },
            onModeSwitch: { viewModel.setMode(.pro) }
        )
    }

    private var rulerStrip: some View {
        let geometry = TimelineGeometry(zoomScale: viewModel.zoomScale)
        return RulerView(
            totalDuration: viewModel.project.slideDuration,
            geometry: geometry,
            isDark: colorScheme == .dark,
            height: 18,
            onTapTime: { _ in }
        )
        .equatable() // HIGH 3: short-circuit body re-evaluation during playhead scrubbing
    }

    private var tracksRegion: some View {
        let tracks: [CompactTrack] = isExpanded ? hoistedAllTracks : hoistedCompactTracks
        let geometry = TimelineGeometry(zoomScale: viewModel.zoomScale)
        let laneWidth = max(geometry.width(for: viewModel.project.slideDuration), 200)
        return ScrollView([.horizontal, isExpanded ? .vertical : []], showsIndicators: isExpanded) {
            VStack(spacing: 4) {
                ForEach(tracks, id: \.id) { track in
                    TrackBarView(
                        title: track.title,
                        isLocked: false,
                        isSelected: track.containsClipId(viewModel.selection.selectedClipId ?? ""),
                        tintHex: tint(for: track.kind),
                        isDark: colorScheme == .dark,
                        laneWidth: laneWidth,
                        laneHeight: 36
                    ) {
                        ZStack(alignment: .leading) {
                            ForEach(track.clipIds, id: \.self) { clipId in
                                clipBar(for: clipId, geometry: geometry, laneHeight: 36)
                            }
                        }
                    }
                }
            }
        }
        .frame(maxHeight: isExpanded ? .infinity : CGFloat(tracks.count) * 40 + 8)
        .animation(reduceMotion ? .none : .spring(response: 0.4, dampingFraction: 0.8), value: isExpanded)
    }

    @ViewBuilder
    private var footerTrigger: some View {
        let hidden = max(0, allTrackCount - Self.compactMaxTracks)
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
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
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
        case .bgAudio, .audio: return "818CF8"
        case .text:            return "A5B4FC"
        }
    }

    @ViewBuilder
    private func clipBar(for clipId: String, geometry: TimelineGeometry, laneHeight: CGFloat) -> some View {
        if let media = viewModel.project.mediaObjects.first(where: { $0.id == clipId }) {
            VideoClipBar(
                clipId: media.id,
                title: media.postMediaId,
                startTime: media.startTime ?? 0,
                duration: media.duration ?? 0,
                fadeIn: media.fadeIn ?? 0,
                fadeOut: media.fadeOut ?? 0,
                isSelected: viewModel.selection.selectedClipId == media.id,
                isLocked: false,
                isDark: colorScheme == .dark,
                geometry: geometry,
                laneHeight: laneHeight,
                frames: [],
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
                    let mediaId = media.id
                    let originalStart = media.startTime ?? 0
                    viewModel.beginClipDrag(clipId: mediaId)
                    viewModel.dragClipMoved(
                        rawTime: originalStart + Float(delta) / Float(geometry.pixelsPerSecond),
                        snapCandidates: []
                    )
                }
            )
            .equatable()
        } else if let audio = viewModel.project.audioPlayerObjects.first(where: { $0.id == clipId }) {
            AudioClipBar(
                clipId: audio.id,
                title: audio.postMediaId,
                startTime: audio.startTime ?? 0,
                duration: audio.duration ?? 0,
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
                    let audioId = audio.id
                    let originalStart = audio.startTime ?? 0
                    viewModel.beginClipDrag(clipId: audioId)
                    viewModel.dragClipMoved(
                        rawTime: originalStart + Float(delta) / Float(geometry.pixelsPerSecond),
                        snapCandidates: []
                    )
                }
            )
            .equatable()
        } else if let text = viewModel.project.textObjects.first(where: { $0.id == clipId }) {
            TextClipBar(
                clipId: text.id,
                content: text.content,
                startTime: text.startTime ?? 0,
                duration: text.displayDuration ?? 0,
                isSelected: viewModel.selection.selectedClipId == text.id,
                isLocked: false,
                isDark: colorScheme == .dark,
                geometry: geometry,
                laneHeight: laneHeight,
                onTap: { viewModel.selectClip(id: text.id) },
                onDoubleTap: { viewModel.selectClip(id: text.id) },
                onLongPress: { viewModel.selectClip(id: text.id) },
                onMoveDelta: { delta in
                    let textId = text.id
                    let originalStart = text.startTime ?? 0
                    viewModel.beginClipDrag(clipId: textId)
                    viewModel.dragClipMoved(
                        rawTime: originalStart + Float(delta) / Float(geometry.pixelsPerSecond),
                        snapCandidates: []
                    )
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
