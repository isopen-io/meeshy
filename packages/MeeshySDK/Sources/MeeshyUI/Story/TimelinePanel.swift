import SwiftUI
import MeeshySDK

// MARK: - Timeline Panel

struct TimelinePanel: View {
    @Bindable var viewModel: StoryComposerViewModel
    @State private var tracks: [TimelineTrack] = []
    @State private var playheadPosition: Float = 0
    @State private var isPlaying: Bool = false

    private let panelBackground = Color(hex: "13111C")

    var body: some View {
        VStack(spacing: 0) {
            timelineHeader

            Divider()
                .overlay(MeeshyColors.indigo900)

            if viewModel.timelineMode == .simple {
                simpleTimeline
            } else {
                advancedTimeline
            }
        }
        .background(panelBackground.opacity(0.95))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .onAppear { buildTracks() }
        .onChange(of: viewModel.currentSlideIndex) { buildTracks() }
    }

    // MARK: - Header

    private var timelineHeader: some View {
        HStack {
            Text("Timeline")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(.white)

            Spacer()

            Picker("Mode", selection: $viewModel.timelineMode) {
                Text("Simple").tag(TimelineMode.simple)
                Text("Avance").tag(TimelineMode.advanced)
            }
            .pickerStyle(.segmented)
            .frame(width: 160)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
    }

    // MARK: - Simple Mode

    private var simpleTimeline: some View {
        ScrollView(.vertical, showsIndicators: false) {
            LazyVStack(spacing: 2) {
                ForEach($tracks) { $track in
                    SimpleTrackRow(
                        track: $track,
                        totalDuration: slideTotalDuration,
                        onPlay: { playTrack(track) },
                        onTrackChanged: { syncTrackToModel($0) }
                    )
                    Divider()
                        .overlay(MeeshyColors.indigo900.opacity(0.5))
                        .padding(.horizontal, 12)
                }

                if tracks.isEmpty {
                    emptyState
                }
            }
        }
        .frame(maxHeight: 280)
    }

    // MARK: - Advanced Mode

    private var advancedTimeline: some View {
        VStack(spacing: 0) {
            transportBar

            ScrollView(.vertical, showsIndicators: false) {
                VStack(spacing: 1) {
                    timeAxis

                    ForEach($tracks) { $track in
                        advancedTrackRow(track: $track)
                    }

                    if tracks.isEmpty {
                        emptyState
                    }
                }
            }
            .frame(maxHeight: 320)
        }
    }

    // MARK: - Transport Bar

    private var transportBar: some View {
        HStack(spacing: 16) {
            Button(action: { playheadPosition = 0 }) {
                Image(systemName: "backward.end.fill")
                    .font(.system(size: 14))
            }

            Button(action: { isPlaying.toggle() }) {
                Image(systemName: isPlaying ? "pause.fill" : "play.fill")
                    .font(.system(size: 16))
            }

            Button(action: { playheadPosition = slideTotalDuration }) {
                Image(systemName: "forward.end.fill")
                    .font(.system(size: 14))
            }

            Spacer()

            Text(formatTime(playheadPosition))
                .font(.system(size: 12, weight: .medium, design: .monospaced))
                .foregroundStyle(.white)

            Text("/ \(formatTime(slideTotalDuration))")
                .font(.system(size: 12, design: .monospaced))
                .foregroundStyle(.secondary)
        }
        .foregroundStyle(.white)
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
    }

    // MARK: - Time Axis

    private var timeAxis: some View {
        GeometryReader { geo in
            let w = geo.size.width - 32
            let totalSec = max(1.0, slideTotalDuration)

            ZStack(alignment: .leading) {
                ForEach(0...Int(totalSec), id: \.self) { sec in
                    let x = 16 + (w * CGFloat(sec) / CGFloat(totalSec))
                    VStack(spacing: 1) {
                        Rectangle()
                            .fill(Color.secondary.opacity(0.4))
                            .frame(width: 1, height: sec % 5 == 0 ? 10 : 5)
                        if sec % 5 == 0 {
                            Text("\(sec)s")
                                .font(.system(size: 8, design: .monospaced))
                                .foregroundStyle(.secondary)
                        }
                    }
                    .position(x: x, y: 12)
                }

                // Draggable playhead
                Rectangle()
                    .fill(.white)
                    .frame(width: 2, height: 24)
                    .shadow(color: .white.opacity(0.5), radius: 3)
                    .position(
                        x: 16 + (w * CGFloat(playheadPosition / max(1, totalSec))),
                        y: 12
                    )
                    .gesture(
                        DragGesture()
                            .onChanged { val in
                                let pct = Float((val.location.x - 16) / w)
                                playheadPosition = max(0, min(totalSec, totalSec * pct))
                            }
                    )
            }
        }
        .frame(height: 28)
    }

    // MARK: - Advanced Track Row

    @ViewBuilder
    private func advancedTrackRow(track: Binding<TimelineTrack>) -> some View {
        let t = track.wrappedValue
        HStack(spacing: 6) {
            HStack(spacing: 3) {
                Image(systemName: t.type.icon)
                    .font(.system(size: 10))
                Text(t.name)
                    .font(.system(size: 10))
                    .lineLimit(1)
            }
            .foregroundStyle(t.type.color)
            .frame(width: 70, alignment: .leading)

            GeometryReader { geo in
                let w = geo.size.width
                let totalSec = max(1.0, slideTotalDuration)
                let startPct = CGFloat(t.startTime / totalSec)
                let durSec = t.duration ?? (totalSec - t.startTime)
                let durPct = CGFloat(durSec / totalSec)

                ZStack(alignment: .leading) {
                    Rectangle()
                        .fill(Color.secondary.opacity(0.08))
                        .frame(height: 28)

                    trackBar(track: t, barWidth: max(12, w * durPct), durSec: durSec, durPct: durPct, totalWidth: w)
                        .offset(x: w * startPct)
                        .gesture(
                            DragGesture()
                                .onChanged { val in
                                    let newStart = Float(val.location.x / w) * totalSec
                                    let maxStart = totalSec - (t.duration ?? 1)
                                    track.wrappedValue.startTime = max(0, min(maxStart, newStart))
                                }
                                .onEnded { _ in
                                    syncTrackToModel(track.wrappedValue)
                                }
                        )

                    // Playhead line overlay
                    let playheadX = CGFloat(playheadPosition / max(1, totalSec)) * w
                    Rectangle()
                        .fill(.white.opacity(0.6))
                        .frame(width: 1, height: 28)
                        .offset(x: playheadX)
                        .allowsHitTesting(false)
                }
            }
            .frame(height: 28)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 2)
    }

    // MARK: - Track Bar (with fade gradients)

    private func trackBar(track t: TimelineTrack, barWidth: CGFloat, durSec: Float, durPct: CGFloat, totalWidth: CGFloat) -> some View {
        HStack(spacing: 0) {
            if let fi = t.fadeIn, fi > 0, durSec > 0 {
                LinearGradient(
                    colors: [t.type.color.opacity(0.2), t.type.color],
                    startPoint: .leading,
                    endPoint: .trailing
                )
                .frame(width: max(4, barWidth * CGFloat(fi / durSec)))
            }

            Rectangle().fill(t.type.color)

            if let fo = t.fadeOut, fo > 0, durSec > 0 {
                LinearGradient(
                    colors: [t.type.color, t.type.color.opacity(0.2)],
                    startPoint: .leading,
                    endPoint: .trailing
                )
                .frame(width: max(4, barWidth * CGFloat(fo / durSec)))
            }
        }
        .frame(width: barWidth, height: 28)
        .clipShape(RoundedRectangle(cornerRadius: 4))
    }

    // MARK: - Empty State

    private var emptyState: some View {
        VStack(spacing: 8) {
            Image(systemName: "timeline.selection")
                .font(.system(size: 24))
                .foregroundStyle(MeeshyColors.indigo400.opacity(0.6))

            Text("Aucun element")
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(.secondary)

            Text("Ajoutez du contenu pour voir la timeline")
                .font(.system(size: 11))
                .foregroundStyle(.secondary.opacity(0.7))
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 24)
    }

    // MARK: - Build Tracks

    private func buildTracks() {
        var result: [TimelineTrack] = []
        let effects = viewModel.currentEffects

        // Background video
        if let bgVid = effects.mediaObjects?.first(where: { $0.placement == "background" && $0.mediaType == "video" }) {
            result.append(TimelineTrack(
                id: bgVid.id,
                name: "Video BG",
                type: .bgVideo,
                startTime: bgVid.startTime ?? 0,
                duration: bgVid.duration,
                volume: bgVid.volume,
                loop: bgVid.loop ?? false,
                fadeIn: bgVid.fadeIn,
                fadeOut: bgVid.fadeOut
            ))
        }

        // Background audio
        if effects.backgroundAudioId != nil {
            result.append(TimelineTrack(
                id: "bg-audio",
                name: "Audio BG",
                type: .bgAudio,
                startTime: Float(effects.backgroundAudioStart ?? 0),
                duration: effects.backgroundAudioEnd.map { Float($0) },
                volume: effects.backgroundAudioVolume ?? 1.0,
                loop: true,
                fadeIn: nil,
                fadeOut: nil
            ))
        }

        // Background audio player objects
        for bgAudio in effects.audioPlayerObjects?.filter({ $0.placement == "background" }) ?? [] {
            result.append(TimelineTrack(
                id: bgAudio.id,
                name: "Audio BG",
                type: .bgAudio,
                startTime: bgAudio.startTime ?? 0,
                duration: bgAudio.duration,
                volume: bgAudio.volume,
                loop: bgAudio.loop ?? true,
                fadeIn: bgAudio.fadeIn,
                fadeOut: bgAudio.fadeOut
            ))
        }

        // Text objects
        for text in effects.textObjects ?? [] {
            let truncated = String(text.content.prefix(12))
            let suffix = text.content.count > 12 ? "..." : ""
            result.append(TimelineTrack(
                id: text.id,
                name: truncated + suffix,
                type: .text,
                startTime: text.startTime ?? 0,
                duration: text.displayDuration,
                volume: nil,
                loop: false,
                fadeIn: text.fadeIn,
                fadeOut: text.fadeOut
            ))
        }

        // Foreground videos
        for vid in effects.mediaObjects?.filter({ $0.placement == "foreground" && $0.mediaType == "video" }) ?? [] {
            result.append(TimelineTrack(
                id: vid.id,
                name: "Video",
                type: .fgVideo,
                startTime: vid.startTime ?? 0,
                duration: vid.duration,
                volume: vid.volume,
                loop: vid.loop ?? false,
                fadeIn: vid.fadeIn,
                fadeOut: vid.fadeOut
            ))
        }

        // Foreground audios
        for aud in effects.audioPlayerObjects?.filter({ $0.placement == "foreground" }) ?? [] {
            result.append(TimelineTrack(
                id: aud.id,
                name: "Audio",
                type: .fgAudio,
                startTime: aud.startTime ?? 0,
                duration: aud.duration,
                volume: aud.volume,
                loop: aud.loop ?? false,
                fadeIn: aud.fadeIn,
                fadeOut: aud.fadeOut
            ))
        }

        tracks = result
    }

    // MARK: - Sync Track to Model

    private func syncTrackToModel(_ track: TimelineTrack) {
        var effects = viewModel.currentEffects

        // Legacy background audio track (uses backgroundAudio* fields, not an object)
        if track.id == "bg-audio" {
            effects.backgroundAudioVolume = track.volume
            effects.backgroundAudioStart = TimeInterval(track.startTime)
            if let dur = track.duration {
                effects.backgroundAudioEnd = TimeInterval(dur)
            }
            viewModel.currentEffects = effects
            return
        }

        // Text objects
        if let idx = effects.textObjects?.firstIndex(where: { $0.id == track.id }) {
            effects.textObjects?[idx].startTime = track.startTime
            effects.textObjects?[idx].displayDuration = track.duration
            effects.textObjects?[idx].fadeIn = track.fadeIn
            effects.textObjects?[idx].fadeOut = track.fadeOut
            viewModel.currentEffects = effects
            return
        }

        // Media objects (background video, foreground video/image)
        if let idx = effects.mediaObjects?.firstIndex(where: { $0.id == track.id }) {
            let currentVolume = effects.mediaObjects![idx].volume
            effects.mediaObjects?[idx].startTime = track.startTime
            effects.mediaObjects?[idx].duration = track.duration
            effects.mediaObjects?[idx].volume = track.volume ?? currentVolume
            effects.mediaObjects?[idx].loop = track.loop
            effects.mediaObjects?[idx].fadeIn = track.fadeIn
            effects.mediaObjects?[idx].fadeOut = track.fadeOut
            viewModel.currentEffects = effects
            return
        }

        // Audio player objects
        if let idx = effects.audioPlayerObjects?.firstIndex(where: { $0.id == track.id }) {
            let currentVolume = effects.audioPlayerObjects![idx].volume
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

    // MARK: - Playback

    private func playTrack(_ track: TimelineTrack) {
        // Individual playback -- will be wired to AVPlayer/AVAudioPlayer in a future task
    }

    // MARK: - Helpers

    private var slideTotalDuration: Float {
        Float(viewModel.currentSlide.duration)
    }

    private func formatTime(_ seconds: Float) -> String {
        let m = Int(seconds) / 60
        let s = Int(seconds) % 60
        return String(format: "%d:%02d", m, s)
    }
}
