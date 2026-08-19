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

extension Message {
    /// Prédicat UNIQUE « ce message peut-il être transféré ? » (spec
    /// 2026-08-19, Volet A.2). Le serveur refuse le transfert d'une vue unique
    /// (`forwardAdmission` → `view-once-not-forwardable`) : offrir l'action
    /// condamnerait l'utilisateur à un échec muet.
    ///
    /// Règle PRODUIT (donc app, pas SDK) qui vivait ré-encodée en six points
    /// d'UI — résolveur d'actions, feuille « Plus… », menu d'appui-long,
    /// swipe-to-forward, rangée quick-reaction, dialogue média. Elle se nomme
    /// ici, une fois ; tout site d'UI la LIT, aucun ne la redit.
    nonisolated var isForwardable: Bool { !isViewOnce }
}
