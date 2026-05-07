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

    // MARK: - Hoisted computed properties (MEDIUM 7)
    // Keyed only on viewModel.project — stable when currentTime / zoomScale change.

    private var hoistedTrackGroups: [TrackGroup] {
        Self.resolveTrackGroups(project: viewModel.project)
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
            .equatable() // HIGH 3: short-circuit body re-evaluation during playhead scrubbing
            ScrollView([.horizontal, .vertical]) {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(hoistedTrackGroups, id: \.section) { group in
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
                .padding(.vertical, 4)
            }
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
                    // DragGesture.onChanged fires with cumulative translation from gesture start.
                    // beginClipDrag captures originalStartTime from the project state at the
                    // moment the drag first began. Subsequent frames re-begin but the guard
                    // in dragClipMoved keeps state consistent.
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
