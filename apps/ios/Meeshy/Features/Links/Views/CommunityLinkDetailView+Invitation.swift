import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Envoyer l'invitation (planche `Lien-Communaute`, #19505)

extension CommunityLinkDetailView {

    /// « Envoyer l'invitation · 2 choisis », la rangée des amis à cocher (K48) et « Inviter 2 personnes » (K40).
    /// Offerte seulement à qui la passerelle laisse inviter, et seulement s'il reste un ami à inviter.
    @ViewBuilder
    var invitationSection: some View {
        let candidates = viewModel.inviteCandidates
        if viewModel.canInvite, !candidates.isEmpty {
            let chosen = viewModel.chosenInviteeIds
            VStack(alignment: .leading, spacing: MeeshySpacing.md) {
                MeeshySectionHeader(title: CommunityLinkDetailCopy.inviteTitle, size: .sheet,
                                    lead: { EmptyView() },
                                    accessory: {
                    if !chosen.isEmpty {
                        Text(CommunityLinkDetailCopy.chosen(chosen.count))
                            .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
                            .foregroundStyle(.secondary)
                    }
                })
                inviteRail(candidates, chosen: chosen)
                MeeshyButton(CommunityLinkDetailCopy.inviteAction(chosen.count), systemImage: "person.badge.plus",
                             kind: .primary, width: .fill, tint: Self.accent,
                             disabledReason: chosen.isEmpty ? CommunityLinkDetailCopy.inviteHint : nil,
                             action: { sendInvitations() })
                    .disabled(chosen.isEmpty)
                    .accessibilityIdentifier("communityLink.detail.invite.send")
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityIdentifier("communityLink.detail.invite")
        }
    }

    private func inviteRail(_ candidates: [CommunityInviteCandidate], chosen: [String]) -> some View {
        let indices = Set(chosen.compactMap { id in candidates.firstIndex { $0.id == id } })
        return MeeshyAvatarGroup(
            count: candidates.count, layout: .rail, size: .s56, max: candidates.count,
            selection: .multiple(indices),
            onSelectionChange: { selection in
                guard case .multiple(let picked) = selection else { return }
                let ids = picked.sorted().map { candidates[$0].id }
                viewModel.setChosenInvitees(chosen.filter { ids.contains($0) } + ids.filter { !chosen.contains($0) })
            },
            label: CommunityLinkDetailCopy.inviteRailLabel,
            caption: { candidates[$0].shortName },
            tint: Self.accent,
            cell: { index, size in
                MeeshyAvatar(name: candidates[index].name, context: .custom(size),
                             avatarURL: candidates[index].avatar, enablePulse: false, isDark: isDark)
            }
        )
        .frame(minHeight: MeeshyControlSize.tapTarget)
    }

    private func sendInvitations() {
        HapticFeedback.light()
        Task {
            let outcome = await viewModel.inviteChosen()
            if outcome.failed > 0 {
                HapticFeedback.error()
                FeedbackToastManager.shared.showError(CommunityLinkDetailCopy.inviteFailed)
            } else if outcome.sent > 0 {
                HapticFeedback.success()
                FeedbackToastManager.shared.showSuccess(CommunityLinkDetailCopy.invited(outcome.sent))
            }
        }
    }
}
