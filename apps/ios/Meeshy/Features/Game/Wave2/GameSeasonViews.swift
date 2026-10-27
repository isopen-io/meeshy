import SwiftUI
import MeeshySDK
import MeeshyUI

/// LA PAGE « SAISON » (#9386, conception II.7) — huit semaines, un thème (une langue), quarante étapes
/// GRATUITES, une rangée Sceau cosmétique. Les étoiles viennent des missions du jour et du duo ; quatre
/// étoiles ouvrent une étape. Miroir de `apps/web/src/components/game-season.tsx`.
///
/// RIEN N'Y RAPPORTE DE L'ARGENT (conformité C-1) : le Sceau se prend en Meeshes (10) et reste décoratif ; il
/// ne change rien au jeu. Chaque étape dit son état par le TEXTE (réclamée, à réclamer, à venir), pas
/// seulement par la couleur. Toucher une étape à réclamer la réclame ; le bouton nomme la prochaine.
///
/// Aucune saison ouverte (`season` absente) est une VALEUR, pas une panne : la prochaine commence bientôt.
///
/// `focus` : la saison qu'un lien du Jeu nomme (#9947). Passée, elle montre mon palmarès ; future, son thème et sa
/// date d'ouverture ; en cours, l'écran ci-dessous, inchangé (`GameSeasonFocusScreen`, #10018).
struct GameSeasonPage: View {
    var focus: GamePageFocus? = nil

    var body: some View {
        GamePageShell(title: GameText.seasonTitle, identifier: "game.season.page") {
            GameWave2Host { model, game in
                // Restée ouverte, la page se repeint à la fermeture du dimanche 20 h (#10225) : c'est le seul instant
                // où l'état d'une saison change, la `TimelineView` y relit l'horloge locale.
                TimelineView(GameSeasonFlipSchedule()) { context in
                    GameSeasonFocusScreen(model: model, game: game, focus: focus?.seasonNumber, moment: .local(context.date))
                }
            }
        }
    }
}

/// LES INSTANTS OÙ UNE PAGE SAISON SE REPEINT (#10225) — maintenant, puis chaque fermeture de semaine (dimanche
/// 20 h local, `GameLeague.nextWeekClose`), seule bascule possible de l'état d'une saison. Miroir du minuteur web
/// (`apps/web/src/lib/game/season-clock.ts`).
struct GameSeasonFlipSchedule: TimelineSchedule {
    var calendar: Calendar = .current

    func entries(from startDate: Date, mode: TimelineScheduleMode) -> AnyIterator<Date> {
        var next: Date? = startDate
        let calendar = calendar
        return AnyIterator {
            guard let current = next else { return nil }
            next = Self.nextClose(after: current, calendar: calendar)
            return current
        }
    }

    /// La prochaine fermeture de semaine, STRICTEMENT après `date`, en date locale.
    static func nextClose(after date: Date, calendar: Calendar = .current) -> Date? {
        let close = GameLeague.nextWeekClose(after: .local(date, calendar: calendar))
        let parts = close.dayKey.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        let at = calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2],
                                                     hour: close.minuteOfDay / 60, minute: close.minuteOfDay % 60))
        guard let at, at > date else { return nil }
        return at
    }
}

struct GameSeasonScreen: View {
    @ObservedObject var model: GameWave2Model
    let game: GameBlock
    /// L'instant qui juge l'état de la saison (#10225) — l'horloge locale par défaut.
    var moment: LeagueMoment? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xl) {
            if let season = game.season {
                GameSeasonHeader(season: season)
                GameSeasonPath(model: model, season: season)
                GameSeasonSeal(model: model, season: season, held: game.treasury.held)
            } else if let upcoming = game.seasonUpcoming {
                GameSeasonUpcoming(upcoming: upcoming, moment: moment)
            } else {
                GameCard(title: GameText.seasonTitle) {
                    GameNote(text: GameText.seasonNone)
                }
                .accessibilityIdentifier("game.season.none")
            }
        }
    }
}

// MARK: - La saison à venir (#10014)

/// Avant l'ouverture de la saison 1 (lundi 2026-12-21), le serveur sert `seasonUpcoming` : l'écran dit
/// laquelle vient, quand, et sur quel thème — jamais un vide. Une donnée de calendrier, la même pour tous.
///
/// Son état se calcule à l'horloge locale (#10131) : le jour de l'ouverture, la carte gardée hors ligne devient celle
/// d'une saison OUVERTE (`GameSeasonOpened`), sans attendre le réseau.
struct GameSeasonUpcoming: View {
    let upcoming: GameUpcomingSeasonBlock
    var moment: LeagueMoment? = nil

    static func line(_ upcoming: GameUpcomingSeasonBlock, locale: Locale = .current) -> String {
        GameText.seasonUpcoming(number: GameCopy.formatCount(upcoming.number), date: GameWave2Format.day(upcoming.startDay, locale: locale))
    }

    var body: some View {
        let tense = GameSeason.liveTense(served: .upcoming, startDay: upcoming.startDay, endDay: upcoming.endDay,
                                         at: moment ?? .local())
        if tense == .upcoming {
            card
        } else {
            GameSeasonOpened(season: upcoming)
        }
    }

    private var card: some View {
        GameCard(tint: MeeshyColors.brandPrimary, title: GameText.seasonTitle) {
            Text(Self.line(upcoming))
                .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                .foregroundColor(ThemeManager.shared.textPrimary)
            if let theme = GameWave2Format.seasonTheme(upcoming.themeKey) {
                Text(GameText.seasonTheme(theme: theme))
                    .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                    .foregroundColor(MeeshyColors.brandPrimary)
            }
            GameNote(text: GameText.seasonHow(per: GameCopy.formatCount(GameSeason.starsPerStep)))
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("game.season.upcoming")
    }
}

/// Une saison OUVERTE dont le bloc gardé ne porte pas encore le parcours (#10131) : hors ligne, le jour de son
/// ouverture. Son numéro, son état, son thème et ses dates ; le parcours se lit au retour du réseau. Miroir de
/// `GameSeasonOpened` (`apps/web/src/components/game-season.tsx`).
struct GameSeasonOpened: View {
    let season: GameUpcomingSeasonBlock

    var body: some View {
        GameCard(tint: MeeshyColors.brandPrimary, title: GameText.archiveSeasonCurrentTitle(number: GameCopy.formatCount(season.number))) {
            if let theme = GameWave2Format.seasonTheme(season.themeKey) {
                Text(GameText.seasonTheme(theme: theme))
                    .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                    .foregroundColor(MeeshyColors.brandPrimary)
            }
            GameNote(text: GameText.archiveSeasonDates(start: GameWave2Format.day(season.startDay),
                                                       end: GameWave2Format.day(season.endDay)))
            GameNote(text: GameText.archiveSeasonOpenedNote)
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("game.season.opened")
    }
}

// MARK: - L'en-tête : où j'en suis

private struct GameSeasonHeader: View {
    let season: GameSeasonBlock

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        let stepsLine = GameText.seasonStepsLine(steps: GameCopy.formatCount(season.steps), total: GameCopy.formatCount(season.stepsTotal))
        GameCard(tint: MeeshyColors.brandPrimary, title: GameText.seasonHeading(
            number: GameCopy.formatCount(season.number), week: GameCopy.formatCount(season.week),
            total: GameCopy.formatCount(GameSeason.weeks))) {
            if let theme = GameWave2Format.seasonTheme(season.themeKey) {
                Text(GameText.seasonTheme(theme: theme))
                    .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                    .foregroundColor(MeeshyColors.brandPrimary)
            }
            Text(GameText.seasonStars(count: season.stars) + " · " + stepsLine)
                .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                .foregroundColor(self.theme.textPrimary)
            GameProgressBar(value: Double(season.steps) / Double(max(1, season.stepsTotal)), tint: MeeshyColors.brandPrimary, label: stepsLine)
            if season.completed {
                GameNote(text: GameText.seasonCompleted, tone: MeeshyColors.success)
            } else {
                GameNote(text: GameText.seasonToNext(stars: GameText.seasonStars(count: season.starsToNext)))
            }
            GameNote(text: GameText.seasonHow(per: GameCopy.formatCount(GameSeason.starsPerStep)))
        }
        .accessibilityIdentifier("game.season.header")
    }
}

// MARK: - Le parcours : quarante étapes

private struct GameSeasonPath: View {
    @ObservedObject var model: GameWave2Model
    let season: GameSeasonBlock

    private let columns = Array(repeating: GridItem(.flexible(), spacing: MeeshySpacing.xsPlus), count: 5)

    var body: some View {
        GameCard(title: GameText.seasonPath) {
            if let next = season.nextReward {
                GameActionButton(
                    title: GameText.seasonClaim(step: GameCopy.formatCount(next.step)) + " · "
                        + GameText.seasonRewardLabel(SeasonReward(kind: next.reward.kind, amount: next.reward.amount)),
                    busy: model.pending.claimingStep != nil, disabled: !model.isOnline,
                    tint: MeeshyColors.brandPrimary, identifier: "game.season.claim"
                ) {
                    Task { await model.claim(step: next.step) }
                }
            }
            GameErrorLine(message: model.errors.claim, identifier: "game.season.claim.error")
            LazyVGrid(columns: columns, spacing: MeeshySpacing.xsPlus) {
                ForEach(1...GameSeason.steps, id: \.self) { step in
                    GameSeasonStepButton(
                        step: step, reward: season.stepReward(step), state: GameSeasonStepState.of(step: step, in: season),
                        online: model.isOnline,
                        busy: model.pending.claimingStep == step, detail: GameElementDetails.seasonStep(step, in: season)
                    ) {
                        Task { await model.claim(step: step) }
                    }
                }
            }
            GameOfflineNote(online: model.isOnline)
        }
        .accessibilityIdentifier("game.season.path")
    }
}

/// UNE ÉTAPE (44 pt) : son état est dit par un mot, jamais par la seule couleur. Réclamée ✓, à réclamer
/// (bouton), à venir (éteinte) ; les récompenses spéciales — fragment, gel, coupe — portent leur marque.
private struct GameSeasonStepButton: View {
    let step: Int
    /// Sa récompense, aux points de LA saison (`GameSeasonBlock.stepReward`, #10232).
    let reward: SeasonReward?
    let state: GameSeasonStepState
    let online: Bool
    let busy: Bool
    /// Les précisions de l'étape : une étape qui ne se réclame pas (déjà réclamée, ou à venir) les ouvre au toucher.
    let detail: GameElementDetail
    let onClaim: () -> Void

    @Environment(\.gameOpenDetail) private var openDetail
    private var theme: ThemeManager { ThemeManager.shared }

    /// L'étape répond-elle au toucher ? Prête : elle se réclame (en ligne, hors geste en vol). Sinon : elle
    /// ouvre ses précisions, quand la page en présente.
    private var responds: Bool {
        state == .ready ? online && !busy : openDetail != nil
    }

    private var tint: Color {
        switch state {
        case .claimed: MeeshyColors.success
        case .ready: MeeshyColors.brandPrimary
        case .locked: theme.textMuted
        }
    }

    private var mark: String {
        if state == .claimed { return "✓" }
        switch reward?.kind {
        case .fragment?: return "◆"
        case .freeze?: return "✦"
        case .seasonCup?: return "★"
        default: return " "
        }
    }

    private var spoken: String {
        let rewardText = reward.map { GameText.seasonRewardLabel($0) } ?? ""
        return GameText.seasonStep(step: GameCopy.formatCount(step)) + ", " + GameText.seasonStepState(state) + ", " + rewardText
    }

    var body: some View {
        Button {
            guard responds else { return }
            HapticFeedback.light()
            if state == .ready { onClaim() } else { openDetail?(detail) }
        } label: {
            VStack(spacing: 0) {
                Text(GameCopy.formatCount(step))
                    .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .bold))
                Text(mark)
                    .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .medium))
            }
            .foregroundColor(tint)
            .frame(maxWidth: .infinity, minHeight: MeeshyControlSize.tapTarget)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.sm, style: .continuous)
                    .fill(state == .locked ? Color.clear : tint.opacity(state == .ready ? MeeshyOpacity.light : MeeshyOpacity.subtle))
            )
            .overlay(
                RoundedRectangle(cornerRadius: MeeshyRadius.sm, style: .continuous)
                    .stroke(tint.opacity(state == .locked ? MeeshyOpacity.medium : MeeshyOpacity.strong), lineWidth: MeeshyBorder.regular)
            )
        }
        .buttonStyle(GameBounceButtonStyle())
        .disabled(!responds)
        .opacity(busy ? 0.6 : 1)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(spoken)
        .accessibilityAddTraits(responds ? .isButton : [])
        .accessibilityIdentifier("game.season.step.\(step)")
    }
}

// MARK: - La rangée Sceau

/// La rangée SCEAU (10 Meeshes) : un cosmétique toutes les quatre étapes, SANS AUCUN avantage de jeu. Elle se
/// prend en Meeshes — jamais en argent — et dit ce qui manque quand le solde ne suffit pas.
private struct GameSeasonSeal: View {
    @ObservedObject var model: GameWave2Model
    let season: GameSeasonBlock
    let held: Int

    private var theme: ThemeManager { ThemeManager.shared }

    private var sealSteps: [Int] {
        Array(stride(from: GameSeason.sealEvery, through: GameSeason.steps, by: GameSeason.sealEvery))
    }

    var body: some View {
        GameCard(title: GameText.seasonSealTitle) {
            GameNote(text: GameText.seasonSealBody(every: GameCopy.formatCount(GameSeason.sealEvery)))
            // Dix pastilles ne tiennent pas sur une ligne d'iPhone : deux rangées de cinq, comme le parcours.
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: MeeshySpacing.xsPlus), count: 5), spacing: MeeshySpacing.sm) {
                ForEach(sealSteps, id: \.self) { step in
                    sealMark(step)
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(GameText.seasonSealCosmetic)
            // Le Sceau SE TOUCHE (#9564) : la rangée rebondit et ouvre ses précisions.
            .gameElement(GameElementDetails.seal(season))
            if season.sealOwned {
                GameNote(text: GameText.seasonSealOwned, tone: MeeshyColors.success)
            } else {
                // Avant l'achat : les Meeshes en poche, le prix et ce qui restera — ou combien il en manque (#9705).
                let spend = GameSpend.preview(held: held, cost: season.sealPrice)
                GameFactChipRow(concept: .season, items: GameSpendRows.spend(spend, format: GameCopy.meeshes, missing: { ConceptText.spendMissingSeal(missing: $0) }),
                                identifier: "game.season.seal.spend")
                GameActionButton(
                    title: GameText.seasonSealBuy(price: GameCopy.meeshes(season.sealPrice)), busy: model.pending.seal,
                    disabled: !model.isOnline || !spend.affordable, tint: MeeshyColors.warning, identifier: "game.season.seal.buy"
                ) {
                    Task { await model.buySeal() }
                }
            }
            GameErrorLine(message: model.errors.seal, identifier: "game.season.seal.error")
        }
        .accessibilityIdentifier("game.season.seal")
    }

    /// Une pastille de la rangée : allumée quand le Sceau est possédé ET l'étape atteinte.
    private func sealMark(_ step: Int) -> some View {
        let lit = season.sealOwned && step <= season.steps
        return VStack(spacing: MeeshySpacing.xxs) {
            SignatureMark(style: lit ? .engraved : .flat, color: lit ? GameMaterial.gold.ink : theme.textMuted)
                .frame(width: 30, height: 30)
                .padding(MeeshySpacing.xs)
                .background(Circle().fill(lit ? AnyShapeStyle(GameMaterial.gold.gradient) : AnyShapeStyle(theme.textMuted.opacity(MeeshyOpacity.subtle))))
            Text(GameCopy.formatCount(step))
                .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .medium))
                .foregroundColor(theme.textMuted)
        }
        .frame(maxWidth: .infinity)
    }
}
