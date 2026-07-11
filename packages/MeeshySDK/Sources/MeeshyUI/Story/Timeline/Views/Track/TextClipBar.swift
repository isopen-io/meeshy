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
    /// Fired when the move drag ends so the caller can commit the move as
    /// an undoable command and clear the in-flight drag state. Without this
    /// the drift snowballs across frames because each `onChanged` re-reads
    /// the (already-mutated) clip start. Mirrors `VideoClipBar.onMoveEnded`.
    public let onMoveEnded: () -> Void
    /// Poignées de trim — la fenêtre temporelle d'un texte se règle au doigt
    /// comme celle d'une vidéo (affichées à la sélection). Défauts no-op pour
    /// les call sites existants.
    public let onTrimStartDelta: (CGFloat) -> Void
    public let onTrimEndDelta: (CGFloat) -> Void

    public init(
        clipId: String, content: String, startTime: Float, duration: Float,
        isSelected: Bool, isLocked: Bool, isDark: Bool,
        geometry: TimelineGeometry, laneHeight: CGFloat,
        onTap: @escaping () -> Void,
        onDoubleTap: @escaping () -> Void,
        onLongPress: @escaping () -> Void,
        onMoveDelta: @escaping (CGFloat) -> Void,
        onMoveEnded: @escaping () -> Void = {},
        onTrimStartDelta: @escaping (CGFloat) -> Void = { _ in },
        onTrimEndDelta: @escaping (CGFloat) -> Void = { _ in }
    ) {
        self.clipId = clipId; self.content = content
        self.startTime = startTime; self.duration = duration
        self.isSelected = isSelected; self.isLocked = isLocked
        self.isDark = isDark; self.geometry = geometry
        self.laneHeight = laneHeight
        self.onTap = onTap; self.onDoubleTap = onDoubleTap
        self.onLongPress = onLongPress; self.onMoveDelta = onMoveDelta
        self.onMoveEnded = onMoveEnded
        self.onTrimStartDelta = onTrimStartDelta
        self.onTrimEndDelta = onTrimEndDelta
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
            if isSelected, !isLocked {
                ClipTrimHandles(laneHeight: laneHeight,
                                onTrimStartDelta: onTrimStartDelta,
                                onTrimEndDelta: onTrimEndDelta)
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
        .accessibilityValue(String(
            format: String(localized: "story.timeline.a11y.clip.displayedRange", bundle: .module),
            startTime, startTime + duration
        ))
    }
}
