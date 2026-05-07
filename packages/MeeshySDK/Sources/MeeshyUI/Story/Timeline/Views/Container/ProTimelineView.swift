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
            case .bgVideo, .video: return true
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
        viewModel.selection.selectedClipId != nil
    }

    // MARK: - Body

    public var body: some View {
        GeometryReader { proxy in
            HStack(spacing: 0) {
                previewColumn
                    .frame(width: proxy.size.width * Self.previewWidthFraction)
                timelineColumn
                    .frame(width: proxy.size.width * (1 - Self.previewWidthFraction))
            }
            .overlay(alignment: .bottomLeading) { inspectorOverlay }
        }
        .background(colorScheme == .dark ? MeeshyColors.indigo950.opacity(0.45) : MeeshyColors.indigo50.opacity(0.45))
        .accessibilityElement(children: .contain)
        .accessibilityLabel(String(localized: "story.timeline.mode.pro", bundle: .module))
    }

    // MARK: - Sub-views

    private var previewColumn: some View {
        VStack(spacing: 0) {
            if let previewSlot { previewSlot() } else { Color.black }
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
                onModeSwitch: { viewModel.setMode(.quick) }
            )
        }
    }

    private var timelineColumn: some View {
        let geometry = TimelineGeometry(zoomScale: viewModel.zoomScale)
        let laneWidth = max(geometry.width(for: viewModel.project.slideDuration), 320)
        return VStack(spacing: 0) {
            TimelineToolbar(
                canUndo: viewModel.canUndo,
                canRedo: viewModel.canRedo,
                isSnapEnabled: viewModel.isSnapEnabled,
                rulerResolutionSeconds: rulerResolution(for: viewModel.zoomScale),
                onUndo: { viewModel.undo() },
                onRedo: { viewModel.redo() },
                onSnapToggle: { viewModel.toggleSnap() }
            )
            RulerView(
                totalDuration: viewModel.project.slideDuration,
                geometry: geometry,
                isDark: colorScheme == .dark,
                height: 22,
                onTapTime: { _ in }
            )
            ScrollView([.horizontal, .vertical]) {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(Self.resolveTrackGroups(project: viewModel.project), id: \.section) { group in
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
                                Color.clear
                            }
                        }
                    }
                }
                .padding(.vertical, 4)
            }
        }
    }

    @ViewBuilder
    private var inspectorOverlay: some View {
        if Self.shouldShowClipInspector(viewModel: viewModel),
           let snapshot = currentClipSnapshot() {
            ClipInspector(
                presentation: .popover,
                clip: snapshot,
                onVolumeChanged: { _ in },
                onFadeInChanged: { _ in },
                onFadeOutChanged: { _ in },
                onLoopToggled: { _ in },
                onBackgroundToggled: { _ in },
                onAddKeyframe: { viewModel.addKeyframeAtPlayhead() },
                onDelete: { viewModel.selectClip(id: nil) }
            )
            .padding(12)
            .transition(.opacity)
            .animation(reduceMotion ? .none : .easeInOut(duration: 0.15),
                       value: viewModel.selection.selectedClipId)
        }
    }

    private func groupHeader(key: String) -> some View {
        HStack(spacing: 6) {
            Rectangle().fill(MeeshyColors.indigo400.opacity(0.7)).frame(width: 4, height: 14)
            Text(String(localized: String.LocalizationValue(key), bundle: .module))
                .font(.system(size: 10, weight: .bold))
                .foregroundStyle(.secondary)
            Spacer()
        }
        .padding(.leading, 6)
    }

    private func tint(for kind: QuickTimelineView.CompactTrack.Kind) -> String {
        switch kind {
        case .bgVideo, .video: return "6366F1"
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

    private func currentClipSnapshot() -> ClipInspector.ClipSnapshot? {
        guard let id = viewModel.selection.selectedClipId else { return nil }
        if let media = viewModel.project.mediaObjects.first(where: { $0.id == id }) {
            return ClipInspector.ClipSnapshot(
                id: media.id,
                // No `url` on StoryMediaObject — use postMediaId as display name
                displayName: media.postMediaId,
                kind: media.mediaType == "audio" ? .audio : .video,
                startTime: media.startTime ?? 0,
                duration: media.duration ?? 0,
                volume: media.volume,
                fadeInDuration: media.fadeIn ?? 0,
                fadeOutDuration: media.fadeOut ?? 0,
                isLooping: media.loop ?? false,
                isBackground: media.isBackground ?? false
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
