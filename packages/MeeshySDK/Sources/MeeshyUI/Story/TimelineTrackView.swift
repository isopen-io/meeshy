import SwiftUI
import MeeshySDK

// MARK: - Track Type

enum TrackType: String {
    case bgVideo, bgImage, bgAudio, fgImage, fgVideo, fgAudio, text

    var icon: String {
        switch self {
        case .bgVideo:  return "tv.fill"
        case .bgImage:  return "photo.fill"
        case .bgAudio:  return "music.note"
        case .fgImage:  return "photo"
        case .fgVideo:  return "video.fill"
        case .fgAudio:  return "waveform"
        case .text:     return "textformat"
        }
    }

    var color: Color {
        switch self {
        case .bgVideo:  return MeeshyColors.indigo700
        case .bgImage:  return MeeshyColors.indigo600
        case .bgAudio:  return MeeshyColors.indigo500
        case .fgImage:  return MeeshyColors.indigo400
        case .fgVideo:  return MeeshyColors.indigo400
        case .fgAudio:  return MeeshyColors.indigo300
        case .text:     return MeeshyColors.indigo200
        }
    }

    var sortOrder: Int {
        switch self {
        case .bgVideo:  return 0
        case .bgImage:  return 1
        case .bgAudio:  return 2
        case .fgImage:  return 3
        case .fgVideo:  return 4
        case .fgAudio:  return 5
        case .text:     return 6
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
    var waveformSamples: [Float]?
    var videoURL: URL?
}

// MARK: - Timeline Track Bar

struct TimelineTrackBar: View {
    @Binding var track: TimelineTrack
    let totalDuration: Float
    let pixelsPerSecond: CGFloat
    let isSelected: Bool
    var onSelect: () -> Void
    var onChanged: (TimelineTrack) -> Void
    var onDetailTap: () -> Void

    @Environment(\.theme) private var theme
    @State private var videoFrames: [UIImage] = []
    @State private var dragStartValue: Float = 0
    @State private var dragStartDuration: Float = 0

    private let trackHeight: CGFloat = 44
    private let handleWidth: CGFloat = 20

    var body: some View {
        let totalWidth = CGFloat(totalDuration) * pixelsPerSecond
        let barStartX = CGFloat(track.startTime) * pixelsPerSecond
        let durSec = track.duration ?? (totalDuration - track.startTime)
        let barWidth = max(handleWidth * 2 + 4, CGFloat(durSec) * pixelsPerSecond)

        ZStack(alignment: .leading) {
            Rectangle()
                .fill(theme.textPrimary.opacity(0.02))
                .frame(width: totalWidth, height: trackHeight)

            trackBarContent(barWidth: barWidth, durSec: durSec)
                .frame(width: barWidth, height: trackHeight)
                .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .fill(
                            LinearGradient(
                                colors: [theme.textPrimary.opacity(0.08), Color.clear],
                                startPoint: .top, endPoint: .center
                            )
                        )
                        .allowsHitTesting(false)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .strokeBorder(
                            isSelected ? MeeshyColors.brandPrimary : theme.textPrimary.opacity(0.1),
                            lineWidth: isSelected ? 1.5 : 0.5
                        )
                )
                .shadow(
                    color: isSelected ? MeeshyColors.indigo500.opacity(0.3) : .clear,
                    radius: isSelected ? 6 : 0,
                    y: isSelected ? 2 : 0
                )
                .overlay(dragHandles(barWidth: barWidth))
                .offset(x: barStartX)
                .gesture(centerDragGesture)
                .onTapGesture { onSelect() }
                .onLongPressGesture(minimumDuration: 0.3) { onDetailTap() }
        }
        .frame(height: trackHeight)
        .task(id: track.videoURL) {
            guard let url = track.videoURL,
                  track.type == .fgVideo || track.type == .bgVideo else { return }
            videoFrames = await VideoFrameExtractor.shared.extractFrames(
                objectId: track.id, url: url
            )
        }
    }

    // MARK: - Track Bar Content

    @ViewBuilder
    private func trackBarContent(barWidth: CGFloat, durSec: Float) -> some View {
        ZStack {
            track.type.color.opacity(0.5)

            if (track.type == .fgVideo || track.type == .bgVideo), !videoFrames.isEmpty {
                videoFrameStrip(barWidth: barWidth)
            }

            if track.type == .fgImage || track.type == .bgImage {
                HStack(spacing: 3) {
                    Image(systemName: track.type.icon)
                        .font(.system(size: 8, weight: .medium))
                        .foregroundStyle(theme.textMuted)
                    Text(track.name)
                        .font(.system(size: 10, weight: .medium))
                        .foregroundStyle(theme.textPrimary)
                        .lineLimit(1)
                }
                .padding(.leading, handleWidth + 4)
                .frame(maxWidth: .infinity, alignment: .leading)
            }

            if (track.type == .fgAudio || track.type == .bgAudio),
               let samples = track.waveformSamples, !samples.isEmpty {
                ZStack {
                    track.type.color.opacity(0.15)
                    waveformView(samples: samples)
                }
            }

            if track.type == .text {
                HStack(spacing: 3) {
                    Image(systemName: "clock")
                        .font(.system(size: 8, weight: .medium))
                        .foregroundStyle(theme.textMuted)
                    Text(track.name)
                        .font(.system(size: 10, weight: .medium))
                        .foregroundStyle(theme.textPrimary)
                        .lineLimit(1)
                }
                .padding(.leading, handleWidth + 4)
                .frame(maxWidth: .infinity, alignment: .leading)
            }

            fadeOverlays(barWidth: barWidth, durSec: durSec)
        }
    }

    // MARK: - Video Frame Strip

    private func videoFrameStrip(barWidth: CGFloat) -> some View {
        HStack(spacing: 0) {
            ForEach(Array(videoFrames.enumerated()), id: \.offset) { _, frame in
                Image(uiImage: frame)
                    .resizable()
                    .scaledToFill()
                    .frame(
                        width: max(1, barWidth / CGFloat(max(1, videoFrames.count))),
                        height: trackHeight
                    )
                    .clipped()
            }
        }
        .opacity(0.7)
    }

    // MARK: - Waveform View

    private func waveformView(samples: [Float]) -> some View {
        Canvas { context, size in
            let count = samples.count
            guard count > 0 else { return }
            let stepW = size.width / CGFloat(count)
            let midY = size.height / 2

            var path = Path()
            for (i, sample) in samples.enumerated() {
                let x = CGFloat(i) * stepW + stepW / 2
                let amp = CGFloat(sample) * midY * 0.8
                path.move(to: CGPoint(x: x, y: midY - amp))
                path.addLine(to: CGPoint(x: x, y: midY + amp))
            }
            context.stroke(path, with: .color(theme.textSecondary), lineWidth: 1.5)
        }
        .allowsHitTesting(false)
    }

    // MARK: - Fade Overlays

    @ViewBuilder
    private func fadeOverlays(barWidth: CGFloat, durSec: Float) -> some View {
        HStack(spacing: 0) {
            if let fi = track.fadeIn, fi > 0, durSec > 0 {
                LinearGradient(
                    colors: [Color.black.opacity(0.5), .clear],
                    startPoint: .leading, endPoint: .trailing
                )
                .frame(width: max(4, barWidth * CGFloat(fi / durSec)))
            }
            Spacer(minLength: 0)
            if let fo = track.fadeOut, fo > 0, durSec > 0 {
                LinearGradient(
                    colors: [.clear, Color.black.opacity(0.5)],
                    startPoint: .leading, endPoint: .trailing
                )
                .frame(width: max(4, barWidth * CGFloat(fo / durSec)))
            }
        }
        .allowsHitTesting(false)
    }

    // MARK: - Drag Handles

    private func dragHandles(barWidth: CGFloat) -> some View {
        HStack(spacing: 0) {
            RoundedRectangle(cornerRadius: 2)
                .fill(theme.textPrimary.opacity(isSelected ? 0.9 : 0.5))
                .frame(width: 6, height: 20)
                .frame(width: handleWidth, height: trackHeight)
                .contentShape(Rectangle())
                .gesture(leftHandleDrag)

            Spacer()

            RoundedRectangle(cornerRadius: 2)
                .fill(theme.textPrimary.opacity(isSelected ? 0.9 : 0.5))
                .frame(width: 6, height: 20)
                .frame(width: handleWidth, height: trackHeight)
                .contentShape(Rectangle())
                .gesture(rightHandleDrag)
        }
    }

    // MARK: - Gestures

    private var leftHandleDrag: some Gesture {
        DragGesture(minimumDistance: 2)
            .onChanged { value in
                let delta = Float(value.translation.width / pixelsPerSecond)
                let currentEnd = dragStartValue + (dragStartDuration > 0 ? dragStartDuration : (totalDuration - dragStartValue))
                let newStart = max(0, dragStartValue + delta)
                let newDur = currentEnd - newStart
                guard newDur >= 0.5 else { return }
                track.startTime = newStart
                track.duration = newDur
            }
            .onEnded { _ in onChanged(track) }
            .simultaneously(with: DragGesture(minimumDistance: 0)
                .onChanged { _ in
                    if dragStartValue == 0 && dragStartDuration == 0 {
                        dragStartValue = track.startTime
                        dragStartDuration = track.duration ?? (totalDuration - track.startTime)
                    }
                }
                .onEnded { _ in dragStartValue = 0; dragStartDuration = 0 }
            )
    }

    private var rightHandleDrag: some Gesture {
        DragGesture(minimumDistance: 2)
            .onChanged { value in
                let delta = Float(value.translation.width / pixelsPerSecond)
                let baseDur = dragStartDuration > 0 ? dragStartDuration : (totalDuration - track.startTime)
                let newDur = max(0.5, baseDur + delta)
                track.duration = min(newDur, totalDuration - track.startTime)
            }
            .onEnded { _ in onChanged(track) }
            .simultaneously(with: DragGesture(minimumDistance: 0)
                .onChanged { _ in
                    if dragStartDuration == 0 {
                        dragStartDuration = track.duration ?? (totalDuration - track.startTime)
                    }
                }
                .onEnded { _ in dragStartDuration = 0 }
            )
    }

    private var centerDragGesture: some Gesture {
        DragGesture(minimumDistance: 6)
            .onChanged { value in
                let delta = Float(value.translation.width / pixelsPerSecond)
                let dur = track.duration ?? (totalDuration - track.startTime)
                let newStart = max(0, min(totalDuration - dur, dragStartValue + delta))
                track.startTime = newStart
            }
            .onEnded { _ in onChanged(track) }
            .simultaneously(with: DragGesture(minimumDistance: 0)
                .onChanged { _ in
                    if dragStartValue == 0 { dragStartValue = track.startTime }
                }
                .onEnded { _ in dragStartValue = 0 }
            )
    }
}

// MARK: - Track Label

struct TrackLabel: View {
    let track: TimelineTrack
    let isSelected: Bool
    @Environment(\.theme) private var theme

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: track.type.icon)
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(track.type.color)
            Text(track.name)
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(isSelected ? theme.textPrimary : theme.textSecondary)
                .lineLimit(1)
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 4)
        .frame(width: 72, alignment: .leading)
        .background(
            Capsule()
                .fill(isSelected ? MeeshyColors.indigo900.opacity(0.5) : Color.clear)
        )
    }
}
