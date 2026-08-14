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
                searchField
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

    private var searchField: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass")
                .font(.subheadline.weight(.medium))
                .foregroundColor(theme.textMuted)
                .accessibilityHidden(true)

            TextField(
                String(localized: "contacts.phonebook.search-placeholder", defaultValue: "Rechercher dans le repertoire", bundle: .main),
                text: $viewModel.searchQuery
            )
            .font(.subheadline)
            .foregroundColor(theme.textPrimary)
            .autocorrectionDisabled()
            .textInputAutocapitalization(.never)

            if !viewModel.searchQuery.isEmpty {
                Button {
                    viewModel.searchQuery = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.subheadline)
                        .foregroundColor(theme.textMuted)
                }
                .accessibilityLabel(String(localized: "common.clear-search", defaultValue: "Effacer la recherche", bundle: .main))
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(theme.inputBackground)
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

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
        .accessibilityLabel(String(localized: "contacts.phonebook.sync-a11y", defaultValue: "Synchroniser le repertoire", bundle: .main))
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
            return String(localized: "contacts.phonebook.filter.invitable", defaultValue: "A inviter", bundle: .main)
        }
    }

    // MARK: - Content

    @ViewBuilder
    private var content: some View {
        if viewModel.loadState == .loading && viewModel.isEmpty {
            ContactsSkeletonList()
        } else if viewModel.visibleContacts.isEmpty {
            emptyState
        } else {
            ScrollView(.vertical, showsIndicators: false) {
                ContactsScrollSentinel()
                LazyVStack(spacing: 0) {
                    ForEach(viewModel.visibleContacts) { contact in
                        PhonebookRow(
                            contact: contact,
                            isDark: colorScheme == .dark,
                            onWrite: { open(contact) },
                            onInvite: { invite(contact) }
                        )
                        .equatable()
                    }
                }
                .padding(.top, 4)
            }
            .reportsContactsScroll(active: isActive, onChange: onScrollOffsetChange)
            .refreshable { await viewModel.load(forceNetwork: true) }
        }
    }

    private var emptyState: some View {
        EmptyStateView(
            icon: "person.crop.circle.badge.questionmark",
            title: viewModel.isEmpty
                ? String(localized: "contacts.phonebook.empty", defaultValue: "Repertoire vide", bundle: .main)
                : String(localized: "contacts.phonebook.no-results", defaultValue: "Aucun resultat", bundle: .main),
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

    private func invite(_ contact: DirectoryContact) {
        guard MFMessageComposeViewController.canSendText() else {
            FeedbackToastManager.shared.showError(
                String(localized: "contacts.phonebook.sms-unavailable", defaultValue: "Cet appareil ne peut pas envoyer de SMS", bundle: .main)
            )
            return
        }
        guard let phoneNumber = contact.invitablePhoneNumber else {
            FeedbackToastManager.shared.showError(
                String(localized: "contacts.phonebook.invite-no-number", defaultValue: "Ce contact n'a pas de numero", bundle: .main)
            )
            return
        }
        invitationTarget = PhonebookInvitation(
            phoneNumber: phoneNumber,
            message: viewModel.invitationMessage(for: contact)
        )
    }
}

// MARK: - Row

/// Ligne du répertoire. `Equatable` sur le contact seul : la liste peut être
/// longue (un carnet réel dépasse souvent 500 fiches) et une cellule ne doit se
/// réévaluer que si SON contact change.
struct PhonebookRow: View, Equatable {
    let contact: DirectoryContact
    /// Passé en valeur primitive plutôt que lu depuis un singleton observé :
    /// une cellule de liste ne doit se réévaluer que si SES entrées changent.
    /// Il entre dans l'égalité, sinon un basculement de thème laisserait la
    /// ligne figée dans les couleurs de l'ancien mode.
    let isDark: Bool
    let onWrite: () -> Void
    let onInvite: () -> Void

    private var theme: ThemeManager { ThemeManager.shared }

    static func == (lhs: PhonebookRow, rhs: PhonebookRow) -> Bool {
        lhs.contact == rhs.contact && lhs.isDark == rhs.isDark
    }

    var body: some View {
        HStack(spacing: 14) {
            MeeshyAvatar(
                name: contact.resolvedName,
                context: .userListItem,
                accentColor: DynamicColorGenerator.colorForName(contact.resolvedName),
                avatarURL: contact.matchedUser?.avatar
            )

            VStack(alignment: .leading, spacing: 3) {
                Text(contact.resolvedName)
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(1)

                if let subtitle = contact.subtitle {
                    Text(subtitle)
                        .font(.caption.weight(.medium))
                        .foregroundColor(theme.textMuted)
                        .lineLimit(1)
                }
            }

            Spacer(minLength: 8)

            if contact.isOnMeeshy {
                actionButton(
                    title: String(localized: "contacts.phonebook.write", defaultValue: "Lui ecrire", bundle: .main),
                    icon: "bubble.left.fill",
                    filled: true,
                    action: onWrite
                )
            } else {
                actionButton(
                    title: String(localized: "contacts.phonebook.invite", defaultValue: "Inviter", bundle: .main),
                    icon: "paperplane.fill",
                    filled: false,
                    action: onInvite
                )
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(accessibilityLabel)
    }

    private var accessibilityLabel: String {
        let state = contact.isOnMeeshy
            ? String(localized: "contacts.phonebook.on-meeshy", defaultValue: "sur Meeshy", bundle: .main)
            : String(localized: "contacts.phonebook.not-on-meeshy", defaultValue: "pas encore sur Meeshy", bundle: .main)
        return "\(contact.resolvedName), \(state)"
    }

    private func actionButton(title: String, icon: String, filled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 5) {
                Image(systemName: icon).font(.caption2.weight(.bold))
                Text(title).font(.caption.weight(.semibold))
            }
            .foregroundColor(filled ? .white : MeeshyColors.indigo500)
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .background(
                Capsule().fill(filled ? MeeshyColors.indigo500 : Color.clear)
            )
            .overlay(
                Capsule().stroke(filled ? Color.clear : MeeshyColors.indigo500.opacity(0.5), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .accessibilityLabel(title)
    }
}

// MARK: - Invitation

struct PhonebookInvitation: Identifiable {
    let phoneNumber: String
    let message: String
    var id: String { phoneNumber }
}
