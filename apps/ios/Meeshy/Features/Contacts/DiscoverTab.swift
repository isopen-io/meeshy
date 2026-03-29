import SwiftUI
import MeeshySDK
import MeeshyUI
import MessageUI

struct DiscoverTab: View {
    @ObservedObject var viewModel: DiscoverViewModel
    @ObservedObject private var theme = ThemeManager.shared

    @State private var showSMSComposer = false

    var body: some View {
        ScrollView(.vertical, showsIndicators: false) {
            VStack(spacing: 16) {
                inviteSection
                searchSection
            }
            .padding(.top, 8)
            .padding(.bottom, 20)
        }
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
            Label("Inviter par email", systemImage: "envelope.fill")
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(theme.textPrimary)

            HStack(spacing: 10) {
                TextField("Adresse email", text: $viewModel.emailText)
                    .font(.system(size: 14))
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
                    Text("Envoyer")
                        .font(.system(size: 13, weight: .semibold))
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
                .accessibilityLabel("Envoyer l'invitation par email")
            }
        }
        .padding(14)
        .glassCard()
    }

    private var smsInviteCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Inviter par SMS", systemImage: "message.fill")
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(theme.textPrimary)

            HStack(spacing: 10) {
                TextField("Numero de telephone", text: $viewModel.phoneText)
                    .font(.system(size: 14))
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
                        ToastManager.shared.showError("SMS non disponible")
                    }
                } label: {
                    Text("Envoyer")
                        .font(.system(size: 13, weight: .semibold))
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
                .accessibilityLabel("Envoyer l'invitation par SMS")
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
            ToastManager.shared.show("Bientot disponible", type: .success)
            HapticFeedback.light()
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "person.crop.circle.badge.plus")
                    .font(.system(size: 16, weight: .medium))
                Text("Importer mes contacts")
                    .font(.system(size: 14, weight: .semibold))
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
                        .font(.system(size: 32, weight: .light))
                        .foregroundColor(theme.textMuted.opacity(0.4))
                    Text("Aucun utilisateur trouve")
                        .font(.system(size: 14, weight: .medium))
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
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(theme.textMuted)

            TextField("Rechercher un utilisateur Meeshy", text: $viewModel.searchQuery)
                .font(.system(size: 14))
                .foregroundColor(theme.textPrimary)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
                .onSubmit { Task { await viewModel.performSearch() } }
                .onChange(of: viewModel.searchQuery) { _, newValue in
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
                        .font(.system(size: 14))
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
        let status = viewModel.connectionStatus(for: user.id)

        return HStack(spacing: 14) {
            MeeshyAvatar(
                name: name,
                context: .userListItem,
                accentColor: color,
                avatarURL: user.avatar,
                presenceState: user.isOnline == true ? .online : .offline
            )

            VStack(alignment: .leading, spacing: 2) {
                Text(name)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(1)
                Text("@\(user.username)")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(theme.textMuted)
            }

            Spacer()

            connectionActionButton(for: user.id, status: status)
        }
        .padding(.horizontal, 4)
        .padding(.vertical, 10)
        .animation(.spring(response: 0.4, dampingFraction: 0.8).delay(Double(index) * 0.04), value: viewModel.searchResults.count)
    }

    @ViewBuilder
    private func connectionActionButton(for userId: String, status: ContactConnectionStatus) -> some View {
        switch status {
        case .connected:
            Text("Connecte")
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(MeeshyColors.success)
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(Capsule().fill(MeeshyColors.success.opacity(0.15)))

        case .pendingSent:
            Text("En attente")
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(MeeshyColors.warning)
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(Capsule().fill(MeeshyColors.warning.opacity(0.15)))

        case .pendingReceived:
            Button {
                Task {
                    // Accept handled via RequestsViewModel
                }
            } label: {
                Text("Accepter")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 5)
                    .background(Capsule().fill(MeeshyColors.success))
            }

        case .none:
            Button {
                Task { await viewModel.sendRequest(to: userId) }
            } label: {
                Text("Ajouter")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 5)
                    .background(Capsule().fill(MeeshyColors.indigo500))
            }
            .accessibilityLabel("Ajouter en ami")
        }
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

    class Coordinator: NSObject, MFMessageComposeViewControllerDelegate {
        func messageComposeViewController(_ controller: MFMessageComposeViewController, didFinishWith result: MessageComposeResult) {
            controller.dismiss(animated: true)
        }
    }
}
