import SwiftUI

public struct AudioClipBar: View, Equatable {

    // MARK: - SOTA P7: Equatable (excludes closures — visual props only)
    public static func == (lhs: AudioClipBar, rhs: AudioClipBar) -> Bool {
        lhs.clipId == rhs.clipId
            && lhs.title == rhs.title
            && lhs.startTime == rhs.startTime
            && lhs.duration == rhs.duration
            && lhs.volume == rhs.volume
            && lhs.isMuted == rhs.isMuted
            && lhs.isSelected == rhs.isSelected
            && lhs.isLocked == rhs.isLocked
            && lhs.isDark == rhs.isDark
            && lhs.geometry == rhs.geometry
            && lhs.laneHeight == rhs.laneHeight
            && lhs.waveformSamples == rhs.waveformSamples
    }

    public let clipId: String
    public let title: String
    public let startTime: Float
    public let duration: Float
    public let volume: Float
    public let isMuted: Bool
    public let isSelected: Bool
    public let isLocked: Bool
    public let isDark: Bool
    public let geometry: TimelineGeometry
    public let laneHeight: CGFloat
    public let waveformSamples: [Float]
    public let onTap: () -> Void
    public let onDoubleTap: () -> Void
    public let onLongPress: () -> Void
    public let onMoveDelta: (CGFloat) -> Void
    /// Fired when the move drag ends so the caller can commit the move as
    /// an undoable command and clear the in-flight drag state. Without this
    /// the drift snowballs across frames because each `onChanged` re-reads
    /// the (already-mutated) clip start. Mirrors `VideoClipBar.onMoveEnded`.
    public let onMoveEnded: () -> Void

    public init(
        clipId: String, title: String, startTime: Float, duration: Float,
        volume: Float, isMuted: Bool, isSelected: Bool, isLocked: Bool,
        isDark: Bool, geometry: TimelineGeometry, laneHeight: CGFloat,
        waveformSamples: [Float],
        onTap: @escaping () -> Void,
        onDoubleTap: @escaping () -> Void,
        onLongPress: @escaping () -> Void,
        onMoveDelta: @escaping (CGFloat) -> Void,
        onMoveEnded: @escaping () -> Void = {}
    ) {
        self.clipId = clipId; self.title = title
        self.startTime = startTime; self.duration = duration
        self.volume = volume; self.isMuted = isMuted
        self.isSelected = isSelected; self.isLocked = isLocked
        self.isDark = isDark; self.geometry = geometry
        self.laneHeight = laneHeight; self.waveformSamples = waveformSamples
        self.onTap = onTap; self.onDoubleTap = onDoubleTap
        self.onLongPress = onLongPress; self.onMoveDelta = onMoveDelta
        self.onMoveEnded = onMoveEnded
    }

    public var accessibilityComposed: String {
        String(format: String(localized: "story.timeline.a11y.clip.audio", bundle: .module), title)
    }

    public var accessibilityValueDescription: String {
        let pct = Int((volume * 100).rounded())
        let muted = isMuted
            ? String(localized: "story.timeline.a11y.audio.muted_suffix", bundle: .module)
            : ""
        return "Volume \(pct)%\(muted)"
    }

    public var body: some View {
        ZStack(alignment: .leading) {
            Rectangle()
                .fill(MeeshyColors.warning.opacity(isDark ? 0.32 : 0.22))
            waveform
            if isMuted { muteBadge }
            if isSelected {
                RoundedRectangle(cornerRadius: 6).stroke(MeeshyColors.indigo400, lineWidth: 2)
                    .allowsHitTesting(false)
            }
        }
        .frame(width: geometry.width(for: duration), height: laneHeight - 4)
        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
        .offset(x: geometry.x(for: startTime))
        .contentShape(Rectangle())
        .onTapGesture(count: 2) { onDoubleTap() }
        .onTapGesture { onTap() }
        .onLongPressGesture(minimumDuration: 0.4) { onLongPress() }
        .gesture(
            DragGesture(minimumDistance: 4)
                .onChanged { v in if !isLocked { onMoveDelta(v.translation.width) } }
                .onEnded { _ in if !isLocked { onMoveEnded() } }
        )
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityComposed)
        .accessibilityValue(accessibilityValueDescription)
    }

    private var waveform: some View {
        GeometryReader { geo in
            // Empty waveform → render nothing. Previously this used
            // `max(samples.count, 1)` + ForEach(0..<count) which then
            // dereferenced samples[0] and crashed with
            // 'Index out of range' on any audio clip that hadn't yet
            // had its waveform extracted. iterating samples.indices
            // is correct for any count including 0.
            if !waveformSamples.isEmpty {
                let count = waveformSamples.count
                let stepX = geo.size.width / CGFloat(count)
                HStack(alignment: .center, spacing: 1) {
                    ForEach(waveformSamples.indices, id: \.self) { i in
                        let amp = CGFloat(waveformSamples[i])
                        Capsule()
                            .fill(Color.white.opacity(0.85))
                            .frame(width: max(1, stepX - 1),
                                   height: max(2, amp * (geo.size.height - 6)))
                    }
                }
                .frame(maxHeight: .infinity, alignment: .center)
            }
        }
        .padding(.horizontal, 3)
        .drawingGroup()   // SOTA P7: bake to Metal layer, skip re-stroke when props unchanged
        .accessibilityHidden(true)
    }

    private var muteBadge: some View {
        Image(systemName: "speaker.slash.fill")
            .font(.caption2)
            .padding(4)
            .background(Circle().fill(Color.black.opacity(0.6)))
            .foregroundStyle(Color.white)
            .padding(4)
            .accessibilityHidden(true)
    }
}
