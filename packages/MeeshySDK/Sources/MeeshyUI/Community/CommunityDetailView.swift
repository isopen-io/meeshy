import SwiftUI
import MeeshySDK

public struct CommunityDetailView: View {
    @StateObject private var viewModel: CommunityDetailViewModel
    @ObservedObject private var theme = ThemeManager.shared
    @Environment(\.dismiss) private var dismiss

    public var onSelectConversation: ((APIConversation) -> Void)? = nil
    public var onOpenSettings: ((MeeshyCommunity) -> Void)? = nil
    public var onOpenMembers: ((String) -> Void)? = nil
    public var onInvite: ((String) -> Void)? = nil

    public init(communityId: String,
                onSelectConversation: ((APIConversation) -> Void)? = nil,
                onOpenSettings: ((MeeshyCommunity) -> Void)? = nil,
                onOpenMembers: ((String) -> Void)? = nil,
                onInvite: ((String) -> Void)? = nil) {
        _viewModel = StateObject(wrappedValue: CommunityDetailViewModel(communityId: communityId))
        self.onSelectConversation = onSelectConversation
        self.onOpenSettings = onOpenSettings
        self.onOpenMembers = onOpenMembers
        self.onInvite = onInvite
    }

    public var body: some View {
        ZStack {
            theme.backgroundPrimary.ignoresSafeArea()

            if viewModel.isLoading && viewModel.community == nil {
                ProgressView()
                    .tint(Color(hex: "FF2E63"))
            } else if let community = viewModel.community {
                ScrollView {
                    VStack(spacing: 0) {
                        headerSection(community)
                        statsSection(community)
                        actionsSection(community)
                        conversationsSection
                    }
                }
            } else if let error = viewModel.errorMessage {
                EmptyStateView(
                    icon: "exclamationmark.triangle",
                    title: "Error",
                    subtitle: error,
                    actionLabel: "Retry",
                    onAction: { Task { await viewModel.load() } }
                )
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .task { await viewModel.load() }
    }

    // MARK: - Header

    @ViewBuilder
    private func headerSection(_ community: MeeshyCommunity) -> some View {
        VStack(spacing: 12) {
            communityAvatar(community)

            Text(community.name)
                .font(.system(size: 22, weight: .bold, design: .rounded))
                .foregroundColor(theme.textPrimary)

            if let desc = community.description, !desc.isEmpty {
                Text(desc)
                    .font(.system(size: 14, weight: .regular, design: .rounded))
                    .foregroundColor(theme.textSecondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
            }

            HStack(spacing: 4) {
                Image(systemName: community.isPrivate ? "lock.fill" : "globe")
                    .font(.system(size: 11))
                Text(community.isPrivate ? "Private" : "Public")
                    .font(.system(size: 12, weight: .medium))
            }
            .foregroundColor(theme.textMuted)
            .padding(.horizontal, 12)
            .padding(.vertical, 4)
            .background(theme.backgroundSecondary)
            .clipShape(Capsule())
        }
        .padding(.vertical, 20)
        .frame(maxWidth: .infinity)
    }

    @ViewBuilder
    private func communityAvatar(_ community: MeeshyCommunity) -> some View {
        let color = community.color.isEmpty ? DynamicColorGenerator.colorForName(community.name) : community.color
        RoundedRectangle(cornerRadius: 22)
            .fill(
                LinearGradient(
                    colors: [Color(hex: color), Color(hex: color).opacity(0.6)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .frame(width: 80, height: 80)
            .overlay {
                Text(String(community.name.prefix(2)).uppercased())
                    .font(.system(size: 30, weight: .bold, design: .rounded))
                    .foregroundColor(.white)
            }
            .shadow(color: Color(hex: color).opacity(0.3), radius: 10, y: 4)
    }

    // MARK: - Stats

    @ViewBuilder
    private func statsSection(_ community: MeeshyCommunity) -> some View {
        HStack(spacing: 0) {
            statItem(value: "\(community.memberCount)", label: "Members", icon: "person.2.fill")
            Divider().frame(height: 30)
            statItem(value: "\(community.conversationCount)", label: "Channels", icon: "bubble.left.and.bubble.right.fill")
        }
        .padding(.vertical, 12)
        .background(theme.backgroundSecondary.opacity(0.5))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .padding(.horizontal, 16)
    }

    private func statItem(value: String, label: String, icon: String) -> some View {
        VStack(spacing: 4) {
            HStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.system(size: 12))
                    .foregroundColor(Color(hex: "A855F7"))
                Text(value)
                    .font(.system(size: 18, weight: .bold, design: .rounded))
                    .foregroundColor(theme.textPrimary)
            }
            Text(label)
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(theme.textSecondary)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Actions

    @ViewBuilder
    private func actionsSection(_ community: MeeshyCommunity) -> some View {
        HStack(spacing: 12) {
            if viewModel.isMember {
                actionButton(icon: "person.2.fill", title: "Members") {
                    onOpenMembers?(community.id)
                }

                actionButton(icon: "person.badge.plus", title: "Invite") {
                    onInvite?(community.id)
                }

                actionButton(icon: "gearshape.fill", title: "Settings") {
                    onOpenSettings?(community)
                }
            } else {
                Button {
                    Task { await viewModel.joinCommunity() }
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "plus.circle.fill")
                        Text("Join Community")
                    }
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(
                        LinearGradient(
                            colors: [Color(hex: "FF2E63"), Color(hex: "A855F7")],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 16)
    }

    private func actionButton(icon: String, title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 18))
                    .foregroundColor(Color(hex: "A855F7"))
                Text(title)
                    .font(.system(size: 11, weight: .medium, design: .rounded))
                    .foregroundColor(theme.textSecondary)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(theme.backgroundSecondary.opacity(0.5))
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }

    // MARK: - Conversations

    @ViewBuilder
    private var conversationsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Channels")
                .font(.system(size: 16, weight: .bold, design: .rounded))
                .foregroundColor(theme.textPrimary)
                .padding(.horizontal, 16)

            if viewModel.conversations.isEmpty && !viewModel.isLoading {
                EmptyStateView(
                    icon: "bubble.left.and.bubble.right",
                    title: "No Channels Yet",
                    subtitle: "Conversations will appear here"
                )
                .frame(height: 200)
            } else {
                LazyVStack(spacing: 0) {
                    ForEach(viewModel.conversations, id: \.id) { conversation in
                        conversationRow(conversation)
                            .onTapGesture { onSelectConversation?(conversation) }

                        if conversation.id != viewModel.conversations.last?.id {
                            Divider().padding(.leading, 60)
                        }
                    }
                }
            }
        }
        .padding(.top, 8)
    }

    private func conversationRow(_ conversation: APIConversation) -> some View {
        HStack(spacing: 12) {
            Image(systemName: "number")
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(Color(hex: "A855F7"))
                .frame(width: 36, height: 36)
                .background(Color(hex: "A855F7").opacity(0.1))
                .clipShape(RoundedRectangle(cornerRadius: 10))

            VStack(alignment: .leading, spacing: 2) {
                Text(conversation.title ?? conversation.identifier ?? "Channel")
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(1)

                if let desc = conversation.description, !desc.isEmpty {
                    Text(desc)
                        .font(.system(size: 12, weight: .regular))
                        .foregroundColor(theme.textSecondary)
                        .lineLimit(1)
                }
            }

            Spacer()

            if let count = conversation.memberCount {
                Text("\(count)")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(theme.textMuted)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .contentShape(Rectangle())
    }
}

// MARK: - ViewModel

@MainActor
final class CommunityDetailViewModel: ObservableObject {
    @Published var community: MeeshyCommunity?
    @Published var conversations: [APIConversation] = []
    @Published var isMember = false
    @Published var isLoading = false
    @Published var errorMessage: String?

    let communityId: String

    init(communityId: String) {
        self.communityId = communityId
    }

    func load() async {
        isLoading = true
        defer { isLoading = false }

        do {
            let apiCommunity = try await CommunityService.shared.get(communityId: communityId)
            community = apiCommunity.toCommunity()

            let currentUserId = AuthManager.shared.currentUser?.id ?? ""
            isMember = apiCommunity.members?.contains(where: { $0.userId == currentUserId }) ?? false

            if isMember {
                conversations = try await CommunityService.shared.getConversations(communityId: communityId)
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func joinCommunity() async {
        do {
            _ = try await CommunityService.shared.join(communityId: communityId)
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
