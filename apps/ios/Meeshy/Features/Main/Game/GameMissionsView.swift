import SwiftUI
import MeeshySDK
import MeeshyUI

/// LES MISSIONS DU JOUR ET LE COFFRE (#9383) — trois missions, leur avancement,
/// un changement par jour (1 Meesh), et le coffre qui s'ouvre quand tout est fait
/// (conception, partie II « Missions du jour »). Miroir de
/// `apps/web/src/components/game-missions.tsx`.
///
/// Le coffre dit son contenu AVANT l'ouverture : un tirage dont on ignore les
/// chances est une loterie, pas un jeu. Ouvert, ses récompenses se posent AU-DESSUS
/// de lui (`ChestStage`, 1,4 s, une tape par récompense).
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

    private static let rerollPrice = 1

    private var theme: ThemeManager { ThemeManager.shared }
    private var missions: GameBlock.Missions { game.missions }
    /// Le fuseau où la passerelle découpe le jour de jeu : celui du COMPTE, jamais celui de l'appareil (#9539).
    private var accountTimezone: String? { AuthManager.shared.currentUser?.timezone }

    var body: some View {
        GameCard(anchor: .missions, title: String(localized: "game.missions.title", defaultValue: "Missions du jour", bundle: .main)) {
            if !missions.unlocked {
                GameNote(text: String(
                    localized: "game.missions.locked",
                    defaultValue: "Les missions s’ouvrent au niveau 5 : trois par jour, et un coffre. Tu es au niveau \(GameCopy.formatCount(game.level.level)).",
                    bundle: .main
                ))
            } else {
                if missions.prismDay {
                    GameNote(text: String(
                        localized: "game.missions.prism_day",
                        defaultValue: "Jour du Prisme : une des missions se joue dans une autre langue que la tienne.",
                        bundle: .main
                    ))
                }
                if let hour = game.boosts.prismHour {
                    GameNote(text: String(
                        localized: "game.missions.prism_hour",
                        defaultValue: "Heure du Prisme : \(GameCopy.clock(minuteOfDay: hour.startMinute)) – \(GameCopy.clock(minuteOfDay: hour.endMinute)) — tes missions comptent double.",
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
                        held: game.treasury.held,
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
                        held: game.treasury.held,
                        onReroll: onReroll
                    )
                }
                GameErrorLine(message: errors.reroll, identifier: "game.missions.reroll.error")
                if !online {
                    GameNote(text: String(
                        localized: "game.missions.offline",
                        defaultValue: "Hors ligne : changer une mission ou ouvrir le coffre reprendra en ligne.",
                        bundle: .main
                    ))
                }
                GameChestCard(
                    chest: game.chest, opening: chestOpening, online: online, error: errors.chest,
                    haptics: haptics, onClaim: onClaim
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
    let held: Int
    let onReroll: (String) -> Void

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
                    GameChip(text: String(localized: "game.mission.done", defaultValue: "Faite", bundle: .main), tint: MeeshyColors.success)
                }
            }
            Text(title)
                .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                .foregroundColor(theme.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
            ProgressionBar(
                progress: mission.target > 0 ? Double(mission.progress) / Double(mission.target) : 0,
                tint: done ? MeeshyColors.success : MeeshyColors.brandPrimary,
                label: title
            )
            HStack(alignment: .center, spacing: MeeshySpacing.sm) {
                Text(progressLine)
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                    .foregroundColor(theme.textMuted)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
                if canReroll && !done && (phase?.allowsAction ?? true) {
                    rerollButton
                }
            }
            if let line = GameCopy.missionTimerLine(phase, window: personal ? window : nil) {
                Label {
                    Text(line)
                        .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                        .fixedSize(horizontal: false, vertical: true)
                } icon: {
                    Image(systemName: "timer")
                        .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
                        .foregroundColor(theme.textMuted)
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
            defaultValue: "\(current) / \(target) · \(reward) · +\(GameCopy.formatCount(mission.glory)) Gloire",
            bundle: .main
        )
    }

    private var rerollButton: some View {
        Button {
            HapticFeedback.light()
            onReroll(mission.id)
        } label: {
            Text(String(localized: "game.mission.reroll", defaultValue: "Changer · 1 Meesh", bundle: .main))
                .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
                .foregroundColor(MeeshyColors.brandPrimary)
                .padding(.horizontal, MeeshySpacing.md)
                .frame(minHeight: 44)
                .background(Capsule().fill(MeeshyColors.brandPrimary.opacity(0.12)))
        }
        .buttonStyle(.plain)
        .disabled(!online || pending || held < 1)
        .opacity(!online || pending || held < 1 ? 0.5 : 1)
        .accessibilityLabel(String(
            localized: "game.mission.reroll.a11y",
            defaultValue: "Changer la mission « \(title) » contre 1 Meesh",
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

    @State private var play = 0
    @State private var rewarded: Bool

    init(chest: GameBlock.Chest, opening: Bool, online: Bool, error: String?, haptics: GameHapticsProviding, onClaim: @escaping () -> Void) {
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

    private var phase: Phase {
        if opening || chest.status == .claimed { return chest.reward == nil ? .opening : .claimed }
        return chest.status == .ready ? .ready : .locked
    }

    var body: some View {
        let phase = self.phase
        VStack(spacing: MeeshySpacing.sm) {
            ChestStage(reward: chest.reward, isOpen: phase == .opening || phase == .claimed, play: play)
            Text(String(localized: "game.chest.title", defaultValue: "Coffre du jour", bundle: .main))
                .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .bold))
                .foregroundColor(theme.textPrimary)
            switch phase {
            case .locked:
                GameNote(text: String(localized: "game.chest.locked", defaultValue: "Termine les missions du jour pour l’ouvrir.", bundle: .main))
            case .opening:
                GameNote(text: String(localized: "game.chest.opening", defaultValue: "Ouverture en cours…", bundle: .main))
            case .ready:
                GameActionButton(
                    title: String(localized: "game.chest.open", defaultValue: "Ouvrir le coffre", bundle: .main),
                    disabled: !online, identifier: "game.chest.open", action: onClaim
                )
            case .claimed:
                GameNote(text: String(localized: "game.chest.claimed", defaultValue: "Reviens demain pour le prochain.", bundle: .main))
            }
            GameNote(text: oddsLine)
                .multilineTextAlignment(.center)
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
            haptics.play(GameHapticPattern.chest(rewards: 1 + (reward.fragment ? 1 : 0) + (reward.freeze ? 1 : 0)))
        }
    }

    private var oddsLine: String {
        let odds = chest.odds
        return String(
            localized: "game.chest.odds",
            defaultValue: "\(GameCopy.formatCount(odds.minPoints)) à \(GameCopy.points(odds.maxPoints)) · \(GameCopy.chance(odds.fragment)) d’un fragment · \(GameCopy.chance(odds.freeze)) d’un gel",
            bundle: .main
        )
    }
}
