import SwiftUI

/// Single track row : sticky leading icon-only label (`labelColumnWidth`) +
/// scrollable lane. Leaf view — primitive `let` parameters only, no @ObservedObject.
public struct TrackBarView<Content: View>: View {

    public let title: String
    public let isLocked: Bool
    public let isSelected: Bool
    public let tintHex: String
    public let isDark: Bool
    public let laneWidth: CGFloat
    public let laneHeight: CGFloat
    /// SF Symbol prefixed to the sticky label. Optional for backwards
    /// compatibility — callers that omit it keep the legacy text-only
    /// label. Used to give each track a modern, instantly recognisable
    /// type marker (waveform / photo / video / textformat).
    public let iconName: String?
    private let lane: () -> Content

    public init(
        title: String,
        isLocked: Bool,
        isSelected: Bool,
        tintHex: String,
        isDark: Bool,
        laneWidth: CGFloat,
        laneHeight: CGFloat,
        iconName: String? = nil,
        @ViewBuilder lane: @escaping () -> Content
    ) {
        self.title = title
        self.isLocked = isLocked
        self.isSelected = isSelected
        self.tintHex = tintHex
        self.isDark = isDark
        self.laneWidth = laneWidth
        self.laneHeight = laneHeight
        self.iconName = iconName
        self.lane = lane
    }

    public var accessibilityComposedLabel: String {
        let lockSuffix = isLocked ? " (verrouillée)" : ""
        return title + lockSuffix
    }

    /// Width of the sticky leading column. Icon-only (no text) so the
    /// scrollable lane — the actual timeline content — gets the width back.
    /// Was 72pt with a text label; on a 402pt-wide phone that's ~18% of the
    /// sheet's width spent on a name already shown a second time inside the
    /// clip bar itself (`VideoClipBar.titleLabel` / `AudioClipBar.titleOverlay`)
    /// — pure redundancy (user report 2026-07-18: "le timeline doit occuper
    /// toute l'espace horizontal du sheet").
    // `static let` stored properties aren't allowed on a generic type
    // (`TrackBarView<Content>`) — computed `static var` instead, same
    // constant-folding result for a literal like this.
    public static var labelColumnWidth: CGFloat { 32 }

    public var body: some View {
        HStack(spacing: 0) {
            label
                .frame(width: Self.labelColumnWidth, height: laneHeight, alignment: .center)
                .background(isDark ? Color.black.opacity(0.25) : Color.white.opacity(0.6))

            ZStack(alignment: .leading) {
                laneBackground
                lane()
            }
            .frame(width: laneWidth, height: laneHeight, alignment: .leading)
            .clipped()
        }
        .frame(height: laneHeight)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityComposedLabel)
    }

    private var label: some View {
        Group {
            if isLocked {
                Image(systemName: "lock.fill")
                    .font(.caption2)
                    .foregroundStyle(MeeshyColors.warning)
            } else if let iconName {
                // Tinted chip wrapping the type icon — picks up the lane tint
                // so audio (warning), text (indigo400), video/image (indigo500)
                // each get their own colour cue at a glance. The track's full
                // name is still announced via `accessibilityComposedLabel` on
                // the row as a whole (VoiceOver) — dropping the on-screen
                // Text(title) loses nothing there, it was pure duplication of
                // the name already shown inside the clip bar itself.
                ZStack {
                    RoundedRectangle(cornerRadius: 4, style: .continuous)
                        .fill(Color(hex: tintHex).opacity(isDark ? 0.30 : 0.18))
                        .frame(width: 18, height: 18)
                    Image(systemName: iconName)
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(Color(hex: tintHex))
                }
            }
        }
        .accessibilityHidden(true)
    }

    private var laneBackground: some View {
        Rectangle()
            .fill(Color(hex: tintHex).opacity(isDark ? 0.06 : 0.04))
            .overlay(
                Rectangle()
                    .stroke(
                        isSelected ? MeeshyColors.indigo400.opacity(0.55) : Color.clear,
                        lineWidth: 1
                    )
            )
    }
}
