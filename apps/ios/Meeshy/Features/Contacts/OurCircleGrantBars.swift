import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - « Notre cercle » : les deux accords en crans (planche `Autre-Cercle`, #19674)

/// La couleur d'une personne dans « Notre cercle » et sa pilule : son accent de profil quand la fiche le donne, la
/// couleur du cercle sinon (hors d'une fiche, dans « Mes cercles »).
enum OurCircleTint {
    static func person(_ accentColor: String?, level: RelationLevel) -> Color {
        guard let accentColor else { return CircleLevelColor.color(for: level) }
        return Color(hex: accentColor)
    }
}

/// « Lui t'accorde · Proche » puis ses six crans, la rangée des cercles où le commun s'allume, puis mes six crans et
/// « Tu lui accordes · Sang ». Chaque accord est à la couleur de QUI l'accorde ; un accord connu seulement « au moins »
/// laisse ses crans supérieurs en pointillé, rien n'est deviné au-delà.
struct OurCircleGrantBars: View {
    /// Les avatars de l'orbite : moi au centre, l'autre sur le cercle commun (diamètres de K33 `.regular`).
    static let centerAvatar: CGFloat = 40
    static let markerAvatar: CGFloat = 48
    /// Le halo de l'orbite.
    static let glowRadius: CGFloat = 150
    private static let rowAvatar: CGFloat = 28
    private static let notchHeight: CGFloat = 8

    let summary: OurCircleSummary
    let theirName: String
    let myName: String
    let theirAccentHex: String?
    let myAccentHex: String
    let myAvatarURL: String?
    let theirTint: Color
    let myTint: Color

    private var theme: ThemeManager { ThemeManager.shared }
    private var levels: [RelationLevel] { RelationLevel.allCases }

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.smPlus) {
            caption(OurCircleCopy.theirSide(name: theirName), value: OurCircleCopy.grant(summary.theirs), tint: theirTint)
            notches(name: theirName, accentHex: theirAccentHex ?? DynamicColorGenerator.colorForName(theirName),
                    avatarURL: nil, level: summary.theirs.level, isFloor: isFloor, tint: theirTint)
                .accessibilityHidden(true)
            glyphs
            notches(name: myName, accentHex: myAccentHex, avatarURL: myAvatarURL, level: summary.mine, isFloor: false,
                    tint: myTint)
                .accessibilityHidden(true)
            caption(OurCircleCopy.mySide, value: CircleLevelNames.title(of: summary.mine), tint: myTint)
        }
        .padding(MeeshySpacing.lg)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.xxl)
                .fill(theme.backgroundSecondary)
        )
        .overlay(
            RoundedRectangle(cornerRadius: MeeshyRadius.xxl)
                .stroke(theme.textMuted.opacity(MeeshyOpacity.light), lineWidth: 1)
        )
        .accessibilityElement(children: .combine)
    }

    /// Son accord n'est connu que par le minimum : au-delà, on ne sait pas.
    private var isFloor: Bool {
        if case .atLeast = summary.theirs { return true }
        return false
    }

    private func caption(_ caption: String, value: String, tint: Color) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(caption)
                .font(MeeshyFont.relative(MeeshyFont.subheadSize))
                .foregroundStyle(theme.textSecondary)
            Spacer(minLength: MeeshySpacing.sm)
            Text(value)
                .font(MeeshyFont.relative(MeeshyFont.calloutSize, weight: .bold))
                .foregroundStyle(tint)
        }
    }

    private func notches(name: String, accentHex: String, avatarURL: String?, level: RelationLevel, isFloor: Bool,
                         tint: Color) -> some View {
        let reached = (levels.firstIndex(of: level) ?? 0) + 1
        return HStack(spacing: MeeshySpacing.xsPlus) {
            MeeshyAvatar(name: name, context: .custom(Self.rowAvatar), accentColor: accentHex, avatarURL: avatarURL)
            ForEach(levels.indices, id: \.self) { index in
                notch(filled: index < reached, unknown: isFloor && index >= reached, tint: tint)
            }
        }
    }

    @ViewBuilder
    private func notch(filled: Bool, unknown: Bool, tint: Color) -> some View {
        if unknown {
            Capsule()
                .stroke(tint.opacity(MeeshyOpacity.strong), style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
                .frame(height: Self.notchHeight)
                .frame(maxWidth: .infinity)
        } else {
            Capsule()
                .fill(filled ? tint : theme.textMuted.opacity(MeeshyOpacity.light))
                .frame(height: Self.notchHeight)
                .frame(maxWidth: .infinity)
        }
    }

    /// La rangée des six cercles entre les deux accords : le commun s'allume, à la couleur de la personne.
    private var glyphs: some View {
        HStack(spacing: MeeshySpacing.xsPlus) {
            Color.clear.frame(width: Self.rowAvatar, height: 1)
            ForEach(levels, id: \.self) { level in
                let isCommon = level == summary.common
                Image(systemName: isCommon && level != .public ? VitrineSeenAsCopy.glyph(of: level) + ".fill" : VitrineSeenAsCopy.glyph(of: level))
                    .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
                    .foregroundStyle(isCommon ? theirTint : theme.textMuted)
                    .frame(maxWidth: .infinity, minHeight: MeeshyControlSize.compact)
                    .background(
                        RoundedRectangle(cornerRadius: MeeshyRadius.sm)
                            .fill(isCommon ? theirTint.opacity(MeeshyOpacity.light) : .clear)
                    )
            }
        }
        .accessibilityHidden(true)
    }
}
