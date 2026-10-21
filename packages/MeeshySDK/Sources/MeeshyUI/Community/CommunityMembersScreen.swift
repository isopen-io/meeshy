import SwiftUI
import Combine
import MeeshySDK

public struct CommunityMembersScreen<ViewModel: CommunityMembersModeling, Invite: View>: View {
    @ObservedObject private var viewModel: ViewModel
    @Environment(\.colorScheme) private var colorScheme
    private var theme: ThemePalette { ThemePalette(colorScheme: colorScheme) }

    public var onInvite: (() -> Void)? = nil
    @State private var showInviteSheet = false
    private let inviteSheet: () -> Invite

    public init(
        viewModel: ViewModel,
        onInvite: (() -> Void)? = nil,
        @ViewBuilder inviteSheet: @escaping () -> Invite
    ) {
        self.viewModel = viewModel
        self.onInvite = onInvite
        self.inviteSheet = inviteSheet
    }

    public var body: some View {
        ZStack {
            theme.backgroundPrimary.ignoresSafeArea()

            if viewModel.isLoading && viewModel.isEmpty {
                ProgressView()
                    .tint(MeeshyColors.indigo500)
            } else if viewModel.isEmpty {
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
            inviteSheet()
                .onDisappear { Task { await viewModel.refresh() } }
        }
    }

    private var memberList: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                ForEach(viewModel.sections) { section in
                    Section {
                        ForEach(section.members) { member in
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

                            if member.id != section.members.last?.id {
                                Divider().padding(.leading, 68)
                            }
                        }
                    } header: {
                        sectionHeader(role: section.role, count: section.members.count)
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

    private func sectionHeader(role: MemberRole, count: Int) -> some View {
        HStack(spacing: MeeshySpacing.xsPlus) {
            Image(systemName: role.icon)
                .font(.system(size: MeeshyIconSize.xxs))
            Text(role.sectionTitle(in: .module))
                .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .bold, design: .rounded))
            Text("\(count)")
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                .foregroundColor(theme.textMuted)
        }
        .foregroundColor(theme.textSecondary)
        .textCase(.uppercase)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.vertical, MeeshySpacing.sm)
        .background(theme.backgroundSecondary.opacity(0.3))
    }
}

// MARK: - Member Row

struct MemberRow: View {
    let member: APICommunityMember
    let isCurrentUserAdmin: Bool
    var onRoleChange: ((MemberRole) -> Void)? = nil
    var onRemove: (() -> Void)? = nil

    @Environment(\.colorScheme) private var colorScheme
    private var theme: ThemePalette { ThemePalette(colorScheme: colorScheme) }

    private var user: APICommunityUser? { member.user }
    private var displayName: String { user?.name ?? String(localized: "community.members.unknownUser", defaultValue: "Unknown", bundle: .module) }
    private var accentColor: String { DynamicColorGenerator.colorForName(displayName) }

    var body: some View {
        HStack(spacing: MeeshySpacing.md) {
            MeeshyAvatar(
                name: displayName,
                context: .userListItem,
                accentColor: accentColor,
                avatarURL: user?.avatar,
                presenceState: UserPresence(isOnline: user?.isOnline ?? false).state,
                ring: user?.avatarRing
            )

            VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                Text(displayName)
                    .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold, design: .rounded))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(1)

                HStack(spacing: MeeshySpacing.xs) {
                    Image(systemName: member.communityRole.icon)
                        .font(.system(size: MeeshyIconSize.xxs))
                    Text(member.communityRole.displayName)
                        .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                }
                .foregroundColor(roleColor)
            }

            Spacer()

            if isCurrentUserAdmin {
                Menu {
                    ForEach(MemberRole.allCases, id: \.self) { role in
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
                        .font(.system(size: MeeshyIconSize.sm, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                        .frame(width: MeeshyControlSize.compact, height: MeeshyControlSize.compact)
                        .contentShape(Circle())
                }
            }
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.vertical, MeeshySpacing.smPlus)
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
