import SwiftUI
import Combine
import MeeshySDK

// MARK: - Status Bubble Controller

@MainActor
final class StatusBubbleController: ObservableObject {
    static let shared = StatusBubbleController()
    private init() {}

    @Published var currentEntry: StatusEntry?
    @Published var anchor: CGPoint = .zero
    /// Mood en attente de confirmation de réponse (groupe / story tray / ailleurs).
    /// Non-nil ⇒ le pop-up "Répondre / Quitter" est présenté.
    @Published var replyConfirmationEntry: StatusEntry?

    var onRepublish: ((StatusEntry) -> Void)?
    /// Action de réponse à un mood : résout/ouvre la DM avec l'auteur et amorce
    /// le composer. Branchée une fois au niveau racine (RootView / iPadRootView).
    var onConfirmedReply: ((StatusEntry) -> Void)?

    /// Vrai quand le mood courant est affiché DANS la conversation directe de son
    /// auteur (barre de conversation directe). La réponse est alors immédiate
    /// (pas de pop-up) : on est déjà dans la bonne conversation. Posé par le site
    /// d'appel à `show(...)`, jamais stale (chaque ouverture le réécrit).
    var repliesInline = false

    func show(entry: StatusEntry, anchor: CGPoint, repliesInline: Bool = false) {
        currentEntry = entry
        self.anchor = anchor
        self.repliesInline = repliesInline

        // Statut consommé : enregistrer la vue côté serveur (sauf le sien) pour
        // que la notification « X a publié un statut » (friend_new_mood) ne reste
        // pas non lue. Le gateway marque alors les notifications liées à ce post
        // et ré-émet `notification:counts`. Fire-and-forget.
        guard entry.userId != AuthManager.shared.currentUser?.id else { return }
        let statusId = entry.id
        Task { try? await PostService.shared.viewPost(postId: statusId) }
    }

    func dismiss() {
        currentEntry = nil
    }

    /// Déclenché quand l'utilisateur touche le CONTENU du mood affiché (pas la
    /// zone extérieure de fermeture). Ouvre la réponse au mood :
    /// - mood affiché dans la conversation directe courante ⇒ réponse immédiate ;
    /// - sinon (groupe, story tray, …) ⇒ pop-up de confirmation Répondre / Quitter.
    func requestReply() {
        guard let entry = currentEntry else { return }
        currentEntry = nil
        // On ne répond pas à son propre mood.
        guard entry.userId != AuthManager.shared.currentUser?.id else { return }

        if repliesInline {
            onConfirmedReply?(entry)
        } else {
            replyConfirmationEntry = entry
        }
    }

    var isPresented: Binding<Bool> {
        Binding(
            get: { self.currentEntry != nil },
            set: { if !$0 { self.currentEntry = nil } }
        )
    }
}

// MARK: - View Modifier

private struct StatusBubbleOverlayModifier: ViewModifier {
    @ObservedObject private var controller = StatusBubbleController.shared

    func body(content: Content) -> some View {
        ZStack {
            content
            if let entry = controller.currentEntry {
                StatusBubbleOverlay(
                    status: entry,
                    anchorPoint: controller.anchor,
                    isPresented: controller.isPresented,
                    onRepublish: entry.userId != AuthManager.shared.currentUser?.id
                        ? controller.onRepublish
                        : nil,
                    onReplyTapped: entry.userId != AuthManager.shared.currentUser?.id
                        ? { controller.requestReply() }
                        : nil
                )
                .zIndex(200)
            }
        }
        .confirmationDialog(
            String(localized: "mood.reply.confirm.title", defaultValue: "Répondre à cette humeur ?", bundle: .main),
            isPresented: Binding(
                get: { controller.replyConfirmationEntry != nil },
                set: { if !$0 { controller.replyConfirmationEntry = nil } }
            ),
            titleVisibility: .visible,
            presenting: controller.replyConfirmationEntry
        ) { entry in
            Button(String(localized: "mood.reply.confirm.reply", defaultValue: "Répondre", bundle: .main)) {
                controller.onConfirmedReply?(entry)
                controller.replyConfirmationEntry = nil
            }
            Button(String(localized: "mood.reply.confirm.cancel", defaultValue: "Quitter", bundle: .main), role: .cancel) {
                controller.replyConfirmationEntry = nil
            }
        } message: { entry in
            Text(Self.moodReplyMessage(entry))
        }
    }

    /// Aperçu du mood présenté dans le pop-up : emoji + contenu entier + date.
    private static func moodReplyMessage(_ entry: StatusEntry) -> String {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .short
        let date = formatter.localizedString(for: entry.createdAt, relativeTo: Date())
        let content = (entry.content?.isEmpty == false) ? " \(entry.content!)" : ""
        return "\(entry.moodEmoji)\(content) \u{00B7} \(date)"
    }
}

extension View {
    func withStatusBubble() -> some View {
        modifier(StatusBubbleOverlayModifier())
    }
}
