import SwiftUI
import MeeshySDK
import MeeshyUI

/// LA FICHE D'UN CONCEPT (#9564) — le sous-menu de la première page. Un gabarit UNIQUE pour les quinze concepts :
///
///  1. le héros — l'emblème en grand, la valeur, la jauge vers l'étape suivante ;
///  2. « C'est quoi ? » — la phrase de la carte (`why`), puis ce qui la développe (`more`) ;
///  3. « Où j'en suis » — toutes les données du concept, en lignes libellé → valeur ;
///  4. « Comment ça marche » — la phrase de la carte (`how`), puis le conseil (`tip`) ;
///  5. « À toi de jouer » — les GESTES du concept (frapper, ouvrir le coffre, changer une mission, protéger ou
///     rallumer la Flamme…) : ils vivent ICI, plus sur la première page ;
///  6. « Aller plus loin » — les sous-pages (classement de la ligue, parcours de saison, règles…).
///
/// Les vues du jeu ne sont pas réécrites : elles se RANGENT dans la fiche de leur concept, pilotées par le même
/// `ProgressionViewModel` (retour instantané, restauration sur échec, clé d'idempotence).
///
/// **La page est AUTONOME dans la pile**, comme `ProgressionSectionPage` : atteinte par une notification ou un
/// lien, elle lit sa propre progression, cache d'abord — aucun spinner ne s'ajoute.
struct ProgressionConceptPage: View {
    let concept: ProgressionConcept

    @StateObject private var viewModel: ProgressionViewModel
    @EnvironmentObject private var router: Router
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme
    @State private var reveal: ProgressionRevealRequest?

    private var theme: ThemeManager { ThemeManager.shared }

    init(concept: ProgressionConcept, viewModel: ProgressionViewModel? = nil) {
        self.concept = concept
        _viewModel = StateObject(wrappedValue: viewModel ?? ProgressionViewModel())
    }

    var body: some View {
        ZStack {
            theme.backgroundGradient.ignoresSafeArea()
            VStack(spacing: 0) {
                header
                ScrollView(showsIndicators: false) {
                    VStack(alignment: .leading, spacing: MeeshySpacing.xl) {
                        if viewModel.isOffline {
                            ProgressionNotice(kind: .offline(hasSnapshot: viewModel.progress != nil))
                        }
                        if let message = viewModel.errorMessage {
                            ProgressionNotice(kind: .error(message)) {
                                Task { await viewModel.load(forceNetwork: true) }
                            }
                        }
                        if let progress = viewModel.progress {
                            ProgressionConceptContent(
                                concept: concept,
                                viewModel: viewModel,
                                photos: viewModel.photos,
                                progress: progress,
                                isDark: colorScheme == .dark,
                                onOpenLink: { open($0) },
                                onReveal: { reveal = $0 }
                            )
                        } else if viewModel.showsSkeleton {
                            ProgressionSkeleton()
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, MeeshySpacing.lg)
                    .padding(.vertical, MeeshySpacing.md)
                }
                .refreshable { await viewModel.load(forceNetwork: true) }
            }
        }
        // Le geste de bord, que `navigationBarHidden(true)` retire en silence.
        .background(InteractivePopEnabler())
        .task { await viewModel.load() }
        .fullScreenCover(item: $reveal) { palier in
            // `.consultation` : on arrive ici DEPUIS la fiche, la célébration n'a pas à y « mener ».
            AchievementRevealView(
                reveal: palier.reveal,
                occasion: .consultation(unlocked: palier.unlocked, reachedAt: palier.reachedAt),
                onContinue: { reveal = nil },
                // Le liseré de la rareté mesurée (#9390) — « Jeu masqué » le retire.
                rarity: RevealRim.entry(of: palier.reveal, in: viewModel.game, hidden: GameDevicePrefsStore.current().prefs.hidden)
            )
        }
    }

    private var header: some View {
        GamePageHeader(title: ConceptText.name(concept), onBack: { dismiss() })
            .overlay(alignment: .trailing) {
                // Le compteur de Meeshes et sa feuille de frappe vivent dans la fiche des Meeshes (#9564) : la
                // première page ne porte plus aucun geste.
                if concept == .meesh, let meesh = viewModel.progress?.meesh {
                    ProgressionMeeshEntry(
                        meesh: meesh,
                        isMinting: viewModel.isMinting,
                        mintError: viewModel.mintError,
                        // La pièce que la feuille frappe (#9537) : elle se grave au numéro que le serveur sert.
                        next: viewModel.game.map { GameMintNext(number: $0.mint.number, edition: $0.mint.edition) },
                        onMint: { Task { await viewModel.mint() } }
                    )
                    .padding(.trailing, MeeshySpacing.lg)
                }
            }
    }

    /// Une sous-page s'ouvre par la PILE : le routeur n'est lu qu'au toucher, jamais dans le corps.
    private func open(_ link: ProgressionConceptLink) {
        switch link {
        case .page(let page): router.push(.gamePage(page))
        case .section(let section): router.push(.progressionSection(section))
        case .rules(let rule): router.push(.progressionRules(rule: rule))
        }
    }
}

/// Le corps d'une fiche : il OBSERVE le modèle et les propositions de photo, et range les vues du jeu.
struct ProgressionConceptContent: View {
    let concept: ProgressionConcept
    @ObservedObject var viewModel: ProgressionViewModel
    @ObservedObject var photos: GamePhotoCoordinator
    let progress: EngagementProgress
    let isDark: Bool
    let onOpenLink: (ProgressionConceptLink) -> Void
    let onReveal: (ProgressionRevealRequest) -> Void

    /// « Jeu masqué » (#9481) : la fiche se lit alors comme devant un serveur sans jeu.
    @ObservedObject private var prefs = GameDevicePrefsStore.current()

    private var theme: ThemeManager { ThemeManager.shared }
    private var game: GameBlock? { prefs.prefs.hidden ? nil : viewModel.game }

    private var offers: [PhotoMoment] {
        guard prefs.prefs.celebrations else { return [] }
        return photos.offers.filter { ProgressionConceptModel.concept(for: $0.emblem) == concept }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xl) {
            hero
            ForEach(offers) { offer in
                GamePhotoOfferView(moment: offer, onStart: { photos.start($0) }, onLater: { photos.later($0) })
            }
            section(ConceptText.sectionWhat) {
                sentence(ConceptText.why(concept), strong: true)
                sentence(ConceptText.more(concept))
            }
            let facts = ProgressionConceptModel.facts(concept, progress: progress, game: game)
            if !facts.isEmpty {
                section(ConceptText.sectionWhere) {
                    ProgressionConceptFacts(facts: facts)
                }
            }
            section(ConceptText.sectionHow) {
                sentence(ConceptText.how(concept), strong: true)
                sentence(ConceptText.tip(concept))
            }
            if ProgressionConceptGestures.exist(for: concept, game: game) {
                ProgressionConceptSectionTitle(text: ConceptText.sectionAct)
                ProgressionConceptGestures(
                    concept: concept, viewModel: viewModel, progress: progress, game: game, isDark: isDark,
                    onOpenLink: onOpenLink, onReveal: onReveal
                )
            }
            let links = ProgressionConceptModel.links(concept).filter { game != nil || !$0.needsGame }
            if !links.isEmpty {
                ProgressionConceptSectionTitle(text: ConceptText.sectionMore)
                VStack(spacing: MeeshySpacing.sm) {
                    ForEach(links) { link in
                        ProgressionConceptRow(
                            title: link.title, symbol: link.symbol,
                            identifier: "progression.concept.link.\(link.id)", action: { onOpenLink(link) }
                        )
                    }
                }
            }
            Spacer().frame(height: MeeshySpacing.xl)
        }
        .fullScreenCover(item: Binding(get: { photos.active }, set: { if $0 == nil { photos.close() } })) { session in
            GamePhotoFlowView(session: session) { photos.close() }
        }
    }

    // MARK: - Le héros

    @ViewBuilder
    private var hero: some View {
        if concept == .level, let game {
            // Le héro de niveau (#5841) EST le héros de cette fiche : anneau, rang, et « Comment gagner ».
            GameHeroView(
                game: game, settled: viewModel.isSettled,
                onOpenRule: { onOpenLink(.rules($0)) }, onOpenGuide: {}
            )
        } else {
            ProgressionConceptHero(
                concept: concept,
                value: ProgressionConceptModel.value(concept, progress: progress, game: game),
                gauge: ProgressionConceptModel.gauge(concept, progress: progress, game: game),
                game: game
            )
        }
    }

    // MARK: - Les sections

    private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            ProgressionConceptSectionTitle(text: title)
            ProgressionCard(tint: concept.tint) {
                VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
                    content()
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }

    private func sentence(_ text: String, strong: Bool = false) -> some View {
        Text(text)
            .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: strong ? .semibold : .regular))
            .foregroundColor(theme.textPrimary)
            .fixedSize(horizontal: false, vertical: true)
    }
}

extension ProgressionConceptLink {
    /// Une sous-page du JEU n'existe pas devant un serveur sans jeu (ni sous « Jeu masqué »).
    var needsGame: Bool {
        switch self {
        case .page, .rules: true
        case .section: false
        }
    }

    var symbol: String {
        switch self {
        case .page(.league): "list.number"
        case .page(.season): "flag.checkered"
        case .page(.prestige): "star.circle"
        case .page(.showcase): "trophy"
        case .page(.atlas): "globe"
        case .page(.settings): "gearshape"
        case .section: "square.grid.2x2"
        case .rules: "questionmark.circle"
        }
    }
}

// MARK: - Le héros générique

/// Le héros d'une fiche : l'emblème en grand, le nom, la valeur, et la jauge vers l'étape suivante quand elle existe.
struct ProgressionConceptHero: View {
    let concept: ProgressionConcept
    let value: String
    let gauge: Double?
    let game: GameBlock?

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        ProgressionCard(tint: concept.tint) {
            HStack(alignment: .center, spacing: MeeshySpacing.lg) {
                ProgressionConceptEmblem(concept: concept, game: game, size: 80)
                VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
                    Text(ConceptText.name(concept))
                        .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                        .textCase(.uppercase)
                        .foregroundColor(theme.textMuted)
                    Text(value)
                        .font(MeeshyFont.relative(MeeshyFont.titleSize, weight: .bold, design: .rounded))
                        .foregroundColor(theme.textPrimary)
                        .fixedSize(horizontal: false, vertical: true)
                    if let gauge {
                        ProgressionBar(progress: gauge, tint: concept.tint, label: ConceptText.name(concept))
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("progression.concept.hero")
    }
}

// MARK: - Les gestes du concept

/// LES GESTES D'UN CONCEPT — les vues du jeu, rangées dans la fiche de leur concept. Aucune n'est réécrite ; chacune
/// reçoit ce que `ProgressionViewModel` pilote. La frappe n'a qu'UN site : la fiche des Meeshes.
struct ProgressionConceptGestures: View {
    let concept: ProgressionConcept
    @ObservedObject var viewModel: ProgressionViewModel
    let progress: EngagementProgress
    let game: GameBlock?
    let isDark: Bool
    let onOpenLink: (ProgressionConceptLink) -> Void
    let onReveal: (ProgressionRevealRequest) -> Void

    private var theme: ThemeManager { ThemeManager.shared }

    /// Le concept a-t-il quelque chose à faire ou à toucher dans sa fiche ?
    static func exist(for concept: ProgressionConcept, game: GameBlock?) -> Bool {
        switch concept {
        case .level: game == nil
        case .points, .missions: game != nil
        case .meesh, .flame, .elans, .badges, .succes: true
        case .league: GameLeagueDetailCard.make(league: game?.league, onOpen: {}) != nil
        case .glory, .season, .prestige, .defis, .showcase, .atlas: false
        }
    }

    var body: some View {
        switch concept {
        case .level:
            if game == nil { ProgressionLevelHero(progress: progress, isDark: isDark) }
        case .points:
            if game != nil {
                GameCard { GameHeroEarn(onOpenRule: { onOpenLink(.rules($0)) }) }
            }
        case .meesh:
            if let game {
                // LE héro de frappe — le SEUL du jeu (#9537).
                GameMintPreviewView(
                    game: game, badgesLost: viewModel.mintBadgeImpact?.lost, online: viewModel.isOnline,
                    minting: viewModel.isMinting, error: viewModel.mintError,
                    celebration: viewModel.celebration, onMint: { Task { await viewModel.mint() } },
                    onOpenRule: { onOpenLink(.rules(GameHero.mintRule)) }
                )
            } else if let meesh = progress.meesh {
                ProgressionMeeshDetail(
                    meesh: meesh,
                    isMinting: viewModel.isMinting,
                    mintError: viewModel.mintError,
                    onMint: { Task { await viewModel.mint() } }
                )
                .padding(MeeshySpacing.lg)
                .background(RoundedRectangle(cornerRadius: MeeshyRadius.lg, style: .continuous).fill(theme.backgroundSecondary))
            }
        case .flame:
            if let game {
                GameFlamePanelView(
                    game: game, online: viewModel.isOnline, buyingFreeze: viewModel.pending.freeze,
                    relighting: viewModel.pending.relight, errors: viewModel.gameErrors,
                    onBuyFreeze: { Task { await viewModel.buyFreeze() } },
                    onRelight: { Task { await viewModel.relight() } }
                )
            } else {
                ProgressionFlammeHero(progress: progress, isDark: isDark)
            }
        case .missions:
            if let game {
                GameMissionsView(
                    game: game, online: viewModel.isOnline, pendingRerollId: viewModel.pending.rerollMissionId,
                    chestOpening: viewModel.pending.chest, errors: viewModel.gameErrors,
                    onReroll: { id in Task { await viewModel.reroll(missionId: id) } },
                    onClaim: { Task { await viewModel.claimChest() } }
                )
            }
        case .league:
            // Sans ligue ouverte ni groupe, rien : la valeur de la fiche dit pourquoi.
            if let detail = GameLeagueDetailCard.make(league: game?.league, onOpen: { onOpenLink(.page(.league)) }) { detail }
        case .elans:
            ProgressionElansHero(progress: progress, isDark: isDark)
        case .badges:
            GameBadgeShelfView(items: GameBadges.items(for: progress))
        case .succes:
            ProgressionLastAchievementHero(progress: progress, isDark: isDark, onReveal: onReveal)
        case .glory, .season, .prestige, .defis, .showcase, .atlas:
            EmptyView()
        }
    }
}
