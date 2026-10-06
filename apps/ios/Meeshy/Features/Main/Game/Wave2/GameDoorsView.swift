import SwiftUI
import MeeshySDK
import MeeshyUI

/// LES PORTES DE LA VAGUE 2 SUR « PROGRESSION » (#9481) — Ligue, Saison, Vitrine, Atlas, Prestige : une
/// entrée par page, avec ce qu'elle ANNONCE (le rang de la semaine, l'étape de la saison…), parce que c'est ce
/// qui donne envie d'ouvrir. Une porte n'existe que si son extension est servie : devant un ancien serveur,
/// l'écran d'avant reste intact. Miroir de `apps/web/src/components/game-doors.tsx`.
struct GameDoorsView: View {
    let game: GameBlock
    let onOpen: (GamePage) -> Void

    private var theme: ThemeManager { ThemeManager.shared }

    /// Le serveur connaît la vague 2 dès qu'une de ses extensions est servie : une saison absente est alors
    /// une VALEUR (aucune saison ouverte), pas un serveur trop ancien.
    private var servedByWave2Server: Bool {
        game.league != nil || game.duo != nil || game.trophies != nil || game.atlas != nil
            || game.prestige != nil || game.visibility != nil
    }

    var body: some View {
        if servedByWave2Server || game.season != nil {
            VStack(spacing: MeeshySpacing.sm) {
                if let league = game.league { leagueDoor(league) }
                seasonDoor
                if let trophies = game.trophies { showcaseDoor(trophies) }
                if let atlas = game.atlas { atlasDoor(atlas) }
                if let prestige = game.prestige { prestigeDoor(prestige) }
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel(GameText.doorsLabel)
            .accessibilityIdentifier("game.doors")
        }
    }

    // MARK: Les cinq portes

    private func leagueDoor(_ league: GameLeagueBlock) -> some View {
        door(.league, icon: AnyView(LeagueGemView(league: league.current?.league ?? .quartz)), size: 30,
             title: GameText.doorLeague, subtitle: leagueSubtitle(league))
    }

    private func leagueSubtitle(_ league: GameLeagueBlock) -> String {
        if league.access == .locked { return GameText.doorLeagueLocked(level: GameCopy.formatCount(GameLeague.minLevel)) }
        if league.access == .open, let current = league.current {
            return GameText.doorLeagueRank(
                league: GameText.leagueName(current.league), rank: GameCopy.formatCount(current.rank),
                size: GameCopy.formatCount(current.groupSize))
        }
        return GameText.doorLeagueOpen
    }

    private var seasonDoor: some View {
        let season = game.season
        return door(.season, icon: AnyView(TrophyView(material: .platinum, label: "")), size: 30,
                    title: season.map { GameText.doorSeason(number: GameCopy.formatCount($0.number)) } ?? GameText.seasonTitle,
                    subtitle: season.map { GameText.doorSeasonSteps(steps: GameCopy.formatCount($0.steps), total: GameCopy.formatCount($0.stepsTotal)) }
                        ?? GameText.doorSeasonNone)
    }

    private func showcaseDoor(_ trophies: GameTrophiesBlock) -> some View {
        door(.showcase, icon: AnyView(TrophyView(material: .gold, label: "")), size: 30, title: GameText.doorShowcase,
             subtitle: trophies.items.isEmpty ? GameText.doorShowcaseEmpty : GameText.doorShowcaseCount(count: trophies.items.count))
    }

    private func atlasDoor(_ atlas: GameAtlasBlock) -> some View {
        door(.atlas, icon: AnyView(AtlasStampView(code: atlas.stamps.first?.language.uppercased() ?? "", tint: MeeshyColors.brandPrimary,
                                                  state: atlas.stamps.isEmpty ? .undiscovered : .stamped, muted: theme.textMuted)),
             size: 32, title: GameText.doorAtlas,
             subtitle: GameText.doorAtlasCount(stamped: GameCopy.formatCount(atlas.stamped), total: GameCopy.formatCount(atlas.total)))
    }

    private func prestigeDoor(_ prestige: GamePrestigeBlock) -> some View {
        let subtitle: String
        if prestige.canPrestige {
            subtitle = GameText.doorPrestigeReady
        } else if prestige.stars > 0 {
            subtitle = GameText.doorPrestigeStars(stars: GameCopy.formatCount(prestige.stars), max: GameCopy.formatCount(prestige.max))
        } else {
            subtitle = GameText.doorPrestigeLocked
        }
        return door(.prestige, icon: AnyView(TrophyView(material: .prism, label: "")), size: 34, title: GameText.doorPrestige, subtitle: subtitle)
    }

    // MARK: Une porte

    private func door(_ page: GamePage, icon: AnyView, size: CGFloat, title: String, subtitle: String) -> some View {
        Button {
            HapticFeedback.light()
            onOpen(page)
        } label: {
            HStack(spacing: MeeshySpacing.md) {
                icon
                    .frame(width: size, height: size)
                    .frame(width: 36, height: 36)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                    Text(title)
                        .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                        .foregroundColor(theme.textPrimary)
                    Text(subtitle)
                        .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .medium))
                        .foregroundColor(theme.textMuted)
                        .lineLimit(2)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.forward")
                    .font(MeeshyFont.relative(MeeshyIconSize.xs, weight: .semibold))
                    .foregroundColor(MeeshyColors.brandPrimary)
                    .accessibilityHidden(true)
            }
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.vertical, MeeshySpacing.sm)
            .frame(minHeight: MeeshyControlSize.tapTarget)
            .background(RoundedRectangle(cornerRadius: MeeshyRadius.md, style: .continuous).fill(theme.backgroundSecondary))
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityHint(GameText.doorsLabel)
        .accessibilityIdentifier("game.door.\(page.rawValue)")
    }
}

/// LE JEU MASQUÉ (#9481) — ce qui remplace le jeu sur cet appareil quand la personne l'a masqué : une carte qui
/// le dit, un bouton pour le réafficher, une porte vers les réglages. Réafficher dit aussi au serveur que le jeu
/// revient (`gameHidden = false`) mais ne rouvre RIEN d'autre : les visibilités fermées par « Jeu masqué »
/// restent fermées jusqu'à ce que la personne les rouvre. Miroir de `game-hidden-card.tsx`.
struct GameHiddenCard: View {
    let onSettings: () -> Void
    var service: GameWave2ServiceProviding = GameService.shared

    @ObservedObject private var prefs = GameDevicePrefsStore.current()
    @State private var busy = false
    @State private var errorMessage: String?

    var body: some View {
        GameCard(title: GameText.settingsHiddenTitle) {
            GameNote(text: GameText.settingsHiddenCard + " " + GameText.settingsHiddenReopenNote)
            GameErrorLine(message: errorMessage, identifier: "game.hidden.error")
            GameActionButton(
                title: GameText.settingsHiddenShow, busy: busy, tint: MeeshyColors.brandPrimary, identifier: "game.hidden.show"
            ) {
                show()
            }
            GameQuietButton(title: GameText.doorSettings, identifier: "game.hidden.settings", action: onSettings)
        }
        .accessibilityIdentifier("game.hidden")
    }

    private func show() {
        guard !busy else { return }
        busy = true
        errorMessage = nil
        prefs.set(hidden: false)
        let service = self.service
        Task {
            do {
                _ = try await service.setPrivacy(gameHidden: false, friendsLeagueOptOut: nil, requestId: UUID().uuidString)
            } catch {
                // Réafficher ne se bloque JAMAIS : le jeu revient sur l'appareil, et l'échec de la moitié serveur
                // se dit (le réglage « Jeu masqué » le rejouera).
                errorMessage = GameCopy.errorMessage(for: error)
            }
            busy = false
        }
    }
}
