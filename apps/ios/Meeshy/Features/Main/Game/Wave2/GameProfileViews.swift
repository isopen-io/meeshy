import SwiftUI
import MeeshySDK
import MeeshyUI

/// LE JEU SUR SON PROFIL (#9481) — ce que la personne montre d'elle-même : l'anneau de niveau (emblème du palier,
/// chiffre romain, étoiles de Prestige), le blason de son rang et sa division, le trésor, la Flamme, la vitrine de
/// trophées, ses meilleures médailles, et la porte vers Progression. Une carte, pas un écran : le profil reste le
/// profil. Miroir de `apps/web/src/components/game-profile-own.tsx`.
///
/// C'est SA vue : il montre tout, quels que soient ses réglages de visibilité (ils disent ce que les AUTRES en
/// voient). Cache-first : il lit le cache de la progression et ne bloque rien ; sans bloc `game` (ancien serveur,
/// jeu pas encore chargé) ou jeu masqué, il ne se dessine pas.
struct GameProfileOwnCard: View {
    let onOpenProgression: () -> Void
    let onOpenShowcase: () -> Void
    var source: GameProfileSourcing = CachedGameProfileSource()

    @ObservedObject private var prefs = GameDevicePrefsStore.current()
    @State private var content: GameProfileContent?

    private static let shelfSize = 4
    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        Group {
            if !prefs.prefs.hidden, let content {
                card(content)
            }
        }
        .task { content = await source.load() }
    }

    private func card(_ content: GameProfileContent) -> some View {
        let game = content.game
        let shelf = shelfEntries(game)
        return GameCard(title: GameText.profileTitle) {
            header(game)
            stats(game)
            if !shelf.isEmpty { showcase(shelf) }
            if !content.medals.isEmpty { medals(content.medals) }
            GameQuietButton(title: GameText.profileSeeProgress, identifier: "game.profile.progress", action: onOpenProgression)
        }
        .accessibilityIdentifier("game.profile")
    }

    // MARK: Le niveau et le rang

    private func header(_ game: GameBlock) -> some View {
        HStack(alignment: .center, spacing: MeeshySpacing.lg) {
            LevelRingView(
                level: game.level.shown.level, progress: game.level.shown.progress, tier: game.level.shown.tier, prestige: game.level.prestige,
                trackColor: theme.textMuted.opacity(MeeshyOpacity.light), inkColor: theme.textPrimary,
                accessibilityLabel: GameCopy.levelRingAccessibility(level: game.level.shown.level, tier: game.level.shown.tier)
            )
            .frame(width: 80, height: game.level.prestige > 0 ? 94 : 80)
            VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                Text(GameText.profileLevel(level: GameCopy.formatCount(game.level.shown.level), tier: GameCopy.tierName(game.level.shown.tier)))
                    .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .bold))
                    .foregroundColor(theme.textPrimary)
                Text(GameCopy.rankLabel(game.glory))
                    .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
                    .foregroundColor(theme.textPrimary)
                Text(GameText.profileGlory(glory: GameCopy.formatCount(game.glory.glory)))
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                    .foregroundColor(theme.textMuted)
            }
            Spacer(minLength: 0)
            RankBlasonView(rank: game.glory.rank, division5: game.glory.shownDivision, level: game.level.shown.level,
                           mythic: game.glory.mythicSeat, title: GameCopy.rankName(game.glory.rank), figures: nil)
                .frame(width: 64, height: 60)
        }
        .accessibilityElement(children: .combine)
    }

    // MARK: Le trésor et la Flamme

    private func stats(_ game: GameBlock) -> some View {
        HStack(spacing: MeeshySpacing.lg) {
            Text(game.treasury.tier.map {
                GameText.profileTreasury(meeshes: GameCopy.meeshes(game.treasury.held), tier: GameCopy.treasuryName($0))
            } ?? GameCopy.meeshes(game.treasury.held))
            HStack(spacing: MeeshySpacing.xs) {
                FlameView(form: game.flame.form ?? .braise, flickers: false)
                    .frame(width: 18, height: 18)
                    .accessibilityHidden(true)
                Text(GameText.profileFlame(days: GameCopy.days(game.flame.days)))
            }
            Spacer(minLength: 0)
        }
        .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .medium))
        .foregroundColor(theme.textPrimary)
        .accessibilityElement(children: .combine)
    }

    // MARK: La vitrine

    private func shelfEntries(_ game: GameBlock) -> [(key: String, view: GameTrophyPresentation)] {
        guard let trophies = game.trophies else { return [] }
        return GameShowcaseRules.shelfOrder(trophies).compactMap { key in
            GameTrophyPresentation.of(key: key).map { (key: key, view: $0) }
        }
    }

    private func showcase(_ shelf: [(key: String, view: GameTrophyPresentation)]) -> some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            Text(GameText.profileShowcase.uppercased())
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                .foregroundColor(theme.textMuted)
                .accessibilityAddTraits(.isHeader)
            HStack(alignment: .bottom, spacing: MeeshySpacing.md) {
                ForEach(Array(shelf.prefix(Self.shelfSize)), id: \.key) { entry in
                    GameTrophyArt(view: entry.view, height: 52)
                        .accessibilityHidden(false)
                        .accessibilityLabel(entry.view.title)
                }
            }
            GameQuietButton(title: GameText.profileSeeShowcase, identifier: "game.profile.showcase", action: onOpenShowcase)
        }
    }

    // MARK: Les médailles

    private func medals(_ items: [GameBadgeItem]) -> some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            Text(GameText.profileMedals.uppercased())
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                .foregroundColor(theme.textMuted)
                .accessibilityAddTraits(.isHeader)
            HStack(alignment: .bottom, spacing: MeeshySpacing.md) {
                ForEach(items) { item in
                    GameMedalView(
                        family: item.family, glyph: item.glyph, material: item.material, progress: item.progress,
                        label: GameCopy.formatCount(item.threshold), muted: theme.textMuted,
                        accessibilityLabel: ProgressionCopy.title(for: item.axis) + ", " + GameCopy.materialName(item.material)
                    )
                    .frame(width: 44, height: 49)
                }
            }
        }
    }
}

// MARK: - Le jeu d'un autre : ce que SES réglages autorisent

/// Son niveau et son rang (réglage `rank`), le palier de son trésor (réglage `treasury`), sa vitrine (réglage
/// `showcase`) — chacun lu SEUL : un réglage fermé ne dessine que ce qui reste ouvert.
struct GameProfileVisitorCard: View {
    let userId: String
    let name: String
    var loader = GameShowcaseLoader()
    var standingLoader = GameUserGameLoader()

    @ObservedObject private var prefs = GameDevicePrefsStore.current()
    @State private var read: GameVisitorRead?

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        Group {
            if let shown = GameVisitorRead.shown(read, for: userId, hidden: prefs.prefs.hidden) {
                GameCard(title: shown.standing != nil ? GameText.visitorGameTitle(name: name) : GameText.profileVisitorTitle(name: name)) {
                    if let standing = shown.standing { GameStandingView(content: standing) }
                    if !shown.entries.isEmpty { showcaseGrid(shown.entries) }
                }
                .accessibilityIdentifier("game.profile.visitor")
            }
        }
        .task(id: userId) {
            guard !prefs.prefs.hidden else { return }
            if let fresh = await GameVisitorLoading.read(userId: userId, kept: read, showcase: loader, standing: standingLoader,
                                                         paintCached: { read = $0 }) {
                read = fresh
            }
        }
    }

    private func showcaseGrid(_ entries: [GameVisitorShowcase.Entry]) -> some View {
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: MeeshySpacing.lg) {
            ForEach(entries) { entry in
                VStack(spacing: MeeshySpacing.xs) {
                    GameTrophyArt(view: entry.presentation, height: 72)
                    Text(entry.presentation.title)
                        .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
                        .foregroundColor(theme.textPrimary)
                        .multilineTextAlignment(.center)
                    Text(entry.caption)
                        .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                        .foregroundColor(theme.textMuted)
                        .multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity)
                .accessibilityElement(children: .combine)
            }
        }
    }
}

/// La lecture commune à la carte du profil et à la bande de la carte de contact. Cache d'abord : ce que le disque a
/// gardé se peint tout de suite (sauf si la vue montre déjà CE membre), la lecture servie le remplace — ou l'efface,
/// quand le membre a fermé son réglage entre-temps. Une lecture ANNULÉE (la vue est passée à un autre membre) ne
/// rend rien : arrivée après celle du suivant, elle l'écraserait.
enum GameVisitorLoading {
    static func read(
        userId: String, kept: GameVisitorRead?, showcase: GameShowcaseLoader, standing: GameUserGameLoader,
        paintCached: (GameVisitorRead) -> Void
    ) async -> GameVisitorRead? {
        if kept?.userId != userId {
            let cachedShowcase = await showcase.cached(userId: userId)
            let cachedStanding = await standing.cached(userId: userId)
            guard !Task.isCancelled else { return nil }
            paintCached(GameVisitorRead(userId: userId, entries: GameVisitorShowcase.entries(cachedShowcase), standing: cachedStanding))
        }
        async let freshShowcase = showcase.load(userId: userId)
        async let freshStanding = standing.load(userId: userId)
        let read = GameVisitorRead(userId: userId, entries: GameVisitorShowcase.entries(await freshShowcase), standing: await freshStanding)
        return Task.isCancelled ? nil : read
    }
}

/// LA BANDE DE LA CARTE DE CONTACT (#9481) — le niveau et le rang (rangée compacte) puis trois coupes au plus, en
/// lecture seule, sous le nom d'un compte Meeshy dans la fiche complète d'une carte de visite. Même règle que la
/// vitrine : ce que le serveur ne sert pas ne se dessine pas.
struct GameContactStrip: View {
    let userId: String
    var loader = GameShowcaseLoader()
    var standingLoader = GameUserGameLoader()

    @ObservedObject private var prefs = GameDevicePrefsStore.current()
    @State private var read: GameVisitorRead?

    var body: some View {
        Group {
            if let shown = GameVisitorRead.shown(read, for: userId, hidden: prefs.prefs.hidden) {
                VStack(alignment: .leading, spacing: MeeshySpacing.xsPlus) {
                    if let standing = shown.standing { GameStandingView(content: standing, compact: true) }
                    if !shown.entries.isEmpty { trophies(shown.entries) }
                }
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("game.contact.strip")
            }
        }
        .task(id: userId) {
            guard !prefs.prefs.hidden else { return }
            if let fresh = await GameVisitorLoading.read(userId: userId, kept: read, showcase: loader, standing: standingLoader,
                                                         paintCached: { read = $0 }) {
                read = fresh
            }
        }
    }

    private func trophies(_ entries: [GameVisitorShowcase.Entry]) -> some View {
        HStack(alignment: .bottom, spacing: MeeshySpacing.sm) {
            ForEach(entries.prefix(3)) { entry in
                GameTrophyArt(view: entry.presentation, height: 32)
                    .accessibilityHidden(false)
                    .accessibilityLabel(entry.presentation.title)
            }
            Spacer(minLength: 0)
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(GameText.profileShowcase)
    }
}
