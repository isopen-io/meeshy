import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI
import MessageUI

struct DiscoverTab: View {
    @ObservedObject var viewModel: DiscoverViewModel
    var isActive: Bool = true
    var onScrollOffsetChange: (CGFloat) -> Void = { _ in }
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    private var theme: ThemeManager { ThemeManager.shared }
    @EnvironmentObject private var statusViewModel: StatusViewModel
    @EnvironmentObject private var router: Router

    @State private var showSMSComposer = false

    var body: some View {
        ScrollView(.vertical, showsIndicators: false) {
            ContactsScrollSentinel()
            VStack(spacing: 16) {
                inviteSection
                searchSection
            }
            .padding(.top, 8)
            .padding(.bottom, 20)
        }
        .reportsContactsScroll(active: isActive, onChange: onScrollOffsetChange)
    }

    // MARK: - Invite Section

    private var inviteSection: some View {
        VStack(spacing: 12) {
            emailInviteCard
            smsInviteCard
            importContactsButton
        }
        .padding(.horizontal, 16)
    }

    private var emailInviteCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label(String(localized: "contacts.discover.email.title", defaultValue: "Inviter par email", bundle: .main), systemImage: "envelope.fill")
                .font(.subheadline.weight(.semibold))
                .foregroundColor(theme.textPrimary)

            HStack(spacing: 10) {
                TextField(String(localized: "contacts.discover.email.placeholder", defaultValue: "Adresse email", bundle: .main), text: $viewModel.emailText)
                    .font(.subheadline)
                    .foregroundColor(theme.textPrimary)
                    .keyboardType(.emailAddress)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .background(theme.inputBackground)
                    .clipShape(RoundedRectangle(cornerRadius: 10))

                Button {
                    Task { await viewModel.sendEmailInvitation() }
                } label: {
                    Text(String(localized: "common.send", defaultValue: "Envoyer", bundle: .main))
                        .font(.footnote.weight(.semibold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .background(
                            Capsule().fill(
                                viewModel.emailText.isEmpty || viewModel.isSendingInvite
                                ? MeeshyColors.indigo500.opacity(0.4)
                                : MeeshyColors.indigo500
                            )
                        )
                }
                .disabled(viewModel.emailText.isEmpty || viewModel.isSendingInvite)
                .accessibilityLabel(String(localized: "contacts.discover.email.send-a11y", defaultValue: "Envoyer l'invitation par email", bundle: .main))
            }
        }
        .padding(14)
        .glassCard()
    }

    private var smsInviteCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label(String(localized: "contacts.discover.sms.title", defaultValue: "Inviter par SMS", bundle: .main), systemImage: "message.fill")
                .font(.subheadline.weight(.semibold))
                .foregroundColor(theme.textPrimary)

            HStack(spacing: 10) {
                TextField(String(localized: "contacts.discover.sms.placeholder", defaultValue: "Numero de telephone", bundle: .main), text: $viewModel.phoneText)
                    .font(.subheadline)
                    .foregroundColor(theme.textPrimary)
                    .keyboardType(.phonePad)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .background(theme.inputBackground)
                    .clipShape(RoundedRectangle(cornerRadius: 10))

                Button {
                    if MFMessageComposeViewController.canSendText() {
                        showSMSComposer = true
                    } else {
                        FeedbackToastManager.shared.showError(String(localized: "contacts.discover.sms.unavailable", defaultValue: "SMS non disponible", bundle: .main))
                    }
                } label: {
                    Text(String(localized: "common.send", defaultValue: "Envoyer", bundle: .main))
                        .font(.footnote.weight(.semibold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .background(
                            Capsule().fill(
                                viewModel.phoneText.isEmpty
                                ? MeeshyColors.indigo500.opacity(0.4)
                                : MeeshyColors.indigo500
                            )
                        )
                }
                .disabled(viewModel.phoneText.isEmpty)
                .accessibilityLabel(String(localized: "contacts.discover.sms.send-a11y", defaultValue: "Envoyer l'invitation par SMS", bundle: .main))
            }
        }
        .padding(14)
        .glassCard()
        .sheet(isPresented: $showSMSComposer) {
            SMSComposerView(
                recipients: [viewModel.phoneText],
                body: viewModel.smsMessage
            )
        }
    }

    private var importContactsButton: some View {
        Button {
            FeedbackToastManager.shared.show(String(localized: "common.coming-soon", defaultValue: "Bientot disponible", bundle: .main), type: .success)
            HapticFeedback.light()
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "person.crop.circle.badge.plus")
                    .font(.callout.weight(.medium))
                Text(String(localized: "contacts.discover.import", defaultValue: "Importer mes contacts", bundle: .main))
                    .font(.subheadline.weight(.semibold))
            }
            .foregroundColor(MeeshyColors.indigo500)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(MeeshyColors.indigo500.opacity(0.3), lineWidth: 1)
            )
        }
    }

    // MARK: - Search Section

    private var searchSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            searchBar
            if viewModel.isSearching {
                HStack {
                    Spacer()
                    ProgressView().tint(MeeshyColors.indigo500)
                    Spacer()
                }
                .padding(.top, 20)
            } else if !viewModel.searchResults.isEmpty {
                searchResults
            } else if !viewModel.searchQuery.isEmpty && viewModel.searchQuery.count >= 2 {
                VStack(spacing: 12) {
                    Image(systemName: "magnifyingglass")
                        .font(.system(.title).weight(.light))
                        .foregroundColor(theme.textMuted.opacity(0.4))
                    Text(String(localized: "contacts.discover.no-results", defaultValue: "Aucun utilisateur trouve", bundle: .main))
                        .font(.subheadline.weight(.medium))
                        .foregroundColor(theme.textMuted)
                }
                .frame(maxWidth: .infinity)
                .padding(.top, 30)
            }
        }
        .padding(.horizontal, 16)
    }

    private var searchBar: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass")
                .font(.subheadline.weight(.medium))
                .foregroundColor(theme.textMuted)

            TextField(String(localized: "contacts.discover.search-placeholder", defaultValue: "Rechercher un utilisateur Meeshy", bundle: .main), text: $viewModel.searchQuery)
                .font(.subheadline)
                .foregroundColor(theme.textPrimary)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
                .onSubmit { Task { await viewModel.performSearch() } }
                .adaptiveOnChange(of: viewModel.searchQuery) { _, newValue in
                    if newValue.count >= 2 {
                        Task { await viewModel.performSearch() }
                    } else {
                        viewModel.searchResults = []
                    }
                }

            if !viewModel.searchQuery.isEmpty {
                Button {
                    viewModel.searchQuery = ""
                    viewModel.searchResults = []
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.subheadline)
                        .foregroundColor(theme.textMuted)
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(theme.inputBackground)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private var searchResults: some View {
        LazyVStack(spacing: 0) {
            ForEach(Array(viewModel.searchResults.enumerated()), id: \.element.id) { index, user in
                searchResultRow(user, index: index)
            }
        }
    }

    private func searchResultRow(_ user: UserSearchResult, index: Int) -> some View {
        let name = user.displayName ?? user.username
        let color = DynamicColorGenerator.colorForName(name)

        return HStack(spacing: 14) {
            MeeshyAvatar(
                name: name,
                context: .userListItem,
                accentColor: color,
                avatarURL: user.avatar,
                moodEmoji: statusViewModel.statusForUser(userId: user.id)?.moodEmoji,
                presenceState: PresenceManager.shared.resolvedState(userId: user.id, isOnline: user.isOnline),
                onMoodTap: statusViewModel.moodTapHandler(for: user.id)
            )
            .onTapGesture {
                router.deepLinkProfileUser = ProfileSheetUser(
                    userId: user.id,
                    username: user.username,
                    displayName: user.displayName,
                    avatarURL: user.avatar
                )
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(name)
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(1)
                Text("@\(user.username)")
                    .font(.caption.weight(.medium))
                    .foregroundColor(theme.textMuted)
            }
            .onTapGesture {
                router.deepLinkProfileUser = ProfileSheetUser(
                    userId: user.id,
                    username: user.username,
                    displayName: user.displayName,
                    avatarURL: user.avatar
                )
            }

            Spacer()

            ConnectionActionView(
                userId: user.id,
                userName: name,
                accentColor: MeeshyColors.indigo500,
                onError: { FeedbackToastManager.shared.showError($0) },
                onSuccess: { FeedbackToastManager.shared.showSuccess($0) }
            )
        }
        .padding(.horizontal, 4)
        .padding(.vertical, 10)
        .animation(.spring(response: 0.4, dampingFraction: 0.8).delay(Double(index) * 0.04), value: viewModel.searchResults.count)
    }
}

// MARK: - SMS Composer

struct SMSComposerView: UIViewControllerRepresentable {
    let recipients: [String]
    let body: String

    func makeUIViewController(context: Context) -> MFMessageComposeViewController {
        let controller = MFMessageComposeViewController()
        controller.recipients = recipients
        controller.body = body
        controller.messageComposeDelegate = context.coordinator
        return controller
    }

    func updateUIViewController(_ uiViewController: MFMessageComposeViewController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator() }

    @MainActor
    class Coordinator: NSObject, MFMessageComposeViewControllerDelegate {
        nonisolated func messageComposeViewController(_ controller: MFMessageComposeViewController, didFinishWith result: MessageComposeResult) {
            DispatchQueue.main.async {
                controller.dismiss(animated: true)
            }
        }
    }
}
