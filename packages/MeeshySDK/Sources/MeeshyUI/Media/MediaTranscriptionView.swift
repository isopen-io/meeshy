import SwiftUI
import MeeshySDK

// MARK: - Flow Layout (text-like wrapping)

struct FlowLayout: Layout {
    var spacing: CGFloat = 0

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let result = arrangeSubviews(proposal: proposal, subviews: subviews)
        return result.size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = arrangeSubviews(
            proposal: ProposedViewSize(width: bounds.width, height: nil),
            subviews: subviews
        )
        for (index, position) in result.positions.enumerated() {
            subviews[index].place(
                at: CGPoint(x: bounds.minX + position.x, y: bounds.minY + position.y),
                proposal: .unspecified
            )
        }
    }

    private func arrangeSubviews(
        proposal: ProposedViewSize,
        subviews: Subviews
    ) -> (size: CGSize, positions: [CGPoint]) {
        let maxWidth = proposal.width ?? .infinity
        var positions: [CGPoint] = []
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > maxWidth && x > 0 {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            positions.append(CGPoint(x: x, y: y))
            rowHeight = max(rowHeight, size.height)
            x += size.width
        }

        return (CGSize(width: maxWidth, height: y + rowHeight), positions)
    }
}

// MARK: - Transcription View (synchronized, flow text with colored segments)

public struct MediaTranscriptionView: View {
    public let segments: [TranscriptionDisplaySegment]
    public let currentTime: Double
    public var accentColor: String = "08D9D6"
    public var maxHeight: CGFloat = 200
    public var onSeek: ((Double) -> Void)? = nil

    @ObservedObject private var theme = ThemeManager.shared
    private var isDark: Bool { theme.mode.isDark }

    public init(segments: [TranscriptionDisplaySegment], currentTime: Double,
                accentColor: String = "08D9D6", maxHeight: CGFloat = 200,
                onSeek: ((Double) -> Void)? = nil) {
        self.segments = segments; self.currentTime = currentTime
        self.accentColor = accentColor; self.maxHeight = maxHeight; self.onSeek = onSeek
    }

    private var activeIndex: Int? {
        segments.firstIndex { currentTime >= $0.startTime && currentTime < $0.endTime }
    }

    public var body: some View {
        ScrollViewReader { proxy in
            ScrollView(.vertical, showsIndicators: false) {
                flowTranscription
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
            }
            .frame(maxHeight: maxHeight)
            .background(transcriptionBackground)
            .onChange(of: activeIndex) { idx in
                if let idx = idx {
                    withAnimation(.easeInOut(duration: 0.3)) {
                        proxy.scrollTo("segment-\(idx)", anchor: .center)
                    }
                }
            }
        }
    }

    // MARK: - Flow Transcription

    private var flowTranscription: some View {
        FlowLayout(spacing: 0) {
            ForEach(Array(segments.enumerated()), id: \.element.id) { index, segment in
                segmentSpan(segment, index: index)
                    .id("segment-\(index)")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func segmentSpan(_ segment: TranscriptionDisplaySegment, index: Int) -> some View {
        let isActive = index == activeIndex
        let isPast = activeIndex != nil && index < activeIndex!

        return Button {
            onSeek?(segment.startTime)
            HapticFeedback.light()
        } label: {
            Text(segment.text + " ")
                .font(.system(size: 14, weight: isActive ? .bold : .regular))
                .foregroundColor(segmentColor(isActive: isActive, isPast: isPast))
                .padding(.horizontal, isActive ? 2 : 0)
                .padding(.vertical, isActive ? 1 : 0)
                .background(
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color(hex: accentColor).opacity(isActive ? 0.12 : 0))
                )
        }
        .buttonStyle(.plain)
        .animation(.easeInOut(duration: 0.15), value: isActive)
    }

    // MARK: - Colors

    private func segmentColor(isActive: Bool, isPast: Bool) -> Color {
        if isActive {
            return Color(hex: accentColor)
        }
        if isPast {
            return isDark ? Color.white.opacity(0.7) : Color.black.opacity(0.6)
        }
        return isDark ? Color.white.opacity(0.35) : Color.black.opacity(0.25)
    }

    private var transcriptionBackground: some View {
        RoundedRectangle(cornerRadius: 12)
            .fill(isDark ? Color.white.opacity(0.04) : Color.black.opacity(0.02))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.04), lineWidth: 0.5)
            )
    }
}
