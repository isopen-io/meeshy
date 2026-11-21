import SwiftUI
import MeeshySDK
import MeeshyUI

/// La carte d'un lien de fiche (`meeshy.me/@pseudo`, `/u/pseudo`) dans une bulle (#19519, planche `Apercu-Lien`).
///
/// Cache d'abord : une carte déjà vue s'affiche dès la première image ; le squelette n'apparaît que sur cache vide.
/// Inconnue, cachée ou bloquée ⇒ la carte neutre ; tant que la passerelle ne sert pas la carte (panne, ancienne
/// route), la bulle retombe sur l'aperçu de lien générique d'avant — aucune régression.
struct BubbleProfileLinkCard: View {
    let handle: String
    let urlString: String
    let fallbackAccent: String
    let isDark: Bool

    @StateObject private var model: ProfileLinkCardViewModel

    init(handle: String, urlString: String, fallbackAccent: String, isDark: Bool,
         model: @autoclosure @escaping () -> ProfileLinkCardViewModel? = nil) {
        self.handle = handle
        self.urlString = urlString
        self.fallbackAccent = fallbackAccent
        self.isDark = isDark
        _model = StateObject(wrappedValue: model() ?? ProfileLinkCardViewModel(
            handle: handle,
            service: ProfileLinkCardService.shared,
            performer: LiveProfileLinkCardActions(),
            prism: ReaderPrism.resolve(for: AuthManager.shared.currentUser)
        ))
    }

    var body: some View {
        content
            .task(id: handle) { await model.load() }
    }

    @ViewBuilder
    private var content: some View {
        switch model.phase {
        case .loading:
            ProfileLinkCardSkeleton()
        case .closed:
            ProfileLinkClosedCard()
        case .unavailable:
            LinkPreviewCard(urlString: urlString, accentColor: fallbackAccent, isDark: isDark)
        case .card(let face):
            ProfileLinkCardView(face: face, onOpen: { model.open() }, onWrite: writeAction(for: face))
        }
    }

    /// « Écrire » n'existe pas sur sa propre carte.
    private func writeAction(for face: ProfileLinkCardFace) -> (() -> Void)? {
        guard face.offersWrite else { return nil }
        let model = model
        return { Task { await model.write() } }
    }
}

struct LiveProfileLinkCardActions: ProfileLinkCardActionPerforming {
    func openProfile(username: String) {
        DeepLinkRouter.shared.pendingDeepLink = .userProfile(username: username)
    }

    func write(to userId: String) async {
        guard let currentUserId = AuthManager.shared.currentUser?.id else { return }
        guard let conversation = await ConversationCreator().openDirectConversation(with: userId,
                                                                                   currentUserId: currentUserId)
        else { return }
        DeepLinkRouter.shared.pendingDeepLink = .conversation(id: conversation.id)
    }
}
