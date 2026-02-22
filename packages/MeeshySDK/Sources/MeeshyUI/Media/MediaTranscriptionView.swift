import SwiftUI
import MeeshySDK

// MARK: - Transcription View (synchronized, speaker-colored)

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
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(Array(segments.enumerated()), id: \.element.id) { index, segment in
                        segmentRow(segment, index: index)
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
            }
            .frame(maxHeight: maxHeight)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(isDark ? Color.white.opacity(0.04) : Color.black.opacity(0.02))
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.04), lineWidth: 0.5)
                    )
            )
            .onChange(of: activeIndex) { idx in
                if let idx = idx {
                    withAnimation(.easeInOut(duration: 0.3)) {
                        proxy.scrollTo(segments[idx].id, anchor: .center)
                    }
                }
            }
        }
    }

    // MARK: - Segment Row
    @ViewBuilder
    private func segmentRow(_ segment: TranscriptionDisplaySegment, index: Int) -> some View {
        let isActive = index == activeIndex
        let speakerColor = Color(hex: segment.speakerColor)

        Button {
            onSeek?(segment.startTime)
            HapticFeedback.light()
        } label: {
            HStack(alignment: .top, spacing: 8) {
                RoundedRectangle(cornerRadius: 2)
                    .fill(speakerColor.opacity(isActive ? 1 : 0.4))
                    .frame(width: 3)

                VStack(alignment: .leading, spacing: 2) {
                    if let sid = segment.speakerId,
                       index == 0 || segments[index - 1].speakerId != sid {
                        Text("Locuteur \(sid)")
                            .font(.system(size: 9, weight: .bold))
                            .foregroundColor(speakerColor)
                            .textCase(.uppercase)
                    }

                    Text(segment.text)
                        .font(.system(size: 13, weight: isActive ? .semibold : .regular))
                        .foregroundColor(
                            isActive
                            ? (isDark ? .white : .black)
                            : (isDark ? .white.opacity(0.6) : .black.opacity(0.5))
                        )
                        .fixedSize(horizontal: false, vertical: true)
                }

                Spacer(minLength: 0)

                Text(formatMediaDuration(segment.startTime))
                    .font(.system(size: 9, weight: .medium, design: .monospaced))
                    .foregroundColor(isDark ? .white.opacity(0.3) : .black.opacity(0.2))
            }
            .padding(.vertical, 4)
            .padding(.horizontal, 6)
            .background(
                RoundedRectangle(cornerRadius: 8)
                    .fill(isActive ? speakerColor.opacity(isDark ? 0.12 : 0.06) : Color.clear)
            )
            .id(segment.id)
        }
        .buttonStyle(.plain)
        .animation(.easeInOut(duration: 0.2), value: isActive)
    }
}
