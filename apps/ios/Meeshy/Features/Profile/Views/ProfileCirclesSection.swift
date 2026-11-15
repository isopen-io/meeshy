import SwiftUI
import MeeshySDK
import MeeshyUI

/// « Mes cercles » sur ma fiche (#18590) : les cinq niveaux au premier regard, ce qui attend ma réponse, et la porte
/// pour inviter.
///
/// Une vue à VALEURS : elle reçoit le résumé et une porte à ouvrir, elle ne charge rien et ne connaît pas le routeur.
/// Chaque pastille ouvre « Mes cercles » ; un cercle vide garde sa pastille (zéro est une réponse, pas une absence).
struct ProfileCirclesSection: View {
    let summary: ProfileCirclesSummary
    let hasServedLinks: Bool
    let accentHex: String
    let onOpen: (ProfileDoor) -> Void

    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            ProfileSectionHeader(icon: "circle.circle.fill", title: Self.title, color: MeeshyColors.brandPrimary)
            VStack(spacing: 0) {
                pills
                if let phrase = Self.emptyPhrase(for: summary, hasServedLinks: hasServedLinks) {
                    emptyLine(phrase).meeshyTransition(.opacity)
                }
                if let requests = Self.requestsText(count: summary.pendingCount) {
                    ProfileNavigationRow(icon: "person.badge.plus", title: requests, hint: nil,
                                         identifier: "profile.circles.requests", accentHex: accentHex) { onOpen(.requests) }
                        .meeshyTransition(.opacity)
                }
                ProfileNavigationRow(icon: "person.crop.circle.badge.plus", title: Self.inviteTitle, hint: nil,
                                     identifier: "profile.circles.invite", accentHex: accentHex) { onOpen(.invite) }
            }
            .background(ProfileSectionCard(tintHex: accentHex))
            .meeshyAnimation(MeeshyAnimation.springDefault, value: summary)
        }
    }

    /// Une rangée seulement si chaque nom y tient ENTIER ; sinon deux rangées, jamais des noms rétrécis et collés.
    private var pills: some View {
        let layouts = Self.pillLayouts(isAccessibilitySize: dynamicTypeSize.isAccessibilitySize)
        return ViewThatFits(in: .horizontal) {
            pillRows(columns: layouts.first ?? 3)
            pillRows(columns: layouts.last ?? 3)
        }
        .padding(.horizontal, MeeshySpacing.sm)
        .padding(.vertical, MeeshySpacing.sm)
    }

    @ViewBuilder
    private func pillRows(columns: Int) -> some View {
        if columns >= summary.entries.count {
            HStack(spacing: Self.pillSpacing) { pillViews }
        } else {
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: Self.pillSpacing), count: columns),
                      spacing: Self.pillSpacing) { pillViews }
        }
    }

    private var pillViews: some View {
        ForEach(summary.entries) { entry in
            ProfileCirclePill(entry: entry, textPrimary: theme.textPrimary, textMuted: theme.textMuted) { onOpen(.circles) }
        }
    }

    private func emptyLine(_ phrase: String) -> some View {
        Text(phrase)
            .font(MeeshyFont.relative(MeeshyFont.footnoteSize))
            .foregroundStyle(theme.textMuted)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, MeeshySpacing.mdPlus)
            .padding(.bottom, MeeshySpacing.sm)
    }

    // MARK: - Ce que la section dit

    static var title: String {
        String(localized: "profile.section.circles", defaultValue: "MES CERCLES", bundle: .main)
    }

    /// Les cinq cercles tiennent sur une rangée ; aux tailles de texte d'accessibilité, ils passent sur deux rangées
    /// plutôt que d'écraser leurs noms.
    static func pillColumns(isAccessibilitySize: Bool) -> Int {
        isAccessibilitySize ? 3 : 5
    }

    /// Les dispositions essayées dans l'ordre : la rangée de cinq d'abord, sinon deux rangées. Aux tailles
    /// d'accessibilité, les deux rangées d'emblée.
    static func pillLayouts(isAccessibilitySize: Bool) -> [Int] {
        isAccessibilitySize ? [pillColumns(isAccessibilitySize: true)] : [pillColumns(isAccessibilitySize: false), 3]
    }

    /// L'air entre deux pastilles : assez pour que deux noms voisins ne se touchent pas.
    static let pillSpacing = MeeshySpacing.sm

    /// « Ami, 3 personnes » : le cercle d'abord, puis qui l'habite.
    static func pillAccessibilityLabel(title: String, count: Int) -> String {
        let format = String(localized: "profile.circles.pill.a11y", defaultValue: "%@, %lld personnes", bundle: .main)
        return String.localizedStringWithFormat(format, title, count)
    }

    /// `nil` quand rien n'attend : la rangée n'existe pas plutôt que de dire « 0 ».
    static func requestsText(count: Int) -> String? {
        guard count > 0 else { return nil }
        let format = String(localized: "profile.circles.requests", defaultValue: "%lld demandes à répondre", bundle: .main)
        return String.localizedStringWithFormat(format, count)
    }

    /// La phrase ne se dit que si AUCUN cercle n'a personne, et seulement une fois les liens servis : elle explique les
    /// zéros, elle ne les remplace pas, et pendant le chargement elle ne dit pas encore « aucun lien ».
    static func emptyPhrase(for summary: ProfileCirclesSummary, hasServedLinks: Bool) -> String? {
        guard hasServedLinks, summary.isEmpty else { return nil }
        return String(localized: "profile.circles.empty", defaultValue: "Tes cercles se remplissent à mesure que tu échanges", bundle: .main)
    }

    static var pillHint: String {
        String(localized: "profile.circles.open.hint", defaultValue: "Ouvre Mes cercles", bundle: .main)
    }

    private static var inviteTitle: String {
        String(localized: "profile.circles.invite", defaultValue: "Inviter", bundle: .main)
    }
}

/// Une pastille de cercle : l'icône du niveau, le nombre de personnes, le nom. Au moins 44 pt, une seule annonce
/// VoiceOver.
private struct ProfileCirclePill: View {
    let entry: ProfileCirclesSummary.Entry
    let textPrimary: Color
    let textMuted: Color
    let action: () -> Void

    var body: some View {
        let title = CircleLevelNames.title(of: entry.level)
        Button {
            HapticFeedback.light()
            action()
        } label: {
            VStack(spacing: MeeshySpacing.xxs) {
                Text(CircleLevelNames.icon(of: entry.level))
                    .font(MeeshyFont.relative(MeeshyFont.subtitleSize))
                Text(entry.count, format: .number)
                    .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .bold, design: .rounded))
                    .foregroundStyle(textPrimary)
                    .contentTransition(.numericText())
                Text(title)
                    .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .medium))
                    .foregroundStyle(textMuted)
                    .lineLimit(1)
                    .minimumScaleFactor(0.85)
            }
            .frame(maxWidth: .infinity, minHeight: 44)
            .padding(.vertical, MeeshySpacing.xs)
            .contentShape(Rectangle())
        }
        .buttonStyle(PressableButtonStyle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(ProfileCirclesSection.pillAccessibilityLabel(title: title, count: entry.count))
        .accessibilityHint(ProfileCirclesSection.pillHint)
        .accessibilityAddTraits(.isButton)
        .accessibilityIdentifier("profile.circles.\(entry.level.rawValue.lowercased())")
    }
}
