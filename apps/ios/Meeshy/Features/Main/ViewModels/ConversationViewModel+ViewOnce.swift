import Foundation
import MeeshySDK

/// **Ouvrir une vue unique** (#7618) — le toucher de la puce
/// `(1) · Touchez pour afficher`, dans les cinq modes.
///
/// Tant qu'il n'est pas ouvert, le message est SCELLÉ : aucun mode ne reçoit
/// son contenu (`MeeshyMessage.sealedForDisplay`). L'ouverture est donc une
/// donnée de la visite, tenue ICI, et non un état de feuille : une feuille ne
/// peut pas rendre ce que son modèle ne porte plus, et la cellule du fil lit le
/// message depuis GRDB, jamais depuis `messages`.
///
/// - un MÉDIA s'ouvre en plein écran, et c'est l'hôte qui le présente : il ne
///   se révèle jamais dans la bulle ;
/// - un TEXTE se lit sur place : le message est marqué révélé, et chaque mode
///   le reçoit de nouveau avec son contenu.
extension ConversationViewModel {

    enum ViewOnceOpening {
        /// Le plein écran à présenter, sur cette pièce.
        case fullscreen(MessageAttachment)
        /// Le texte est révélé à sa place dans le fil.
        case inPlace
        /// Le texte révélé a été RETOUCHÉ : il passe à « déjà ouvert » (#7579).
        case closed
        /// Rien à ouvrir : message inconnu, sans vue unique, ou déjà ouvert.
        case unavailable
    }

    func openViewOnce(messageId: String) -> ViewOnceOpening {
        guard let index = messages.firstIndex(where: { $0.id == messageId }),
              messages[index].holdsViewOnce,
              !messages[index].isViewOnceOpened else {
            return .unavailable
        }
        if revealedViewOnceIds[messageId] == true {
            closeViewOnce(messageId: messageId)
            return .closed
        }
        if let media = messages[index].openableViewOnceMedia {
            return .fullscreen(media)
        }
        revealedViewOnceIds[messageId] = true
        messages[index].isViewOnceRevealed = true
        return .inPlace
    }

    /// **Un texte lu sur place passe à « déjà ouvert »** (#7579) — quand on le
    /// RETOUCHE, quand il SORT DE L'ÉCRAN au défilement, ou quand on quitte la
    /// conversation. Sans effet sur un message qui n'est pas révélé : les trois
    /// portes peuvent se déclencher ensemble, la consommation ne part qu'une
    /// fois.
    ///
    /// L'ouverture se grave en base AVANT que la révélation ne tombe : la
    /// cellule passe directement du texte à `(1) · Déjà ouvert`, sans repasser
    /// par la puce « Touchez pour afficher ».
    func closeViewOnce(messageId: String) {
        guard revealedViewOnceIds[messageId] == true,
              let index = messages.firstIndex(where: { $0.id == messageId }),
              messages[index].viewOnceOpenedAt == nil else { return }
        messages[index].viewOnceOpenedAt = Date()
        Task { [weak self] in
            guard let self else { return }
            _ = await self.consumeViewOnce(messageId: messageId)
            self.revealedViewOnceIds.removeValue(forKey: messageId)
            if let index = self.messages.firstIndex(where: { $0.id == messageId }) {
                self.messages[index].isViewOnceRevealed = false
            }
        }
    }

    /// Referme toutes les vues uniques révélées — la sortie de conversation.
    ///
    /// Ce que l'AUTEUR a révélé se referme sans être consommé (directive porteur
    /// 2026-09-24) : la sortie de l'auteur consommait ses propres messages,
    /// « sans geste » visible (#7578, § 6).
    func closeAllRevealedViewOnce() {
        for (messageId, isRevealed) in revealedViewOnceIds where isRevealed {
            guard isAuthoredByMe(messageId) else {
                closeViewOnce(messageId: messageId)
                continue
            }
            revealedViewOnceIds.removeValue(forKey: messageId)
            if let index = messages.firstIndex(where: { $0.id == messageId }) {
                messages[index].isViewOnceRevealed = false
            }
        }
    }

    /// Les vues uniques armées pendant la visite que la SORTIE peut consommer :
    /// jamais celles de l'auteur.
    func viewOnceConsumableOnExit(_ messageIds: [String]) -> [String] {
        messageIds.filter { !isAuthoredByMe($0) }
    }

    private func isAuthoredByMe(_ messageId: String) -> Bool {
        messages.first(where: { $0.id == messageId })?.isMe == true
    }

    /// Grave l'ouverture sur CET appareil et purge ce qui en reste : médias en
    /// cache, traductions, transcription, pistes traduites, puis la ligne GRDB
    /// elle-même (`markViewOnceOpened`). Seule l'enveloppe survit.
    func markViewOnceOpenedLocally(messageId: String) async {
        if let message = messages.first(where: { $0.id == messageId }) {
            evictViewOnceMedia(message: message)
        }
        messageTranslations.removeValue(forKey: messageId)
        messageTranscriptions.removeValue(forKey: messageId)
        messageTranslatedAudios.removeValue(forKey: messageId)
        try? await messagePersistence.markViewOnceOpened(localId: messageId)
    }

    /// Pose la révélation de la visite sur des messages relus du magasin : une
    /// écriture GRDB (un accusé, une réaction) ne doit pas refermer un texte
    /// que le lecteur est en train de lire.
    func applyingViewOnceReveals(_ incoming: [Message]) -> [Message] {
        guard !revealedViewOnceIds.isEmpty else { return incoming }
        return incoming.map { message in
            guard revealedViewOnceIds[message.id] == true else { return message }
            var revealed = message
            revealed.isViewOnceRevealed = true
            return revealed
        }
    }
}
