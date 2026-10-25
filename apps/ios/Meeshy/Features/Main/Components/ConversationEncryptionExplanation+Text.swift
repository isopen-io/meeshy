import Foundation

/// Les mots de la fiche Chiffrement (#12880) : une clé LITTÉRALE par texte,
/// dans les sept langues du catalogue.
extension ConversationEncryptionExplanation.Topic {
    var title: String {
        switch self {
        case .whoReads:
            String(localized: "conversation.encryption.topic.whoReads", defaultValue: "Qui peut lire", bundle: .main)
        case .available:
            String(localized: "conversation.encryption.topic.available", defaultValue: "Ce qui fonctionne", bundle: .main)
        case .absent:
            String(localized: "conversation.encryption.topic.absent", defaultValue: "Absent dans ce mode", bundle: .main)
        case .notYet:
            String(localized: "conversation.encryption.topic.notYet", defaultValue: "Pas encore disponible", bundle: .main)
        case .devices:
            String(localized: "conversation.encryption.topic.devices", defaultValue: "Vos appareils", bundle: .main)
        case .switching:
            String(localized: "conversation.encryption.topic.switching", defaultValue: "Activer ou désactiver", bundle: .main)
        case .permanence:
            String(localized: "conversation.encryption.topic.permanence", defaultValue: "Définitif", bundle: .main)
        }
    }
}

extension ConversationEncryptionExplanation.Fact {
    /// Le symbole SF qui précède le fait.
    var systemImage: String {
        switch self {
        case .transitProtected: "arrow.left.arrow.right"
        case .storedWithoutEncryption: "lock.open"
        case .encryptedOnServerServerReads: "lock.icloud"
        case .hybridIsServerToday: "info.circle"
        case .onlyParticipantsRead: "lock.shield.fill"
        case .everyServerFeature: "checkmark.circle"
        case .translatedOnDevice: "globe"
        case .noServerTranscription: "waveform"
        case .noNotificationPreview: "bell.slash"
        case .noSearch: "magnifyingglass"
        case .noEdit: "pencil.slash"
        case .noForward: "arrowshape.turn.up.right"
        case .noOfflineSending: "wifi.slash"
        case .notYetPlacesAndStickers: "mappin.and.ellipse"
        case .attachmentsEncryptedOnDevice: "paperclip"
        case .notYetDecryptedNotifications: "bell"
        case .notYetGroups: "person.3"
        case .groupSendingUnavailable: "person.3.fill"
        case .notYetSafetyNumbers: "checkmark.shield"
        case .oneKeyPerDevice: "key"
        case .deviceLimit: "iphone"
        case .restoredDeviceIsNew: "arrow.clockwise"
        case .whoMayToggle: "person.crop.circle.badge.checkmark"
        case .switchKeepsHistory: "clock.arrow.circlepath"
        case .switchIsShownInThread: "text.bubble"
        case .endToEndIsFinal: "lock.fill"
        case .endToEndNeverTurnedOff, .endToEndNeverTurnedOffDirect: "lock.shield"
        case .serverCannotTurnItOff: "iphone"
        case .voiceTranslatedAsTextOnDevice: "captions.bubble"
        case .noLockScreenMediaPreview: "lock.iphone"
        case .noWebPlayback: "desktopcomputer"
        case .noServerModeration: "flag"
        }
    }

    var text: String { readingText ?? limitText ?? "" }

    /// Qui lit, ce qui fonctionne, ce qui manque.
    private var readingText: String? {
        switch self {
        case .transitProtected:
            String(localized: "conversation.encryption.fact.transitProtected", defaultValue: "Entre votre appareil et le serveur, les messages voyagent toujours protégés.", bundle: .main)
        case .storedWithoutEncryption:
            String(localized: "conversation.encryption.fact.storedWithoutEncryption", defaultValue: "Sur le serveur, les messages sont stockés sans chiffrement : Meeshy peut les lire.", bundle: .main)
        case .encryptedOnServerServerReads:
            String(localized: "conversation.encryption.fact.encryptedOnServerServerReads", defaultValue: "Sur le serveur, les messages sont chiffrés avec une clé que Meeshy détient : Meeshy peut les lire pour les traduire et les transcrire.", bundle: .main)
        case .hybridIsServerToday:
            String(localized: "conversation.encryption.fact.hybridIsServerToday", defaultValue: "Le mode hybride fonctionne aujourd’hui comme le mode Serveur : les appareils n’ajoutent aucun chiffrement de bout en bout.", bundle: .main)
        case .onlyParticipantsRead:
            String(localized: "conversation.encryption.fact.onlyParticipantsRead", defaultValue: "Seuls les appareils des participants peuvent lire les messages. Meeshy n’a pas les clés et ne peut pas les lire.", bundle: .main)
        case .everyServerFeature:
            String(localized: "conversation.encryption.fact.everyServerFeature", defaultValue: "Toutes les fonctions sont disponibles : traduction automatique, transcription des vocaux, aperçu des notifications, recherche.", bundle: .main)
        case .translatedOnDevice:
            String(localized: "conversation.encryption.fact.translatedOnDevice", defaultValue: "La traduction automatique se fait sur votre appareil, jamais sur le serveur.", bundle: .main)
        case .attachmentsEncryptedOnDevice:
            String(localized: "conversation.encryption.fact.attachmentsEncryptedOnDevice", defaultValue: "Photos, vidéos, fichiers et vocaux sont chiffrés sur votre appareil avant l’envoi : le serveur n’en garde qu’une copie illisible.", bundle: .main)
        case .noServerTranscription:
            String(localized: "conversation.encryption.fact.noServerTranscription", defaultValue: "Le serveur ne transcrit pas les messages vocaux.", bundle: .main)
        case .noNotificationPreview:
            String(localized: "conversation.encryption.fact.noNotificationPreview", defaultValue: "Les notifications n’affichent pas le texte du message : le serveur ne le connaît pas.", bundle: .main)
        case .noSearch:
            String(localized: "conversation.encryption.fact.noSearch", defaultValue: "La recherche du serveur ne trouve pas ces messages.", bundle: .main)
        case .noEdit:
            String(localized: "conversation.encryption.fact.noEdit", defaultValue: "Un message envoyé ne peut pas être modifié.", bundle: .main)
        case .noForward:
            String(localized: "conversation.encryption.fact.noForward", defaultValue: "Un message ne peut pas être transféré.", bundle: .main)
        default: nil
        }
    }

    /// Ce qui n’est pas encore livré, les appareils, la bascule.
    private var limitText: String? {
        switch self {
        case .noOfflineSending:
            String(localized: "conversation.encryption.fact.noOfflineSending", defaultValue: "Hors connexion, un message n’est pas mis en attente : renvoyez-le une fois connecté.", bundle: .main)
        case .notYetPlacesAndStickers:
            String(localized: "conversation.encryption.fact.notYetPlacesAndStickers", defaultValue: "Lieux, fiches de contact et stickers ne peuvent pas encore être envoyés.", bundle: .main)
        case .notYetDecryptedNotifications:
            String(localized: "conversation.encryption.fact.notYetDecryptedNotifications", defaultValue: "Le déchiffrement des notifications sur l’appareil, pour en afficher le texte, n’est pas encore disponible.", bundle: .main)
        case .notYetGroups:
            String(localized: "conversation.encryption.fact.notYetGroups", defaultValue: "Le chiffrement de bout en bout des groupes n’est pas encore disponible dans l’application.", bundle: .main)
        case .groupSendingUnavailable:
            String(localized: "conversation.encryption.fact.groupSendingUnavailable", defaultValue: "Dans ce groupe, l’application ne peut pas encore envoyer de message chiffré.", bundle: .main)
        case .notYetSafetyNumbers:
            String(localized: "conversation.encryption.fact.notYetSafetyNumbers", defaultValue: "La vérification des numéros de sécurité avec vos contacts n’est pas encore disponible.", bundle: .main)
        case .oneKeyPerDevice:
            String(localized: "conversation.encryption.fact.oneKeyPerDevice", defaultValue: "Chaque appareil a sa propre clé, qui ne le quitte jamais.", bundle: .main)
        case .deviceLimit:
            String(localized: "conversation.encryption.fact.deviceLimit", defaultValue: "Votre compte peut avoir jusqu’à 16 appareils chiffrés. Au-delà, l’application vous propose d’en retirer un ; un appareil retiré ne lit plus les nouveaux messages chiffrés.", bundle: .main)
        case .restoredDeviceIsNew:
            String(localized: "conversation.encryption.fact.restoredDeviceIsNew", defaultValue: "Un appareil réinstallé ou restauré compte comme un nouvel appareil : il ne lit pas les messages chiffrés reçus avant.", bundle: .main)
        case .whoMayToggle:
            String(localized: "conversation.encryption.fact.whoMayToggle", defaultValue: "Pendant la phase de test, seuls les membres de la conversation qui ont un rôle d’équipe Meeshy (analyste ou plus) peuvent activer ou désactiver le chiffrement ; dans un groupe, il faut aussi en être modérateur.", bundle: .main)
        case .switchKeepsHistory:
            String(localized: "conversation.encryption.fact.switchKeepsHistory", defaultValue: "Une bascule ne change que les nouveaux messages : ceux déjà chiffrés de bout en bout le restent, lisibles sur les appareils qui les ont reçus.", bundle: .main)
        case .switchIsShownInThread:
            String(localized: "conversation.encryption.fact.switchIsShownInThread", defaultValue: "Chaque activation ou désactivation s’affiche dans le fil, pour tous les membres.", bundle: .main)
        default: permanenceText
        }
    }

    /// Le bout en bout ne se désactive pas (#12949).
    private var permanenceText: String? {
        switch self {
        case .endToEndIsFinal:
            String(localized: "conversation.encryption.fact.endToEndIsFinal", defaultValue: "Une fois activé, le chiffrement de bout en bout ne se désactive plus.", bundle: .main)
        case .endToEndNeverTurnedOff:
            String(localized: "conversation.encryption.fact.endToEndNeverTurnedOff", defaultValue: "Le chiffrement de bout en bout ne se désactive pas. Pour échanger en clair, créez une nouvelle conversation.", bundle: .main)
        case .endToEndNeverTurnedOffDirect:
            String(localized: "conversation.encryption.fact.endToEndNeverTurnedOffDirect", defaultValue: "Le chiffrement de bout en bout ne se désactive pas : ce tête-à-tête reste chiffré. Pour échanger en clair avec cette personne, ouvrez une conversation non chiffrée à côté : les deux sont dans la liste, celle-ci marquée d’un cadenas.", bundle: .main)
        case .serverCannotTurnItOff:
            String(localized: "conversation.encryption.fact.serverCannotTurnItOff", defaultValue: "Sur cet appareil, une fois cette conversation vue chiffrée de bout en bout, votre compte n’y écrit plus jamais en clair, même si le serveur la présentait ensuite autrement.", bundle: .main)
        default: attachmentTradeOffText
        }
    }

    /// Ce que le bout en bout retire aux pièces jointes (#10789).
    private var attachmentTradeOffText: String? {
        switch self {
        case .voiceTranslatedAsTextOnDevice:
            String(localized: "conversation.encryption.fact.voiceTranslatedAsTextOnDevice", defaultValue: "Un message vocal se traduit en texte sur votre appareil : il n’a pas de version traduite avec la voix clonée.", bundle: .main)
        case .noLockScreenMediaPreview:
            String(localized: "conversation.encryption.fact.noLockScreenMediaPreview", defaultValue: "Sur l’écran verrouillé, une notification n’affiche ni photo, ni vidéo, ni extrait de vocal.", bundle: .main)
        case .noWebPlayback:
            String(localized: "conversation.encryption.fact.noWebPlayback", defaultValue: "Sur le web, une pièce jointe chiffrée ne s’ouvre pas : ouvrez-la dans l’application.", bundle: .main)
        case .noServerModeration:
            String(localized: "conversation.encryption.fact.noServerModeration", defaultValue: "Le serveur ne peut pas modérer ce qui s’échange ici : seul un participant peut signaler un message.", bundle: .main)
        default: nil
        }
    }
}
