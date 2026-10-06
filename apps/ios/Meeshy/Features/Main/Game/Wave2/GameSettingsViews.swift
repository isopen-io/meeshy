import SwiftUI
import MeeshySDK
import MeeshyUI

/// LES RÉGLAGES DU JEU (#9481) — un seul écran pour ce que le jeu laisse choisir : les célébrations de Mee et
/// Meo, le mode « Jeu masqué », qui voit quoi (rang, trésor, vitrine, Atlas — #5738), la ligue publique
/// (consentement et pseudonyme), l'opposition à la ligue entre amis, et le carnet des règles. Miroir de
/// `apps/web/src/components/game-settings.tsx`.
///
/// **« Jeu masqué » est un geste composé, et il le dit.** Il masque le jeu sur l'appareil ET demande au
/// serveur de sortir le compte des classements, des vitrines et des listes (la vitrine retombe à « moi seul »
/// ; conformité A-7, D-2). Le réafficher ne rouvre RIEN du côté serveur au-delà du jeu lui-même : l'écran le
/// dit, la personne rouvre ce qu'elle veut, un réglage à la fois. Défaut sûr : on ne devine jamais ce qu'elle
/// aurait choisi d'ouvrir. Les valeurs par défaut quand le serveur ne les sert pas encore sont les PLUS
/// FERMÉES de la loi : « amis » (rang, trésor, vitrine) et « moi seul » (Atlas).
struct GameSettingsPage: View {
    var body: some View {
        GamePageShell(title: GameText.settingsTitle, identifier: "game.settings.page") {
            GameWave2Host { model, game in
                GameSettingsScreen(model: model, game: game)
            }
        }
    }
}

struct GameSettingsScreen: View {
    @ObservedObject var model: GameWave2Model
    @ObservedObject private var prefs = GameDevicePrefsStore.current()
    let game: GameBlock

    @EnvironmentObject private var router: Router

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        celebrations
        hidden
        if let visibility = game.visibility { visibilityCard(visibility) }
        if let league = game.league { leagueCard(league) }
        friendsLeague
        doors
    }

    // MARK: Les célébrations

    private var celebrations: some View {
        GameCard(title: GameText.settingsCelebrationsTitle) {
            GameNote(text: GameText.settingsCelebrationsBody)
            GameSwitchRow(
                label: GameText.settingsCelebrationsSwitch, isOn: prefs.prefs.celebrations,
                identifier: "game.settings.celebrations"
            ) { on in
                prefs.set(celebrations: on)
            }
        }
        .accessibilityIdentifier("game.settings.celebrations.card")
    }

    // MARK: Jeu masqué

    private var hidden: some View {
        GameCard(title: GameText.settingsHiddenTitle) {
            GameNote(text: GameText.settingsHiddenBody)
            GameSwitchRow(
                label: GameText.settingsHiddenSwitch, isOn: prefs.prefs.hidden,
                disabled: (!model.isOnline && !prefs.prefs.hidden) || model.pending.hide, identifier: "game.settings.hidden"
            ) { on in
                Task { await model.setHidden(on) }
            }
            if prefs.prefs.hidden { GameNote(text: GameText.settingsHiddenReopenNote) }
            GameErrorLine(message: model.errors.hide, identifier: "game.settings.hidden.error")
            GameOfflineNote(online: model.isOnline)
        }
        .accessibilityIdentifier("game.settings.hidden.card")
    }

    // MARK: Qui voit quoi

    private func visibilityCard(_ visibility: GameVisibility) -> some View {
        GameCard(title: GameText.settingsVisibilityTitle) {
            GameNote(text: GameText.settingsVisibilityBody)
            picker(GameText.visibilityFieldRank, value: visibility.rank) { await model.setVisibility(rank: $0) }
            picker(GameText.visibilityFieldTreasury, value: visibility.treasury) { await model.setVisibility(treasury: $0) }
            picker(GameText.visibilityFieldShowcase, value: visibility.showcase) { await model.setVisibility(showcase: $0) }
            picker(GameText.visibilityFieldAtlas, value: visibility.atlas) { await model.setVisibility(atlas: $0) }
            GameErrorLine(message: model.errors.visibility, identifier: "game.settings.visibility.error")
        }
        .accessibilityIdentifier("game.settings.visibility")
    }

    private func picker(_ legend: String, value: ShowcaseVisibility, apply: @escaping @MainActor (ShowcaseVisibility) async -> Void) -> some View {
        GameVisibilityPickerView(legend: legend, value: value, disabled: !model.isOnline, busy: model.pending.visibility) { level in
            Task { await apply(level) }
        }
    }

    // MARK: La ligue publique

    private func leagueCard(_ league: GameLeagueBlock) -> some View {
        let inLeague = league.access == .open
        return GameCard(title: GameText.settingsLeagueTitle) {
            GameNote(text: leagueSentence(league, inLeague: inLeague))
            GameQuietButton(title: GameText.settingsLeagueManage, identifier: "game.settings.league.manage") {
                router.push(.gamePage(.league))
            }
            if inLeague {
                GameQuietButton(
                    title: GameText.leagueConsentLeave, destructive: true,
                    disabled: !model.isOnline || model.pending.consent, identifier: "game.settings.league.leave"
                ) {
                    Task { await model.setConsent(false) }
                }
            }
            GameErrorLine(message: model.errors.consent, identifier: "game.settings.league.error")
        }
        .accessibilityIdentifier("game.settings.league")
    }

    private func leagueSentence(_ league: GameLeagueBlock, inLeague: Bool) -> String {
        guard inLeague else { return GameText.settingsLeagueOff }
        return league.pseudonym.map { GameText.settingsLeagueOn(name: $0) } ?? GameText.settingsLeagueOnUnnamed
    }

    // MARK: La ligue entre amis

    private var friendsLeague: some View {
        GameCard(title: GameText.settingsFriendsLeagueTitle) {
            GameNote(text: GameText.settingsFriendsLeagueBody)
            GameSwitchRow(
                label: GameText.settingsFriendsLeagueSwitch, isOn: model.friendsLeagueOptedOut,
                disabled: !model.isOnline || model.pending.friendsOptOut, identifier: "game.settings.friends-league"
            ) { on in
                Task { await model.setFriendsLeagueOptOut(on) }
            }
            GameErrorLine(message: model.errors.friendsOptOut, identifier: "game.settings.friends-league.error")
            GameOfflineNote(online: model.isOnline)
        }
        .accessibilityIdentifier("game.settings.friends-league.card")
    }

    // MARK: Les règles et le carnet

    private var doors: some View {
        VStack(spacing: MeeshySpacing.sm) {
            door(GameText.settingsHelp, symbol: "questionmark.circle", id: "game.settings.help") {
                router.push(.progressionRules(rule: nil))
            }
            door(String(localized: "game.door.notebook", defaultValue: "Carnet de progression", bundle: .main), symbol: "book.closed", id: "game.settings.notebook") {
                router.push(.progressionNotebook)
            }
        }
    }

    private func door(_ title: String, symbol: String, id: String, action: @escaping () -> Void) -> some View {
        Button {
            HapticFeedback.light()
            action()
        } label: {
            HStack(spacing: MeeshySpacing.sm) {
                Image(systemName: symbol)
                Text(title)
            }
            .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
            .foregroundColor(MeeshyColors.brandPrimary)
            .frame(maxWidth: .infinity, minHeight: MeeshyControlSize.tapTarget)
            .background(RoundedRectangle(cornerRadius: MeeshyRadius.md).fill(theme.backgroundSecondary))
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier(id)
    }
}
