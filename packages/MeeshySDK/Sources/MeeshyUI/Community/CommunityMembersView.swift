import SwiftUI
import MeeshySDK
import os

public struct CommunityMembersView: View {
    @StateObject private var viewModel: CommunityMembersViewModel
    @ObservedObject private var theme = ThemeManager.shared

    public var onInvite: (() -> Void)? = nil
    @State private var showInviteSheet = false

    public init(communityId: String, onInvite: (() -> Void)? = nil) {
        _viewModel = StateObject(wrappedValue: CommunityMembersViewModel(communityId: communityId))
        self.onInvite = onInvite
    }

    public var body: some View {
        ZStack {
            theme.backgroundPrimary.ignoresSafeArea()

            if viewModel.isLoading && viewModel.members.isEmpty {
                ProgressView()
                    .tint(MeeshyColors.indigo500)
            } else if viewModel.members.isEmpty {
                EmptyStateView(
                    icon: "person.3",
                    title: String(localized: "community.members.empty.title", defaultValue: "No Members", bundle: .module),
                    subtitle: String(localized: "community.members.empty.subtitle", defaultValue: "Invite people to join this community", bundle: .module),
                    actionLabel: String(localized: "community.members.empty.action", defaultValue: "Invite", bundle: .module),
                    onAction: { onInvite?() }
                )
            } else {
                memberList
            }
        }
        .navigationTitle(String(localized: "community.members.title", defaultValue: "Members", bundle: .module))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                if viewModel.canInvite {
                    Button {
                        if let onInvite {
                            onInvite()
                        } else {
                            showInviteSheet = true
                        }
                    } label: {
                        Image(systemName: "person.badge.plus")
                            .foregroundColor(MeeshyColors.indigo500)
                    }
                }
            }
        }
        .refreshable { await viewModel.refresh() }
        .task { await viewModel.loadIfNeeded() }
        .sheet(isPresented: $showInviteSheet) {
            CommunityInviteView(communityId: viewModel.communityId)
                .onDisappear { Task { await viewModel.refresh() } }
        }
    }

    private var memberList: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                ForEach(groupedMembers.keys.sorted(by: { $0.level > $1.level }), id: \.self) { role in
                    if let members = groupedMembers[role] {
                        Section {
                            ForEach(members) { member in
                                MemberRow(
                                    member: member,
                                    isCurrentUserAdmin: viewModel.isCurrentUserAdmin,
                                    onRoleChange: { newRole in
                                        Task { await viewModel.updateRole(memberId: member.id, role: newRole) }
                                    },
                                    onRemove: {
                                        Task { await viewModel.removeMember(userId: member.userId) }
                                    }
                                )

                                if member.id != members.last?.id {
                                    Divider().padding(.leading, 68)
                                }
                            }
                        } header: {
                            sectionHeader(role: role, count: members.count)
                        }
                    }
                }

                if viewModel.hasMore {
                    ProgressView()
                        .tint(MeeshyColors.indigo500)
                        .padding()
                        .task { await viewModel.loadMore() }
                }
            }
        }
    }

    private var groupedMembers: [CommunityRole: [APICommunityMember]] {
        Dictionary(grouping: viewModel.members) { $0.communityRole }
    }

    private func sectionHeader(role: CommunityRole, count: Int) -> some View {
        HStack(spacing: 6) {
            Image(systemName: role.icon)
                .font(.system(size: 11))
            Text("\(role.displayName)s")
                .font(.system(size: 12, weight: .bold, design: .rounded))
            Text("\(count)")
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(theme.textMuted)
        }
        .foregroundColor(theme.textSecondary)
        .textCase(.uppercase)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(theme.backgroundSecondary.opacity(0.3))
    }
}

// MARK: - Member Row

struct MemberRow: View {
    let member: APICommunityMember
    let isCurrentUserAdmin: Bool
    var onRoleChange: ((CommunityRole) -> Void)? = nil
    var onRemove: (() -> Void)? = nil

    @ObservedObject private var theme = ThemeManager.shared

    private var user: APICommunityUser? { member.user }
    private var displayName: String { user?.name ?? String(localized: "community.members.unknownUser", defaultValue: "Unknown", bundle: .module) }
    private var accentColor: String { DynamicColorGenerator.colorForName(displayName) }

    var body: some View {
        HStack(spacing: 12) {
            MeeshyAvatar(
                name: displayName,
                context: .userListItem,
                accentColor: accentColor,
                avatarURL: user?.avatar,
                presenceState: user?.isOnline == true ? .online : .offline
            )

            VStack(alignment: .leading, spacing: 2) {
                Text(displayName)
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(1)

                HStack(spacing: 4) {
                    Image(systemName: member.communityRole.icon)
                        .font(.system(size: 9))
                    Text(member.communityRole.displayName)
                        .font(.system(size: 11, weight: .medium))
                }
                .foregroundColor(roleColor)
            }

            Spacer()

            if isCurrentUserAdmin {
                Menu {
                    ForEach(CommunityRole.allCases, id: \.self) { role in
                        Button {
                            onRoleChange?(role)
                        } label: {
                            Label(role.displayName, systemImage: role.icon)
                        }
                        .disabled(role == member.communityRole)
                    }

                    Divider()

                    Button(role: .destructive) {
                        onRemove?()
                    } label: {
                        Label(String(localized: "community.members.remove", defaultValue: "Remove", bundle: .module), systemImage: "person.badge.minus")
                    }
                } label: {
                    Image(systemName: "ellipsis")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                        .frame(width: 32, height: 32)
                        .contentShape(Circle())
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
    }

    private var roleColor: Color {
        switch member.communityRole {
        case .creator: return MeeshyColors.warning
        case .admin: return MeeshyColors.error
        case .moderator: return MeeshyColors.indigo500
        case .member: return theme.textMuted
        }
    }
}

// MARK: - ViewModel

@MainActor
final class CommunityMembersViewModel: ObservableObject {
    @Published var members: [APICommunityMember] = []
    @Published var isLoading = false
    @Published var hasMore = false
    @Published var isCurrentUserAdmin = false

    let communityId: String
    @Published var isMember = false
    var canInvite: Bool { isMember }

    private var hasLoaded = false
    private var currentOffset = 0
    private let pageSize = 30
    private let service: CommunityServiceProviding

    init(communityId: String, service: CommunityServiceProviding = CommunityService.shared) {
        self.communityId = communityId
        self.service = service
    }

    func loadIfNeeded() async {
        guard !hasLoaded else { return }
        await load()
    }

    func refresh() async {
        currentOffset = 0
        hasLoaded = false
        await load()
    }

    func loadMore() async {
        guard hasMore, !isLoading else { return }
        await load(append: true)
    }

    private func load(append: Bool = false) async {
        isLoading = true
        defer { isLoading = false }

        do {
            let response = try await service.getMembers(
                communityId: communityId,
                offset: append ? currentOffset : 0,
                limit: pageSize
            )

            if append {
                members.append(contentsOf: response.data)
            } else {
                members = response.data
            }

            currentOffset = members.count
            hasMore = response.pagination?.hasMore ?? false
            hasLoaded = true

            let currentUserId = AuthManager.shared.currentUser?.id ?? ""
            let currentMember = members.first { $0.userId == currentUserId }
            isMember = currentMember != nil
            isCurrentUserAdmin = currentMember?.communityRole.hasMinimumRole(.admin) ?? false
        } catch {
            Logger.community.error("[CommunityMembersVM] Error loading: \(error)")
        }
    }

    func updateRole(memberId: String, role: CommunityRole) async {
        do {
            _ = try await service.updateMemberRole(
                communityId: communityId,
                memberId: memberId,
                role: role
            )
            await refresh()
        } catch {
            Logger.community.error("[CommunityMembersVM] Error updating role: \(error)")
        }
    }

    func removeMember(userId: String) async {
        do {
            try await service.removeMember(communityId: communityId, userId: userId)
            members.removeAll { $0.userId == userId }
        } catch {
            Logger.community.error("[CommunityMembersVM] Error removing member: \(error)")
        }
    }
}

// MARK: - Logger

private extension Logger {
    static let community = Logger(subsystem: "me.meeshy.sdk", category: "community")
}
