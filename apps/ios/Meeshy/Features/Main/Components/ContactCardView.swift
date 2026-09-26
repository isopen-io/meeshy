import SwiftUI
import Contacts
import ContactsUI
import MeeshySDK
import MeeshyUI

// MARK: - Carte de visite dans une bulle (#8101)

/// Une pièce jointe vCard rendue en CARTE DE VISITE : le nom tel que
/// l'auteur l'a enregistré dans son carnet, le premier numéro dessous, et —
/// si un numéro ou un e-mail appartient à un compte Meeshy — son avatar avec
/// **Se connecter** | **Écrire**. Toucher le nom ouvre la fiche complète.
///
/// Cellule de liste : `Equatable` sur ses seules entrées primitives, aucun
/// `@ObservedObject` de singleton. L'état (carte lue, comptes résolus) vit
/// dans un `ContactCardViewModel` possédé par la cellule, servi depuis le
/// cache dès l'`init` — une carte déjà lue s'affiche sans spinner.
struct ContactCardView: View, Equatable {
    let attachment: MessageAttachment
    let isMe: Bool
    let accentHex: String

    @StateObject private var model: ContactCardViewModel
    @State private var isShowingDetail = false
    @Environment(\.colorScheme) private var colorScheme

    init(attachment: MessageAttachment, isMe: Bool, accentHex: String) {
        self.attachment = attachment
        self.isMe = isMe
        self.accentHex = accentHex
        _model = StateObject(wrappedValue: ContactCardViewModel(attachment: attachment))
    }

    nonisolated static func == (lhs: ContactCardView, rhs: ContactCardView) -> Bool {
        lhs.attachment.id == rhs.attachment.id
            && lhs.attachment.fileUrl == rhs.attachment.fileUrl
            && lhs.isMe == rhs.isMe
            && lhs.accentHex == rhs.accentHex
    }

    private var isDark: Bool { colorScheme == .dark }
    private var accent: Color { Color(hex: accentHex) }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            header
            if let account = model.primaryAccount {
                ContactAccountActionRow(model: model, account: account, accentHex: accentHex, style: .compact)
            }
        }
        .padding(12)
        .frame(width: 256, alignment: .leading)
        .adaptiveGlass(in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(accent.opacity(0.25), lineWidth: 1)
        )
        .task { await model.load() }
        .fullScreenCover(isPresented: $isShowingDetail) {
            ContactCardDetailSheet(model: model, accentHex: accentHex)
                .clearCoverBackground()
        }
    }

    private var header: some View {
        Button {
            guard model.card != nil else { return }
            HapticFeedback.light()
            withoutCoverAnimation { isShowingDetail = true }
        } label: {
            HStack(spacing: 10) {
                leadingAvatar
                VStack(alignment: .leading, spacing: 2) {
                    Text(String(localized: "contact-card.shared", defaultValue: "Contact partagé", bundle: .main))
                        .font(.caption2.weight(.semibold))
                        .foregroundColor(accent)
                        .textCase(.uppercase)
                    Text(displayName)
                        .font(.subheadline.weight(.bold))
                        .foregroundColor(.primary)
                        .lineLimit(2)
                    if let phone = model.card?.primaryPhone?.value {
                        Text(phone)
                            .font(.footnote.monospacedDigit())
                            .foregroundColor(.secondary)
                            .lineLimit(1)
                    }
                }
                Spacer(minLength: 4)
                Image(systemName: "chevron.forward")
                    .font(.caption.weight(.semibold))
                    .foregroundColor(.secondary)
                    .opacity(model.card == nil ? 0 : 1)
            }
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Self.accessibilityLabel(card: model.card, account: model.primaryAccount, fallbackName: attachment.originalName))
        .accessibilityHint(String(localized: "contact-card.a11y-hint", defaultValue: "Appuyer pour ouvrir le contact", bundle: .main))
        .accessibilityAddTraits(.isButton)
    }

    @ViewBuilder
    private var leadingAvatar: some View {
        if let account = model.primaryAccount {
            MeeshyAvatar(name: account.displayName, context: .messageBubble, accentColor: accentHex, avatarURL: account.avatarUrl, isDark: isDark)
                .accessibilityHidden(true)
        } else {
            ZStack {
                Circle().fill(LinearGradient(colors: [accent, accent.opacity(0.7)], startPoint: .topLeading, endPoint: .bottomTrailing))
                Image(systemName: "person.crop.circle.fill")
                    .font(.system(size: 18, weight: .medium))
                    .foregroundColor(.white)
            }
            .frame(width: 36, height: 36)
            .accessibilityHidden(true)
        }
    }

    private var displayName: String {
        if let name = model.card?.displayName, !name.isEmpty { return name }
        if model.didFailToRead { return String(localized: "contact-card.unreadable", defaultValue: "Contact illisible", bundle: .main) }
        let base = (attachment.originalName as NSString).deletingPathExtension
        return base.isEmpty ? String(localized: "contact-card.shared", defaultValue: "Contact partagé", bundle: .main) : base
    }

    // MARK: - Accessibilité

    /// L'étiquette VoiceOver de la carte : nom, premier numéro, et le compte
    /// Meeshy associé s'il y en a un — tout ce que la carte montre.
    static func accessibilityLabel(card: VCard?, account: PublicContactAccount?, fallbackName: String) -> String {
        let name = card?.displayName.isEmpty == false ? card?.displayName ?? fallbackName : fallbackName
        var parts = [String(format: String(localized: "contact-card.a11y-label", defaultValue: "Contact partagé : %@", bundle: .main), name)]
        if let phone = card?.primaryPhone?.value {
            parts.append(String(format: String(localized: "contact-card.a11y-phones", defaultValue: "Téléphone : %@", bundle: .main), phone))
        }
        if let account {
            parts.append(String(format: String(localized: "contact-card.a11y-on-meeshy", defaultValue: "Sur Meeshy : %@", bundle: .main), "@" + account.username))
        }
        return parts.joined(separator: ", ")
    }
}

// MARK: - Se connecter | Écrire

/// La rangée d'actions d'un compte résolu, partagée par la bulle et la fiche.
/// `self` ⇒ rien ; ami ⇒ **Écrire** ; demande envoyée ⇒ un ÉTAT, pas un bouton.
struct ContactAccountActionRow: View {
    enum Style { case compact, prominent }

    @ObservedObject var model: ContactCardViewModel
    let account: PublicContactAccount
    let accentHex: String
    let style: Style
    /// Appelé juste avant d'ouvrir la conversation — la fiche s'y referme.
    var onWillNavigate: (() -> Void)? = nil

    var body: some View {
        let actions = model.actions(for: account)
        let isBusy = model.busyUserIds.contains(account.userId)
        if actions != .none {
            HStack(spacing: 8) {
                switch actions.connect {
                case .connect:
                    actionButton(String(localized: "contact-card.action.connect", defaultValue: "Se connecter", bundle: .main), icon: "person.badge.plus", filled: true, disabled: isBusy) {
                        Task {
                            guard await model.connect(account) else {
                                HapticFeedback.error()
                                FeedbackToastManager.shared.showError(String(localized: "contact-card.toast.request-failed", defaultValue: "Impossible d'envoyer la demande", bundle: .main))
                                return
                            }
                            HapticFeedback.success()
                        }
                    }
                case .accept(let requestId):
                    actionButton(String(localized: "contact-card.action.accept", defaultValue: "Accepter", bundle: .main), icon: "person.crop.circle.badge.checkmark", filled: true, disabled: isBusy) {
                        Task {
                            guard await model.accept(account, requestId: requestId) else {
                                HapticFeedback.error()
                                FeedbackToastManager.shared.showError(String(localized: "contact-card.toast.accept-failed", defaultValue: "Impossible d'accepter la demande", bundle: .main))
                                return
                            }
                            HapticFeedback.success()
                        }
                    }
                case .pending:
                    Label(String(localized: "contact-card.state.request-sent", defaultValue: "Demande envoyée", bundle: .main), systemImage: "clock")
                        .font(.footnote.weight(.semibold))
                        .foregroundColor(.secondary)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .accessibilityElement(children: .combine)
                case nil:
                    EmptyView()
                }
                if actions.canWrite {
                    actionButton(String(localized: "contact-card.action.write", defaultValue: "Écrire", bundle: .main), icon: "bubble.left.fill", filled: actions.connect == nil, disabled: isBusy) {
                        Task {
                            guard let conversation = await model.openConversation(with: account) else { return }
                            HapticFeedback.success()
                            onWillNavigate?()
                            // La voie de navigation GLOBALE (la même que `/c/:id`) : une
                            // bulle vit aussi hors de la pile qui porte le `Router`
                            // (menu surélevé, Focal), où un `@EnvironmentObject`
                            // manquant ferait tomber l'app.
                            DeepLinkRouter.shared.pendingDeepLink = .conversation(id: conversation.id)
                        }
                    }
                }
            }
        }
    }

    private func actionButton(_ title: String, icon: String, filled: Bool, disabled: Bool, action: @escaping () -> Void) -> some View {
        let accent = Color(hex: accentHex)
        return Button(action: action) {
            Label(title, systemImage: icon)
                .font((style == .compact ? Font.footnote : Font.subheadline).weight(.semibold))
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .foregroundColor(filled ? .white : accent)
                .frame(maxWidth: .infinity, minHeight: 44)
                .background(
                    Capsule().fill(filled ? AnyShapeStyle(accent) : AnyShapeStyle(accent.opacity(0.14)))
                )
        }
        .buttonStyle(.plain)
        .disabled(disabled)
        .opacity(disabled ? 0.6 : 1)
        .accessibilityLabel(title)
    }
}

// MARK: - Présentation plein écran transparente

private struct ClearCoverBackground: UIViewRepresentable {
    func makeUIView(context: Context) -> UIView {
        let view = UIView()
        DispatchQueue.main.async { view.superview?.superview?.backgroundColor = .clear }
        return view
    }

    func updateUIView(_ uiView: UIView, context: Context) {}
}

private struct ClearCoverBackgroundModifier: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 16.4, *) {
            content.presentationBackground(.clear)
        } else {
            content.background(ClearCoverBackground())
        }
    }
}

extension View {
    /// Un `fullScreenCover` dont le fond laisse voir l'écran qu'il couvre —
    /// la fiche floute elle-même la conversation derrière elle.
    func clearCoverBackground() -> some View { modifier(ClearCoverBackgroundModifier()) }
}

/// Présente sans le glissement vertical du système : la fiche anime son
/// propre voile, et un voile qui monte du bas se lirait comme une feuille.
@MainActor
func withoutCoverAnimation(_ change: () -> Void) {
    var transaction = Transaction()
    transaction.disablesAnimations = true
    withTransaction(transaction, change)
}

// MARK: - Sélecteur de contact (UIKit)

/// Le sélecteur système : il ne demande AUCUNE autorisation d'accès au
/// carnet — l'utilisateur ne partage que la fiche qu'il touche.
struct ContactPickerView: UIViewControllerRepresentable {
    let onSelect: (CNContact) -> Void
    let onCancel: () -> Void

    func makeUIViewController(context: Context) -> CNContactPickerViewController {
        let picker = CNContactPickerViewController()
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: CNContactPickerViewController, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(onSelect: onSelect, onCancel: onCancel)
    }

    class Coordinator: NSObject, CNContactPickerDelegate {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
        let onSelect: (CNContact) -> Void
        let onCancel: () -> Void

        init(onSelect: @escaping (CNContact) -> Void, onCancel: @escaping () -> Void) {
            self.onSelect = onSelect
            self.onCancel = onCancel
        }

        func contactPicker(_ picker: CNContactPickerViewController, didSelect contact: CNContact) {
            onSelect(contact)
        }

        func contactPickerDidCancel(_ picker: CNContactPickerViewController) {
            onCancel()
        }
    }
}
