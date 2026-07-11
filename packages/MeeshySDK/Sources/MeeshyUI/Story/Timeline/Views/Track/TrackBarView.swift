import SwiftUI

/// Single track row : sticky leading label (72 pt) + scrollable lane.
/// Leaf view — primitive `let` parameters only, no @ObservedObject.
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

    public var body: some View {
        HStack(spacing: 0) {
            label
                .frame(width: 72, height: laneHeight, alignment: .leading)
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
        HStack(spacing: 5) {
            if isLocked {
                Image(systemName: "lock.fill")
                    .font(.caption2)
                    .foregroundStyle(MeeshyColors.warning)
                    .accessibilityHidden(true)
            } else if let iconName {
                // Tinted chip wrapping the type icon — picks up the lane tint
                // so audio (warning), text (indigo400), video/image (indigo500)
                // each get their own colour cue at a glance.
                ZStack {
                    RoundedRectangle(cornerRadius: 4, style: .continuous)
                        .fill(Color(hex: tintHex).opacity(isDark ? 0.30 : 0.18))
                        .frame(width: 18, height: 18)
                    Image(systemName: iconName)
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(Color(hex: tintHex))
                }
                .accessibilityHidden(true)
            }
            Text(title)
                .font(.caption2.weight(isSelected ? .semibold : .regular))
                .foregroundStyle(isDark ? MeeshyColors.indigo50 : MeeshyColors.indigo900)
                .lineLimit(1)
                // 72 pt de colonne − icône 18 pt − paddings : « VIDÉO 1 » ne
                // tient pas à taille nominale et s'affichait « VID… ». On
                // resserre puis réduit (plancher 0.7) avant de tronquer.
                .allowsTightening(true)
                .minimumScaleFactor(0.7)
                .truncationMode(.tail)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 8)
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
