import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - La feuille de précisions (#9564, amendement n° 2)
//
// UN composant pour tous les éléments du jeu. Une feuille à détente AJUSTÉE AU CONTENU (verre natif sur iOS 26,
// matière translucide en deçà), poignée visible : elle se ferme au geste, et rend le focus à l'élément touché.
// L'emblème entre en grand avec le MÊME ressort que le rebond du toucher (`GameMotion.release`) ; sous « réduire
// les animations », un fondu. Présentée par `.sheet(item:)` depuis la page — jamais un `fullScreenCover`, qui
// laisse l'écran recouvert aveugle.

/// L'emblème d'un élément, dessiné par les briques du jeu. DÉCORATIF : le nom voisin dit tout.
struct GameElementEmblemView: View {
    let emblem: GameElementEmblem
    var size: CGFloat = 112

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        drawing
            .frame(width: size, height: size)
            .accessibilityHidden(true)
    }

    @ViewBuilder
    private var drawing: some View {
        switch emblem {
        case .concept(let concept):
            ProgressionConceptEmblem(concept: concept, game: nil, size: size)
        case .tier(let tier):
            TierEmblemView(tier: tier, knockout: theme.backgroundPrimary)
        case .rank(let rank, let division):
            RankBlasonView(rank: rank, division: division, title: GameCopy.rankName(rank))
        case .coin(let edition):
            MeeshCoinView(face: .obverse, edition: edition)
        case .flame(let form):
            FlameView(form: form ?? .braise, flickers: false)
                .saturation(form == nil ? 0 : 1)
                .opacity(form == nil ? 0.45 : 1)
        case .chest(let open):
            ChestView(isOpen: open)
        case .league(let league):
            LeagueGemView(league: league)
        case .trophy(let material):
            TrophyView(material: material, label: "")
        case .stamp(let code, let stamped):
            AtlasStampView(code: code, tint: MeeshyColors.brandPrimary, state: stamped ? .stamped : .undiscovered, muted: theme.textMuted)
        case .badge(let family, let glyph, let material, let lit, let progress):
            GameMedalView(family: family, glyph: glyph, material: material, state: lit ? .lit : .imprint, progress: progress,
                          surface: theme.backgroundPrimary, muted: theme.textMuted)
        case .medal(let material, let lit):
            GameMedalView(family: .social, glyph: .social, material: material, state: lit ? .lit : .imprint,
                          surface: theme.backgroundPrimary, muted: theme.textMuted)
        case .symbol(let name):
            Image(systemName: name)
                .resizable()
                .scaledToFit()
                .foregroundColor(MeeshyColors.brandPrimary)
                .padding(size * 0.2)
        }
    }
}

private struct GameElementSheetHeightKey: PreferenceKey {
    static let defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = max(value, nextValue()) }
}

struct GameElementSheet: View {
    let detail: GameElementDetail
    /// « Voir la fiche » ; `nil` quand la feuille s'ouvre DANS la fiche du concept.
    var onOpenConcept: ((ProgressionConcept) -> Void)?

    @Environment(\.dismiss) private var dismiss
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    /// L'emblème est entré : c'est ce qui joue le ressort, et ce qui fait monter la jauge — une fois.
    @State private var entered = false
    @State private var contentHeight: CGFloat = 0
    /// Le lecteur d'écran se pose sur le NOM à l'ouverture : la feuille annonce ce qu'elle précise.
    @AccessibilityFocusState private var nameFocused: Bool

    private var theme: ThemeManager { ThemeManager.shared }
    private var tint: Color { detail.concept.tint }

    /// La détente de la feuille : la hauteur du contenu, une fois mesurée ; avant, une hauteur de départ.
    static func detentHeight(measured: CGFloat) -> CGFloat {
        measured > 0 ? measured : 360
    }

    var body: some View {
        ScrollView(showsIndicators: false) {
            content
                .background(GeometryReader { geo in
                    Color.clear.preference(key: GameElementSheetHeightKey.self, value: geo.size.height)
                })
        }
        .onPreferenceChange(GameElementSheetHeightKey.self) { contentHeight = $0 }
        .presentationDetents([.height(Self.detentHeight(measured: contentHeight)), .large])
        .presentationDragIndicator(.visible)
        .adaptiveSheetGlassBackground()
        .onAppear {
            withAnimation(reduceMotion ? GameMotion.reduced : GameMotion.release) { entered = true }
        }
        // Une fois la feuille posée : un focus donné pendant sa montée se perd.
        .task { @MainActor in
            try? await Task.sleep(nanoseconds: 350_000_000)
            nameFocused = true
        }
        // Un conteneur qui porte un identifiant se déclare conteneur : sinon l'identifiant recouvre ceux de ses éléments.
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("game.detail")
    }

    private var content: some View {
        VStack(alignment: .center, spacing: MeeshySpacing.lg) {
            GameElementEmblemView(emblem: detail.emblem)
                .saturation(detail.isLockedLook ? 0.2 : 1)
                .scaleEffect(entered || reduceMotion ? 1 : GameMotion.entranceScale)
                .opacity(entered ? 1 : 0.2)
                .padding(.top, MeeshySpacing.xl)

            VStack(spacing: MeeshySpacing.xs) {
                Text(detail.name)
                    .font(MeeshyFont.relative(MeeshyFont.titleSize, weight: .bold, design: .rounded))
                    .foregroundColor(theme.textPrimary)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                    .accessibilityFocused($nameFocused)
                    .accessibilityIdentifier("game.detail.name")
                status
            }

            if let progress = detail.progress {
                ProgressionBar(progress: entered ? progress : 0, tint: tint, label: detail.name)
                    .animation(reduceMotion ? nil : .easeOut(duration: GameTimeline.levelGainDuration), value: entered)
            }

            section(ConceptText.ficheWhat, detail.what)
            if let how = detail.how {
                section(detail.howTitle, how)
            }

            if !detail.facts.isEmpty {
                ProgressionCard(tint: tint) {
                    ProgressionConceptFacts(facts: detail.facts)
                }
            }
            if detail.rarity != nil {
                VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
                    ProgressionConceptSectionTitle(text: GameDetailText.rarity)
                    GameRarityLine(entry: detail.rarity)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }

            if let onOpenConcept {
                ProgressionConceptRow(
                    title: GameDetailText.seeFiche, subtitle: ConceptText.name(detail.concept), symbol: "arrow.forward.circle",
                    identifier: "game.detail.sheet", action: { onOpenConcept(detail.concept) }
                )
            }
            GameQuietButton(title: GameDetailText.close, identifier: "game.detail.close") { dismiss() }
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.bottom, MeeshySpacing.lg)
    }

    // MARK: - L'état

    @ViewBuilder
    private var status: some View {
        switch detail.status {
        case .obtained:
            statusLine(symbol: "checkmark.seal.fill", color: MeeshyColors.success, identifier: "game.detail.obtained")
        case .locked:
            statusLine(symbol: "lock.fill", color: theme.textMuted, identifier: "game.detail.locked")
        case .value(let value, _):
            Text(value)
                .font(MeeshyFont.relative(MeeshyFont.subtitleSize, weight: .bold, design: .rounded))
                .foregroundColor(theme.textPrimary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("game.detail.value")
        }
    }

    private func statusLine(symbol: String, color: Color, identifier: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: MeeshySpacing.xs) {
            Image(systemName: symbol)
                .accessibilityHidden(true)
            Text(detail.statusLine)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
        .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
        .foregroundColor(color)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier(identifier)
    }

    private func section(_ title: String, _ text: String) -> some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
            ProgressionConceptSectionTitle(text: title)
            Text(text)
                .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .regular))
                .foregroundColor(theme.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

extension GameElementDetail {
    /// Un élément verrouillé se dessine désaturé : on le reconnaît, on ne l'a pas encore.
    var isLockedLook: Bool {
        if case .locked = status { return true }
        return false
    }
}

// MARK: - La porte des précisions

private struct GameOpenDetailKey: EnvironmentKey {
    static let defaultValue: ((GameElementDetail) -> Void)? = nil
}

extension EnvironmentValues {
    /// Ouvre les précisions d'un élément. Posée par la PAGE (`GamePageScaffold`), qui présente la feuille — UNE
    /// par page, quel que soit le nombre d'éléments. `nil` hors d'une page de Progression : l'élément se lit
    /// alors sans se toucher, et rien ne plante faute d'hôte.
    var gameOpenDetail: ((GameElementDetail) -> Void)? {
        get { self[GameOpenDetailKey.self] }
        set { self[GameOpenDetailKey.self] = newValue }
    }
}

/// Rend un élément TOUCHABLE : il rebondit, puis la page ouvre SES précisions. Sans précisions à dire (un élément
/// que ce client ne sait pas lire) ou sans page pour les présenter, l'élément reste tel quel.
private struct GameElementTouch: ViewModifier {
    let detail: GameElementDetail?
    /// L'identifiant de l'élément pour les témoins ; à défaut, celui de ses précisions.
    let identifier: String?

    @Environment(\.gameOpenDetail) private var openDetail

    @ViewBuilder
    func body(content: Content) -> some View {
        if let detail, let openDetail {
            GameBounceButton(action: { openDetail(detail) }) {
                content.contentShape(Rectangle())
            }
            .accessibilityHint(GameDetailText.open(detail.name))
            .accessibilityIdentifier(identifier ?? "game.element." + detail.id)
        } else if let identifier {
            content.accessibilityIdentifier(identifier)
        } else {
            content
        }
    }
}

extension View {
    /// L'élément rebondit au toucher et ouvre ses précisions (`GameElementDetails` dit lesquelles).
    func gameElement(_ detail: GameElementDetail?, identifier: String? = nil) -> some View {
        modifier(GameElementTouch(detail: detail, identifier: identifier))
    }

    /// Présente les précisions de l'élément touché. `onOpenConcept` : « Voir la fiche », hors de la fiche du concept.
    func gameElementSheet(_ detail: Binding<GameElementDetail?>, onOpenConcept: ((ProgressionConcept) -> Void)?) -> some View {
        sheet(item: detail) { element in
            GameElementSheet(
                detail: element,
                onOpenConcept: onOpenConcept.map { open in
                    { concept in
                        detail.wrappedValue = nil
                        open(concept)
                    }
                }
            )
        }
    }
}
