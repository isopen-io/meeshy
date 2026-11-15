import Foundation

// MARK: - In-app banner: identity slots

/// Ce qui IDENTIFIE l'auteur d'une bannière in-app — nom affiché, avatar,
/// couleur de repli — et le nom canonique du groupe où l'événement a eu lieu.
///
/// Ce que la bannière DIT (headline, corps, vignette, réaction) vit dans
/// `NotificationBannerPresentation.swift` : deux questions, deux fichiers.
///
/// Toutes les propriétés sont pures et `O(1)` — elles sont lues depuis une vue
/// feuille transitoire (`NotificationToastView`) à chaque rendu.
public extension SocketNotificationEvent {

    /// Nom affiché de l'acteur (expéditeur / déclencheur), avec replis sûrs.
    var actorDisplayName: String {
        if let name = senderDisplayName, !name.isEmpty { return name }
        if let handle = senderUsername, !handle.isEmpty { return handle }
        if let title, !title.isEmpty { return title }
        return "Quelqu'un"
    }

    /// Le nom CANONIQUE du groupe où le message a été envoyé — `nil` pour un
    /// message direct, pour une conversation sans titre, et pour tout ce qui
    /// n'est pas un message de conversation.
    ///
    /// Ce n'est PAS une ligne d'affichage : c'est la matière première du
    /// cadrage « X dans <groupe> ». Le nom que la bannière montre est celui que
    /// l'APPAREIL connaît (renommage local + emoji favori), résolu par
    /// `NotificationToastManager.resolvedConversationGroupName(for:)`.
    var conversationGroupName: String? {
        guard bannerFraming == .conversation, !isDirect else { return nil }
        guard let title = conversationTitle, !title.isEmpty else { return nil }
        return title
    }

    // MARK: Avatar

    /// Avatar de la bannière : la photo de l'expéditeur, à défaut celle du
    /// groupe (messages de groupe), à défaut les initiales déterministes.
    var toastAvatarURL: String? {
        if let sender = senderAvatar, !sender.isEmpty { return sender }
        if !isDirect, let group = conversationAvatar, !group.isEmpty { return group }
        return nil
    }

    /// Nom qui alimente les initiales de repli. Quand la bannière retombe sur
    /// l'avatar du groupe, les initiales représentent le groupe.
    var toastAvatarName: String {
        let senderHasAvatar = (senderAvatar?.isEmpty == false)
        if !senderHasAvatar, !isDirect, conversationAvatar?.isEmpty == false,
           let title = conversationTitle, !title.isEmpty {
            return title
        }
        return actorDisplayName
    }

    /// Graine de couleur déterministe pour le dégradé de repli de l'avatar
    /// (stable entre deux rendus + identique à la pastille d'expéditeur de la
    /// bulle).
    var toastAvatarColorSeed: String {
        senderId ?? toastAvatarName
    }
}
