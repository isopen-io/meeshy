import SwiftUI
import MessageUI
import MeeshySDK
import MeeshyUI

/// Répertoire — le carnet d'adresses synchronisé.
///
/// Chaque ligne porte l'action qui a du sens pour ce contact : « Lui écrire »
/// quand il a un compte Meeshy (le rapprochement s'est fait par numéro, email
/// ou pseudo vCard), « Inviter » sinon.
struct PhonebookListView: View {
    @ObservedObject var viewModel: PhonebookViewModel
    var isActive: Bool = true
    var onScrollOffsetChange: (CGFloat) -> Void = { _ in }

    @Environment(\.colorScheme) private var colorScheme
    private var theme: ThemeManager { ThemeManager.shared }
    @EnvironmentObject private var router: Router

    @State private var invitationTarget: PhonebookInvitation?

    var body: some View {
        VStack(spacing: 0) {
            header
            content
        }
        .task { await viewModel.load() }
        .adaptiveOnChange(of: viewModel.searchQuery) { _, _ in
            Task { await viewModel.searchQueryChanged() }
        }
        .sheet(item: $invitationTarget) { invitation in
            // `SMSComposerView` est le composeur SMS unique de l'app
            // (DiscoverTab.swift) — pas de second composeur à maintenir.
            SMSComposerView(recipients: [invitation.phoneNumber], body: invitation.message)
        }
    }

    // MARK: - Header (sync + filters)

    private var header: some View {
        VStack(spacing: 10) {
            HStack(spacing: 10) {
                ContactsSearchField(
                    placeholder: String(localized: "contacts.phonebook.search-placeholder", defaultValue: "Rechercher dans le répertoire", bundle: .main),
                    query: $viewModel.searchQuery
                )
                syncButton
            }
            .padding(.horizontal, 16)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(DirectoryFilter.allCases, id: \.self) { filter in
                        filterChip(filter)
                    }
                }
                .padding(.horizontal, 16)
            }
        }
        .padding(.vertical, 8)
    }

    /// Synchronisation explicite : relit le carnet de l'appareil et le renvoie.
    private var syncButton: some View {
        Button {
            Task { await viewModel.synchronize() }
        } label: {
            Group {
                if viewModel.isSyncing {
                    ProgressView().progressViewStyle(.circular).tint(.white)
                } else {
                    Image(systemName: "arrow.triangle.2.circlepath")
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(.white)
                }
            }
            .frame(width: 38, height: 38)
            .background(Circle().fill(MeeshyColors.indigo500))
        }
        .disabled(viewModel.isSyncing)
        .accessibilityLabel(String(localized: "contacts.phonebook.sync-a11y", defaultValue: "Synchroniser le répertoire", bundle: .main))
    }

    private func filterChip(_ filter: DirectoryFilter) -> some View {
        let isSelected = viewModel.activeFilter == filter
        return Button {
            viewModel.setFilter(filter)
        } label: {
            Text(label(for: filter))
                .font(.footnote.weight(.semibold))
                .foregroundColor(isSelected ? .white : MeeshyColors.indigo500)
                .padding(.horizontal, 14)
                .padding(.vertical, 7)
                .background(Capsule().fill(isSelected ? MeeshyColors.indigo500 : Color.clear))
                .overlay(Capsule().stroke(isSelected ? Color.clear : MeeshyColors.indigo900.opacity(0.3), lineWidth: 1))
        }
        .accessibilityAddTraits(isSelected ? [.isSelected] : [])
    }

    private func label(for filter: DirectoryFilter) -> String {
        switch filter {
        case .all:
            return String(localized: "contacts.phonebook.filter.all", defaultValue: "Tous", bundle: .main)
        case .meeshy:
            let count = viewModel.meeshyCount
            let base = String(localized: "contacts.phonebook.filter.meeshy", defaultValue: "Sur Meeshy", bundle: .main)
            return count > 0 ? "\(base) (\(count))" : base
        case .invitable:
            return String(localized: "contacts.phonebook.filter.invitable", defaultValue: "À inviter", bundle: .main)
        }
    }

    // MARK: - Content

    @ViewBuilder
    private var content: some View {
        if viewModel.loadState == .loading && viewModel.isEmpty {
            ContactsSkeletonList()
        } else if viewModel.visibleContacts.isEmpty && !viewModel.showsPlatformResults {
            emptyState
        } else {
            ScrollView(.vertical, showsIndicators: false) {
                ContactsScrollSentinel()
                LazyVStack(spacing: 0) {
                    ForEach(viewModel.visibleContacts) { contact in
                        DirectoryPersonRow(
                            name: contact.resolvedName,
                            subtitle: contact.subtitle,
                            avatarURL: contact.matchedUser?.avatar,
                            action: contact.isOnMeeshy ? .write : .invite,
                            accessibilityDetail: contact.isOnMeeshy
                                ? String(localized: "contacts.phonebook.on-meeshy", defaultValue: "sur Meeshy", bundle: .main)
                                : String(localized: "contacts.phonebook.not-on-meeshy", defaultValue: "pas encore sur Meeshy", bundle: .main),
                            isDark: colorScheme == .dark,
                            onAction: { contact.isOnMeeshy ? open(contact) : invite(contact) }
                        )
                        .equatable()
                    }

                    if viewModel.showsPlatformResults {
                        platformSection
                    }
                }
                .padding(.top, 4)
            }
            .reportsContactsScroll(active: isActive, onChange: onScrollOffsetChange)
            .refreshable { await viewModel.load(forceNetwork: true) }
        }
    }

    /// Relais de recherche : le répertoire n'a rien, on montre ce que la
    /// plateforme sait — sous un en-tête qui dit d'où viennent ces gens, pour
    /// qu'aucune ligne ne se fasse passer pour un contact du carnet.
    @ViewBuilder
    private var platformSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Text(String(localized: "contacts.phonebook.platform-results", defaultValue: "Sur Meeshy, hors de ton répertoire", bundle: .main))
                    .font(.caption.weight(.semibold))
                    .foregroundColor(theme.textMuted)

                if viewModel.isSearchingPlatform {
                    ProgressView().progressViewStyle(.circular).scaleEffect(0.6)
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)

            if viewModel.platformResults.isEmpty && !viewModel.isSearchingPlatform {
                Text(String(localized: "contacts.phonebook.platform-none", defaultValue: "Aucun utilisateur ne correspond", bundle: .main))
                    .font(.subheadline)
                    .foregroundColor(theme.textMuted)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 8)
            } else {
                ForEach(viewModel.platformResults) { user in
                    DirectoryPersonRow(
                        name: user.displayName.flatMap { $0.isEmpty ? nil : $0 } ?? user.username,
                        subtitle: "@\(user.username)",
                        avatarURL: user.avatar,
                        action: .write,
                        isDark: colorScheme == .dark,
                        onAction: { openPlatformUser(user) }
                    )
                    .equatable()
                }
            }
        }
    }

    private var emptyState: some View {
        EmptyStateView(
            icon: "person.crop.circle.badge.questionmark",
            title: viewModel.isEmpty
                ? String(localized: "contacts.phonebook.empty", defaultValue: "Répertoire vide", bundle: .main)
                : String(localized: "contacts.phonebook.no-results", defaultValue: "Aucun résultat", bundle: .main),
            subtitle: viewModel.isEmpty
                ? String(localized: "contacts.phonebook.empty-hint", defaultValue: "Synchronise ton carnet d'adresses pour retrouver tes contacts sur Meeshy", bundle: .main)
                : ""
        )
    }

    // MARK: - Actions

    private func open(_ contact: DirectoryContact) {
        Task {
            guard let conversation = await viewModel.startConversation(with: contact) else { return }
            HapticFeedback.success()
            router.navigateToConversation(conversation)
        }
    }

    private func openPlatformUser(_ user: UserSearchResult) {
        Task {
            guard let conversation = await viewModel.startConversation(withUserId: user.id) else { return }
            HapticFeedback.success()
            router.navigateToConversation(conversation)
        }
    }

    private func invite(_ contact: DirectoryContact) {
        guard MFMessageComposeViewController.canSendText() else {
            FeedbackToastManager.shared.showError(
                String(localized: "contacts.phonebook.sms-unavailable", defaultValue: "Cet appareil ne peut pas envoyer de SMS", bundle: .main)
            )
            return
        }
        guard let phoneNumber = contact.invitablePhoneNumber else {
            FeedbackToastManager.shared.showError(
                String(localized: "contacts.phonebook.invite-no-number", defaultValue: "Ce contact n'a pas de numéro", bundle: .main)
            )
            return
        }
        invitationTarget = PhonebookInvitation(
            phoneNumber: phoneNumber,
            message: viewModel.invitationMessage(for: contact)
        )
    }
}

// MARK: - Invitation

struct PhonebookInvitation: Identifiable {
    let phoneNumber: String
    let message: String
    var id: String { phoneNumber }
}
