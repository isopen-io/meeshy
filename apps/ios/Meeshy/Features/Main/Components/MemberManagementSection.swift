import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

// MARK: - MemberManagementSection

struct MemberManagementSection: View {
    @ObservedObject var viewModel: ConversationSettingsViewModel
    let currentUserRole: MemberRole

    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    private var theme: ThemeManager { ThemeManager.shared }

    @State private var showAddParticipant = false

    private let sectionColor = MeeshyColors.indigo600

    // MARK: - Body

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeader
            sectionContainer
        }
        .sheet(isPresented: $showAddParticipant) {
            AddParticipantSheet(
                conversationId: viewModel.conversationId,
                accentColor: viewModel.accentColor,
                existingMemberIds: Set(viewModel.participants.compactMap { $0.userId }),
                onAdded: {
                    Task { await viewModel.loadMembers() }
                }
            )
        }
    }

    // MARK: - Section Header

    private var sectionHeader: some View {
        HStack(spacing: 6) {
            Image(systemName: "person.3.fill")
                .font(MeeshyFont.relative(11, weight: .semibold))
                .foregroundColor(sectionColor)
                .accessibilityHidden(true)

            Text(headerTitle)
                .font(MeeshyFont.relative(11, weight: .bold))
                .foregroundColor(theme.textMuted)
                .tracking(1.2)
        }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }

    private var headerTitle: String {
        let count = viewModel.totalMemberCount > 0 ? viewModel.totalMemberCount : viewModel.participants.count
        let base = String(localized: "member-management.title", defaultValue: "MEMBRES", bundle: .main)
        return count > 0 ? "\(base) (\(count))" : base
    }

    // MARK: - Section Container

    private var sectionContainer: some View {
        VStack(spacing: 0) {
            searchBar

            if viewModel.isLoadingMembers && viewModel.participants.isEmpty {
                loadingState
            } else if filteredParticipants.isEmpty {
                emptyState
            } else {
                memberList
            }

            if currentUserRole.hasMinimumRole(.moderator) {
                addMemberButton
            }
        }
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(theme.backgroundSecondary.opacity(0.5))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .strokeBorder(sectionColor.opacity(0.2), lineWidth: 1)
        )
    }

    // MARK: - Search Bar

    private var searchBar: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass")
                .font(MeeshyFont.relative(13, weight: .medium))
                .foregroundColor(theme.textMuted)
                .accessibilityHidden(true)

            TextField(String(localized: "member-management.search", defaultValue: "Rechercher un membre...", bundle: .main), text: $viewModel.memberSearchText)
                .font(MeeshyFont.relative(14, design: .rounded))
                .foregroundColor(theme.textPrimary)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)

            if !viewModel.memberSearchText.isEmpty {
                Button {
                    viewModel.memberSearchText = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(MeeshyFont.relative(14))
                        .foregroundColor(theme.textMuted)
                }
                .accessibilityLabel(String(localized: "accessibility.clear_search", defaultValue: "Effacer la recherche", bundle: .main))
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(theme.textMuted.opacity(0.06))
        )
        .padding(.horizontal, 12)
        .padding(.top, 12)
        .padding(.bottom, 8)
    }

    // MARK: - Member List

    private var memberList: some View {
        LazyVStack(spacing: 0) {
            ForEach(Array(filteredParticipants.enumerated()), id: \.element.id) { index, participant in
                memberRow(participant)

                if index < filteredParticipants.count - 1 {
                    Divider()
                        .padding(.leading, 60)
                        .opacity(0.4)
                }
            }
        }
        .padding(.vertical, 4)
    }

    // MARK: - Member Row

    private func memberRow(_ participant: APIParticipant) -> some View {
        let displayName = participant.name
        let avatarColor = DynamicColorGenerator.colorForName(displayName)
        let targetRole = MemberRole(rawValue: participant.effectiveRole) ?? .member

        return HStack(spacing: 12) {
            MeeshyAvatar(
                name: displayName,
                context: .userListItem,
                accentColor: avatarColor,
                avatarURL: participant.resolvedAvatar
            )
            .frame(width: 36, height: 36)
            .clipShape(Circle())

            VStack(alignment: .leading, spacing: 2) {
                Text(displayName)
                    .font(MeeshyFont.relative(14, weight: .semibold, design: .rounded))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(1)

                roleBadge(for: targetRole)
            }

            Spacer()

            let actions = availableActions(for: participant)
            if !actions.isEmpty {
                Menu {
                    ForEach(actions, id: \.label) { action in
                        Button(role: action.isDestructive ? .destructive : nil) {
                            Task { await action.handler() }
                        } label: {
                            Label(action.label, systemImage: action.icon)
                        }
                    }
                } label: {
                    // Fixed 13pt: chrome glyph centered in a fixed 32×32 tap frame — a
                    // scalable font would overflow the frame (doctrine 82i). The Menu
                    // carries an .accessibilityLabel, so VoiceOver reads the member's name.
                    Image(systemName: "ellipsis")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                        .frame(width: 32, height: 32)
                        .contentShape(Circle())
                }
                .accessibilityLabel(String(format: String(localized: "member-management.options-a11y", defaultValue: "Options pour %@", bundle: .main), displayName))
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .contentShape(Rectangle())
    }

    // MARK: - Role Badge

    private func roleBadge(for role: MemberRole) -> some View {
        Group {
            switch role {
            case .creator:
                HStack(spacing: 3) {
                    Image(systemName: "crown.fill")
                        .font(MeeshyFont.relative(9))
                        .accessibilityHidden(true)
                    Text(String(localized: "member-management.role.creator", defaultValue: "Creator", bundle: .main))
                        .font(MeeshyFont.relative(11, weight: .medium))
                }
                .foregroundColor(Color(hex: "F8B500"))

            case .admin:
                HStack(spacing: 3) {
                    Image(systemName: "shield.fill")
                        .font(MeeshyFont.relative(9))
                        .accessibilityHidden(true)
                    Text(String(localized: "member-management.role.admin", defaultValue: "Admin", bundle: .main))
                        .font(MeeshyFont.relative(11, weight: .medium))
                }
                .foregroundColor(MeeshyColors.info)

            case .moderator:
                HStack(spacing: 3) {
                    Image(systemName: "checkmark.shield.fill")
                        .font(MeeshyFont.relative(9))
                        .accessibilityHidden(true)
                    Text(String(localized: "member-management.role.moderator", defaultValue: "Modérateur", bundle: .main))
                        .font(MeeshyFont.relative(11, weight: .medium))
                }
                .foregroundColor(MeeshyColors.success)

            case .member:
                EmptyView()
            }
        }
    }

    // MARK: - Add Member Button

    private var addMemberButton: some View {
        Button {
            HapticFeedback.light()
            showAddParticipant = true
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "person.badge.plus")
                    .font(MeeshyFont.relative(13, weight: .semibold))
                    .accessibilityHidden(true)

                Text(String(localized: "participants.add.title", defaultValue: "Ajouter un membre", bundle: .main))
                    .font(MeeshyFont.relative(14, weight: .semibold, design: .rounded))
            }
            .foregroundColor(sectionColor)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .overlay(
                Rectangle()
                    .fill(sectionColor.opacity(0.15))
                    .frame(height: 0.5),
                alignment: .top
            )
        }
        .accessibilityLabel(String(localized: "member-management.add-a11y", defaultValue: "Ajouter un membre a la conversation", bundle: .main))
    }

    // MARK: - Loading State

    private var loadingState: some View {
        VStack(spacing: 0) {
            ForEach(0..<3, id: \.self) { _ in
                skeletonRow
            }
        }
        .padding(.vertical, 4)
    }

    private var skeletonRow: some View {
        HStack(spacing: 12) {
            Circle()
                .fill(theme.textMuted.opacity(0.1))
                .frame(width: 36, height: 36)

            VStack(alignment: .leading, spacing: 4) {
                RoundedRectangle(cornerRadius: 4)
                    .fill(theme.textMuted.opacity(0.1))
                    .frame(width: 100, height: 12)

                RoundedRectangle(cornerRadius: 3)
                    .fill(theme.textMuted.opacity(0.07))
                    .frame(width: 60, height: 9)
            }

            Spacer()
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .shimmer()
    }

    // MARK: - Empty State

    private var emptyState: some View {
        VStack(spacing: 8) {
            // Fixed 28pt: decorative empty-state hero glyph — the adjacent label carries
            // the meaning, so it stays fixed and is hidden from VoiceOver (precedent 90i).
            Image(systemName: "person.slash")
                .font(.system(size: 28, weight: .light))
                .foregroundColor(theme.textMuted.opacity(0.4))
                .accessibilityHidden(true)

            Text(String(localized: "member-management.empty", defaultValue: "Aucun membre trouvé", bundle: .main))
                .font(MeeshyFont.relative(13, weight: .medium, design: .rounded))
                .foregroundColor(theme.textMuted)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 24)
        .accessibilityElement(children: .combine)
    }

    // MARK: - Filtered Participants

    private var filteredParticipants: [APIParticipant] {
        let query = viewModel.memberSearchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !query.isEmpty else { return viewModel.participants }
        return viewModel.participants.filter {
            $0.name.lowercased().contains(query)
        }
    }

    // MARK: - Available Actions

    private struct MemberAction {
        let label: String
        let icon: String
        let isDestructive: Bool
        let handler: () async -> Void
    }

    /// Les gestes offerts sur un membre — construits À PARTIR de
    /// `MemberActionPolicy`, qui décide seule ce qui est permis et, surtout, quel
    /// identifiant part au gateway.
    ///
    /// Cette fabrique passait `participant.id` — un `Participant.id` — aux trois
    /// routes qui filtrent sur `userId`. Promouvoir répondait 404 ; retirer
    /// répondait 200 sans rien faire. Le bon identifiant était calculé juste à
    /// côté et ne servait qu'au bannissement.
    private func availableActions(for participant: APIParticipant) -> [MemberAction] {
        MemberActionPolicy.actions(for: participant, currentUserRole: currentUserRole)
            .map { action in
                MemberAction(
                    label: label(for: action.kind),
                    icon: icon(for: action.kind),
                    isDestructive: action.kind == .expel || action.kind == .ban,
                    handler: { await perform(action) }
                )
            }
    }

    private func perform(_ action: MemberActionPolicy.Action) async {
        switch action.kind {
        case .promoteToAdmin, .promoteToModerator, .demoteToMember:
            // La policy ne propose un changement de rang qu'aux comptes : la clé
            // est donc bien un `User.id` ici.
            guard let role = action.kind.targetRole else { return }
            await viewModel.updateRole(userId: action.targetKey, newRole: role)
        case .expel:
            await viewModel.expelParticipant(key: action.targetKey)
        case .ban:
            await viewModel.banParticipant(key: action.targetKey)
        }
    }

    private func label(for kind: MemberActionPolicy.Kind) -> String {
        switch kind {
        case .promoteToAdmin:
            return String(localized: "member-management.action.promote-admin", defaultValue: "Promouvoir Admin", bundle: .main)
        case .promoteToModerator:
            return String(localized: "member-management.action.promote-moderator", defaultValue: "Promouvoir Modérateur", bundle: .main)
        case .demoteToMember:
            return String(localized: "member-management.action.demote-member", defaultValue: "Rétrograder Membre", bundle: .main)
        case .expel:
            return String(localized: "member-management.action.expel", defaultValue: "Expulser", bundle: .main)
        case .ban:
            return String(localized: "member-management.action.ban", defaultValue: "Bannir", bundle: .main)
        }
    }

    private func icon(for kind: MemberActionPolicy.Kind) -> String {
        switch kind {
        case .promoteToAdmin: return "shield.fill"
        case .promoteToModerator: return "checkmark.shield.fill"
        case .demoteToMember: return "person.fill"
        case .expel: return "person.fill.xmark"
        case .ban: return "hand.raised.fill"
        }
    }
}
