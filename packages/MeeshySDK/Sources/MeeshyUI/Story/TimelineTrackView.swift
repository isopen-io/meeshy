import SwiftUI
import MeeshySDK

// MARK: - Track Type

enum TrackType {
    case bgVideo, bgAudio, fgVideo, fgAudio, text

    var icon: String {
        switch self {
        case .bgVideo: return "tv.fill"
        case .bgAudio: return "music.note"
        case .fgVideo: return "video.fill"
        case .fgAudio: return "waveform"
        case .text:    return "textformat"
        }
    }

    var color: Color {
        switch self {
        case .bgVideo: return MeeshyColors.indigo700
        case .bgAudio: return MeeshyColors.indigo600
        case .text:    return MeeshyColors.indigo200
        case .fgVideo: return MeeshyColors.indigo400
        case .fgAudio: return MeeshyColors.indigo300
        }
    }
}

// MARK: - Track Data

struct TimelineTrack: Identifiable {
    let id: String
    let name: String
    let type: TrackType
    var startTime: Float
    var duration: Float?
    var volume: Float?
    var loop: Bool
    var fadeIn: Float?
    var fadeOut: Float?
}

// MARK: - Simple Track Row

struct SimpleTrackRow: View {
    @Binding var track: TimelineTrack
    let totalDuration: Float
    var onPlay: (() -> Void)?
    var onTrackChanged: ((TimelineTrack) -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Image(systemName: track.type.icon)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(track.type.color)
                    .frame(width: 20)

                Text(track.name)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(.white)
                    .lineLimit(1)

                Spacer()

                if track.type != .text {
                    Button(action: { onPlay?() }) {
                        Image(systemName: "play.fill")
                            .font(.system(size: 10))
                            .foregroundStyle(.white)
                            .frame(width: 24, height: 24)
                            .background(track.type.color.opacity(0.8))
                            .clipShape(Circle())
                    }
                    .buttonStyle(.plain)
                }

                if track.type != .text {
                    Button {
                        track.loop.toggle()
                        onTrackChanged?(track)
                    } label: {
                        Image(systemName: "repeat")
                            .font(.system(size: 11))
                            .foregroundStyle(track.loop ? track.type.color : .secondary)
                    }
                    .buttonStyle(.plain)
                }
            }

            timingBar

            timingLabels

            volumeSlider
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }

    // MARK: - Timing Bar

    private var timingBar: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let safeDuration = max(0.01, totalDuration)
            let startPct = CGFloat(track.startTime / safeDuration)
            let durSec = track.duration ?? (safeDuration - track.startTime)
            let durPct = CGFloat(durSec / safeDuration)

            ZStack(alignment: .leading) {
                Capsule()
                    .fill(Color.secondary.opacity(0.15))
                    .frame(height: 8)

                Capsule()
                    .fill(track.type.color)
                    .frame(width: max(12, w * durPct), height: 8)
                    .offset(x: w * startPct)
            }
        }
        .frame(height: 8)
    }

    // MARK: - Timing Labels

    private var timingLabels: some View {
        HStack {
            Text(formatTime(track.startTime))
                .font(.system(size: 10, design: .monospaced))
                .foregroundStyle(.secondary)

            Spacer()

            if let dur = track.duration {
                Text(formatTime(track.startTime + dur))
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundStyle(.secondary)
            }
        }
    }

    // MARK: - Volume Slider

    @ViewBuilder
    private var volumeSlider: some View {
        if let vol = track.volume, track.type != .text {
            HStack(spacing: 6) {
                Image(systemName: "speaker.fill")
                    .font(.system(size: 10))
                    .foregroundStyle(.secondary)

                Slider(
                    value: Binding(
                        get: { Double(vol) },
                        set: {
                            track.volume = Float($0)
                            onTrackChanged?(track)
                        }
                    ),
                    in: 0...1
                )
                .tint(track.type.color)

                Text("\(Int(vol * 100))%")
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundStyle(.secondary)
                    .frame(width: 32)
            }
        }
    }

    // MARK: - Formatting

    private func formatTime(_ seconds: Float) -> String {
        let m = Int(seconds) / 60
        let s = Int(seconds) % 60
        let ms = Int((seconds - Float(Int(seconds))) * 10)
        return String(format: "%d:%02d.%d", m, s, ms)
    }
}
