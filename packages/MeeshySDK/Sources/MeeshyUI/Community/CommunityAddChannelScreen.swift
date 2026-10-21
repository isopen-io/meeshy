import SwiftUI
import MeeshySDK

public struct CommunityAddChannelScreen<ViewModel: CommunityAddChannelModeling>: View {
    @ObservedObject private var viewModel: ViewModel
    @Environment(\.colorScheme) private var colorScheme
    private var theme: ThemePalette { ThemePalette(colorScheme: colorScheme) }
    @Environment(\.dismiss) private var dismiss

    public init(viewModel: ViewModel) {
        self.viewModel = viewModel
    }

    private var filtered: [APIConversation] {
        guard !viewModel.searchText.isEmpty else { return viewModel.conversations }
        return viewModel.conversations.filter { title(for: $0).localizedCaseInsensitiveContains(viewModel.searchText) }
    }

    private func title(for conversation: APIConversation) -> String {
        viewModel.titles[conversation.id] ?? String(localized: "community.addChannel.conversation.fallbackName", defaultValue: "Conversation", bundle: .module)
    }

    public var body: some View {
        NavigationStack {
            ZStack {
                theme.backgroundPrimary.ignoresSafeArea()

                if viewModel.isLoading && viewModel.conversations.isEmpty {
                    ProgressView()
                        .tint(MeeshyColors.brandPrimary)
                } else if filtered.isEmpty && !viewModel.isLoading {
                    emptyState
                } else {
                    conversationList
                }
            }
            .navigationTitle(String(localized: "community.addChannel.title", defaultValue: "Ajouter un channel", bundle: .module))
            .navigationBarTitleDisplayMode(.inline)
            .searchable(text: $viewModel.searchText, prompt: String(localized: "community.addChannel.search.prompt", defaultValue: "Rechercher une conversation...", bundle: .module))
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "common.close", defaultValue: "Fermer", bundle: .module)) { dismiss() }
                }
            }
        }
        .task { await viewModel.load() }
        .presentationDetents([.medium, .large])
        .alert(String(localized: "community.addChannel.move.confirm.title", defaultValue: "Déplacer cette conversation ?", bundle: .module), isPresented: $viewModel.showMoveConfirm) {
            Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .module), role: .cancel) {
                viewModel.cancelMove()
            }
            Button(String(localized: "community.addChannel.move.button", defaultValue: "Déplacer", bundle: .module)) {
                viewModel.confirmMove()
            }
        } message: {
            Text(String(localized: "community.addChannel.move.confirm.message", defaultValue: "Cette conversation appartient déjà à une autre communauté. Elle sera déplacée vers celle-ci.", bundle: .module))
        }
    }

    private var emptyState: some View {
        VStack(spacing: MeeshySpacing.md) {
            Image(systemName: "bubble.left.and.bubble.right")
                .font(.system(size: 40))
                .foregroundColor(theme.textMuted)
            Text(viewModel.searchText.isEmpty ? String(localized: "community.addChannel.empty.noConversations", defaultValue: "Aucune conversation disponible", bundle: .module) : String(localized: "community.addChannel.empty.noResults", defaultValue: "Aucun résultat", bundle: .module))
                .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .medium, design: .rounded))
                .foregroundColor(theme.textSecondary)
            if viewModel.searchText.isEmpty {
                Text(String(localized: "community.addChannel.empty.hint", defaultValue: "Créez d'abord une conversation pour l'ajouter ici.", bundle: .module))
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize))
                    .foregroundColor(theme.textMuted)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, MeeshySpacing.xxxl)
            }
        }
    }

    private var conversationList: some View {
        List {
            ForEach(filtered, id: \.id) { conversation in
                Button {
                    viewModel.handleTap(conversation)
                } label: {
                    channelRow(conversation)
                }
                .disabled(viewModel.isAdding != nil)
                .listRowBackground(theme.backgroundSecondary.opacity(0.3))
            }

            if viewModel.hasMore && viewModel.searchText.isEmpty {
                HStack {
                    Spacer()
                    if viewModel.isLoadingMore {
                        ProgressView()
                            .tint(MeeshyColors.brandPrimary)
                    }
                    Spacer()
                }
                .listRowBackground(Color.clear)
                .task { await viewModel.loadMore() }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
    }

    private func channelRow(_ conversation: APIConversation) -> some View {
        HStack(spacing: MeeshySpacing.md) {
            Image(systemName: "number")
                .font(.system(size: MeeshyIconSize.sm, weight: .semibold))
                .foregroundColor(MeeshyColors.brandPrimary)
                .frame(width: MeeshyControlSize.compact, height: MeeshyControlSize.compact)
                .background(MeeshyColors.brandPrimary.opacity(0.1))
                .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.xs))

            VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                Text(title(for: conversation))
                    .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold, design: .rounded))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(1)

                HStack(spacing: MeeshySpacing.sm) {
                    if let count = conversation.memberCount {
                        Label("\(count)", systemImage: "person.2.fill")
                            .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                            .foregroundColor(theme.textMuted)
                    }

                    if conversation.communityId != nil {
                        Label(String(localized: "community.addChannel.otherCommunity", defaultValue: "Autre communauté", bundle: .module), systemImage: "arrow.triangle.swap")
                            .font(.system(size: MeeshyFont.captionSize, weight: .medium))
                            .foregroundColor(MeeshyColors.amber500)
                    }
                }
            }

            Spacer()

            if viewModel.isAdding == conversation.id {
                ProgressView()
                    .tint(MeeshyColors.brandPrimary)
            } else if conversation.communityId != nil {
                Image(systemName: "arrow.forward.circle.fill")
                    .font(.system(size: MeeshyIconSize.xl))
                    .foregroundColor(MeeshyColors.amber500)
            } else {
                Image(systemName: "plus.circle.fill")
                    .font(.system(size: MeeshyIconSize.xl))
                    .foregroundColor(MeeshyColors.brandPrimary)
            }
        }
        .padding(.vertical, MeeshySpacing.xs)
    }
}
