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
    /// Largeur de la colonne d'étiquette collante. Passée par le conteneur —
    /// défaut = la constante partagée `TrackBarView.labelColumnWidth` — pour
    /// que ruler, playhead et étiquette restent alignés au pixel via une source
    /// unique plutôt qu'un littéral dupliqué. Les conteneurs la pilotent depuis
    /// `TimelineScrubArea.laneLabelWidth` (offset ruler/playhead) pour garantir
    /// l'alignement.
    public let labelColumnWidth: CGFloat
    /// Durée totale de la piste, pré-formatée par le conteneur via
    /// `formatTrackDuration`. Rendue ligne 1 de l'étiquette, à droite de l'icône.
    public let durationLabel: String
    /// Nom de type (`IMAGE_1`) ou nom personnalisé de la piste. Rendu ligne 2.
    public let typeLabel: String
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
        labelColumnWidth: CGFloat = TrackBarView.labelColumnWidth,
        durationLabel: String = "",
        typeLabel: String = "",
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
        self.labelColumnWidth = labelColumnWidth
        self.durationLabel = durationLabel
        self.typeLabel = typeLabel
        self.lane = lane
    }

    public var accessibilityComposedLabel: String {
        let lockSuffix = isLocked ? " (verrouillée)" : ""
        let dur = durationLabel.isEmpty ? "" : " — \(durationLabel)"
        return title + dur + lockSuffix
    }

    /// Width of the sticky leading column. Two-line label (icon + total
    /// duration on line 1, type/custom name on line 2) so the track carries its
    /// own duration + identity; sized to fit "IMAGE_1" / "3,2 s" at a glance
    /// while staying far narrower than the old 72pt text column (user report
    /// 2026-07-18: le timeline doit occuper toute l'espace horizontal). MUST
    /// equal `TimelineScrubArea.laneLabelWidth` (the ruler/playhead offset) so
    /// ticks align with the lanes — the two are kept in lockstep at 52.
    // `static let` stored properties aren't allowed on a generic type
    // (`TrackBarView<Content>`) — computed `static var` instead, same
    // constant-folding result for a literal like this.
    public static var labelColumnWidth: CGFloat { 52 }

    /// Durée totale de piste formatée pour l'étiquette : « 3,2 s » sous la
    /// minute, « 1:04 » au-delà. Pure — testée sans monter la vue.
    public static func formatTrackDuration(_ seconds: Float) -> String {
        let total = max(0, seconds)
        if total < 60 {
            return String(format: "%.1f s", total).replacingOccurrences(of: ".", with: ",")
        }
        let minutes = Int(total) / 60
        let remainder = Int(total.rounded()) % 60
        return String(format: "%d:%02d", minutes, remainder)
    }

    public var body: some View {
        HStack(spacing: 0) {
            label
                .frame(width: labelColumnWidth, height: laneHeight, alignment: .leading)
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
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 3) {
                if isLocked {
                    Image(systemName: "lock.fill")
                        .font(.system(size: 9))
                        .foregroundStyle(MeeshyColors.warning)
                } else if let iconName {
                    // Tinted chip wrapping the type icon — picks up the lane
                    // tint so audio (warning), text (indigo400), video/image
                    // (indigo500) each get their own colour cue at a glance.
                    ZStack {
                        RoundedRectangle(cornerRadius: 4, style: .continuous)
                            .fill(Color(hex: tintHex).opacity(isDark ? 0.30 : 0.18))
                            .frame(width: 16, height: 16)
                        Image(systemName: iconName)
                            .font(.system(size: 9, weight: .semibold))
                            .foregroundStyle(Color(hex: tintHex))
                    }
                }
                Text(durationLabel)
                    .font(.system(size: 8, weight: .semibold))
                    .monospacedDigit()
                    .foregroundStyle(isDark ? MeeshyColors.indigo100 : MeeshyColors.indigo700)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                Spacer(minLength: 0)
            }
            Text(typeLabel)
                .font(.system(size: 9, weight: isSelected ? .bold : .semibold))
                .foregroundStyle(isDark ? MeeshyColors.indigo50 : MeeshyColors.indigo900)
                .lineLimit(1)
                .allowsTightening(true)
                .minimumScaleFactor(0.65)
                .truncationMode(.tail)
        }
        .padding(.horizontal, 6)
        .frame(maxWidth: .infinity, alignment: .leading)
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
