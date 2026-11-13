import Foundation
import MeeshyUI

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
            String(localized: "conversation.encryption.topic.switching", defaultValue: "Changer de mode", bundle: .main)
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
        case .notYetAttachments: "paperclip"
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
        }
    }

    var text: String { readingText ?? limitText ?? "" }

    /// Qui lit, ce qui fonctionne, ce qui manque.
    private var readingText: String? {
        switch self {
        case .transitProtected:
            String(localized: "conversation.encryption.fact.transitProtected", defaultValue: "Entre votre appareil et le serveur, les messages voyagent toujours protégés.", bundle: .main)
        case .storedWithoutEncryption:
            String(localized: "conversation.encryption.fact.storedWithoutEncryption", defaultValue: "Ses messages sont stockés sans chiffrement.", bundle: .main)
        case .encryptedOnServerServerReads:
            String(localized: "conversation.encryption.fact.encryptedOnServerServerReads", defaultValue: "Vos messages sont chiffrés sur nos serveurs. Traduction, transcription et recherche fonctionnent.", bundle: .main)
        case .hybridIsServerToday:
            String(localized: "conversation.encryption.fact.hybridIsServerToday", defaultValue: "Le mode hybride n’est pas du bout en bout : nos serveurs lisent les messages pour la traduction et la recherche.", bundle: .main)
        case .onlyParticipantsRead:
            String(localized: "conversation.encryption.fact.onlyParticipantsRead", defaultValue: "Seuls vos appareils et ceux des participants lisent les messages.", bundle: .main)
        case .everyServerFeature:
            String(localized: "conversation.encryption.fact.everyServerFeature", defaultValue: "Toutes les fonctions sont disponibles : traduction automatique, transcription des vocaux, aperçu des notifications, recherche.", bundle: .main)
        case .translatedOnDevice:
            String(localized: "conversation.encryption.fact.translatedOnDevice", defaultValue: "La traduction automatique se fait sur votre appareil, jamais sur le serveur.", bundle: .main)
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
        case .notYetAttachments:
            String(localized: "conversation.encryption.fact.notYetAttachments", defaultValue: "Photos, vidéos, fichiers, vocaux, lieux et stickers ne peuvent pas encore être envoyés.", bundle: .main)
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
            String(localized: "conversation.encryption.fact.whoMayToggle", defaultValue: "Pendant la phase de test, seuls les membres de la conversation qui ont un rôle d’équipe Meeshy (analyste ou plus) peuvent changer de mode ; dans un groupe, il faut aussi en être modérateur. Le chiffrement ne se désactive pas.", bundle: .main)
        case .switchKeepsHistory:
            String(localized: "conversation.encryption.fact.switchKeepsHistory", defaultValue: "Une bascule ne change que les nouveaux messages : ceux déjà chiffrés de bout en bout le restent, lisibles sur les appareils qui les ont reçus.", bundle: .main)
        case .switchIsShownInThread:
            String(localized: "conversation.encryption.fact.switchIsShownInThread", defaultValue: "Chaque changement de mode s’affiche dans le fil, pour tous les membres.", bundle: .main)
        default: permanenceText
        }
    }

    /// Le bout en bout ne se désactive pas (#12949).
    private var permanenceText: String? {
        switch self {
        case .endToEndIsFinal:
            String(localized: "conversation.encryption.fact.endToEndIsFinal", defaultValue: "Une fois activé, le chiffrement de bout en bout ne se désactive plus.", bundle: .main)
        case .endToEndNeverTurnedOff:
            String(localized: "conversation.encryption.fact.endToEndNeverTurnedOff", defaultValue: "Le chiffrement de bout en bout ne se désactive jamais.", bundle: .main)
        case .endToEndNeverTurnedOffDirect:
            String(localized: "conversation.encryption.fact.endToEndNeverTurnedOffDirect", defaultValue: "Le chiffrement de bout en bout ne se désactive jamais : ce tête-à-tête le reste.", bundle: .main)
        case .serverCannotTurnItOff:
            String(localized: "conversation.encryption.fact.serverCannotTurnItOff", defaultValue: "Vue chiffrée de bout en bout, elle ne s’écrit plus jamais en clair ici.", bundle: .main)
        default: nil
        }
    }
}

/// Les (i) de la fiche Chiffrement (épure #18078) : la phrase d'état reste LISIBLE au repos, le détail
/// secondaire passe derrière un (i) dont le nom est la QUESTION à laquelle la note répond.
extension ConversationEncryptionExplanation.Fact {
    var note: MeeshyInfoNote? {
        switch self {
        case .hybridIsServerToday:
            MeeshyInfoNote(
                question: String(localized: "conversation.encryption.note.hybridLayer.question", defaultValue: "Que vérifie la seconde couche ?", bundle: .main),
                text: String(localized: "conversation.encryption.note.hybridLayer.text", defaultValue: "Entre deux appareils compatibles, une seconde couche permet en plus de vérifier qu’un message texte n’a pas été modifié en chemin ; quand elle manque, rien n’est présenté comme vérifié.", bundle: .main)
            )
        case .endToEndNeverTurnedOff:
            ConversationEncryptionRevertNote.note(direct: false)
        case .endToEndNeverTurnedOffDirect:
            ConversationEncryptionRevertNote.note(direct: true)
        case .serverCannotTurnItOff:
            MeeshyInfoNote(
                question: String(localized: "conversation.encryption.note.serverSays.question", defaultValue: "Et si le serveur dit le contraire ?", bundle: .main),
                text: String(localized: "conversation.encryption.note.serverSays.text", defaultValue: "Même si le serveur la présentait ensuite autrement, votre compte n’y écrit plus sans chiffrement de bout en bout depuis cet appareil.", bundle: .main)
            )
        case .oneKeyPerDevice:
            MeeshyInfoNote(
                question: String(localized: "conversation.encryption.note.devices.question", defaultValue: "Que devient un appareil retiré ou réinstallé ?", bundle: .main),
                text: joinedNoteText()
            )
        case .switchKeepsHistory:
            MeeshyInfoNote(
                question: String(localized: "conversation.encryption.note.whoMayToggle.question", defaultValue: "Qui peut changer de mode ?", bundle: .main),
                text: joinedNoteText()
            )
        default:
            nil
        }
    }

    private func joinedNoteText() -> String {
        ConversationEncryptionExplanation.noteFacts(of: self).map(\.text).joined(separator: " ")
    }
}

/// « Et si je veux revenir sans chiffrement ? » : la seconde phrase du pied « ne se désactive jamais », la même
/// derrière le pied de création, le pied d'activation, l'écart servi et le fait « Définitif » de la fiche.
enum ConversationEncryptionRevertNote {
    static var question: String {
        String(localized: "conversation.encryption.note.revert.question", defaultValue: "Et si je veux revenir sans chiffrement ?", bundle: .main)
    }

    static func note(direct: Bool = false) -> MeeshyInfoNote {
        let text = direct
            ? String(localized: "conversation.encryption.note.revertDirect.text", defaultValue: "Vous pourrez toujours ouvrir à côté une autre conversation, sans chiffrement de bout en bout, avec cette personne : les deux sont dans la liste, celle-ci marquée d’un cadenas.", bundle: .main)
            : String(localized: "conversation.encryption.note.revert.text", defaultValue: "Vous pourrez toujours ouvrir une autre conversation, sans chiffrement de bout en bout, avec les mêmes personnes.", bundle: .main)
        return MeeshyInfoNote(question: question, text: text)
    }
}
