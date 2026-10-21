// Message, MessageAttachment, Reaction, ReactionSummary, ChatMessage, MessageReaction
// are now sourced from MeeshySDK/Models/CoreModels.swift to avoid type ambiguity.
// ReplyReference and ForwardReference are also in the SDK.
// Typealiases provide backward-compatible short names for the app layer.

import MeeshySDK

// Les alias courts (`Message`, `MessageAttachment`…) vivent dans
// `MessageAliases.swift`, compilé aussi dans l'extension de partage.

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
/// | chiffré de bout en bout | non | oui (jamais publier) |
/// | flamme à durée | oui, durée ≤ source | non |
/// | flamme après lecture, vue unique | non | non |
///
/// Un message FLOUTÉ se transfère, flou hérité, et ne laisse rien d'autre sortir
/// (#8009, D8 du 2026-10-18) ; un message CHIFFRÉ ne se
/// publie pas. Un message qui CITE un contenu protégé ne s'image pas (décision
/// porteur du 2026-10-08) : citer reste permis, le reste de ses sorties suit sa
/// propre nature. Le serveur fait foi et refusera ; un bouton que cette
/// projection n'offre pas n'est pas rendu.
nonisolated struct MessageExitOffer: Equatable, Sendable {
    let law: ContentExitLaw
    /// Le message ou l'une de ses pièces est flouté.
    let holdsBlur: Bool
    /// Le message ou l'une de ses pièces est chiffré.
    let isEncrypted: Bool
    /// Le message cite un contenu protégé — flamme, flamme après lecture, vue
    /// unique, flou, ou citation dont la nature ne se lit pas
    /// (`MeeshyMessage.quotesProtectedContent`).
    let quotesProtectedContent: Bool

    init(law: ContentExitLaw, holdsBlur: Bool, isEncrypted: Bool, quotesProtectedContent: Bool = false) {
        self.law = law
        self.holdsBlur = holdsBlur
        self.isEncrypted = isEncrypted
        self.quotesProtectedContent = quotesProtectedContent
    }

    static let unrestricted = MessageExitOffer(law: .ordinary, holdsBlur: false, isEncrypted: false)

    var nature: ContentExitLaw.Nature { law.nature }

    /// Le verdict de capture d'écran, tel que la loi le rend : `blocked` (vue
    /// unique) se rend dans la couche sécurisée (#9574), `announced` (les deux
    /// flammes) reste capturable et se déclare (#9617), `free` ne fait rien.
    var capture: ContentExitLaw.CaptureVerdict { law.capture }

    func offers(_ exit: MessageExit) -> Bool {
        // D8 (#10949, porteur 2026-10-18) : un flouté se TRANSFÈRE, son flou
        // hérité par la copie (la passerelle l'impose) ; rien d'autre ne sort.
        // E2EE ⇒ pas de transfert (`MessageActionPolicy.forward`) : le texte déchiffré
        // sur l'appareil partirait EN CLAIR vers le serveur et la cible. Une seule
        // loi pour toutes les portes (menu, Plus…, glissé, double toucher, sélection).
        if exit == .forward { return law.forward.isAllowed && !isEncrypted }
        guard !holdsBlur else { return false }
        switch exit {
        case .forward: return law.forward.isAllowed && !isEncrypted
        case .copy, .save, .share: return law.exportable
        case .imagine: return law.exportable && !quotesProtectedContent
        case .publish: return law.exportable && !isEncrypted
        }
    }

    /// Une sélection multiple se transfère-t-elle ? Oui dès qu'UN message sort
    /// (D6, #10949) : l'écran de partage retire le protégé avec son motif et
    /// envoie le reste. Une sélection où rien ne sort ne rend pas l'action.
    static func selectionOffersForward(_ messages: [Message]) -> Bool {
        messages.isEmpty || messages.contains { $0.exitOffer.offers(.forward) }
    }

    /// Les pièces qu'une visionneuse peut laisser sortir, parmi ces messages :
    /// seules celles d'un message qui offre l'enregistrement. Une pièce absente
    /// de la liste ne sort pas.
    static func mediaExitGate(for messages: [Message]) -> ContentExitGate {
        .only(Set(messages.filter { $0.exitOffer.offers(.save) }.flatMap { $0.attachments.map(\.id) }))
    }

    /// Les pièces qu'une visionneuse rend dans la couche sécurisée (#9574,
    /// #9617) : toutes, SAUF celles d'un message que la règle « annoncé OU
    /// noir » laisse en clair — une flamme seulement si la visionneuse
    /// ANNONCE sa capture (`surfaceAnnounces`, fermé par défaut). Une pièce
    /// dont le porteur est inconnu est protégée.
    static func captureShieldScope(for messages: [Message], surfaceAnnounces: Bool = false) -> CaptureShieldScope {
        .allExcept(Set(messages.filter { !ContentCaptureVisibility.renderedVerdict(for: $0).shieldsCapture(surfaceAnnounces: surfaceAnnounces) }
            .flatMap { $0.attachments.map(\.id) }))
    }
}

extension Message {
    /// La projection de la loi de sortie pour ce message — voir `MessageExitOffer`.
    nonisolated var exitOffer: MessageExitOffer {
        MessageExitOffer(
            law: contentExitLaw,
            holdsBlur: holdsBlur,
            isEncrypted: isEncrypted || attachments.contains { $0.isEncrypted },
            quotesProtectedContent: quotesProtectedContent
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

// MARK: - Ce qu'un aperçu dit d'un message HORS de sa conversation (#9622)

/// **Le texte d'un message qui disparaît ne quitte pas sa conversation** — loi
/// de sortie (#9572) appliquée aux aperçus publiés AILLEURS : l'écran d'accueil
/// (widget, App Group), un résultat de recherche. Hors de la conversation,
/// aucune couche sécurisée ne s'applique, et un widget garde son texte tant
/// qu'il n'est pas rafraîchi — donc après la destruction du message. Le serveur
/// sert déjà un libellé pour la vue unique et la flamme après lecture, mais le
/// TEXTE d'une flamme à durée (#7451) : la nature, lue sur le dernier message,
/// décide ici pour les trois, en un seul site.
nonisolated enum OutsidePreview {

    /// Le libellé qui remplace le texte d'un contenu qui disparaît ; `nil` pour
    /// un contenu ordinaire.
    static func protectionLabel(for nature: ContentExitLaw.Nature) -> String? {
        switch nature {
        case .ordinary: return nil
        case .viewOnce: return String(localized: "protection.viewOnce", bundle: .main)
        case .afterReadFlame: return String(localized: "protection.afterRead", bundle: .main)
        case .timedFlame: return String(localized: "exit.preview.ephemeral", defaultValue: "Message éphémère", bundle: .main)
        }
    }

    /// L'aperçu du dernier message d'une conversation, tel qu'il peut sortir :
    /// le libellé de protection pour un contenu qui disparaît, sinon l'aperçu
    /// résolu par le Prisme (`resolvedLastMessagePreview`).
    static func lastMessage(of conversation: MeeshyConversation, preferredLanguages: [String]) -> String? {
        protectionLabel(for: conversation.lastMessageContentExitLaw.nature)
            ?? conversation.resolvedLastMessagePreview(preferredLanguages: preferredLanguages)
    }
}
