// Message, MessageAttachment, Reaction, ReactionSummary, ChatMessage, MessageReaction
// are now sourced from MeeshySDK/Models/CoreModels.swift to avoid type ambiguity.
// ReplyReference and ForwardReference are also in the SDK.
// Typealiases provide backward-compatible short names for the app layer.

import MeeshySDK

typealias Message = MeeshyMessage
typealias MessageAttachment = MeeshyMessageAttachment
typealias Reaction = MeeshyReaction
typealias ReactionSummary = MeeshyReactionSummary
typealias ChatMessage = MeeshyChatMessage
typealias MessageReaction = MeeshyMessageReaction

/// Une SORTIE : un geste qui emporte le contenu d'un message hors de la bulle
/// qui le porte.
nonisolated enum MessageExit: String, CaseIterable, Sendable {
    /// Transférer dans une autre conversation.
    case forward
    /// Copier dans le presse-papiers.
    case copy
    /// Enregistrer dans Photos ou Fichiers, à la main ou automatiquement.
    case save
    /// Partager hors de Meeshy (feuille de partage système, AirDrop).
    case share
    /// « Imager » et « Imager la discussion ».
    case imagine
    /// Composer ou publier en post, réel ou story.
    case publish
}

/// **Ce qu'un message laisse sortir — LA projection de la loi de sortie côté
/// application** (#9573).
///
/// La loi (`ContentExitLaw`, miroir de `@meeshy/shared`) juge la nature de
/// disparition ; le flou et le chiffrement gardent leurs propres restrictions.
/// Cette projection les COMPOSE, une fois, et tout site qui offre une sortie —
/// menu d'appui long, feuille « Plus », rangée rapide, balayage, sélection
/// multiple, visionneuses, enregistrement automatique, « Imager », feuille de
/// transfert, publication — la LIT. Aucun ne relit un drapeau.
///
/// | nature | transférer | copier, enregistrer, partager, imager, publier |
/// |---|---|---|
/// | ordinaire | oui | oui |
/// | flamme à durée | oui, durée ≤ source | non |
/// | flamme après lecture, vue unique | non | non |
///
/// Un message FLOUTÉ ne laisse rien sortir (#8009) ; un message CHIFFRÉ ne se
/// publie pas. Le serveur fait foi et refusera ; un bouton que cette projection
/// n'offre pas n'est pas rendu.
nonisolated struct MessageExitOffer: Equatable, Sendable {
    let law: ContentExitLaw
    /// Le message ou l'une de ses pièces est flouté.
    let holdsBlur: Bool
    /// Le message ou l'une de ses pièces est chiffré.
    let isEncrypted: Bool

    static let unrestricted = MessageExitOffer(law: .ordinary, holdsBlur: false, isEncrypted: false)

    var nature: ContentExitLaw.Nature { law.nature }

    /// Le verdict de capture d'écran, tel que la loi le rend — consommé par
    /// l'anti-capture (#9574).
    var capture: ContentExitLaw.CaptureVerdict { law.capture }

    func offers(_ exit: MessageExit) -> Bool {
        guard !holdsBlur else { return false }
        switch exit {
        case .forward: return law.forward.isAllowed
        case .copy, .save, .share, .imagine: return law.exportable
        case .publish: return law.exportable && !isEncrypted
        }
    }

    /// Une sélection multiple se transfère-t-elle ? Un seul message non
    /// transférable retire l'action — le lot partirait amputé.
    static func selectionOffersForward(_ messages: [Message]) -> Bool {
        messages.allSatisfy { $0.exitOffer.offers(.forward) }
    }

    /// Le verdict de transfert d'un LOT, celui que la feuille de transfert lit
    /// pour sa rangée de durée (`ContentExitLaw.ForwardVerdict.batch`).
    static func batchForwardVerdict(_ messages: [Message]) -> ContentExitLaw.ForwardVerdict {
        guard selectionOffersForward(messages) else { return .refused(.afterRead) }
        return .batch(messages.map(\.contentExitLaw.forward))
    }

    /// Les pièces qu'une visionneuse peut laisser sortir, parmi ces messages :
    /// seules celles d'un message qui offre l'enregistrement. Une pièce absente
    /// de la liste ne sort pas.
    static func mediaExitGate(for messages: [Message]) -> ContentExitGate {
        .only(Set(messages.filter { $0.exitOffer.offers(.save) }.flatMap { $0.attachments.map(\.id) }))
    }

    /// Les pièces qu'une visionneuse rend dans la couche sécurisée (#9574) :
    /// toutes, SAUF celles d'un message dont la capture est libre. Une pièce
    /// dont le porteur est inconnu est protégée.
    static func captureShieldScope(for messages: [Message]) -> CaptureShieldScope {
        .allExcept(Set(messages.filter { $0.exitOffer.capture == .free }.flatMap { $0.attachments.map(\.id) }))
    }
}

/// **Ce que la feuille de transfert offre pour ce lot** (#9573) — lue une fois
/// par la feuille, pour sa rangée de durée, ses pilules de publication et
/// « Imager la discussion ».
nonisolated struct ForwardSheetOffer: Equatable, Sendable {
    /// Le verdict de transfert du lot ENTIER — sa borne de durée est celle de
    /// la plus longue flamme, chaque message restant ramené à la sienne.
    let forward: ContentExitLaw.ForwardVerdict
    /// Le message désigné peut-il être publié ou composé ?
    let publishes: Bool
    /// « Imager la discussion » s'offre-t-il depuis ce message ?
    let imaginesDiscussion: Bool

    init(message: Message, additionalMessages: [Message] = []) {
        forward = MessageExitOffer.batchForwardVerdict([message] + additionalMessages)
        let offer = message.exitOffer
        publishes = offer.offers(.publish)
        imaginesDiscussion = offer.offers(.imagine)
    }

    /// Les durées de la rangée — vide : aucune rangée (lot sans flamme à durée).
    var durationChoices: [ForwardDurationChoice] { forward.durationChoices }

    /// La durée SÉLECTIONNÉE dans la rangée : le choix de l'utilisateur s'il
    /// fait partie des choix offerts, sinon celle de la source.
    func selectedDuration(chosen: Int?) -> Int? {
        guard let chosen, durationChoices.contains(where: { $0.seconds == chosen }) else {
            return forward.defaultDurationSeconds
        }
        return chosen
    }
}

extension Message {
    /// La projection de la loi de sortie pour ce message — voir `MessageExitOffer`.
    nonisolated var exitOffer: MessageExitOffer {
        MessageExitOffer(
            law: contentExitLaw,
            holdsBlur: holdsBlur,
            isEncrypted: isEncrypted || attachments.contains { $0.isEncrypted }
        )
    }

    /// Ce que les visionneuses de CE message peuvent laisser sortir.
    nonisolated var exitGate: ContentExitGate { exitOffer.offers(.save) ? .open : .sealed }

    /// « Ce message peut-il être transféré ? » — projection de la loi de sortie
    /// (`exitOffer`). Le serveur refuse une vue unique, une flamme après
    /// lecture et un éphémère sans durée lisible (`forwardAdmission`) : offrir
    /// l'action condamnerait l'utilisateur à un échec.
    nonisolated var isForwardable: Bool { exitOffer.offers(.forward) }

    /// Le message est-il FLOUTÉ, au niveau du message ou d'une de ses pièces
    /// (#8009) ? Son appui long ne laisse sortir aucun contenu : ni copie, ni
    /// traduction, ni transfert, ni enregistrement, et son aperçu reste flou.
    nonisolated var holdsBlur: Bool { isBlurred || attachments.contains { $0.isBlurred } }
}
