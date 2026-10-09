import SwiftUI
import MeeshySDK
import MeeshyUI

/// LA FICHE D'UN CONCEPT (#9564) — le deuxième niveau du jeu (`GameNavigationMap`). Un gabarit UNIQUE pour les
/// quinze concepts :
///
///  1. le héros — l'emblème en grand, la valeur, la jauge vers l'étape suivante ; ou, quand le concept a sa PIÈCE
///     de jeu (anneau du niveau, frappe des Meeshes, détail de ligue, Élans), cette pièce À SA PLACE — jamais les
///     deux (amendement n° 4) ;
///  2. « C'est quoi ? » — les deux phrases de la carte, à quoi ça sert (`why`) et comment ça marche (`how`) ;
///  3. « Où j'en suis » — toutes les données du concept, en lignes libellé → valeur ;
///  4. « Comment en gagner » — les deux conseils qui développent la carte (`tip1`, `tip2`) ;
///  5. « À toi de jouer » — les GESTES du concept (frapper, ouvrir le coffre, changer une mission, protéger ou
///     rallumer la Flamme…) : ils vivent ICI, plus sur la première page ;
///  6. « Aller plus loin » — les sous-pages (classement de la ligue, parcours de saison, règles…).
///
/// Les vues du jeu ne sont pas réécrites : elles se RANGENT dans la fiche de leur concept, pilotées par le même
/// `ProgressionViewModel` (retour instantané, restauration sur échec, clé d'idempotence).
///
/// **La page est AUTONOME dans la pile**, comme `ProgressionSectionPage` : atteinte par une notification ou un
/// lien, elle lit sa propre progression, cache d'abord — aucun spinner ne s'ajoute. Une entrée extérieure peut
/// demander une `section` : la fiche s'y pose, une fois, sous la barre compacte.
struct ProgressionConceptPage: View {
    let concept: ProgressionConcept
    let section: ProgressionConceptSection?

    @StateObject private var viewModel: ProgressionViewModel
    @EnvironmentObject private var router: Router
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var reveal: ProgressionRevealRequest?
    /// La section demandée a été atteinte : le regard ne se repose pas à chaque relecture.
    @State private var focused = false

    private var theme: ThemeManager { ThemeManager.shared }

    init(concept: ProgressionConcept, section: ProgressionConceptSection? = nil, viewModel: ProgressionViewModel? = nil) {
        self.concept = concept
        self.section = section
        _viewModel = StateObject(wrappedValue: viewModel ?? ProgressionViewModel())
    }

    var body: some View {
        // Le lecteur de défilement ENVELOPPE le gabarit : la section visée se trouve dans SON défilement.
        ScrollViewReader { proxy in
            page
                .adaptiveOnChange(of: viewModel.progress != nil, initial: true) { _, ready in
                    guard ready, !focused, let section else { return }
                    focused = true
                    Task { @MainActor in
                        try? await Task.sleep(nanoseconds: 300_000_000)
                        withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.35)) {
                            proxy.scrollTo(section, anchor: GameRulesPage.focusAnchor)
                        }
                    }
                }
        }
    }

    private var page: some View {
        // L'en-tête dynamique des pages de Progression (#9564) : grand titre au repos, barre compacte et translucide
        // quand la fiche défile dessous, retour en disque de verre.
        GamePageScaffold(
            title: ConceptText.name(concept),
            onRefresh: { await viewModel.load(forceNetwork: true) }
        ) {
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
        }
        // « Comprendre les badges » (#9640) : l'étagère et la feuille d'un badge mènent à la section badges du carnet.
        .environment(\.gameOpenBadgesGuide, { router.openGame(at: GameNavigationMap.badgesGuide) })
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

    /// Une sous-page s'ouvre par la PILE, au troisième niveau : le routeur n'est lu qu'au toucher, jamais dans le corps.
    private func open(_ link: ProgressionConceptLink) {
        router.push(GameNavigationMap.route(for: link))
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
        // « Jeu masqué » (#9481, #9564) : une fiche ouverte directement (notification, lien) ne montre que la carte
        // masquée, comme la première page — rien du jeu ne se peint par un chemin oublié.
        if prefs.prefs.hidden, viewModel.game != nil {
            GameHiddenCard(onSettings: { onOpenLink(.page(.settings)) })
        } else {
            ficheBody
        }
    }

    private var ficheBody: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xl) {
            hero
            ForEach(offers) { offer in
                GamePhotoOfferView(moment: offer, onStart: { photos.start($0) }, onLater: { photos.later($0) })
            }
            section(ConceptText.ficheWhat) {
                sentence(ConceptText.why(concept), strong: true)
                sentence(ConceptText.how(concept))
            }
            let facts = ProgressionConceptModel.facts(concept, progress: progress, game: game)
            if !facts.isEmpty {
                section(ConceptText.ficheWhere) {
                    ProgressionConceptFacts(facts: facts, concept: concept)
                }
            }
            section(ConceptText.ficheEarn) {
                sentence(ConceptText.tip1(concept))
                sentence(ConceptText.tip2(concept))
            }
            if ProgressionConceptGestures.exist(for: concept, progress: progress, game: game), !hasPiece {
                VStack(alignment: .leading, spacing: MeeshySpacing.xl) {
                    ProgressionConceptSectionTitle(text: ConceptText.sectionAct)
                    gestures
                }
                .id(ProgressionConceptSection.act)
            }
            let links = ProgressionConceptModel.links(concept).filter { game != nil || !$0.needsGame }
            if !links.isEmpty {
                VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
                    ProgressionConceptSectionTitle(text: ConceptText.ficheMore)
                    ForEach(links) { link in
                        ProgressionConceptRow(
                            title: link.title, symbol: link.symbol,
                            identifier: "progression.concept.link.\(link.id)", action: { onOpenLink(link) }
                        )
                    }
                }
                .id(ProgressionConceptSection.more)
            }
            Spacer().frame(height: MeeshySpacing.xl)
        }
        .fullScreenCover(item: Binding(get: { photos.active }, set: { if $0 == nil { photos.close() } })) { session in
            GamePhotoFlowView(session: session) { photos.close() }
        }
    }

    // MARK: - Le héros

    /// Le concept a-t-il sa PIÈCE de jeu ? Elle prend alors la place du héros générique (règle n° 3).
    private var hasPiece: Bool { ProgressionConceptGestures.isHero(for: concept, progress: progress, game: game) }

    private var gestures: some View {
        ProgressionConceptGestures(
            concept: concept, viewModel: viewModel, progress: progress, game: game, isDark: isDark,
            onOpenLink: onOpenLink, onReveal: onReveal
        )
    }

    @ViewBuilder
    private var hero: some View {
        if hasPiece {
            // UNE pièce, UN héros : l'anneau du niveau, la frappe, le détail de ligue ou les Élans REMPLACENT le
            // héros générique au lieu de s'y ajouter. Elle porte la section « À toi de jouer » qu'une entrée vise.
            // Aucun identifiant sur l'enveloppe : il recouvrirait celui de la pièce (« game.hero », la frappe…).
            VStack(alignment: .leading, spacing: MeeshySpacing.xl) { gestures }
                .id(ProgressionConceptSection.act)
        } else {
            ProgressionConceptHero(
                concept: concept,
                value: ProgressionConceptModel.value(concept, progress: progress, game: game),
                gauge: ProgressionConceptModel.gauge(concept, progress: progress, game: game),
                game: game
            )
            .gameElement(GameElementDetails.hero(of: concept, progress: progress, game: game), identifier: "progression.concept.hero")
        }
    }

    // MARK: - Les sections

    private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        // Le contenu est bâti ICI : la carte garde sa fermeture, elle ne peut pas retenir un paramètre non échappant.
        let lines = content()
        return VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            ProgressionConceptSectionTitle(text: title)
            ProgressionCard(tint: concept.tint) {
                VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
                    lines
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
        case .page: true
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
        card.accessibilityElement(children: .combine)
    }

    private var card: some View {
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
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                        .modifier(GameValueRoll(value: value))
                    if let gauge {
                        ProgressionBar(progress: gauge, tint: concept.tint, label: ConceptText.name(concept))
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .contentShape(Rectangle())
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
    static func exist(for concept: ProgressionConcept, progress: EngagementProgress, game: GameBlock?) -> Bool {
        switch concept {
        case .level, .flame, .elans, .badges, .succes: true
        case .points, .missions: game != nil
        case .meesh: game != nil || progress.meesh != nil
        case .league: GameLeagueDetailCard.make(league: game?.league, onOpen: {}) != nil
        case .glory, .season, .prestige, .defis, .showcase, .atlas: false
        }
    }

    /// La pièce de jeu EST-elle le héros de la fiche ? Pour le niveau (son anneau), les Meeshes (la frappe), la ligue
    /// (son détail) et les Élans : elle dit déjà la valeur de tête, un héros générique la redirait (règle n° 3).
    static func isHero(for concept: ProgressionConcept, progress: EngagementProgress, game: GameBlock?) -> Bool {
        switch concept {
        case .level, .meesh, .league, .elans: exist(for: concept, progress: progress, game: game)
        case .points, .glory, .flame, .missions, .season, .prestige, .badges, .defis, .succes, .showcase, .atlas: false
        }
    }

    var body: some View {
        switch concept {
        case .level:
            if let game {
                // Le héro de niveau (#5841) EST le héros de cette fiche : anneau, rang, et « Comment gagner ».
                // L'anneau n'est dessiné qu'ici ; l'anneau et le blason s'y touchent.
                GameHeroView(game: game, settled: viewModel.isSettled, elan: progress.elan, onOpenGuide: {})
            } else {
                ProgressionLevelHero(progress: progress, isDark: isDark)
            }
        case .points:
            if game != nil {
                GameCard { GameHeroEarn(elan: progress.elan) }
            }
        case .meesh:
            if let game {
                // LE héro de frappe — le SEUL du jeu (#9537).
                GameMintPreviewView(
                    game: game, badgesLost: viewModel.mintBadgeImpact?.lost, online: viewModel.isOnline,
                    minting: viewModel.isMinting, error: viewModel.mintError,
                    celebration: viewModel.celebration, onMint: { Task { await viewModel.mint() } }
                )
                // Le palier du trésor : ce que les Meeshes gardées remplissent.
                GameElementTile(detail: GameElementDetails.treasuryTier(game.treasury))
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
                // La forme de la Flamme et les gels : deux éléments qui se touchent, au-dessus de leurs gestes.
                HStack(alignment: .top, spacing: MeeshySpacing.md) {
                    GameElementTile(detail: GameElementDetails.flameForm(game.flame))
                    GameElementTile(detail: GameElementDetails.freeze(game.flame))
                }
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
            GameBadgeShelfView(progress: progress)
        case .succes:
            ProgressionLastAchievementHero(progress: progress, isDark: isDark, onReveal: onReveal)
        case .glory, .season, .prestige, .defis, .showcase, .atlas:
            EmptyView()
        }
    }
}

// MARK: - Une tuile d'élément

/// UN ÉLÉMENT QUI SE TOUCHE, en tuile : son emblème, son nom, son état. Elle rebondit et ouvre SES précisions.
/// Sert les éléments qu'aucune vue du jeu ne dessinait à part (la forme de la Flamme, les gels, le palier du trésor).
struct GameElementTile: View {
    let detail: GameElementDetail

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        ProgressionCard(tint: detail.concept.tint) {
            HStack(alignment: .center, spacing: MeeshySpacing.md) {
                GameElementEmblemView(emblem: detail.emblem, size: 44)
                VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                    Text(detail.name)
                        .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                        .foregroundColor(theme.textPrimary)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(detail.statusLine)
                        .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                        .foregroundColor(theme.textMuted)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                        .modifier(GameValueRoll(value: detail.statusLine))
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .frame(minHeight: MeeshyControlSize.tapTarget)
        }
        .accessibilityElement(children: .combine)
        .gameElement(detail)
    }
}
