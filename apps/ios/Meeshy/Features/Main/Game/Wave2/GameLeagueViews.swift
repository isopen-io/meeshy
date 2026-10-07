import SwiftUI
import MeeshySDK
import MeeshyUI

/// LA PAGE « LIGUE » (#9384, #9385) — la ligue publique, la ligue entre amis, la mission en duo. Une page
/// dédiée du hub Progression, au même cadre que le carnet et les règles : retour, titre, hors-ligne dit.
/// Miroir de `apps/web/src/routes/progression-ligue.tsx`.
///
/// CACHE-FIRST. Le bloc `game` vient du cache de la progression (la même clé que le hub : aucune requête de
/// plus à l'ouverture) ; le classement et la ligue Amis sont des lectures à part, servies depuis leur cache
/// disque dès qu'il existe et rafraîchies en silence. Un squelette ne paraît que sur un cache VIDE.
struct GameLeaguePage: View {
    var body: some View {
        GamePageShell(title: GameText.leagueTitle, identifier: "game.league.page") {
            GameWave2Host { model, game in
                GameLeagueScreen(model: model, game: game)
            }
        }
    }
}

/// Aujourd'hui le pseudonyme CHOISI est fermé (conformité A-5) : la passerelle refuse tout pseudonyme
/// choisi tant que le filtre d'injures, le signalement par ligne et la décision motivée ne sont pas
/// ouverts. Proposer le champ ferait échouer le consentement de qui le remplit. Le jour où le contrat
/// dira que le choix est ouvert, ce drapeau le lira.
enum GameLeagueRules {
    static let chosenPseudonymOpen = false
}

struct GameLeagueScreen: View {
    @ObservedObject var model: GameWave2Model
    let game: GameBlock

    enum Tab: Hashable {
        case mine
        case friends
    }

    /// Ce qui relance la lecture : l'onglet, et — pour « ma ligue » — l'ouverture de la ligue. Consentir ouvre la
    /// ligue sans changer d'onglet : sans cette clé, le classement ne se lirait qu'en rouvrant la page.
    struct LoadKey: Hashable {
        let tab: Tab
        let leagueOpen: Bool
    }

    static func loadKey(tab: Tab, access: LeagueAccess?) -> LoadKey {
        LoadKey(tab: tab, leagueOpen: tab == .mine && access == .open)
    }

    @State private var tab: Tab = .mine
    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xl) {
            if let league = game.league {
                tabBar
                switch tab {
                case .mine:
                    GameLeagueMineView(model: model, game: game, league: league)
                case .friends:
                    GameFriendsLeagueCard(model: model)
                }
                if let duo = game.duo {
                    GameDuoCard(model: model, duo: duo, levelRecord: game.level.record)
                }
            } else {
                GameNote(text: GameText.unavailable)
            }
        }
        .task(id: Self.loadKey(tab: tab, access: game.league?.access)) {
            switch tab {
            case .mine:
                if game.league?.access == .open { await model.loadWeek() }
            case .friends:
                await model.loadFriendsLeague()
            }
        }
        .task(id: game.duo?.unlocked) {
            if game.duo?.unlocked == true { await model.loadFriends() }
        }
    }

    private var tabBar: some View {
        HStack(spacing: MeeshySpacing.sm) {
            tabButton(.mine, title: GameText.leagueTabMine, id: "game.league.tab.mine")
            tabButton(.friends, title: GameText.leagueTabFriends, id: "game.league.tab.friends")
        }
        .accessibilityElement(children: .contain)
    }

    private func tabButton(_ value: Tab, title: String, id: String) -> some View {
        let selected = tab == value
        return Button {
            guard !selected else { return }
            HapticFeedback.light()
            tab = value
        } label: {
            Text(title)
                .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                .foregroundColor(selected ? MeeshyColors.brandPrimary : theme.textPrimary)
                .frame(maxWidth: .infinity, minHeight: MeeshyControlSize.tapTarget)
                .background(
                    RoundedRectangle(cornerRadius: MeeshyRadius.smPlus, style: .continuous)
                        .fill(selected ? MeeshyColors.brandPrimary.opacity(MeeshyOpacity.light) : theme.backgroundSecondary)
                )
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
        .accessibilityIdentifier(id)
    }
}

// MARK: - Ma ligue : les quatre états que la passerelle sert

/// Verrouillée (niveau 10), fermée aux mineurs, en attente de consentement, ouverte — dans l'ordre où la
/// passerelle les sert (`access`). Un état que ce client ne connaît pas n'est pas peint : il vaut mieux se
/// taire que deviner une porte (le bloc ne se décode pas — voir `GameLeagueBlock`).
private struct GameLeagueMineView: View {
    @ObservedObject var model: GameWave2Model
    let game: GameBlock
    let league: GameLeagueBlock

    var body: some View {
        switch league.access {
        case .locked:
            GameCard(title: GameText.leagueTitle) {
                GameNote(text: GameText.leagueLocked(
                    level: GameCopy.formatCount(GameLeague.minLevel), current: GameCopy.formatCount(game.level.record)))
            }
            .accessibilityIdentifier("game.league.locked")
        case .minor:
            GameCard(title: GameText.leagueTitle) {
                GameNote(text: GameText.leagueMinor)
            }
            .accessibilityIdentifier("game.league.minor")
        case .consentRequired:
            GameLeagueConsentCard(model: model)
        case .open:
            GameLeaguePlacedCard(league: league)
            GameLeagueStandingsCard(model: model)
            GameLeagueAccountCard(model: model, league: league)
        }
    }
}

// MARK: Le consentement

/// LE CONSENTEMENT À LA LIGUE PUBLIQUE (#9384, conformité A-1 et A-2) — la notice COMPLÈTE avant le geste :
/// ce qui est montré, à qui, comment on est placé, le risque qui reste, et comment se retirer. Un
/// consentement qu'on donne sans avoir lu ce qui précède n'en est pas un (RGPD art. 4(11), 13). Le
/// pseudonyme est tiré au sort par le serveur, jamais calculé depuis le compte.
struct GameLeagueConsentCard: View {
    @ObservedObject var model: GameWave2Model

    var body: some View {
        GameCard(title: GameText.leagueConsentTitle) {
            VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
                ForEach([
                    GameText.leagueConsentShown, GameText.leagueConsentWho, GameText.leagueConsentHow,
                    GameText.leagueConsentRisk, GameText.leagueConsentWithdrawInfo,
                ], id: \.self) { line in
                    GameNote(text: line)
                }
            }
            GameNote(text: GameText.leaguePseudonymDrawn)
            GameErrorLine(message: model.errors.consent, identifier: "game.league.consent.error")
            GameActionButton(
                title: GameText.leagueConsentAccept, busy: model.pending.consent, disabled: !model.isOnline,
                tint: MeeshyColors.brandPrimary, identifier: "game.league.consent.accept"
            ) {
                Task { await model.setConsent(true) }
            }
            GameOfflineNote(online: model.isOnline)
        }
        .accessibilityIdentifier("game.league.consent")
    }
}

// MARK: La place de la semaine

private struct GameLeaguePlacedCard: View {
    let league: GameLeagueBlock

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        GameCard(title: GameText.leagueTitle + " · " + GameWave2Format.week(league.weekKey)) {
            if let current = league.current {
                placed(current)
            } else {
                GameNote(text: GameText.leagueWaiting)
            }
        }
        .accessibilityIdentifier("game.league.placed")
    }

    private func zoneColor(_ zone: LeagueZone) -> Color {
        switch zone {
        case .promotion: MeeshyColors.success
        case .safe: theme.textMuted
        case .relegation: MeeshyColors.error
        }
    }

    private func gap(_ current: GameLeagueBlock.Current) -> String {
        switch current.pointsToPromotion {
        case nil: GameText.leagueAtTop
        case 0?: GameText.leagueInPromotion
        case let points?: GameText.leagueToPromotion(points: GameCopy.points(points))
        }
    }

    private func placed(_ current: GameLeagueBlock.Current) -> some View {
        HStack(alignment: .center, spacing: MeeshySpacing.md) {
            // La gemme SE TOUCHE (#9564) : elle rebondit et ouvre les précisions de la ligue — rien que la page
            // n'affiche déjà.
            LeagueGemView(league: current.league)
                .frame(width: 64, height: 64)
                .accessibilityHidden(true)
                .gameElement(GameElementDetails.leagueGem(league))
            VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                Text(GameText.leagueName(current.league))
                    .font(MeeshyFont.relative(MeeshyFont.titleSize, weight: .bold))
                    .foregroundColor(theme.textPrimary)
                Text(GameText.leagueRankLine(rank: GameCopy.formatCount(current.rank), size: GameCopy.formatCount(current.groupSize)))
                    .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                    .foregroundColor(theme.textPrimary)
                Text(GameText.zoneLabel(current.zone) + " · " + gap(current))
                    .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .medium))
                    .foregroundColor(zoneColor(current.zone))
                TimelineView(.periodic(from: .now, by: 60)) { context in
                    GameNote(text: GameText.leagueCloses(remaining: GameWave2Format.remaining(closes: league.closes, now: context.date)))
                }
            }
            Spacer(minLength: 0)
        }
        .accessibilityElement(children: .combine)
    }
}

// MARK: Le classement du groupe

/// Le classement est servi SOUS PSEUDONYMES et FIGÉ à 4 h : seule la ligne `isMe` est en direct, et l'écran
/// le DIT (conformité A-6). Aucune ligne ne montre d'avatar, de drapeau ni de langue.
private struct GameLeagueStandingsCard: View {
    @ObservedObject var model: GameWave2Model

    var body: some View {
        GameCard(title: GameText.leagueTabMine) {
            let week = model.week
            if let value = week.value {
                if value.entries.isEmpty {
                    GameNote(text: GameText.leagueEmpty)
                } else {
                    LeagueStandingsList(entries: value.entries)
                }
            } else if week.showsSkeleton {
                GameRowsSkeleton(rows: 5)
            } else if week.failedWithoutValue {
                GameRetryBlock(message: week.errorMessage ?? "") { Task { await model.loadWeek() } }
            }
            GameNote(text: GameText.leagueSnapshot)
        }
        .accessibilityIdentifier("game.league.standings")
    }
}

struct LeagueStandingsList: View {
    let entries: [LeagueWeekEntry]

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        VStack(spacing: MeeshySpacing.xs) {
            ForEach(Array(entries.enumerated()), id: \.element.rank) { index, entry in
                if index == 0 || entries[index - 1].zone != entry.zone {
                    Text(GameText.zoneLabel(entry.zone).uppercased())
                        .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                        .foregroundColor(zoneColor(entry.zone))
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.top, MeeshySpacing.sm)
                        .accessibilityHidden(true)
                }
                LeagueStandingRow(entry: entry, zoneColor: zoneColor(entry.zone))
            }
        }
    }

    private func zoneColor(_ zone: LeagueZone) -> Color {
        switch zone {
        case .promotion: MeeshyColors.success
        case .safe: theme.textMuted
        case .relegation: MeeshyColors.error
        }
    }
}

private struct LeagueStandingRow: View {
    let entry: LeagueWeekEntry
    let zoneColor: Color

    private var theme: ThemeManager { ThemeManager.shared }

    private var spoken: String {
        var parts = [GameCopy.formatCount(entry.rank), entry.displayName]
        if entry.isMe { parts.append(GameText.leagueMe) }
        parts.append(GameText.zoneLabel(entry.zone))
        if let cup = entry.cup { parts.append(GameText.cupName(cup)) }
        parts.append(GameCopy.points(entry.weekPoints))
        return parts.joined(separator: ", ")
    }

    var body: some View {
        HStack(spacing: MeeshySpacing.md) {
            Text(GameCopy.formatCount(entry.rank))
                .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .bold))
                .foregroundColor(theme.textMuted)
                .frame(minWidth: 28, alignment: .leading)
            HStack(spacing: MeeshySpacing.xsPlus) {
                Text(entry.displayName)
                    .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(1)
                if entry.isMe { GameChip(text: GameText.leagueMe) }
            }
            Spacer(minLength: 0)
            if let cup = entry.cup {
                TrophyView(material: GameTrophyPresentation.Kind.league(cup).material, label: "")
                    .frame(width: 28, height: 28)
                    .accessibilityHidden(true)
            }
            Text(GameCopy.points(entry.weekPoints))
                .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
                .foregroundColor(theme.textPrimary)
        }
        .padding(.horizontal, MeeshySpacing.md)
        .frame(minHeight: MeeshyControlSize.tapTarget)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.sm, style: .continuous)
                .fill(entry.isMe ? MeeshyColors.brandPrimary.opacity(MeeshyOpacity.light) : Color.clear)
        )
        .overlay(alignment: .leading) {
            Capsule().fill(zoneColor).frame(width: 3).padding(.vertical, MeeshySpacing.xs)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(spoken)
        // Une ligne du classement SE TOUCHE (#9564) : elle rebondit et redit ce que la page montre déjà — jamais
        // une présence, jamais un identifiant.
        .gameElement(GameElementDetails.player(entry))
    }
}

// MARK: Mon compte de ligue

/// Le pseudonyme gardé, et la sortie : quitter la ligue publique d'un geste (conformité A-1 : un
/// consentement se retire aussi simplement qu'il se donne).
private struct GameLeagueAccountCard: View {
    @ObservedObject var model: GameWave2Model
    let league: GameLeagueBlock

    @State private var proposed = ""

    var body: some View {
        GameCard(title: GameText.leaguePseudonymTitle) {
            if let name = league.pseudonym {
                GameNote(text: GameText.leaguePseudonymCurrent(name: name))
            }
            if GameLeagueRules.chosenPseudonymOpen {
                pseudonymField
            }
            GameQuietButton(
                title: GameText.leagueConsentLeave, destructive: true,
                disabled: !model.isOnline || model.pending.consent, identifier: "game.league.leave"
            ) {
                Task { await model.setConsent(false) }
            }
            GameErrorLine(message: model.errors.consent, identifier: "game.league.leave.error")
            GameOfflineNote(online: model.isOnline)
        }
        .accessibilityIdentifier("game.league.account")
    }

    /// Le champ du pseudonyme choisi — fermé tant que `GameLeagueRules.chosenPseudonymOpen` l'est.
    private var pseudonymField: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            TextField(GameText.leaguePseudonymNew, text: $proposed)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .padding(MeeshySpacing.md)
                .frame(minHeight: MeeshyControlSize.tapTarget)
                .accessibilityIdentifier("game.league.pseudonym.field")
            let trimmed = proposed.trimmingCharacters(in: .whitespacesAndNewlines)
            let invalid = !trimmed.isEmpty && !GameLeague.isValidPseudonym(trimmed)
            if invalid { GameErrorLine(message: GameText.leaguePseudonymInvalid, identifier: "game.league.pseudonym.invalid") }
            GameNote(text: GameText.leaguePseudonymHintChange)
            GameErrorLine(message: model.errors.pseudonym, identifier: "game.league.pseudonym.error")
            GameActionButton(
                title: GameText.leaguePseudonymSave, busy: model.pending.pseudonym,
                disabled: !model.isOnline || trimmed.isEmpty || invalid, tint: MeeshyColors.brandPrimary,
                identifier: "game.league.pseudonym.save"
            ) {
                Task { await model.setPseudonym(trimmed) }
            }
        }
    }
}

// MARK: - La ligue entre amis

/// LA LIGUE ENTRE AMIS (#9385) — le même classement de la semaine, restreint aux amis ACCEPTÉS. Toujours
/// ouverte, sans consentement : ils se connaissent déjà, donc leurs NOMS s'affichent — le seul endroit du
/// jeu où un classement porte des identités. Un ami dont le nom n'est pas connu s'affiche « Un ami »,
/// jamais son identifiant.
struct GameFriendsLeagueCard: View {
    @ObservedObject var model: GameWave2Model

    private var theme: ThemeManager { ThemeManager.shared }

    private var names: [String: String] {
        Dictionary(model.friends.map { ($0.id, $0.displayName) }, uniquingKeysWith: { first, _ in first })
    }

    var body: some View {
        GameCard(title: GameText.leagueFriendsTitle) {
            GameNote(text: GameText.leagueFriendsBody)
            let state = model.friendsLeague
            if let value = state.value {
                GameNote(text: GameWave2Format.week(value.weekKey) + " · "
                    + GameText.leagueCloses(remaining: GameWave2Format.remaining(closes: value.closes, now: Date())))
                if value.entries.count <= 1 {
                    GameNote(text: GameText.leagueFriendsEmpty)
                }
                VStack(spacing: MeeshySpacing.xs) {
                    ForEach(value.entries, id: \.userId) { entry in
                        friendRow(entry)
                    }
                }
            } else if state.showsSkeleton {
                GameRowsSkeleton(rows: 3)
            } else if state.failedWithoutValue {
                GameRetryBlock(message: state.errorMessage ?? "") { Task { await model.loadFriendsLeague() } }
            }
        }
        .accessibilityIdentifier("game.league.friends")
    }

    private func friendRow(_ entry: LeagueFriendsEntry) -> some View {
        let name = entry.isMe ? GameText.leagueMe : (names[entry.userId] ?? GameText.leagueFriendsUnknown)
        return HStack(spacing: MeeshySpacing.md) {
            Text(GameCopy.formatCount(entry.rank))
                .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .bold))
                .foregroundColor(theme.textMuted)
                .frame(minWidth: 28, alignment: .leading)
            Text(name)
                .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                .foregroundColor(theme.textPrimary)
                .lineLimit(1)
            Spacer(minLength: 0)
            Text(GameCopy.points(entry.weekPoints))
                .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
                .foregroundColor(theme.textPrimary)
        }
        .padding(.horizontal, MeeshySpacing.md)
        .frame(minHeight: MeeshyControlSize.tapTarget)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.sm, style: .continuous)
                .fill(entry.isMe ? MeeshyColors.brandPrimary.opacity(MeeshyOpacity.light) : Color.clear)
        )
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(GameCopy.formatCount(entry.rank)), \(name), \(GameCopy.points(entry.weekPoints))")
    }
}

// MARK: - Squelette et reprise

/// Des rangées grises, sur cache VIDE seulement — jamais un spinner.
struct GameRowsSkeleton: View {
    let rows: Int

    var body: some View {
        VStack(spacing: MeeshySpacing.xs) {
            ForEach(0..<rows, id: \.self) { _ in
                SkeletonShape(height: MeeshyControlSize.tapTarget, cornerRadius: MeeshyRadius.sm)
            }
        }
        .skeletonShimmer()
        .accessibilityHidden(true)
    }
}

/// L'échec d'une lecture quand rien d'autre n'est à montrer : la phrase, et de quoi réessayer.
struct GameRetryBlock: View {
    let message: String
    let retry: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            GameErrorLine(message: message, identifier: "game.retry.message")
            GameQuietButton(title: GameText.retry, identifier: "game.retry", action: retry)
        }
    }
}
