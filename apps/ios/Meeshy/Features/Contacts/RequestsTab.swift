import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

struct RequestsTab: View {
    @ObservedObject var viewModel: RequestsViewModel
    var isActive: Bool = true
    var onScrollOffsetChange: (CGFloat) -> Void = { _ in }
    private var theme: ThemeManager { ThemeManager.shared }
    @EnvironmentObject private var statusViewModel: StatusViewModel

    @State private var activeFilter: RequestFilter = .received

    var body: some View {
        VStack(spacing: 0) {
            filterPills
            content
        }
        .task {
            await viewModel.loadReceived()
            await viewModel.loadSent()
        }
    }

    // MARK: - Filter Pills

    private var filterPills: some View {
        HStack(spacing: MeeshySpacing.smPlus) {
            ForEach(RequestFilter.allCases, id: \.self) { filter in
                let count = filter == .received ? viewModel.receivedRequests.count : viewModel.sentRequests.count
                let isSelected = activeFilter == filter
                Button {
                    withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                        activeFilter = filter
                    }
                    HapticFeedback.light()
                } label: {
                    HStack(spacing: MeeshySpacing.xs) {
                        Text(filterTitle(filter))
                            .font(.footnote.weight(.semibold))
                        if count > 0 {
                            Text("(\(count))")
                                .font(.caption.weight(.bold))
                        }
                    }
                    .foregroundColor(isSelected ? .white : MeeshyColors.indigo500)
                    .padding(.horizontal, MeeshySpacing.lg)
                    .padding(.vertical, MeeshySpacing.sm)
                    .background(
                        Capsule().fill(isSelected ? MeeshyColors.indigo500 : Color.clear)
                    )
                    .overlay(
                        Capsule().stroke(isSelected ? Color.clear : MeeshyColors.indigo900.opacity(MeeshyOpacity.medium), lineWidth: 1)
                    )
                }
                .accessibilityLabel(String(format: String(localized: "contacts.requests.filter-a11y", defaultValue: "%@, %d demandes", bundle: .main), filterTitle(filter), count))
                .accessibilityAddTraits(isSelected ? [.isSelected] : [])
            }
            Spacer()
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.vertical, MeeshySpacing.smPlus)
    }

    /// Localized display title for a request filter. `RequestFilter.rawValue`
    /// stays the stable identity/persistence key (raw FR literals); this helper
    /// is the only shipped-to-screen surface, so it goes through `String(localized:)`
    /// with properly accented French defaults. Mirrors the 176i `tabTitle(_:)`
    /// doctrine for `ContactsHubView`.
    private func filterTitle(_ filter: RequestFilter) -> String {
        switch filter {
        case .received:
            return String(localized: "contacts.requests.filter.received", defaultValue: "Reçues", bundle: .main)
        case .sent:
            return String(localized: "contacts.requests.filter.sent", defaultValue: "Envoyées", bundle: .main)
        }
    }

    // MARK: - Content

    @ViewBuilder
    private var content: some View {
        switch activeFilter {
        case .received:
            if viewModel.receivedRequests.isEmpty {
                emptyState(
                    icon: "person.2.slash",
                    title: String(localized: "contacts.requests.empty.received", defaultValue: "Aucune demande reçue", bundle: .main),
                    subtitle: String(localized: "contacts.requests.empty.received.subtitle", defaultValue: "Les demandes de contact reçues apparaîtront ici", bundle: .main)
                )
            } else {
                receivedList
            }
        case .sent:
            if viewModel.sentRequests.isEmpty {
                emptyState(
                    icon: "paperplane",
                    title: String(localized: "contacts.requests.empty.sent", defaultValue: "Aucune demande envoyée", bundle: .main),
                    subtitle: String(localized: "contacts.requests.empty.sent.subtitle", defaultValue: "Les demandes que vous envoyez apparaîtront ici", bundle: .main)
                )
            } else {
                sentList
            }
        }
    }

    // MARK: - Received List

    private var receivedList: some View {
        ScrollView(.vertical, showsIndicators: false) {
            ContactsScrollSentinel()
            LazyVStack(spacing: 0) {
                ForEach(Array(viewModel.receivedRequests.enumerated()), id: \.element.id) { index, request in
                    receivedRow(request, index: index)
                }
            }
            .padding(.top, MeeshySpacing.xs)
        }
        .reportsContactsScroll(active: isActive, onChange: onScrollOffsetChange)
        .refreshable { await viewModel.loadReceived(forceNetwork: true) }
    }

    private func receivedRow(_ request: FriendRequest, index: Int) -> some View {
        let sender = request.sender
        let name = sender?.name ?? String(localized: "common.unknown", defaultValue: "Inconnu", bundle: .main)
        let color = DynamicColorGenerator.colorForName(name)

        return HStack(spacing: MeeshySpacing.mdPlus) {
            MeeshyAvatar(
                name: name,
                context: .userListItem,
                accentColor: color,
                avatarURL: sender?.avatar,
                moodEmoji: statusViewModel.statusForUser(userId: request.senderId)?.moodEmoji,
                onMoodTap: statusViewModel.moodTapHandler(for: request.senderId)
            )

            VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                Text(name)
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(1)

                if let username = sender?.username {
                    Text("@\(username)")
                        .font(.caption.weight(.medium))
                        .foregroundColor(theme.textMuted)
                }

                if let message = request.message, !message.isEmpty {
                    Text(message)
                        .font(.footnote)
                        .foregroundColor(theme.textSecondary)
                        .lineLimit(2)
                } else {
                    // Sans message personnalisé, expliciter l'intention pour que la
                    // ligne se suffise à elle-même (parité avec le sheet profil).
                    Text(String(localized: "contacts.requests.received.intent", defaultValue: "Souhaite entrer en contact avec vous", bundle: .main))
                        .font(.footnote)
                        .foregroundColor(theme.textSecondary)
                        .lineLimit(2)
                }

                Text(request.createdAt.relativeTimeString)
                    .font(.caption2.weight(.medium))
                    .foregroundColor(theme.textMuted)
            }

            Spacer()

            HStack(spacing: MeeshySpacing.sm) {
                Button {
                    Task { await viewModel.reject(requestId: request.id) }
                } label: {
                    Image(systemName: "xmark")
                        .font(.caption.weight(.bold))
                        .foregroundColor(theme.textMuted)
                        .frame(width: MeeshyControlSize.tapTarget, height: MeeshyControlSize.tapTarget)
                        .background(Circle().fill(theme.textMuted.opacity(MeeshyOpacity.light)))
                }
                .accessibilityLabel(String(format: String(localized: "contacts.requests.reject-a11y", defaultValue: "Refuser la demande de %@", bundle: .main), name))

                Button {
                    Task { await viewModel.accept(requestId: request.id) }
                } label: {
                    Image(systemName: "checkmark")
                        .font(.caption.weight(.bold))
                        .foregroundColor(.white)
                        .frame(width: MeeshyControlSize.tapTarget, height: MeeshyControlSize.tapTarget)
                        .background(
                            Circle().fill(
                                LinearGradient(
                                    colors: [MeeshyColors.success, MeeshyColors.success.opacity(MeeshyOpacity.heavy)],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                        )
                }
                .accessibilityLabel(String(format: String(localized: "contacts.requests.accept-a11y", defaultValue: "Accepter la demande de %@", bundle: .main), name))
            }
        }
        .padding(.horizontal, MeeshySpacing.xl)
        .padding(.vertical, MeeshySpacing.md)
        .accessibilityElement(children: .combine)
        .transition(.opacity.combined(with: .move(edge: .trailing)))
        .animation(.easeOut(duration: 0.2).delay(Double(index) * 0.02), value: viewModel.receivedRequests.count)
    }

    // MARK: - Sent List

    private var sentList: some View {
        ScrollView(.vertical, showsIndicators: false) {
            ContactsScrollSentinel()
            LazyVStack(spacing: 0) {
                ForEach(Array(viewModel.sentRequests.enumerated()), id: \.element.id) { index, request in
                    sentRow(request, index: index)
                }
            }
            .padding(.top, MeeshySpacing.xs)
        }
        .reportsContactsScroll(active: isActive, onChange: onScrollOffsetChange)
        .refreshable { await viewModel.loadSent(forceNetwork: true) }
    }

    private func sentRow(_ request: FriendRequest, index: Int) -> some View {
        let receiver = request.receiver
        let name = receiver?.name ?? String(localized: "common.unknown", defaultValue: "Inconnu", bundle: .main)
        let color = DynamicColorGenerator.colorForName(name)

        return HStack(spacing: MeeshySpacing.mdPlus) {
            MeeshyAvatar(
                name: name,
                context: .userListItem,
                accentColor: color,
                avatarURL: receiver?.avatar
            )

            VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                Text(name)
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(1)

                if let username = receiver?.username {
                    Text("@\(username)")
                        .font(.caption.weight(.medium))
                        .foregroundColor(theme.textMuted)
                }

                Text(request.createdAt.relativeTimeString)
                    .font(.caption2.weight(.medium))
                    .foregroundColor(theme.textMuted)
            }

            Spacer()

            Text(String(localized: "contacts.requests.pending", defaultValue: "En attente", bundle: .main))
                .font(.caption2.weight(.semibold))
                .foregroundColor(MeeshyColors.warning)
                .padding(.horizontal, MeeshySpacing.sm)
                .padding(.vertical, MeeshySpacing.xs)
                .background(
                    Capsule().fill(MeeshyColors.warning.opacity(MeeshyOpacity.light))
                )

            Button {
                Task { await viewModel.cancel(requestId: request.id) }
            } label: {
                Text(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main))
                    .font(.caption.weight(.semibold))
                    .foregroundColor(MeeshyColors.error)
                    .padding(.horizontal, MeeshySpacing.md)
                    .padding(.vertical, MeeshySpacing.xsPlus)
                    .background(
                        Capsule().stroke(MeeshyColors.error.opacity(MeeshyOpacity.medium), lineWidth: 1)
                    )
            }
            .accessibilityLabel(String(format: String(localized: "contacts.requests.cancel-a11y", defaultValue: "Annuler la demande envoyée à %@", bundle: .main), name))
        }
        .padding(.horizontal, MeeshySpacing.xl)
        .padding(.vertical, MeeshySpacing.md)
        .accessibilityElement(children: .combine)
        .animation(.easeOut(duration: 0.2).delay(Double(index) * 0.02), value: viewModel.sentRequests.count)
    }

    // MARK: - Empty State

    // Delegates to the shared `AdaptiveContentUnavailableView` (native
    // `ContentUnavailableView` on iOS 17+, faithful iOS 16 fallback) instead of
    // a hand-rolled VStack — parity with the twin `FriendRequestListView` (175i)
    // and `StarredMessagesView`. The primitive groups icon + title + subtitle as
    // one VoiceOver element and adds a guidance subtitle the bespoke version
    // lacked. maxHeight fill keeps it vertically centred like the former Spacer
    // sandwich.
    private func emptyState(icon: String, title: String, subtitle: String) -> some View {
        AdaptiveContentUnavailableView(
            title,
            systemImage: icon,
            description: Text(subtitle)
        )
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
