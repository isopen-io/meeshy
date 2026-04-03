import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - MemberManagementSection

struct MemberManagementSection: View {
    @ObservedObject var viewModel: ConversationSettingsViewModel
    let currentUserRole: MemberRole

    @ObservedObject private var theme = ThemeManager.shared

    @State private var showAddParticipant = false

    private let sectionColor = Color(hex: "9B59B6")

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
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(sectionColor)

            Text(headerTitle)
                .font(.system(size: 11, weight: .bold))
                .foregroundColor(theme.textMuted)
                .tracking(1.2)
        }
    }

    private var headerTitle: String {
        let count = viewModel.totalMemberCount > 0 ? viewModel.totalMemberCount : viewModel.participants.count
        return count > 0 ? "MEMBRES (\(count))" : "MEMBRES"
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
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(theme.textMuted)

            TextField("Rechercher un membre...", text: $viewModel.memberSearchText)
                .font(.system(size: 14, design: .rounded))
                .foregroundColor(theme.textPrimary)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)

            if !viewModel.memberSearchText.isEmpty {
                Button {
                    viewModel.memberSearchText = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 14))
                        .foregroundColor(theme.textMuted)
                }
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
                    .font(.system(size: 14, weight: .semibold, design: .rounded))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(1)

                roleBadge(for: targetRole)
            }

            Spacer()

            let actions = availableActions(for: participant, targetRole: targetRole)
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
                    Image(systemName: "ellipsis")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                        .frame(width: 32, height: 32)
                        .contentShape(Circle())
                }
                .accessibilityLabel("Options pour \(displayName)")
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
                        .font(.system(size: 9))
                    Text("Creator")
                        .font(.system(size: 11, weight: .medium))
                }
                .foregroundColor(Color(hex: "F8B500"))

            case .admin:
                HStack(spacing: 3) {
                    Image(systemName: "shield.fill")
                        .font(.system(size: 9))
                    Text("Admin")
                        .font(.system(size: 11, weight: .medium))
                }
                .foregroundColor(Color(hex: "3B82F6"))

            case .moderator:
                HStack(spacing: 3) {
                    Image(systemName: "checkmark.shield.fill")
                        .font(.system(size: 9))
                    Text("Modérateur")
                        .font(.system(size: 11, weight: .medium))
                }
                .foregroundColor(Color(hex: "4ECDC4"))

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
                    .font(.system(size: 13, weight: .semibold))

                Text("Ajouter un membre")
                    .font(.system(size: 14, weight: .semibold, design: .rounded))
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
        .accessibilityLabel("Ajouter un membre a la conversation")
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
            Image(systemName: "person.slash")
                .font(.system(size: 28, weight: .light))
                .foregroundColor(theme.textMuted.opacity(0.4))

            Text("Aucun membre trouvé")
                .font(.system(size: 13, weight: .medium, design: .rounded))
                .foregroundColor(theme.textMuted)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 24)
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

    private func availableActions(for participant: APIParticipant, targetRole: MemberRole) -> [MemberAction] {
        guard currentUserRole > targetRole else { return [] }

        var actions: [MemberAction] = []

        let participantId = participant.id
        let userId = participant.userId ?? participant.id

        if currentUserRole == .creator && targetRole < .admin {
            actions.append(MemberAction(
                label: "Promouvoir Admin",
                icon: "shield.fill",
                isDestructive: false,
                handler: { await viewModel.updateRole(participantId: participantId, newRole: "ADMIN") }
            ))
        }

        if currentUserRole.hasMinimumRole(.admin) && targetRole == .member {
            actions.append(MemberAction(
                label: "Promouvoir Modérateur",
                icon: "checkmark.shield.fill",
                isDestructive: false,
                handler: { await viewModel.updateRole(participantId: participantId, newRole: "MODERATOR") }
            ))
        }

        if currentUserRole > targetRole && targetRole > .member {
            actions.append(MemberAction(
                label: "Rétrograder Membre",
                icon: "person.fill",
                isDestructive: false,
                handler: { await viewModel.updateRole(participantId: participantId, newRole: "MEMBER") }
            ))
        }

        actions.append(MemberAction(
            label: "Expulser",
            icon: "person.fill.xmark",
            isDestructive: true,
            handler: { await viewModel.expelParticipant(participantId: participantId) }
        ))

        if currentUserRole.hasMinimumRole(.admin) {
            actions.append(MemberAction(
                label: "Bannir",
                icon: "hand.raised.fill",
                isDestructive: true,
                handler: { await viewModel.banParticipant(userId: userId) }
            ))
        }

        return actions
    }
}
