import SwiftUI
import MeeshySDK
import MeeshyUI

/// « Mes cercles » sur ma fiche (#18590, planche `Main`) : les cinq niveaux au premier regard, ce qui attend ma réponse,
/// et la porte pour inviter.
///
/// Une vue à VALEURS : elle reçoit le résumé et une porte à ouvrir, elle ne charge rien et ne connaît pas le routeur.
/// Les pastilles SONT l'échelle de proximité du kit (K33, forme à comptes) : la même loi d'intensité que « Voir comme »,
/// aucune pastille redessinée ici (loi 12). Toute l'échelle ouvre « Mes cercles », donc elle est UN bouton et UNE
/// annonce VoiceOver ; un cercle vide garde sa pastille (zéro est une réponse, pas une absence).
struct ProfileCirclesSection: View {
    let summary: ProfileCirclesSummary
    let hasServedLinks: Bool
    let accentHex: String
    let onOpen: (ProfileDoor) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            ProfileSectionHeader(icon: "circle.circle.fill", title: Self.title, color: MeeshyColors.brandPrimary)
            VStack(spacing: 0) {
                scaleButton
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

    /// L'échelle tient sur une rangée tant que chaque nom y tient ENTIER ; sinon elle défile, jamais des noms écrasés.
    private var scaleButton: some View {
        Button {
            HapticFeedback.light()
            onOpen(.circles)
        } label: {
            ViewThatFits(in: .horizontal) {
                scale.frame(maxWidth: .infinity)
                ScrollView(.horizontal, showsIndicators: false) { scale }
            }
            .frame(minHeight: MeeshyControlSize.tapTarget)
            .padding(.horizontal, MeeshySpacing.sm)
            .padding(.vertical, MeeshySpacing.sm)
            .contentShape(Rectangle())
        }
        .buttonStyle(PressableButtonStyle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Self.accessibilityLabel(summary: summary))
        .accessibilityHint(Self.pillHint)
        .accessibilityAddTraits(.isButton)
        .accessibilityIdentifier("profile.circles.scale")
    }

    private var scale: some View {
        MeeshyCircleScale(
            levels: Self.scaleLevels(of: summary),
            current: nil,
            counts: Self.scaleCounts(of: summary),
            tint: Color(hex: accentHex),
            form: .dots,
            size: .regular
        )
    }

    private func emptyLine(_ phrase: String) -> some View {
        Text(phrase)
            .font(MeeshyFont.relative(MeeshyFont.footnoteSize))
            .foregroundStyle(ThemeManager.shared.textMuted)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, MeeshySpacing.mdPlus)
            .padding(.bottom, MeeshySpacing.sm)
    }

    // MARK: - Ce que la section dit

    static var title: String {
        String(localized: "profile.section.circles", defaultValue: "MES CERCLES", bundle: .main)
    }

    /// Les niveaux de l'échelle, du plus large au plus intime : nommés comme partout, dessinés du glyphe de « Voir
    /// comme ».
    static func scaleLevels(of summary: ProfileCirclesSummary) -> [MeeshyCircleScaleLevel] {
        summary.entries.map { entry in
            MeeshyCircleScaleLevel(title: CircleLevelNames.title(of: entry.level),
                                   systemImage: VitrineSeenAsCopy.glyph(of: entry.level))
        }
    }

    /// Le compte de chaque pastille, dans l'ordre des niveaux.
    static func scaleCounts(of summary: ProfileCirclesSummary) -> [Int] {
        summary.entries.map(\.count)
    }

    /// « Ami, 3 personnes » : le cercle d'abord, puis qui l'habite.
    static func pillAccessibilityLabel(title: String, count: Int) -> String {
        let format = String(localized: "profile.circles.pill.a11y", defaultValue: "%@, %lld personnes", bundle: .main)
        return String.localizedStringWithFormat(format, title, count)
    }

    /// Le titre de la section, puis chaque cercle avec ses personnes : une seule annonce pour toute l'échelle.
    static func accessibilityLabel(summary: ProfileCirclesSummary) -> String {
        let pills = summary.entries.map {
            pillAccessibilityLabel(title: CircleLevelNames.title(of: $0.level), count: $0.count)
        }
        return ([title] + pills).joined(separator: ", ")
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
