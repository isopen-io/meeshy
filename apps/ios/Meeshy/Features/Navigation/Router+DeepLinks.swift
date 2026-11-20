import SwiftUI
import Combine
import CoreLocation
import MeeshySDK
import MeeshyUI
import os

extension Router {
    // MARK: - Deep Link Handling

    func handleDeepLink(_ url: URL) {
        DeepLinkParser.open(url) { [weak self] destination in
            guard let self else { return }
            switch destination {
            case .ownProfile:
                replaceStack(with: .profile)

            case .userProfile(let username, let face):
                deepLinkProfileUser = ProfileSheetUser(username: username).opening(on: face)

            case .trackedLink(let token):
                // `/l/<token>` resolved async by targetType (records the click).
                DeepLinkRouter.shared.resolveTrackedLink(token)

            case .joinLink(let identifier):
                // In-app taps of an invitation share link. Funnel them through
                // the shared `DeepLinkRouter` pending pipeline so they land on
                // the exact same authenticated join flow as cold-launch
                // Universal Links (RootView/iPadRootView `handleDeepLink` →
                // `joinViaShareLink`). This keeps the join resolution + error
                // handling in a single place rather than duplicating the
                // `ShareLinkService.joinAuthenticated` call here.
                DeepLinkRouter.shared.pendingDeepLink = .joinLink(identifier: identifier)

            case .chatLink(let identifier):
                DeepLinkRouter.shared.pendingDeepLink = .chatLink(identifier: identifier)

            case .conversation(let id, let draftText):
                Task { [weak self] in
                    await self?.handleConversationDeepLink(id, draftText: draftText)
                }

            case .magicLink, .emailVerificationLink, .passwordResetLink:
                // Voie IN-APP (#10874) : un lien d'e-mail touché dans un contenu
                // n'ouvre ni session ni écran de réinitialisation — il part au
                // navigateur intégré. `InAppLinks` l'y envoie déjà ; ce cas en
                // est le second verrou, pour tout appelant qui l'oublierait.
                Self.logger.info("In-app email link sent to the browser")
                EmailLinkBrowser.present(url)

            case .share(let text, let urlString):
                Self.logger.info("Deep link share received")
                handleShareDeepLink(text: text, urlString: urlString)

            case .userLinks:
                replaceStack(with: .links)

            case .postDetail(let postId):
                push(.postDetail(postId))

            case .storyDetail(let postId):
                // Un lien tapé dans l'app prend la voie du lancement système :
                // la racine ouvre le lecteur sur CETTE story par `StoryDoor`,
                // comme le même lien reçu de l'extérieur (#7808).
                DeepLinkRouter.shared.pendingDeepLink = .storyDetail(postId: postId)

            case .reel(let postId):
                // Même voie que le lancement système : la racine ouvre le
                // réel par `ReelDoor`, dans le lecteur de réels (#7805).
                DeepLinkRouter.shared.pendingDeepLink = .reel(postId: postId)

            case .community(let id):
                push(.communityDetail(id))

            case .recentConversation:
                DeepLinkRouter.shared.pendingDeepLink = .recentConversation

            case .unreadConversations:
                DeepLinkRouter.shared.pendingDeepLink = .unreadConversations

            case .hashtag(let tag):
                push(.hashtagResults(tag: tag))

            case .game(let link):
                openGame(at: GameNavigationMap.entry(for: link))

            case .packShop(let domain, let pack):
                openPackShop(domain: domain, pack: pack)

            case .referral, .call, .external:
                break
            }
        }
    }

    // MARK: - Vitrine des packs (#10632)

    /// Ouvre Réglages puis la vitrine unique, filtrée sur `domain` : le lanceur
    /// porte la demande jusqu'à `SettingsView`, qui présente `PacksSettingsView`.
    func openPackShop(domain: PackDomain?, pack: String? = nil) {
        PackShopLauncher.shared.request(domain: domain, pack: pack)
        replaceStack(with: .settings)
    }

    /// Ouvre Réglages puis « Mes packs » (#16433).
    func openMyPacks() {
        PackShopLauncher.shared.request(domain: nil, page: .mine)
        replaceStack(with: .settings)
    }

    // MARK: - Conversation Deep Link

    /// Ouvre une conversation via deep link et dépose un brouillon si fourni.
    ///
    /// Voie IN-APP : appelée par le handler `openURL` (RootView/iPadRootView)
    /// quand un tap `Link` résout en `.conversation(id, draftText)` via
    /// `DeepLinkParser.parse`. La voie système (cold launch / widget tap) passe
    /// par `DeepLinkRouter.handle` qui dépose le même brouillon de son côté.
    ///
    /// Les surfaces widget / App Shortcut qui pré-remplissent le composer
    /// portent leur texte en query param (`quickreply?text=…`, `send?message=…`) ;
    /// il est déposé dans `DraftStore` AVANT la navigation pour que
    /// `ConversationView` le trouve à l'ouverture. Le dépôt précède aussi le
    /// fetch réseau : si celui-ci échoue, le texte dicté n'est pas perdu — il
    /// attend dans le brouillon la prochaine ouverture manuelle.
    ///
    /// - Parameter conversationId: ID de conversation (MongoDB ObjectId)
    /// - Parameter draftText: Texte optionnel à déposer en brouillon (jamais envoyé)
    private func handleConversationDeepLink(_ conversationId: String, draftText: String? = nil) async {
        if let draftText, !draftText.isEmpty {
            DraftStore.shared.stageShortcutDraft(draftText, for: conversationId)
            Self.logger.info("Deep link staged draft text for conversation \(conversationId)")
        }
        do {
            let currentUserId = AuthManager.shared.currentUser?.id ?? ""
            let apiConversation = try await ConversationService.shared.getById(conversationId)
            let conversation = apiConversation.toConversation(currentUserId: currentUserId)
            navigateToConversation(conversation)
            Self.logger.info("Deep link navigated to conversation \(conversationId)")
        } catch {
            Self.logger.error("Failed to load conversation for deep link: \(error.localizedDescription)")
            FeedbackToastManager.shared.showError(String(localized: "deeplink.conversation.error", defaultValue: "Impossible d'ouvrir la conversation", bundle: .main))
        }
    }

    // MARK: - Share Deep Link

    private func handleShareDeepLink(text: String?, urlString: String?) {
        popToRoot()

        if let urlString, let url = URL(string: urlString) {
            pendingShareContent = .link(url)
        } else if let text, !text.isEmpty {
            pendingShareContent = .text(text)
        } else {
            Self.logger.error("Share deep link received with no content")
        }
    }
}
