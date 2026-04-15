import SwiftUI
import AVFoundation
import MeeshySDK

struct TimelinePanel: View {
    @Bindable var viewModel: StoryComposerViewModel
    @State private var tracks: [TimelineTrack] = []
    @State private var engine = TimelinePlaybackEngine()
    @State private var detailTrackId: String?
    @State private var mediaDurationCache: [String: Float] = [:]
    @State private var scrollProxy: ScrollViewProxy?
    @State private var showMediaEditor: String?
    @State private var zoomAnchor: CGFloat = 1.0
    @Environment(\.theme) private var theme

    private var zoomScale: CGFloat { viewModel.timelineZoomScale }

    private let labelWidth: CGFloat = 72
    private let trackHeight: CGFloat = 44
    private let rulerHeight: CGFloat = 28
    private let sectionHeaderHeight: CGFloat = 20
    private let basePixelsPerSecond: CGFloat = 50

    private var pixelsPerSecond: CGFloat { basePixelsPerSecond * zoomScale }
    private var slideDuration: Float { viewModel.currentSlideDuration }
    private var totalTimelineWidth: CGFloat { CGFloat(slideDuration) * pixelsPerSecond }

    private var trackFingerprint: Int {
        let e = viewModel.currentEffects
        var h = (e.textObjects?.count ?? 0)
        h = h &* 31 &+ (e.mediaObjects?.count ?? 0)
        h = h &* 31 &+ (e.audioPlayerObjects?.count ?? 0)
        h = h &* 31 &+ (viewModel.hasBackgroundImage ? 1 : 0)
        h = h &* 31 &+ (viewModel.drawingData != nil ? 1 : 0)
        for t in e.textObjects ?? [] { h = h &* 31 &+ t.id.hashValue &+ t.content.hashValue }
        for m in e.mediaObjects ?? [] { h = h &* 31 &+ m.id.hashValue }
        for a in e.audioPlayerObjects ?? [] { h = h &* 31 &+ a.id.hashValue }
        return h
    }

    var body: some View {
        VStack(spacing: 0) {
            transportBar
            Divider().overlay(MeeshyColors.indigo900.opacity(0.3))

            if viewModel.timelineAdvanced {
                advancedTimelineContent
            } else {
                SimpleTimelineView(
                    viewModel: viewModel,
                    onEditTap: { id in showMediaEditor = id }
                )
            }
        }
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(theme.backgroundPrimary.opacity(0.97))
                .overlay(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .strokeBorder(theme.inputBorder.opacity(0.4), lineWidth: 0.5)
                )
        )
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .onAppear {
            zoomAnchor = viewModel.timelineZoomScale
            buildTracks()
            configureEngine()
        }
        .onChange(of: trackFingerprint) { buildTracks(); configureEngine() }
        .onDisappear {
            engine.stop()
            viewModel.isTimelinePlaying = false
            viewModel.timelinePlaybackTime = 0
        }
        .sheet(item: Binding(
            get: { showMediaEditor.map { MediaEditorTarget(id: $0) } },
            set: { showMediaEditor = $0?.id }
        )) { target in
            mediaEditorSheet(for: target.id)
        }
    }

    // MARK: - Engine Configuration

    private func configureEngine() {
        engine.configure(duration: slideDuration)
        engine.configureMedia(buildMediaElements())
        engine.onTimeUpdate = { time in
            viewModel.timelinePlaybackTime = time
            scrollProxy?.scrollTo("playhead", anchor: .center)
        }
        engine.onPlaybackEnd = {
            viewModel.isTimelinePlaying = false
        }
    }

    private func buildMediaElements() -> [TimelinePlaybackEngine.MediaElement] {
        var elements: [TimelinePlaybackEngine.MediaElement] = []
        let effects = viewModel.currentEffects

        for media in effects.mediaObjects ?? [] {
            let url: URL?
            let mediaType: TimelinePlaybackEngine.MediaElement.MediaType
            if media.mediaType == "video" {
                url = viewModel.loadedVideoURLs[media.id]
                mediaType = .video
            } else {
                url = nil
                mediaType = .image
            }
            elements.append(TimelinePlaybackEngine.MediaElement(
                id: media.id, type: mediaType, url: url,
                startTime: media.startTime ?? 0,
                duration: media.duration ?? slideDuration,
                volume: media.volume
            ))
        }

        for audio in effects.audioPlayerObjects ?? [] {
            elements.append(TimelinePlaybackEngine.MediaElement(
                id: audio.id, type: .audio,
                url: viewModel.loadedAudioURLs[audio.id],
                startTime: audio.startTime ?? 0,
                duration: audio.duration ?? slideDuration,
                volume: audio.volume
            ))
        }

        return elements
    }

    // MARK: - Media Editor Sheet

    private struct MediaEditorTarget: Identifiable {
        let id: String
    }

    @ViewBuilder
    private func mediaEditorSheet(for elementId: String) -> some View {
        let effects = viewModel.currentEffects

        if let media = effects.mediaObjects?.first(where: { $0.id == elementId }) {
            if media.mediaType == "image", let img = viewModel.loadedImages[elementId] {
                MeeshyImageEditorView(
                    image: img,
                    initialCropRatio: nil,
                    accentColor: MeeshyColors.brandPrimaryHex,
                    onAccept: { edited in
                        viewModel.loadedImages[elementId] = edited
                        showMediaEditor = nil
                    },
                    onCancel: { showMediaEditor = nil }
                )
            } else if media.mediaType == "video", let url = viewModel.loadedVideoURLs[elementId] {
                MeeshyVideoPreviewView(
                    url: url,
                    context: .story,
                    onAccept: { showMediaEditor = nil },
                    onCancel: { showMediaEditor = nil }
                )
            } else {
                emptyEditorPlaceholder
            }
        } else if effects.audioPlayerObjects?.contains(where: { $0.id == elementId }) == true,
                  let url = viewModel.loadedAudioURLs[elementId] {
            MeeshyAudioEditorView(
                url: url,
                onConfirm: { _, _, _, _ in showMediaEditor = nil },
                onDismiss: { showMediaEditor = nil },
                onCancel: { showMediaEditor = nil }
            )
        } else {
            emptyEditorPlaceholder
        }
    }

    private var emptyEditorPlaceholder: some View {
        VStack(spacing: 8) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 24))
                .foregroundStyle(theme.textMuted)
            Text(String(localized: "story.timeline.mediaUnavailable", defaultValue: "Media non disponible", bundle: .module))
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(theme.textMuted)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(theme.backgroundPrimary)
    }

    // MARK: - Transport Bar

    private var transportBar: some View {
        HStack(spacing: 12) {
            Button {
                engine.stop()
                viewModel.isTimelinePlaying = false
                viewModel.timelinePlaybackTime = 0
            } label: {
                Image(systemName: "backward.end.fill")
                    .font(.system(size: 12))
                    .foregroundStyle(theme.textSecondary)
            }

            Button {
                engine.configure(duration: slideDuration)
                engine.configureMedia(buildMediaElements())
                engine.isMuted = viewModel.isMuted
                engine.toggle()
                viewModel.isTimelinePlaying = engine.isPlaying
            } label: {
                Image(systemName: viewModel.isTimelinePlaying ? "pause.fill" : "play.fill")
                    .font(.system(size: 14))
                    .foregroundStyle(theme.textPrimary)
                    .frame(width: 36, height: 36)
                    .background(Circle().fill(MeeshyColors.brandGradient))
                    .shadow(color: MeeshyColors.indigo500.opacity(0.4), radius: 8, y: 2)
            }

            HStack(spacing: 2) {
                Text(formatTimePrecise(viewModel.timelinePlaybackTime))
                    .font(.system(size: 13, weight: .semibold, design: .monospaced))
                    .foregroundStyle(theme.textPrimary)
                Text("/")
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundStyle(theme.textMuted)
                Text(formatTimePrecise(slideDuration))
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundStyle(theme.textSecondary)
            }

            Spacer()

            if zoomScale != 1.0 {
                Text(zoomLabel)
                    .font(.system(size: 10, weight: .medium, design: .monospaced))
                    .foregroundStyle(MeeshyColors.indigo400)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Capsule().fill(MeeshyColors.indigo400.opacity(0.15)))
            }

            Button {
                viewModel.isMuted.toggle()
                engine.isMuted = viewModel.isMuted
                HapticFeedback.light()
            } label: {
                Image(systemName: viewModel.isMuted ? "speaker.slash.fill" : "speaker.wave.2.fill")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(viewModel.isMuted ? MeeshyColors.error : theme.textSecondary)
                    .frame(width: 32, height: 32)
                    .background(
                        Circle().fill(viewModel.isMuted ? MeeshyColors.error.opacity(0.15) : Color.clear)
                    )
            }

            Button {
                withAnimation(.spring(response: 0.25)) {
                    viewModel.timelineAdvanced.toggle()
                }
            } label: {
                Image(systemName: viewModel.timelineAdvanced ? "slider.horizontal.3" : "slider.horizontal.2.square")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(viewModel.timelineAdvanced ? MeeshyColors.brandPrimary : theme.textSecondary)
                    .frame(width: 32, height: 32)
                    .background(
                        Circle().fill(viewModel.timelineAdvanced ? MeeshyColors.brandPrimary.opacity(0.15) : Color.clear)
                    )
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(.ultraThinMaterial.opacity(0.5))
    }

    // MARK: - Advanced Timeline Content

    private var advancedTimelineContent: some View {
        let grouped = groupedTracks

        return ScrollView(.vertical, showsIndicators: false) {
            HStack(alignment: .top, spacing: 0) {
                labelColumn(grouped: grouped)
                    .frame(width: labelWidth)

                ScrollViewReader { proxy in
                    ScrollView(.horizontal, showsIndicators: false) {
                        ZStack(alignment: .topLeading) {
                            VStack(spacing: 0) {
                                rulerRow
                                trackRows(grouped: grouped)
                            }

                            gridLines(grouped: grouped)
                            playheadOverlay(grouped: grouped)
                            durationHandleOverlay

                            Color.clear
                                .frame(width: 1, height: 1)
                                .id("playhead")
                                .offset(x: CGFloat(viewModel.timelinePlaybackTime) * pixelsPerSecond)
                        }
                        .frame(width: totalTimelineWidth)
                    }
                    .onAppear { scrollProxy = proxy }
                }
            }

            if tracks.isEmpty { emptyState }
        }
        .frame(maxHeight: 340)
        .gesture(
            MagnificationGesture()
                .onChanged { value in
                    viewModel.timelineZoomScale = max(0.5, min(10.0, zoomAnchor * value))
                }
                .onEnded { _ in
                    zoomAnchor = viewModel.timelineZoomScale
                }
        )
    }

    // MARK: - Track Grouping

    private struct TrackGroup: Identifiable {
        let id: String
        let label: String
        let icon: String
        var tracks: [Int]
    }

    private var groupedTracks: [TrackGroup] {
        var groups: [TrackGroup] = []
        var mediaTracks: [Int] = []
        var overlayTracks: [Int] = []

        for (i, t) in tracks.enumerated() {
            switch t.type {
            case .image, .video, .drawing: mediaTracks.append(i)
            case .audio, .text: overlayTracks.append(i)
            }
        }

        if !mediaTracks.isEmpty {
            groups.append(TrackGroup(id: "media", label: "MEDIA", icon: "photo.on.rectangle", tracks: mediaTracks))
        }
        if !overlayTracks.isEmpty {
            groups.append(TrackGroup(id: "overlay", label: "OVERLAY", icon: "square.on.square.fill", tracks: overlayTracks))
        }
        return groups
    }

    private func totalTrackAreaHeight(grouped: [TrackGroup]) -> CGFloat {
        var h: CGFloat = 0
        for group in grouped {
            h += sectionHeaderHeight
            h += CGFloat(group.tracks.count) * trackHeight
        }
        return h
    }

    // MARK: - Label Column

    private func labelColumn(grouped: [TrackGroup]) -> some View {
        VStack(spacing: 0) {
            Color.clear.frame(height: rulerHeight)

            ForEach(grouped) { group in
                sectionHeaderLabel(group.label, icon: group.icon)
                    .frame(height: sectionHeaderHeight)

                ForEach(group.tracks, id: \.self) { idx in
                    let t = tracks[idx]
                    let isSel = viewModel.selectedElementId == t.id
                    TrackLabel(track: t, isSelected: isSel)
                        .frame(width: labelWidth, height: trackHeight)
                        .onTapGesture { viewModel.selectedElementId = t.id }
                }
            }
        }
    }

    private func sectionHeaderLabel(_ label: String, icon: String) -> some View {
        HStack(spacing: 3) {
            Image(systemName: icon)
                .font(.system(size: 7, weight: .bold))
                .foregroundStyle(MeeshyColors.indigo400.opacity(0.5))
            Text(label)
                .font(.system(size: 8, weight: .bold))
                .foregroundStyle(MeeshyColors.indigo400.opacity(0.5))
                .tracking(0.5)
        }
        .frame(width: labelWidth, height: sectionHeaderHeight, alignment: .leading)
        .padding(.leading, 6)
    }

    // MARK: - Ruler Row (Adaptive)

    private var rulerRow: some View {
        ZStack(alignment: .leading) {
            adaptiveTickMarks
        }
        .frame(width: totalTimelineWidth, height: rulerHeight)
    }

    private var rulerConfig: (minor: Float, major: Float, format: (Float) -> String) {
        let pps = pixelsPerSecond
        if pps > 1000 {
            return (0.01, 0.1, formatMs)
        } else if pps > 200 {
            return (0.1, 0.5, formatMs)
        } else if pps > 50 {
            return (0.5, 2, formatSecondsShort)
        } else if pps > 10 {
            return (1, 5, formatSecondsShort)
        } else if pps > 2 {
            return (5, 15, formatMinSec)
        } else {
            return (10, 30, formatMinSec)
        }
    }

    private var adaptiveTickMarks: some View {
        let tickColor = theme.textSecondary
        let config = rulerConfig

        return Canvas { context, size in
            let totalSec = max(0.01, slideDuration)
            let pps = pixelsPerSecond
            var t: Float = 0

            while t <= totalSec {
                let x = CGFloat(t) * pps
                let isMajor = config.minor > 0 && t.truncatingRemainder(dividingBy: config.major) < config.minor * 0.1
                let h: CGFloat = isMajor ? 12 : 6

                context.stroke(
                    Path { p in
                        p.move(to: CGPoint(x: x, y: size.height - h))
                        p.addLine(to: CGPoint(x: x, y: size.height))
                    },
                    with: .color(tickColor.opacity(isMajor ? 0.7 : 0.3)),
                    lineWidth: 1
                )

                if isMajor {
                    context.draw(
                        Text(config.format(t))
                            .font(.system(size: 8, design: .monospaced))
                            .foregroundStyle(tickColor.opacity(0.7)),
                        at: CGPoint(x: x, y: 6)
                    )
                }
                t += config.minor
            }
        }
        .allowsHitTesting(false)
    }

    // MARK: - Track Rows

    private func trackRows(grouped: [TrackGroup]) -> some View {
        VStack(spacing: 0) {
            ForEach(grouped) { group in
                sectionHeaderBar(group.label)
                    .frame(height: sectionHeaderHeight)

                ForEach(group.tracks, id: \.self) { idx in
                    trackRowContent(at: idx)
                }
            }
        }
    }

    private func sectionHeaderBar(_ label: String) -> some View {
        Rectangle()
            .fill(MeeshyColors.indigo900.opacity(0.15))
            .frame(height: sectionHeaderHeight)
            .overlay(alignment: .bottom) {
                Rectangle()
                    .fill(MeeshyColors.indigo900.opacity(0.2))
                    .frame(height: 0.5)
            }
    }

    private func trackRowContent(at idx: Int) -> some View {
        let t = tracks[idx]
        let isSel = viewModel.selectedElementId == t.id
        let binding = $tracks[idx]

        return TimelineTrackBar(
            track: binding,
            totalDuration: slideDuration,
            pixelsPerSecond: pixelsPerSecond,
            isSelected: isSel,
            onSelect: { viewModel.selectedElementId = t.id },
            onChanged: { updated in
                viewModel.autoExtendDuration(
                    forElementEnd: updated.startTime + (updated.duration ?? 0)
                )
                syncTrackToModel(updated)
            },
            onDetailTap: { detailTrackId = t.id },
            onEditTap: isEditableTrack(t) ? { showMediaEditor = t.id } : nil
        )
        .frame(width: totalTimelineWidth, height: trackHeight)
        .popover(isPresented: Binding(
            get: { detailTrackId == t.id },
            set: { if !$0 { detailTrackId = nil } }
        )) {
            TrackDetailPopover(
                track: binding,
                totalDuration: slideDuration,
                onChanged: { syncTrackToModel($0) },
                onDelete: {
                    detailTrackId = nil
                    viewModel.deleteElement(id: t.id)
                },
                onDismiss: { detailTrackId = nil }
            )
        }
    }

    private func isEditableTrack(_ track: TimelineTrack) -> Bool {
        switch track.type {
        case .image, .video, .audio: return true
        case .text, .drawing: return false
        }
    }

    // MARK: - Grid Lines

    private func gridLines(grouped: [TrackGroup]) -> some View {
        let areaHeight = totalTrackAreaHeight(grouped: grouped)
        let gridColor = theme.textMuted
        let config = rulerConfig

        return Canvas { context, size in
            let totalSec = max(0.01, slideDuration)
            let pps = pixelsPerSecond
            var t: Float = 0

            while t <= totalSec {
                let x = CGFloat(t) * pps
                let isMajor = config.minor > 0 && t.truncatingRemainder(dividingBy: config.major) < config.minor * 0.1

                context.stroke(
                    Path { p in
                        p.move(to: CGPoint(x: x, y: 0))
                        p.addLine(to: CGPoint(x: x, y: size.height))
                    },
                    with: .color(gridColor.opacity(isMajor ? 0.15 : 0.07)),
                    lineWidth: 0.5
                )
                t += config.minor
            }
        }
        .frame(width: totalTimelineWidth, height: rulerHeight + areaHeight)
        .allowsHitTesting(false)
    }

    // MARK: - Playhead

    private func playheadOverlay(grouped: [TrackGroup]) -> some View {
        let x = CGFloat(viewModel.timelinePlaybackTime) * pixelsPerSecond
        let totalHeight = rulerHeight + totalTrackAreaHeight(grouped: grouped)
        let headColor = theme.textPrimary

        return VStack(spacing: 0) {
            playheadTriangle(color: headColor)
            Rectangle()
                .fill(headColor)
                .frame(width: 1.5, height: max(0, totalHeight - 6))
        }
        .shadow(color: MeeshyColors.indigo400.opacity(0.5), radius: 3)
        .offset(x: x - 4)
        .gesture(
            DragGesture(minimumDistance: 0)
                .onChanged { val in
                    let t = Float(val.location.x / pixelsPerSecond)
                    engine.seek(to: max(0, min(slideDuration, t)))
                }
        )
    }

    private func playheadTriangle(color: Color) -> some View {
        Path { p in
            p.move(to: CGPoint(x: 0, y: 0))
            p.addLine(to: CGPoint(x: 8, y: 0))
            p.addLine(to: CGPoint(x: 4, y: 6))
            p.closeSubpath()
        }
        .fill(color)
        .frame(width: 8, height: 6)
    }

    // MARK: - Duration Handle

    private var durationHandleOverlay: some View {
        let x = CGFloat(slideDuration) * pixelsPerSecond

        return RoundedRectangle(cornerRadius: 3)
            .fill(MeeshyColors.indigo400)
            .frame(width: 16, height: 16)
            .rotationEffect(.degrees(45))
            .overlay(
                RoundedRectangle(cornerRadius: 3)
                    .stroke(theme.textPrimary.opacity(0.8), lineWidth: 1)
                    .rotationEffect(.degrees(45))
            )
            .frame(width: 20, height: 20)
            .contentShape(Rectangle().size(width: 30, height: 30))
            .offset(x: x - 10, y: rulerHeight / 2 - 10)
            .gesture(
                DragGesture(minimumDistance: 2)
                    .onChanged { val in
                        let newDur = Float(val.location.x / pixelsPerSecond)
                        viewModel.currentSlideDuration = max(2, min(30, newDur))
                        engine.configure(duration: viewModel.currentSlideDuration)
                    }
            )
    }

    // MARK: - Empty State

    private var emptyState: some View {
        VStack(spacing: 8) {
            Image(systemName: "waveform.path.ecg")
                .font(.system(size: 28, weight: .ultraLight))
                .foregroundStyle(
                    LinearGradient(
                        colors: [MeeshyColors.indigo400.opacity(0.6), MeeshyColors.indigo600.opacity(0.3)],
                        startPoint: .top, endPoint: .bottom
                    )
                )
            Text(String(localized: "story.timeline.addContent", defaultValue: "Ajoutez du contenu pour voir la timeline", bundle: .module))
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(theme.textMuted)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 24)
    }

    // MARK: - Build Tracks

    private func buildTracks() {
        var result: [TimelineTrack] = []
        let effects = viewModel.currentEffects

        if viewModel.hasBackgroundImage {
            result.append(TimelineTrack(
                id: "bg-image-main", name: String(localized: "story.timeline.bgImage", defaultValue: "Image Fond", bundle: .module), type: .image,
                startTime: 0, duration: nil,
                volume: nil, loop: false,
                fadeIn: nil, fadeOut: nil
            ))
        }

        for media in effects.mediaObjects ?? [] {
            if media.mediaType == "video" {
                let vidURL = viewModel.loadedVideoURLs[media.id]
                result.append(TimelineTrack(
                    id: media.id, name: String(localized: "story.timeline.video", defaultValue: "Video", bundle: .module), type: .video,
                    startTime: media.startTime ?? 0, duration: media.duration,
                    volume: media.volume, loop: media.loop ?? false,
                    fadeIn: media.fadeIn, fadeOut: media.fadeOut,
                    videoURL: vidURL,
                    mediaDuration: mediaDurationCache[media.id] ?? intrinsicDuration(url: vidURL)
                ))
            } else {
                result.append(TimelineTrack(
                    id: media.id, name: String(localized: "story.timeline.image", defaultValue: "Image", bundle: .module), type: .image,
                    startTime: media.startTime ?? 0, duration: media.duration,
                    volume: nil, loop: false,
                    fadeIn: media.fadeIn, fadeOut: media.fadeOut,
                    image: viewModel.loadedImages[media.id]
                ))
            }
        }

        if viewModel.drawingData != nil {
            result.append(TimelineTrack(
                id: "drawing", name: String(localized: "story.timeline.drawing", defaultValue: "Dessin", bundle: .module), type: .drawing,
                startTime: 0, duration: nil,
                volume: nil, loop: false,
                fadeIn: nil, fadeOut: nil
            ))
        }

        if effects.backgroundAudioId != nil {
            result.append(TimelineTrack(
                id: "bg-audio", name: String(localized: "story.timeline.bgAudio", defaultValue: "Audio BG", bundle: .module), type: .audio,
                startTime: Float(effects.backgroundAudioStart ?? 0),
                duration: effects.backgroundAudioEnd.map { Float($0) },
                volume: effects.backgroundAudioVolume ?? 1.0, loop: true,
                fadeIn: nil, fadeOut: nil
            ))
        }

        for audio in effects.audioPlayerObjects ?? [] {
            let audURL = viewModel.loadedAudioURLs[audio.id]
            result.append(TimelineTrack(
                id: audio.id, name: String(localized: "story.timeline.audio", defaultValue: "Audio", bundle: .module), type: .audio,
                startTime: audio.startTime ?? 0, duration: audio.duration,
                volume: audio.volume, loop: audio.loop ?? false,
                fadeIn: audio.fadeIn, fadeOut: audio.fadeOut,
                waveformSamples: audio.waveformSamples,
                mediaDuration: mediaDurationCache[audio.id] ?? intrinsicDuration(url: audURL)
            ))
        }

        for text in effects.textObjects ?? [] {
            let label = String(text.content.prefix(10)) + (text.content.count > 10 ? "..." : "")
            result.append(TimelineTrack(
                id: text.id, name: label.isEmpty ? String(localized: "story.timeline.text", defaultValue: "Texte", bundle: .module) : label, type: .text,
                startTime: text.startTime ?? 0, duration: text.displayDuration,
                volume: nil, loop: false,
                fadeIn: text.fadeIn, fadeOut: text.fadeOut
            ))
        }

        result.sort { $0.type.sortOrder < $1.type.sortOrder }
        tracks = result
    }

    // MARK: - Sync Track to Model

    private func syncTrackToModel(_ track: TimelineTrack) {
        var effects = viewModel.currentEffects

        if track.id == "bg-audio" {
            effects.backgroundAudioVolume = track.volume
            effects.backgroundAudioStart = TimeInterval(track.startTime)
            if let dur = track.duration { effects.backgroundAudioEnd = TimeInterval(dur) }
            viewModel.currentEffects = effects
            return
        }

        if let idx = effects.textObjects?.firstIndex(where: { $0.id == track.id }) {
            effects.textObjects?[idx].startTime = track.startTime
            effects.textObjects?[idx].displayDuration = track.duration
            effects.textObjects?[idx].fadeIn = track.fadeIn
            effects.textObjects?[idx].fadeOut = track.fadeOut
            viewModel.currentEffects = effects
            return
        }

        if let idx = effects.mediaObjects?.firstIndex(where: { $0.id == track.id }) {
            let currentVolume = effects.mediaObjects?[idx].volume ?? 1.0
            effects.mediaObjects?[idx].startTime = track.startTime
            effects.mediaObjects?[idx].duration = track.duration
            effects.mediaObjects?[idx].volume = track.volume ?? currentVolume
            effects.mediaObjects?[idx].loop = track.loop
            effects.mediaObjects?[idx].fadeIn = track.fadeIn
            effects.mediaObjects?[idx].fadeOut = track.fadeOut
            viewModel.currentEffects = effects
            return
        }

        if let idx = effects.audioPlayerObjects?.firstIndex(where: { $0.id == track.id }) {
            let currentVolume = effects.audioPlayerObjects?[idx].volume ?? 1.0
            effects.audioPlayerObjects?[idx].startTime = track.startTime
            effects.audioPlayerObjects?[idx].duration = track.duration
            effects.audioPlayerObjects?[idx].volume = track.volume ?? currentVolume
            effects.audioPlayerObjects?[idx].loop = track.loop
            effects.audioPlayerObjects?[idx].fadeIn = track.fadeIn
            effects.audioPlayerObjects?[idx].fadeOut = track.fadeOut
            viewModel.currentEffects = effects
            return
        }
    }

    // MARK: - Zoom Label

    private var zoomLabel: String {
        if zoomScale >= 10 {
            return "\(Int(zoomScale * 100))%"
        } else if zoomScale >= 1 {
            return String(format: "%.0f%%", zoomScale * 100)
        } else if zoomScale >= 0.1 {
            return String(format: "%.0f%%", zoomScale * 100)
        } else {
            return String(format: "%.1f%%", zoomScale * 100)
        }
    }

    // MARK: - Time Formatting

    private func formatTimePrecise(_ sec: Float) -> String {
        let m = Int(sec) / 60
        let s = Int(sec) % 60
        let ms = Int((sec - Float(Int(sec))) * 1000)
        return String(format: "%d:%02d.%03d", m, s, ms)
    }

    private func formatMs(_ sec: Float) -> String {
        let ms = Int(sec * 1000)
        if ms < 1000 {
            return "\(ms)ms"
        }
        return String(format: "%.1fs", sec)
    }

    private func formatSecondsShort(_ sec: Float) -> String {
        if sec < 60 { return String(format: "%.1fs", sec) }
        return String(format: "%d:%02d", Int(sec) / 60, Int(sec) % 60)
    }

    private func formatMinSec(_ sec: Float) -> String {
        let m = Int(sec) / 60
        let s = Int(sec) % 60
        if m > 0 { return "\(m):\(String(format: "%02d", s))" }
        return "\(s)s"
    }

    // MARK: - Helpers

    private func intrinsicDuration(url: URL?) -> Float? {
        guard let url else { return nil }
        let key = url.lastPathComponent
        if let cached = mediaDurationCache[key] { return cached }
        Task { await loadIntrinsicDuration(url: url, key: key) }
        return nil
    }

    private func loadIntrinsicDuration(url: URL, key: String) async {
        let asset = AVURLAsset(url: url)
        guard let cmDuration = try? await asset.load(.duration) else { return }
        let dur = Float(CMTimeGetSeconds(cmDuration))
        guard dur > 0, dur.isFinite else { return }
        mediaDurationCache[key] = dur
    }
}
