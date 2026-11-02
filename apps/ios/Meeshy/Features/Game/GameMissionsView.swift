import SwiftUI
import MeeshySDK
import MeeshyUI

/// LES MISSIONS DU JOUR ET LE COFFRE (#9383) — trois missions, leur avancement,
/// un changement par jour (1 Meesh), et le coffre qui s'ouvre quand tout est fait
/// (conception, partie II « Missions du jour »). Miroir de
/// `apps/web/src/components/game-missions.tsx`.
///
/// Le coffre garde son contenu SECRET jusqu'à l'ouverture (#10567, qui renverse
/// #10011) : fermé, il ne dit ni montant, ni chance, ni borne — la surprise est son
/// contenu. Ouvert, ses récompenses se posent AU-DESSUS de lui (`ChestStage`, 1,4 s,
/// une tape par récompense).
///
/// Avant chaque geste, ce qu'il dépense ou exige se dit (#9705) : le prix d'un
/// changement contre les Meeshes en poche, les missions faites que le coffre
/// attend, le niveau qui ouvre les missions.
///
/// Rien n'est inventé côté client : les missions, leur objectif et leur
/// récompense viennent du bloc `game`, et le contenu du coffre n'existe qu'une fois
/// la passerelle l'a tiré. Pendant l'ouverture, le coffre est déjà ouvert (retour
/// instantané) et le contenu attendu s'annonce comme tel.
struct GameMissionsView: View {
    let game: GameBlock
    let online: Bool
    let pendingRerollId: String?
    let chestOpening: Bool
    let errors: GameErrors
    let onReroll: (String) -> Void
    let onClaim: () -> Void
    var haptics: GameHapticsProviding = GameHaptics.shared
    /// La fin de mission se photographie (#10816) : présent, une mission personnelle accomplie propose sa carte.
    var onPhotoMission: ((GameBlock.Mission) -> Void)?

    private var theme: ThemeManager { ThemeManager.shared }
    private var missions: GameBlock.Missions { game.missions }
    /// Le fuseau où la passerelle découpe le jour de jeu : celui du COMPTE, jamais celui de l'appareil (#9539).
    private var accountTimezone: String? { AuthManager.shared.currentUser?.timezone }

    /// Le prix d'un changement contre les Meeshes en poche, lu sur la loi.
    var rerollSpend: SpendPreview { GameSpend.preview(held: game.treasury.held, cost: GameMissions.rerollPrice) }

    /// La rangée du changement : posée tant qu'une mission du jour reste à faire dans le jour, même quand le serveur
    /// retire le changement faute de Meesh (`rerollAvailable`) — pour dire combien il en manque.
    func rerollShown(now: Date = Date()) -> Bool {
        let end = GameMissionClock.endOfDay(missions.dayKey, timezone: accountTimezone)
        let dayOpen = end.map { now < $0 } ?? true
        let pending = missions.items.contains { !$0.isCompleted }
        return dayOpen && pending && (missions.rerollAvailable || !rerollSpend.affordable)
    }

    var body: some View {
        GameCard(anchor: .missions, title: String(localized: "game.missions.title", defaultValue: "Le rêve de cette nuit", bundle: .main)) {
            if !missions.unlocked {
                GameNote(text: GameCopy.missionsLocked(level: GameCopy.formatCount(game.level.shown.level)))
                GameFactChipRow(
                    concept: .missions,
                    items: GameSpendRows.requirement(GameSpend.requirement(current: game.level.shown.level, required: GameMissions.minLevel)),
                    identifier: "game.missions.requirement"
                )
            } else {
                if missions.prismDay {
                    GameNote(text: String(
                        localized: "game.missions.prism_day",
                        defaultValue: "Jour du Prisme : un des actes se joue dans une autre langue que la tienne.",
                        bundle: .main
                    ))
                }
                if let hour = game.boosts.prismHour {
                    GameNote(text: String(
                        localized: "game.missions.prism_hour",
                        defaultValue: "Heure du Prisme : \(GameCopy.clock(minuteOfDay: hour.startMinute)) – \(GameCopy.clock(minuteOfDay: hour.endMinute)) — chaque acte compte double.",
                        bundle: .main
                    ))
                }
                ForEach(missions.items) { mission in
                    GameMissionRow(
                        mission: mission,
                        window: GameMissionWindow(start: nil, end: GameMissionClock.endOfDay(missions.dayKey, timezone: accountTimezone)),
                        personal: false,
                        canReroll: missions.rerollAvailable,
                        pending: pendingRerollId == mission.id,
                        online: online,
                        affordable: rerollSpend.affordable,
                        onReroll: onReroll
                    )
                }
                if let personal = missions.personal {
                    GameMissionRow(
                        mission: personal.mission,
                        window: GameMissionWindow(start: personal.startsAtDate, end: personal.endsAtDate),
                        personal: true,
                        canReroll: false,
                        pending: false,
                        online: online,
                        affordable: rerollSpend.affordable,
                        onReroll: onReroll,
                        onPhoto: onPhotoMission
                    )
                }
                if rerollShown() {
                    VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                        GameNote(text: GameCopy.rerollLabel)
                        GameFactChipRow(
                            concept: .missions,
                            items: GameSpendRows.spend(rerollSpend, format: GameCopy.meeshes, missing: { ConceptText.spendMissingReroll(missing: $0) }),
                            identifier: "game.missions.reroll.spend"
                        )
                    }
                }
                GameErrorLine(message: errors.reroll, identifier: "game.missions.reroll.error")
                if !online {
                    GameNote(text: String(
                        localized: "game.missions.offline",
                        defaultValue: "Hors ligne : changer un acte ou ouvrir l’Offrande reprendra en ligne.",
                        bundle: .main
                    ))
                }
                GameChestCard(
                    chest: game.chest, opening: chestOpening, online: online, error: errors.chest,
                    haptics: haptics, onClaim: onClaim, missions: missions, starFragments: game.starFragments
                )
            }
        }
    }
}

/// La plage d'une carte : celle de la mission personnelle (deux heures), ou la fin du jour de jeu pour les trois du jour.
/// Sans fin lisible, la carte n'a pas de minuteur (#9539).
struct GameMissionWindow: Equatable {
    let start: Date?
    let end: Date?

    func phase(completed: Bool, now: Date) -> GameMissionClock.Phase? {
        guard let end else { return nil }
        return GameMissionClock.phase(start: start, end: end, completed: completed, now: now)
    }
}

private struct GameMissionRow: View {
    let mission: GameBlock.Mission
    let window: GameMissionWindow
    let personal: Bool
    let canReroll: Bool
    let pending: Bool
    let online: Bool
    /// Les Meeshes en poche couvrent le prix d'un changement (`GameMissions.rerollPrice`).
    let affordable: Bool
    let onReroll: (String) -> Void
    var onPhoto: ((GameBlock.Mission) -> Void)?

    private var theme: ThemeManager { ThemeManager.shared }
    private var done: Bool { mission.isCompleted }
    private var title: String { GameCopy.missionTitle(templateKey: mission.templateKey, target: mission.target) }

    /// Le minuteur est CALME (heures et minutes) : un rafraîchissement par minute tant qu'il reste plus d'une heure, puis
    /// plus serré ; une plage passée ne bat plus qu'à l'heure.
    private var tick: TimeInterval {
        guard let end = window.end else { return 3600 }
        let remaining = end.timeIntervalSinceNow
        return remaining > 0 ? GameMissionClock.refreshInterval(remaining: remaining) : 3600
    }

    var body: some View {
        TimelineView(.periodic(from: Date(), by: tick)) { context in
            card(phase: window.phase(completed: done, now: context.date))
        }
    }

    private func card(phase: GameMissionClock.Phase?) -> some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
            // La mission SE TOUCHE (#9564) : elle rebondit et ouvre ses précisions. Son bouton « Changer » reste à part,
            // en dessous — un bouton dans un bouton ne répond à personne.
            Group {
                VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
                    FlowLayout(spacing: MeeshySpacing.xs) {
                        if personal {
                            GameChip(text: GameCopy.personalMissionName, tint: MeeshyColors.indigo500)
                        }
                        GameChip(text: GameCopy.difficultyName(mission.difficulty),
                                 tint: mission.difficulty == .gold ? MeeshyColors.warning : MeeshyColors.brandPrimary)
                        if mission.prism {
                            GameChip(text: String(localized: "game.mission.prism", defaultValue: "Prisme", bundle: .main))
                        }
                        if let ending = GameCopy.missionEnding(phase) {
                            GameChip(text: ending.text, tint: ending.isSuccess ? MeeshyColors.success : MeeshyColors.warning)
                        } else if done {
                            GameChip(text: String(localized: "game.mission.done", defaultValue: "Réalisé", bundle: .main), tint: MeeshyColors.success)
                        }
                    }
                    Text(title)
                        .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                        .foregroundStyle(theme.textPrimary)
                        .fixedSize(horizontal: false, vertical: true)
                    ProgressionBar(
                        progress: mission.target > 0 ? Double(mission.progress) / Double(mission.target) : 0,
                        tint: done ? MeeshyColors.success : MeeshyColors.brandPrimary,
                        label: title
                    )
                }
                .multilineTextAlignment(.leading)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .gameElement(GameElementDetails.mission(mission))
            HStack(alignment: .center, spacing: MeeshySpacing.sm) {
                Text(progressLine)
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                    .foregroundStyle(theme.textMuted)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
                if canReroll && !done && (phase?.allowsAction ?? true) {
                    rerollButton
                }
                if personal && done, let onPhoto {
                    photoButton(onPhoto)
                }
            }
            if let line = GameCopy.missionTimerLine(phase, window: personal ? window : nil) {
                Label {
                    Text(line)
                        .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
                        .foregroundStyle(theme.textMuted)
                        .fixedSize(horizontal: false, vertical: true)
                } icon: {
                    Image(systemName: "timer")
                        .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
                        .foregroundStyle(theme.textMuted)
                }
                .accessibilityIdentifier("game.mission.timer")
            }
        }
        .padding(MeeshySpacing.md)
        .background(RoundedRectangle(cornerRadius: MeeshyRadius.sm).fill(theme.textMuted.opacity(0.1)))
        .opacity(pending ? 0.6 : 1)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("game.mission.\(mission.id)")
    }

    private var progressLine: String {
        let current = GameCopy.formatCount(min(mission.progress, mission.target))
        let target = GameCopy.formatCount(mission.target)
        let reward = "+" + GameCopy.points(mission.reward)
        guard mission.glory > 0 else {
            return String(localized: "game.mission.progress", defaultValue: "\(current) / \(target) · \(reward)", bundle: .main)
        }
        return String(
            localized: "game.mission.progress_glory",
            defaultValue: "\(current) / \(target) · \(reward) · +\(GameCopy.formatCount(mission.glory)) de gloire",
            bundle: .main
        )
    }

    /// La mission personnelle accomplie se photographie (#10816) : sa carte grave le pseudo gratté.
    private func photoButton(_ onPhoto: @escaping (GameBlock.Mission) -> Void) -> some View {
        Button {
            HapticFeedback.light()
            onPhoto(mission)
        } label: {
            Image(systemName: "camera.fill")
                .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
                .foregroundStyle(MeeshyColors.brandPrimary)
                .frame(width: 44, height: 44)
                .background(Circle().fill(MeeshyColors.brandPrimary.opacity(0.12)))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(String(localized: "game.photo.offer.start", defaultValue: "Photographier", bundle: .main)) — \(title)")
        .accessibilityIdentifier("game.mission.photo")
    }

    private var rerollButton: some View {
        Button {
            HapticFeedback.light()
            onReroll(mission.id)
        } label: {
            Text(GameCopy.rerollLabel)
                .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
                .foregroundStyle(MeeshyColors.brandPrimary)
                .padding(.horizontal, MeeshySpacing.md)
                .frame(minHeight: 44)
                .background(Capsule().fill(MeeshyColors.brandPrimary.opacity(0.12)))
        }
        .buttonStyle(.plain)
        .disabled(!online || pending || !affordable)
        .opacity(!online || pending || !affordable ? 0.5 : 1)
        .accessibilityLabel(String(
            localized: "game.mission.reroll.a11y",
            defaultValue: "Changer l’acte « \(title) » contre \(GameCopy.meeshes(GameMissions.rerollPrice))",
            bundle: .main
        ))
        .accessibilityIdentifier("game.mission.reroll")
    }
}

// MARK: - Le coffre

private struct GameChestCard: View {
    let chest: GameBlock.Chest
    let opening: Bool
    let online: Bool
    let error: String?
    let haptics: GameHapticsProviding
    let onClaim: () -> Void
    /// Les missions du jour : ce que le coffre attend, dit dans ses précisions.
    let missions: GameBlock.Missions
    /// Les fragments d'étoile collectés (#10011) — `nil` devant un serveur antérieur.
    let starFragments: StarFragmentsTotal?

    @State private var play = 0
    @State private var rewarded: Bool

    init(chest: GameBlock.Chest, opening: Bool, online: Bool, error: String?, haptics: GameHapticsProviding,
         onClaim: @escaping () -> Void, missions: GameBlock.Missions, starFragments: StarFragmentsTotal? = nil) {
        self.missions = missions
        self.starFragments = starFragments
        self.chest = chest
        self.opening = opening
        self.online = online
        self.error = error
        self.haptics = haptics
        self.onClaim = onClaim
        _rewarded = State(initialValue: chest.reward != nil)
    }

    private var theme: ThemeManager { ThemeManager.shared }

    private enum Phase { case locked, ready, opening, claimed }

    /// Les missions du jour faites, sur celles du jour : ce que le coffre attend.
    private var doneItem: GameFactChipItem {
        let done = missions.items.filter(\.isCompleted).count
        return GameFactChipItem(
            label: ConceptText.factDone,
            value: "\(GameCopy.formatCount(done)) / \(GameCopy.formatCount(missions.items.count))",
            detail: .missionsDone
        )
    }

    private var phase: Phase {
        if opening || chest.status == .claimed { return chest.reward == nil ? .opening : .claimed }
        return chest.status == .ready ? .ready : .locked
    }

    var body: some View {
        let phase = self.phase
        VStack(spacing: MeeshySpacing.sm) {
            // Le coffre SE TOUCHE (#9564) : il rebondit et ouvre ses précisions ; « Ouvrir le coffre » reste son geste.
            Group {
                VStack(spacing: MeeshySpacing.sm) {
                    ChestStage(reward: chest.reward, isOpen: phase == .opening || phase == .claimed, play: play)
                    Text(String(localized: "game.chest.title", defaultValue: "L’Offrande", bundle: .main))
                        .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .bold))
                        .foregroundStyle(theme.textPrimary)
                }
                .frame(maxWidth: .infinity)
            }
            .gameElement(GameElementDetails.chest(chest, missions: missions))
            switch phase {
            case .locked:
                GameNote(text: String(localized: "game.chest.locked", defaultValue: "Réalise les trois actes du rêve pour la faire apparaître.", bundle: .main))
                GameFactChipRow(concept: .missions, items: [doneItem], identifier: "game.chest.requirement")
            case .opening:
                GameNote(text: String(localized: "game.chest.opening", defaultValue: "Ouverture en cours…", bundle: .main))
            case .ready:
                GameActionButton(
                    title: String(localized: "game.chest.open", defaultValue: "Ouvrir l’Offrande", bundle: .main),
                    disabled: !online, identifier: "game.chest.open", action: onClaim
                )
            case .claimed:
                GameNote(text: String(localized: "game.chest.claimed", defaultValue: "Une nouvelle Offrande t’attend au bout du prochain rêve.", bundle: .main))
            }
            if let starFragments {
                GameNote(text: GameCopy.starFragments(starFragments.collected))
                    .multilineTextAlignment(.center)
                    .accessibilityIdentifier("game.starFragments")
            }
            if !opening {
                GameErrorLine(message: error, identifier: "game.chest.error")
            }
        }
        .frame(maxWidth: .infinity)
        .padding(MeeshySpacing.md)
        .background(RoundedRectangle(cornerRadius: MeeshyRadius.sm).fill(MeeshyColors.warning.opacity(0.1)))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("game.chest.\(phase)")
        .adaptiveOnChange(of: chest.reward) { _, reward in
            guard let reward else {
                rewarded = false
                return
            }
            guard !rewarded else { return }
            rewarded = true
            play += 1
            haptics.play(GameHapticPattern.chest(rewards: GameChestLines.of(reward).count))
        }
    }
}
