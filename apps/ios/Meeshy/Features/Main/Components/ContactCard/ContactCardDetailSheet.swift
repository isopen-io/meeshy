import SwiftUI
import Contacts
import ContactsUI
import MessageUI
import MeeshySDK
import MeeshyUI

/// La fiche d'une carte de visite (#8101) : la conversation se FLOUTE et une
/// fiche Liquid Glass (iOS 26 ; matériau translucide en repli) liste TOUS les
/// champs de la vCard. Un appui long sur un champ le copie — retour
/// haptique + toast. La section « Sur Meeshy » montre le profil PUBLIC du
/// compte associé (bannière, avatar, nom, @username, bio) avec ses actions.
struct ContactCardDetailSheet: View {
    @ObservedObject var model: ContactCardViewModel
    let accentHex: String

    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var isVisible = false
    @State private var isShowingAddToContacts = false
    @State private var invitation: PhonebookInvitation?

    private var accent: Color { Color(hex: accentHex) }
    private var fields: [ContactCardField] { model.card.map { ContactCardField.fields(for: $0) } ?? [] }

    var body: some View {
        ZStack {
            Rectangle()
                .fill(.ultraThinMaterial)
                .overlay(Color.black.opacity(colorScheme == .dark ? 0.35 : 0.12))
                .ignoresSafeArea()
                .opacity(isVisible ? 1 : 0)
                .onTapGesture { close() }
                .accessibilityLabel(String(localized: "contact-card.detail.close", defaultValue: "Fermer la fiche", bundle: .main))
                .accessibilityAddTraits(.isButton)

            if isVisible {
                card
                    .padding(.horizontal, 16)
                    .transition(reduceMotion ? .opacity : .scale(scale: 0.94).combined(with: .opacity))
            }
        }
        .onAppear {
            withAnimation(reduceMotion ? .easeOut(duration: 0.15) : .spring(response: 0.38, dampingFraction: 0.86)) {
                isVisible = true
            }
        }
        .accessibilityAction(.escape) { close() }
        .feedbackToastOverlay()
        .sheet(isPresented: $isShowingAddToContacts) {
            if let card = model.card {
                AddToContactsView(card: card) { isShowingAddToContacts = false }
                    .ignoresSafeArea()
            }
        }
        .sheet(item: $invitation) { invitation in
            SMSComposerView(recipients: [invitation.phoneNumber], body: invitation.message)
        }
    }

    // MARK: - Fiche

    private var card: some View {
        VStack(spacing: 0) {
            header
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if !fields.isEmpty {
                        VStack(spacing: 0) {
                            ForEach(Array(fields.enumerated()), id: \.element.id) { index, field in
                                ContactCardFieldRow(field: field, accent: accent)
                                if index < fields.count - 1 {
                                    Divider().padding(.leading, 48)
                                }
                            }
                        }
                        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Color.primary.opacity(0.05)))
                    }
                    ForEach(model.accounts) { account in
                        meeshySection(account)
                    }
                    footerActions
                }
                .padding(16)
            }
            .frame(maxHeight: 560)
        }
        .frame(maxWidth: 520)
        .adaptiveGlass(in: RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 28, style: .continuous).stroke(accent.opacity(0.25), lineWidth: 1))
        .shadow(color: .black.opacity(0.18), radius: 24, y: 10)
        .accessibilityElement(children: .contain)
        .accessibilityAddTraits(.isModal)
    }

    private var header: some View {
        HStack(alignment: .center, spacing: 12) {
            ZStack {
                Circle().fill(LinearGradient(colors: [accent, accent.opacity(0.7)], startPoint: .topLeading, endPoint: .bottomTrailing))
                Text(Self.initials(model.card?.displayName ?? ""))
                    .font(.title3.weight(.bold))
                    .foregroundColor(.white)
            }
            .frame(width: 52, height: 52)
            .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 2) {
                Text(model.card?.displayName ?? "")
                    .font(.title3.weight(.bold))
                    .foregroundColor(.primary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                if let subtitle = subtitle {
                    Text(subtitle)
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
            }
            Spacer(minLength: 8)
            Button(action: close) {
                Image(systemName: "xmark")
                    .font(.body.weight(.semibold))
                    .foregroundColor(.primary)
                    .frame(width: 44, height: 44)
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(String(localized: "contact-card.detail.close", defaultValue: "Fermer la fiche", bundle: .main))
        }
        .padding(.horizontal, 16)
        .padding(.top, 16)
        .padding(.bottom, 4)
    }

    private var subtitle: String? {
        let parts = [model.card?.title, model.card?.organization].compactMap { $0 }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    // MARK: - Sur Meeshy

    private func meeshySection(_ account: PublicContactAccount) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            ZStack(alignment: .bottomLeading) {
                banner(account)
                MeeshyAvatar(name: account.displayName, context: .storyViewer, accentColor: accentHex, avatarURL: account.avatarUrl, isDark: colorScheme == .dark)
                    .padding(3)
                    .background(Circle().fill(.ultraThinMaterial))
                    .offset(x: 12, y: 22)
                    .accessibilityHidden(true)
            }
            VStack(alignment: .leading, spacing: 6) {
                Text(String(localized: "contact-card.on-meeshy", defaultValue: "Sur Meeshy", bundle: .main))
                    .font(.caption.weight(.semibold))
                    .foregroundColor(accent)
                    .textCase(.uppercase)
                    .accessibilityAddTraits(.isHeader)
                Text(account.displayName)
                    .font(.headline)
                    .foregroundColor(.primary)
                Text("@" + account.username)
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                if let bio = account.bio, !bio.isEmpty {
                    Text(bio)
                        .font(.subheadline)
                        .foregroundColor(.primary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                ContactAccountActionRow(model: model, account: account, accentHex: accentHex, style: .prominent, onWillNavigate: { close() })
                    .padding(.top, 6)
            }
            .padding(.horizontal, 12)
            .padding(.top, 30)
            .padding(.bottom, 12)
            .accessibilityElement(children: .contain)
        }
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Color.primary.opacity(0.05)))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    @ViewBuilder
    private func banner(_ account: PublicContactAccount) -> some View {
        let gradient = LinearGradient(colors: [accent.opacity(0.55), accent.opacity(0.2)], startPoint: .topLeading, endPoint: .bottomTrailing)
        if let bannerUrl = account.bannerUrl {
            CachedAsyncImage(url: bannerUrl, targetSize: CGSize(width: 480, height: 96), thumbHash: nil, showsStatusOverlays: false) {
                gradient
            }
            .frame(height: 84)
            .frame(maxWidth: .infinity)
            .clipped()
            .accessibilityHidden(true)
        } else {
            gradient.frame(height: 84).accessibilityHidden(true)
        }
    }

    // MARK: - Pied

    @ViewBuilder
    private var footerActions: some View {
        VStack(spacing: 8) {
            if model.card != nil {
                footerButton(String(localized: "contact-card.action.add-to-contacts", defaultValue: "Ajouter aux contacts", bundle: .main), icon: "person.crop.circle.badge.plus") {
                    isShowingAddToContacts = true
                }
            }
            if model.accounts.isEmpty, let phone = model.card?.primaryPhone?.value, MFMessageComposeViewController.canSendText() {
                footerButton(String(localized: "contact-card.action.invite", defaultValue: "Inviter sur Meeshy", bundle: .main), icon: "paperplane") {
                    invitation = PhonebookInvitation(phoneNumber: phone, message: PhonebookViewModel.invitationMessage(name: model.card?.displayName ?? ""))
                }
            }
        }
    }

    private func footerButton(_ title: String, icon: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(title, systemImage: icon)
                .font(.subheadline.weight(.semibold))
                .foregroundColor(accent)
                .frame(maxWidth: .infinity, minHeight: 44)
                .background(Capsule().fill(accent.opacity(0.12)))
        }
        .buttonStyle(.plain)
    }

    // MARK: - Fermeture

    private func close() {
        withAnimation(reduceMotion ? .easeOut(duration: 0.12) : .easeOut(duration: 0.2)) {
            isVisible = false
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
            withoutCoverAnimation { dismiss() }
        }
    }

    static func initials(_ name: String) -> String {
        let letters = MeeshyAvatar.initials(for: name)
        return letters.isEmpty ? "?" : letters
    }
}

// MARK: - Un champ copiable

/// Une ligne de la fiche. Appui long ⇒ copie + haptique + toast ; VoiceOver
/// lit « libellé, valeur » et propose l'action « Copier ».
struct ContactCardFieldRow: View {
    let field: ContactCardField
    let accent: Color

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: field.kind.systemImage)
                .font(.body.weight(.medium))
                .foregroundColor(accent)
                .frame(width: 24, height: 24)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(field.label)
                    .font(.caption)
                    .foregroundColor(.secondary)
                Text(field.value)
                    .font(.body)
                    .foregroundColor(.primary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .frame(minHeight: 44)
        .contentShape(Rectangle())
        .onLongPressGesture(minimumDuration: 0.4) { copy() }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(field.label + ", " + field.value)
        .accessibilityHint(String(localized: "contact-card.field.copy-hint", defaultValue: "Appui long pour copier", bundle: .main))
        .accessibilityAction(named: Text(String(localized: "contact-card.field.copy", defaultValue: "Copier", bundle: .main))) { copy() }
    }

    private func copy() {
        UIPasteboard.general.string = field.value
        HapticFeedback.success()
        FeedbackToastManager.shared.showSuccess(
            String(format: String(localized: "contact-card.toast.copied", defaultValue: "%@ copié", bundle: .main), field.label)
        )
    }
}

// MARK: - Ajouter au carnet

/// `CNContactViewController` en mode « nouveau contact inconnu » : l'écran
/// système d'ajout, prérempli depuis la vCard. Aucune autorisation d'accès au
/// carnet n'est demandée avant que l'utilisateur ne choisisse d'enregistrer.
private struct AddToContactsView: UIViewControllerRepresentable {
    let card: VCard
    let onDone: () -> Void

    func makeUIViewController(context: Context) -> UINavigationController {
        let contact = (try? CNContactVCardSerialization.contacts(with: Data(VCardWriter.write(card).utf8)).first) ?? CNContact()
        let controller = CNContactViewController(forUnknownContact: contact)
        controller.contactStore = CNContactStore()
        controller.allowsActions = false
        controller.delegate = context.coordinator
        controller.navigationItem.leftBarButtonItem = UIBarButtonItem(systemItem: .close, primaryAction: UIAction { _ in onDone() })
        return UINavigationController(rootViewController: controller)
    }

    func updateUIViewController(_ uiViewController: UINavigationController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(onDone: onDone) }

    final class Coordinator: NSObject, CNContactViewControllerDelegate {
        // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466) → double-free au
        // démontage hors d'une tâche. Garde : MainActorDeinitSourceGuardTests.
        nonisolated deinit {}
        let onDone: () -> Void
        init(onDone: @escaping () -> Void) { self.onDone = onDone }

        func contactViewController(_ viewController: CNContactViewController, didCompleteWith contact: CNContact?) {
            onDone()
        }
    }
}
