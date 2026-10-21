import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Une saison passée ou future, une semaine passée, quand un lien les ouvre (#10018)
//
// Miroir de `apps/web/src/components/game-archive.tsx`. Rien de la présence d'autrui : une saison montre son
// calendrier (le même pour tous) et MON palmarès ; une semaine, MON résultat gravé.

/// La page Saison, sur la saison qu'un lien nomme. La saison en cours garde l'écran d'avant, inchangé.
struct GameSeasonFocusScreen: View {
    @ObservedObject var model: GameWave2Model
    let game: GameBlock
    let focus: Int?
    /// L'instant qui juge l'état de la saison (#10225) : celui de la `TimelineView` de la page, qui se renouvelle
    /// au dimanche 20 h ; l'horloge locale par défaut.
    let moment: LeagueMoment?
    @StateObject private var archive: GameArchiveModel

    init(model: GameWave2Model, game: GameBlock, focus: Int?, moment: LeagueMoment? = nil, archive: GameArchiveModel? = nil) {
        self.model = model
        self.game = game
        self.focus = focus
        self.moment = moment
        _archive = StateObject(wrappedValue: archive ?? GameArchiveModel())
    }

    var body: some View {
        let shown = GameSeasonShown.of(focus: focus, game: game, load: archive.season, moment: moment ?? .local(),
                                       schedule: model.seasonSchedule)
        Group {
            if shown == .current {
                GameSeasonScreen(model: model, game: game, moment: moment)
            } else {
                GameSeasonArchiveView(shown: shown) { reload() }
            }
        }
        .task(id: focus) {
            // Au retour du réseau (#10131), le bloc `game` gardé se relit avec la saison : une saison ouverte à
            // l'horloge locale retrouve alors son parcours.
            let progression = model.progression
            archive.onReconnect = { await progression.load(forceNetwork: true) }
            await load()
        }
    }

    private func load() async {
        guard GameSeasonShown.needsArchive(focus: focus, game: game), let focus else { return }
        await archive.loadSeason(number: focus)
    }

    private func reload() {
        Task { await load() }
    }
}

/// Ce que la page Saison montre d'une saison qui n'est pas en cours.
struct GameSeasonArchiveView: View {
    let shown: GameSeasonShown
    let retry: () -> Void

    var body: some View {
        switch shown {
        case .current:
            EmptyView()
        case .upcoming(let upcoming):
            GameSeasonUpcoming(upcoming: upcoming)
        case .opened(let season):
            GameSeasonOpened(season: season)
        case .past(let season):
            GameSeasonRecord(season: season)
        case .skeleton:
            ProgressionSkeleton()
        case .failed(let message):
            GameCard(title: GameText.seasonTitle) {
                GameRetryBlock(message: message, retry: retry)
            }
        }
    }
}

/// LE PALMARÈS d'une saison passée : mes étoiles, mes étapes, les récompenses réclamées, la coupe et le Sceau.
struct GameSeasonRecord: View {
    let season: GameSeasonArchive

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        GameCard(tint: MeeshyColors.brandPrimary, title: GameText.archiveSeasonPastTitle(number: GameCopy.formatCount(season.number))) {
            if let themeName = GameWave2Format.seasonTheme(season.themeKey) {
                Text(GameText.seasonTheme(theme: themeName))
                    .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                    .foregroundColor(MeeshyColors.brandPrimary)
            }
            GameNote(text: GameText.archiveSeasonDates(start: GameWave2Format.day(season.startDay), end: GameWave2Format.day(season.endDay)))
            if let progress = season.progress {
                played(progress)
            } else {
                GameNote(text: GameText.archiveSeasonNotPlayed)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("game.season.archive")
    }

    @ViewBuilder
    private func played(_ progress: GameSeasonProgressArchive) -> some View {
        let stepsLine = GameText.seasonStepsLine(steps: GameCopy.formatCount(progress.steps), total: GameCopy.formatCount(GameSeason.steps))
        Text(GameText.seasonStars(count: progress.stars) + " · " + stepsLine)
            .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
            .foregroundColor(theme.textPrimary)
        GameProgressBar(value: Double(progress.steps) / Double(max(1, GameSeason.steps)), tint: MeeshyColors.brandPrimary, label: stepsLine)
        GameNote(text: GameText.archiveSeasonRewards(count: progress.claimedSteps.count))
        if progress.completed {
            GameNote(text: GameText.archiveSeasonCupWon, tone: MeeshyColors.success)
        } else {
            GameNote(text: GameText.archiveSeasonCupMissed)
        }
        if progress.sealOwned {
            GameNote(text: GameText.archiveSeasonSealOwned, tone: MeeshyColors.success)
        }
    }
}

// MARK: - La semaine de ligue

/// La page Ligue, sur la semaine qu'un lien nomme. La semaine en cours garde l'écran d'avant, inchangé.
struct GameLeagueFocusScreen: View {
    @ObservedObject var model: GameWave2Model
    let game: GameBlock
    let focus: String?
    @StateObject private var archive: GameArchiveModel

    init(model: GameWave2Model, game: GameBlock, focus: String?, archive: GameArchiveModel? = nil) {
        self.model = model
        self.game = game
        self.focus = focus
        _archive = StateObject(wrappedValue: archive ?? GameArchiveModel())
    }

    var body: some View {
        let shown = GameLeagueShown.of(focus: focus, game: game, load: archive.week)
        Group {
            switch shown {
            case .current:
                GameLeagueScreen(model: model, game: game)
            case .week(let week):
                GameLeagueWeekArchiveCard(archive: week)
            case .skeleton:
                ProgressionSkeleton()
            case .failed(let message):
                GameCard(title: GameText.leagueTitle) {
                    GameRetryBlock(message: message) { reload() }
                }
            }
        }
        .task(id: focus) { await load() }
    }

    private func load() async {
        guard GameLeagueShown.needsArchive(focus: focus, game: game), let focus else { return }
        await archive.loadWeek(key: focus)
    }

    private func reload() {
        Task { await load() }
    }
}

/// MON RÉSULTAT GRAVÉ d'une semaine : la ligue, le rang final, la zone et la coupe — ou la purge, ou l'absence de
/// place. Aucun autre membre du groupe ne se relit.
struct GameLeagueWeekArchiveCard: View {
    let archive: GameLeagueWeekArchive

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        GameCard(title: GameText.leagueTitle + " · " + GameWave2Format.week(archive.weekKey)) {
            content
            GameNote(text: GameText.archiveWeekPrivacy)
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("game.league.archive")
    }

    @ViewBuilder
    private var content: some View {
        if archive.status == .upcoming {
            GameNote(text: GameText.archiveWeekUpcoming)
        } else if let result = archive.result {
            engraved(result)
        } else if archive.retention == .purged {
            GameNote(text: GameText.archiveWeekPurged)
        } else {
            GameNote(text: GameText.archiveWeekNotPlaced)
        }
    }

    private func zoneColor(_ zone: LeagueZone) -> Color {
        switch zone {
        case .promotion: MeeshyColors.success
        case .safe: theme.textMuted
        case .relegation: MeeshyColors.error
        }
    }

    private func engraved(_ result: GameLeagueWeekResult) -> some View {
        HStack(alignment: .center, spacing: MeeshySpacing.md) {
            LeagueGemView(league: result.league)
                .frame(width: 64, height: 64)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                Text(GameText.leagueName(result.league))
                    .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .bold))
                    .foregroundColor(theme.textPrimary)
                if let rank = result.finalRank {
                    Text(GameText.archiveWeekRank(rank: GameCopy.formatCount(rank)))
                        .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                        .foregroundColor(theme.textPrimary)
                }
                if let points = result.finalPoints {
                    GameNote(text: GameText.archiveWeekPoints(points: GameCopy.points(points)))
                }
                if let zone = result.zone {
                    Text(GameText.zoneLabel(zone))
                        .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                        .foregroundColor(zoneColor(zone))
                }
                if let cup = result.cup {
                    Text(GameText.cupName(cup))
                        .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                        .foregroundColor(GameMaterial.gold.ink)
                } else if result.settled {
                    GameNote(text: GameText.archiveWeekNoCup)
                }
                if !result.settled {
                    GameNote(text: GameText.archiveWeekUnsettled)
                }
            }
        }
    }
}
