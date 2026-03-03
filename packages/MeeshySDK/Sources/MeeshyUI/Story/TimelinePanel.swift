import SwiftUI
import MeeshySDK

struct TimelinePanel: View {
    @Bindable var viewModel: StoryComposerViewModel
    @State private var tracks: [TimelineTrack] = []
    @State private var engine = TimelinePlaybackEngine()
    @State private var detailTrackId: String?
    @State private var zoomScale: CGFloat = 1.0
    @Environment(\.theme) private var theme

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
            timelineContent
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
            buildTracks()
            configureEngine()
        }
        .onChange(of: viewModel.currentSlideIndex) { buildTracks() }
        .onChange(of: trackFingerprint) { buildTracks() }
        .onDisappear {
            engine.stop()
            viewModel.isTimelinePlaying = false
            viewModel.timelinePlaybackTime = 0
        }
    }

    private func configureEngine() {
        engine.configure(duration: slideDuration)
        engine.onTimeUpdate = { time in
            viewModel.timelinePlaybackTime = time
        }
        engine.onPlaybackEnd = {
            viewModel.isTimelinePlaying = false
            engine.seek(to: 0)
            viewModel.timelinePlaybackTime = 0
        }
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
                Text(formatTime(viewModel.timelinePlaybackTime))
                    .font(.system(size: 13, weight: .semibold, design: .monospaced))
                    .foregroundStyle(theme.textPrimary)
                Text("/")
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundStyle(theme.textMuted)
                Text(formatTime(slideDuration))
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundStyle(theme.textSecondary)
            }

            Spacer()

            if zoomScale != 1.0 {
                Text("\(Int(zoomScale * 100))%")
                    .font(.system(size: 10, weight: .medium, design: .monospaced))
                    .foregroundStyle(MeeshyColors.indigo400)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Capsule().fill(MeeshyColors.indigo400.opacity(0.15)))
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

    // MARK: - Timeline Content (single HScroll)

    private var timelineContent: some View {
        let grouped = groupedTracks

        return ScrollView(.vertical, showsIndicators: false) {
            HStack(alignment: .top, spacing: 0) {
                labelColumn(grouped: grouped)
                    .frame(width: labelWidth)

                ScrollView(.horizontal, showsIndicators: false) {
                    ZStack(alignment: .topLeading) {
                        VStack(spacing: 0) {
                            rulerRow
                            trackRows(grouped: grouped)
                        }

                        gridLines(grouped: grouped)
                        playheadOverlay(grouped: grouped)
                        durationHandleOverlay
                    }
                    .frame(width: totalTimelineWidth)
                }
            }

            if tracks.isEmpty { emptyState }
        }
        .frame(maxHeight: 340)
        .gesture(
            MagnificationGesture()
                .onChanged { value in
                    zoomScale = max(0.5, min(4.0, value))
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
        var bgTracks: [Int] = []
        var fgTracks: [Int] = []

        for (i, t) in tracks.enumerated() {
            switch t.type {
            case .bgVideo, .bgImage, .drawing, .bgAudio: bgTracks.append(i)
            case .fgImage, .fgVideo, .fgAudio, .text: fgTracks.append(i)
            }
        }

        if !bgTracks.isEmpty {
            groups.append(TrackGroup(id: "bg", label: "FOND", icon: "square.stack.fill", tracks: bgTracks))
        }
        if !fgTracks.isEmpty {
            groups.append(TrackGroup(id: "fg", label: "FRONT", icon: "square.on.square.fill", tracks: fgTracks))
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

    // MARK: - Label Column (fixed, outside scroll)

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

    // MARK: - Ruler Row

    private var rulerRow: some View {
        ZStack(alignment: .leading) {
            timeTickMarks
        }
        .frame(width: totalTimelineWidth, height: rulerHeight)
    }

    private var timeTickMarks: some View {
        let tickColor = theme.textSecondary
        return Canvas { context, size in
            let totalSec = max(1, slideDuration)
            let pps = pixelsPerSecond
            let tickInterval: Float = zoomScale > 2 ? 0.5 : (zoomScale > 1 ? 1 : 2)
            var t: Float = 0
            while t <= totalSec {
                let x = CGFloat(t) * pps
                let isMajor = t.truncatingRemainder(dividingBy: max(1, tickInterval * 2)) < 0.01
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
                        Text(formatTimeShort(t))
                            .font(.system(size: 8, design: .monospaced))
                            .foregroundStyle(tickColor.opacity(0.7)),
                        at: CGPoint(x: x, y: 6)
                    )
                }
                t += tickInterval
            }
        }
        .allowsHitTesting(false)
    }

    // MARK: - Track Rows (inside scroll)

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
            onDetailTap: { detailTrackId = t.id }
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

    // MARK: - Grid Lines (Canvas behind tracks)

    private func gridLines(grouped: [TrackGroup]) -> some View {
        let areaHeight = totalTrackAreaHeight(grouped: grouped)
        let gridColor = theme.textMuted

        return Canvas { context, size in
            let totalSec = max(1, slideDuration)
            let pps = pixelsPerSecond
            let tickInterval: Float = zoomScale > 2 ? 0.5 : (zoomScale > 1 ? 1 : 2)
            var t: Float = 0
            while t <= totalSec {
                let x = CGFloat(t) * pps
                let isMajor = t.truncatingRemainder(dividingBy: max(1, tickInterval * 2)) < 0.01
                context.stroke(
                    Path { p in
                        p.move(to: CGPoint(x: x, y: 0))
                        p.addLine(to: CGPoint(x: x, y: size.height))
                    },
                    with: .color(gridColor.opacity(isMajor ? 0.15 : 0.07)),
                    lineWidth: 0.5
                )
                t += tickInterval
            }
        }
        .frame(width: totalTimelineWidth, height: rulerHeight + areaHeight)
        .allowsHitTesting(false)
    }

    // MARK: - Playhead (spans ruler + all tracks)

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
            Text("Ajoutez du contenu pour voir la timeline")
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

        // FOND: Main background image (selectedImage — not a media object)
        if viewModel.hasBackgroundImage {
            result.append(TimelineTrack(
                id: "bg-image-main", name: "Image Fond", type: .bgImage,
                startTime: 0, duration: nil,
                volume: nil, loop: false,
                fadeIn: nil, fadeOut: nil
            ))
        }

        // FOND: Background video
        if let bgVid = effects.mediaObjects?.first(where: {
            $0.placement == "background" && $0.mediaType == "video"
        }) {
            result.append(TimelineTrack(
                id: bgVid.id, name: "Video BG", type: .bgVideo,
                startTime: bgVid.startTime ?? 0, duration: bgVid.duration,
                volume: bgVid.volume, loop: bgVid.loop ?? false,
                fadeIn: bgVid.fadeIn, fadeOut: bgVid.fadeOut,
                videoURL: viewModel.loadedVideoURLs[bgVid.id]
            ))
        }

        // FOND: Background images (media objects)
        for bgImg in effects.mediaObjects?.filter({
            $0.placement == "background" && $0.mediaType == "image"
        }) ?? [] {
            result.append(TimelineTrack(
                id: bgImg.id, name: "Image BG", type: .bgImage,
                startTime: bgImg.startTime ?? 0, duration: bgImg.duration,
                volume: nil, loop: false,
                fadeIn: bgImg.fadeIn, fadeOut: bgImg.fadeOut
            ))
        }

        // FOND: Drawing layer
        if viewModel.drawingData != nil {
            result.append(TimelineTrack(
                id: "drawing", name: "Dessin", type: .drawing,
                startTime: 0, duration: nil,
                volume: nil, loop: false,
                fadeIn: nil, fadeOut: nil
            ))
        }

        // FOND: Background audio (library)
        if effects.backgroundAudioId != nil {
            result.append(TimelineTrack(
                id: "bg-audio", name: "Audio BG", type: .bgAudio,
                startTime: Float(effects.backgroundAudioStart ?? 0),
                duration: effects.backgroundAudioEnd.map { Float($0) },
                volume: effects.backgroundAudioVolume ?? 1.0, loop: true,
                fadeIn: nil, fadeOut: nil
            ))
        }

        // FOND: Background audio (custom recordings)
        for bgAudio in effects.audioPlayerObjects?.filter({ $0.placement == "background" }) ?? [] {
            result.append(TimelineTrack(
                id: bgAudio.id, name: "Audio BG", type: .bgAudio,
                startTime: bgAudio.startTime ?? 0, duration: bgAudio.duration,
                volume: bgAudio.volume, loop: bgAudio.loop ?? true,
                fadeIn: bgAudio.fadeIn, fadeOut: bgAudio.fadeOut,
                waveformSamples: bgAudio.waveformSamples
            ))
        }

        // CONTENU: Foreground images
        for img in effects.mediaObjects?.filter({
            $0.placement == "foreground" && $0.mediaType == "image"
        }) ?? [] {
            result.append(TimelineTrack(
                id: img.id, name: "Image", type: .fgImage,
                startTime: img.startTime ?? 0, duration: img.duration,
                volume: nil, loop: false,
                fadeIn: img.fadeIn, fadeOut: img.fadeOut
            ))
        }

        // CONTENU: Foreground videos
        for vid in effects.mediaObjects?.filter({
            $0.placement == "foreground" && $0.mediaType == "video"
        }) ?? [] {
            result.append(TimelineTrack(
                id: vid.id, name: "Video", type: .fgVideo,
                startTime: vid.startTime ?? 0, duration: vid.duration,
                volume: vid.volume, loop: vid.loop ?? false,
                fadeIn: vid.fadeIn, fadeOut: vid.fadeOut,
                videoURL: viewModel.loadedVideoURLs[vid.id]
            ))
        }

        // CONTENU: Foreground audio
        for aud in effects.audioPlayerObjects?.filter({ $0.placement == "foreground" }) ?? [] {
            result.append(TimelineTrack(
                id: aud.id, name: "Audio", type: .fgAudio,
                startTime: aud.startTime ?? 0, duration: aud.duration,
                volume: aud.volume, loop: aud.loop ?? false,
                fadeIn: aud.fadeIn, fadeOut: aud.fadeOut,
                waveformSamples: aud.waveformSamples
            ))
        }

        // TEXTE
        for text in effects.textObjects ?? [] {
            let label = String(text.content.prefix(10)) + (text.content.count > 10 ? "..." : "")
            result.append(TimelineTrack(
                id: text.id, name: label.isEmpty ? "Texte" : label, type: .text,
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

    // MARK: - Helpers

    private func formatTime(_ sec: Float) -> String {
        let m = Int(sec) / 60
        let s = Int(sec) % 60
        let ms = Int((sec - Float(Int(sec))) * 10)
        return String(format: "%d:%02d.%d", m, s, ms)
    }

    private func formatTimeShort(_ sec: Float) -> String {
        if sec < 60 { return String(format: "%.0fs", sec) }
        return String(format: "%d:%02d", Int(sec) / 60, Int(sec) % 60)
    }
}
