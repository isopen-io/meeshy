import SwiftUI
import MeeshySDK
import MeeshyUI

/// « Mes cercles » sur ma fiche (#18590, planche `Main`) : l'en-tête du kit (K44) qui porte ce qui attend ma réponse, les
/// cinq niveaux au premier regard, et « Inviter quelqu'un », le bouton du kit (K40).
///
/// Une vue à VALEURS : elle reçoit le résumé et une porte à ouvrir, elle ne charge rien et ne connaît pas le routeur.
/// Les pastilles SONT l'échelle de proximité du kit (K33, forme à comptes) : la même loi d'intensité que « Voir comme »,
/// aucune pastille redessinée ici (loi 12). Chaque pastille ouvre « Mes cercles » sur SON niveau (#18685) ; VoiceOver
/// garde UNE annonce pour l'échelle, ouvre Mes cercles en haut et propose une action par niveau. Un cercle vide garde
/// sa pastille (zéro est une réponse, pas une absence). Les noms viennent de la table servie, catalogue en repli.
struct ProfileCirclesSection: View {
    let summary: ProfileCirclesSummary
    let hasServedLinks: Bool
    var loadState: LoadState = .idle
    let accentHex: String
    var levelTitles: CircleLevelTitles = .catalogue
    let onOpen: (ProfileDoor) -> Void
    /// Relance le chargement depuis l'état indisponible.
    var onRetry: () -> Void = {}

    /// Ce que l'échelle peint : les comptes une fois des liens servis (zéro compris), aucun compte pendant le premier
    /// chargement, l'état indisponible du kit après un échec sur un cache vide — jamais cinq « 0 » inventés.
    enum Phase: Equatable {
        case loading
        case counts
        case unavailable(offline: Bool)
    }

    static func phase(hasServedLinks: Bool, loadState: LoadState) -> Phase {
        if hasServedLinks { return .counts }
        switch loadState {
        case .offline: return .unavailable(offline: true)
        case .error: return .unavailable(offline: false)
        case .idle, .loading, .cachedStale, .cachedFresh, .loaded: return .loading
        }
    }

    private var phase: Phase { Self.phase(hasServedLinks: hasServedLinks, loadState: loadState) }

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            MeeshySectionHeader(title: Self.title, lead: { EmptyView() }, accessory: { requestsButton })
            MeeshyGroupCard(tint: Color(hex: accentHex), label: Self.title) {
                VStack(spacing: 0) {
                    if case .unavailable(let offline) = phase {
                        unavailable(offline: offline).meeshyTransition(.opacity)
                    } else {
                        scaleButton
                    }
                    if let phrase = Self.emptyPhrase(for: summary, hasServedLinks: hasServedLinks) {
                        emptyLine(phrase).meeshyTransition(.opacity)
                    }
                    // L'invitation ferme la carte des cercles (#19986) : teintée à l'accent, lisible sur tout fond,
                    // et rangée avec ce qu'elle agrandit plutôt que posée seule dessous.
                    MeeshyButton(Self.inviteTitle, systemImage: "person.badge.plus",
                                 kind: .tinted, size: .s44, width: .fill, tint: tint,
                                 action: { onOpen(.invite) })
                        .padding(.top, MeeshySpacing.md)
                        .accessibilityIdentifier("profile.circles.invite")
                }
            }
        }
        .meeshyMotion(.morph, value: summary)
        .meeshyMotion(.morph, value: phase)
    }

    /// Rien n'est servi et le chargement a échoué : le bloc d'état du kit (K38), avec Réessayer.
    private func unavailable(offline: Bool) -> some View {
        MeeshyStateBlock(kind: offline ? .offline : .error, title: Self.unavailableTitle(offline: offline),
                         primary: MeeshyStateBlockAction(title: ProfilePublicationsCopy.retry,
                                                         systemImage: "arrow.clockwise",
                                                         perform: { onRetry() }),
                         art: .none, size: .compact, tint: tint)
            .padding(.vertical, MeeshySpacing.sm)
            .accessibilityIdentifier("profile.circles.unavailable")
    }

    /// L'accent de la fiche : l'échelle et l'encre des demandes.
    private var tint: Color { Color(hex: accentHex) }

    /// « 2 demandes à répondre » dans l'en-tête, à l'encre de l'accent ; rien quand rien n'attend.
    @ViewBuilder
    private var requestsButton: some View {
        if let requests = Self.requestsText(count: summary.pendingCount) {
            Button {
                HapticFeedback.light()
                onOpen(.requests)
            } label: {
                Text(requests)
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .bold))
                    .foregroundStyle(tint)
                    .multilineTextAlignment(.trailing)
                    .frame(minHeight: MeeshyControlSize.tapTarget)
                    .contentShape(Rectangle())
            }
            .buttonStyle(PressableButtonStyle())
            .accessibilityIdentifier("profile.circles.requests")
            .meeshyTransition(.opacity)
        }
    }

    /// L'échelle tient sur une rangée tant que chaque nom y tient ENTIER ; sinon elle défile, jamais des noms écrasés.
    private var scaleButton: some View {
        ViewThatFits(in: .horizontal) {
            scale.frame(maxWidth: .infinity)
            ScrollView(.horizontal, showsIndicators: false) { scale }
        }
        .frame(minHeight: MeeshyControlSize.tapTarget)
        .padding(.horizontal, MeeshySpacing.sm)
        .padding(.vertical, MeeshySpacing.sm)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Self.accessibilityLabel(summary: summary, titles: levelTitles, isLoading: phase == .loading))
        .accessibilityHint(Self.pillHint)
        .accessibilityAddTraits(.isButton)
        .accessibilityAction { open(.circles) }
        .accessibilityActions {
            ForEach(summary.entries) { entry in
                Button(levelTitles.title(of: entry.level)) { open(.circle(entry.level)) }
            }
        }
        .accessibilityIdentifier("profile.circles.scale")
    }

    private func open(_ door: ProfileDoor) {
        HapticFeedback.light()
        onOpen(door)
    }

    private var scale: some View {
        MeeshyCircleScale(
            levels: Self.scaleLevels(of: summary, titles: levelTitles),
            current: nil,
            counts: phase == .counts ? Self.scaleCounts(of: summary) : nil,
            tint: tint,
            form: .dots,
            size: .regular,
            onSelect: { open(Self.door(forPillAt: $0, of: summary)) },
            haptic: .none
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
        String(localized: "profile.section.circles", defaultValue: "Mes cercles", bundle: .main)
    }

    /// Les niveaux de l'échelle, du plus large au plus intime : nommés comme partout, dessinés du glyphe de « Voir
    /// comme ».
    static func scaleLevels(of summary: ProfileCirclesSummary,
                            titles: CircleLevelTitles = .catalogue) -> [MeeshyCircleScaleLevel] {
        summary.entries.map { entry in
            MeeshyCircleScaleLevel(title: titles.title(of: entry.level),
                                   systemImage: VitrineSeenAsCopy.glyph(of: entry.level))
        }
    }

    /// La porte de la pastille touchée : Mes cercles sur son niveau ; hors de l'échelle, Mes cercles en haut.
    static func door(forPillAt index: Int, of summary: ProfileCirclesSummary) -> ProfileDoor {
        summary.entries.indices.contains(index) ? .circle(summary.entries[index].level) : .circles
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
    static func accessibilityLabel(summary: ProfileCirclesSummary, titles: CircleLevelTitles = .catalogue,
                                   isLoading: Bool = false) -> String {
        if isLoading { return [title, ProfileActivityBand.loadingLabel].joined(separator: ", ") }
        let pills = summary.entries.map {
            pillAccessibilityLabel(title: titles.title(of: $0.level), count: $0.count)
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

    static func unavailableTitle(offline: Bool) -> String {
        offline
            ? String(localized: "profile.circles.offline", defaultValue: "Hors ligne — Mes cercles reviendront avec le réseau",
                     bundle: .main)
            : String(localized: "profile.circles.failed", defaultValue: "Mes cercles sont indisponibles", bundle: .main)
    }

    static var pillHint: String {
        String(localized: "profile.circles.open.a11y", defaultValue: "Ouvre Mes cercles", bundle: .main)
    }

    private static var inviteTitle: String {
        String(localized: "profile.circles.invite", defaultValue: "Inviter quelqu'un", bundle: .main)
    }
}
