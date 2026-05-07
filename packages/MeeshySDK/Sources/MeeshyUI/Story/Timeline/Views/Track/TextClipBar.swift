import SwiftUI

public struct TextClipBar: View, Equatable {

    // MARK: - SOTA P7: Equatable (excludes closures — visual props only)
    public static func == (lhs: TextClipBar, rhs: TextClipBar) -> Bool {
        lhs.clipId == rhs.clipId
            && lhs.content == rhs.content
            && lhs.startTime == rhs.startTime
            && lhs.duration == rhs.duration
            && lhs.isSelected == rhs.isSelected
            && lhs.isLocked == rhs.isLocked
            && lhs.isDark == rhs.isDark
            && lhs.geometry == rhs.geometry
            && lhs.laneHeight == rhs.laneHeight
    }

    public let clipId: String
    public let content: String
    public let startTime: Float
    public let duration: Float
    public let isSelected: Bool
    public let isLocked: Bool
    public let isDark: Bool
    public let geometry: TimelineGeometry
    public let laneHeight: CGFloat
    public let onTap: () -> Void
    public let onDoubleTap: () -> Void
    public let onLongPress: () -> Void
    public let onMoveDelta: (CGFloat) -> Void

    public init(
        clipId: String, content: String, startTime: Float, duration: Float,
        isSelected: Bool, isLocked: Bool, isDark: Bool,
        geometry: TimelineGeometry, laneHeight: CGFloat,
        onTap: @escaping () -> Void,
        onDoubleTap: @escaping () -> Void,
        onLongPress: @escaping () -> Void,
        onMoveDelta: @escaping (CGFloat) -> Void
    ) {
        self.clipId = clipId; self.content = content
        self.startTime = startTime; self.duration = duration
        self.isSelected = isSelected; self.isLocked = isLocked
        self.isDark = isDark; self.geometry = geometry
        self.laneHeight = laneHeight
        self.onTap = onTap; self.onDoubleTap = onDoubleTap
        self.onLongPress = onLongPress; self.onMoveDelta = onMoveDelta
    }

    public static func previewSnippet(_ s: String, maxLength: Int) -> String {
        s.count > maxLength ? String(s.prefix(maxLength)) : s
    }

    public var accessibilityComposed: String {
        String(format: String(localized: "story.timeline.a11y.clip.text", bundle: .module),
               Self.previewSnippet(content, maxLength: 40))
    }

    public var body: some View {
        ZStack(alignment: .leading) {
            Rectangle().fill(MeeshyColors.error.opacity(isDark ? 0.32 : 0.22))
            HStack {
                Image(systemName: "textformat")
                    .font(.caption2)
                    .foregroundStyle(.white)
                    .accessibilityHidden(true)
                Text(Self.previewSnippet(content, maxLength: 24))
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 6)
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
        )
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityComposed)
        .accessibilityValue("Affiché de \(String(format: "%.1f", startTime))s à \(String(format: "%.1f", startTime + duration))s")
    }
}
