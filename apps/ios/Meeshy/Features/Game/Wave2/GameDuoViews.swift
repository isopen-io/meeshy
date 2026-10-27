import SwiftUI
import MeeshySDK
import MeeshyUI

/// LA MISSION EN DUO (#9385, conception II.7) — à deux, avec un ami accepté : un objectif commun dans la
/// semaine, la récompense DOUBLE si les deux finissent leur part. Elle s'ouvre au niveau 20 (record) pour
/// les deux, sur invitation ACCEPTÉE, et se quitte à tout moment (conformité B-4). Aucune pression : le duo
/// n'envoie rien, il se lit ici. Miroir de `apps/web/src/components/game-duo.tsx`.
///
/// Cinq états, lus de `duo.status` : jamais ouvert (`none`), invité (envoyée ou reçue), actif, réussi,
/// abandonné ou expiré. L'écran ne devine rien : la mission, la part du partenaire et la récompense viennent
/// du bloc servi.
struct GameDuoCard: View {
    @ObservedObject var model: GameWave2Model
    let duo: GameDuoBlock
    let levelRecord: Int

    private var partner: String { duo.partner?.displayName ?? GameText.leagueFriendsUnknown }

    var body: some View {
        GameCard(title: GameText.duoTitle) {
            content
            GameErrorLine(message: model.errors.duo, identifier: "game.duo.error")
            GameOfflineNote(online: model.isOnline)
        }
        .accessibilityIdentifier("game.duo")
    }

    @ViewBuilder
    private var content: some View {
        if !duo.unlocked {
            GameNote(text: GameText.duoLocked(level: GameCopy.formatCount(GameDuo.minLevel), current: GameCopy.formatCount(levelRecord)))
            GameFactChipRow(
                concept: .league,
                items: GameSpendRows.requirement(GameSpend.requirement(current: levelRecord, required: GameDuo.minLevel), record: true),
                identifier: "game.duo.requirement"
            )
        } else {
            switch duo.status {
            case .invited: invited
            case .active, .completed: running
            case .none, .abandoned, .expired: idle
            }
        }
    }

    // MARK: Invité

    @ViewBuilder
    private var invited: some View {
        GameNote(text: duo.role == .invitee ? GameText.duoInvitedInvitee(name: partner) : GameText.duoInvitedInviter(name: partner))
        if duo.role == .invitee, let duoId = duo.duoId {
            GameActionButton(
                title: GameText.duoAccept, busy: model.pending.accept, disabled: !model.isOnline,
                tint: MeeshyColors.brandPrimary, identifier: "game.duo.accept"
            ) {
                Task { await model.accept(duoId: duoId) }
            }
        }
        if let duoId = duo.duoId {
            GameQuietButton(
                title: duo.role == .invitee ? GameText.duoDecline : GameText.duoCancel, destructive: true,
                disabled: !model.isOnline || model.pending.duo, identifier: "game.duo.abandon"
            ) {
                Task { await model.abandon(duoId: duoId) }
            }
        }
    }

    // MARK: En cours ou réussi

    @ViewBuilder
    private var running: some View {
        if let mission = duo.mission {
            Text(GameCopy.missionTitle(templateKey: mission.templateKey, target: mission.partTarget))
                .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                .foregroundColor(ThemeManager.shared.textPrimary)
            if let progress = duo.progress {
                progressLines(mission: mission, progress: progress)
            }
        }
        if let reward = duo.reward {
            GameNote(
                text: reward.doubled
                    ? GameText.duoRewardDoubled(points: GameCopy.points(reward.points))
                    : GameText.duoReward(points: GameCopy.points(reward.points)),
                tone: reward.doubled ? MeeshyColors.success : nil
            )
        }
        GameNote(text: duo.status == .completed ? GameText.duoCompleted : GameText.duoRewardHint)
        if duo.status == .active, let duoId = duo.duoId {
            GameQuietButton(
                title: GameText.duoAbandon, destructive: true, disabled: !model.isOnline || model.pending.duo,
                identifier: "game.duo.abandon"
            ) {
                Task { await model.abandon(duoId: duoId) }
            }
        }
    }

    private func progressLines(mission: GameDuoBlock.Mission, progress: GameDuoBlock.Progress) -> some View {
        let mine = min(progress.mine, mission.partTarget)
        let theirs = min(progress.partner, mission.partTarget)
        let target = max(1, mission.partTarget)
        return VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
                GameNote(text: GameText.duoProgressMe(done: GameCopy.formatCount(mine), target: GameCopy.formatCount(mission.partTarget)))
                GameProgressBar(value: Double(mine) / Double(target), tint: MeeshyColors.brandPrimary,
                                label: GameText.duoProgressMe(done: GameCopy.formatCount(mine), target: GameCopy.formatCount(mission.partTarget)))
            }
            VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
                GameNote(text: GameText.duoProgressPartner(name: partner, done: GameCopy.formatCount(theirs), target: GameCopy.formatCount(mission.partTarget)))
                GameProgressBar(value: Double(theirs) / Double(target), tint: MeeshyColors.success,
                                label: GameText.duoProgressPartner(name: partner, done: GameCopy.formatCount(theirs), target: GameCopy.formatCount(mission.partTarget)))
            }
            GameNote(text: GameText.duoProgressCommon(done: GameCopy.formatCount(progress.common), target: GameCopy.formatCount(mission.commonTarget)))
        }
        .accessibilityElement(children: .contain)
    }

    // MARK: Sans duo, abandonné, expiré

    /// Huit amis au plus : on invite d'un toucher, sans sélecteur à chercher.
    private static let friendLimit = 8

    @ViewBuilder
    private var idle: some View {
        GameNote(text: idleSentence)
        if duo.status == .none {
            if model.friends.isEmpty {
                GameNote(text: GameText.duoNoFriends)
            } else {
                VStack(spacing: MeeshySpacing.sm) {
                    ForEach(Array(model.friends.prefix(Self.friendLimit)), id: \.id) { friend in
                        GameActionButton(
                            title: GameText.duoInvite(name: friend.displayName), busy: model.pending.invite,
                            disabled: !model.isOnline, tint: MeeshyColors.brandPrimary, identifier: "game.duo.invite"
                        ) {
                            Task { await model.invite(friend) }
                        }
                    }
                }
                .accessibilityElement(children: .contain)
                .accessibilityLabel(GameText.duoPick)
            }
        }
    }

    private var idleSentence: String {
        switch duo.status {
        case .abandoned: GameText.duoAbandoned
        case .expired: GameText.duoExpired
        default: GameText.duoNone
        }
    }
}
