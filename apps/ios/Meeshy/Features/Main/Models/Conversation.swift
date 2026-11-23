// Models previously defined here (ConversationTag, ConversationSection, Conversation, Community)
// are now sourced from MeeshySDK/Models/CoreModels.swift to avoid type ambiguity.
// Typealiases provide backward-compatible short names for the app layer.

import MeeshySDK

typealias Conversation = MeeshyConversation
typealias ConversationTag = MeeshyConversationTag
typealias ConversationSection = MeeshyConversationSection
typealias Community = MeeshyCommunity

extension MeeshyConversation {

    /// Greffe les métadonnées que `conversation:updated` porte, champ absent ⇒
    /// valeur gardée. Mutée sur une COPIE puis reposée d'un coup par l'appelant :
    /// `conversations` a un `didSet` qui diffe tout le tableau, une écriture par
    /// champ le payait huit fois.
    ///
    /// Un DM n'est jamais renommable : son `title` client est le nom du
    /// participant, dérivé à la conversion REST (`toConversation` écarte le
    /// titre DB). Le payload socket porte le titre BRUT — le greffer sur un DM
    /// écrase le nom affiché (« sandra raveloson » → « Sany » au premier
    /// pin/mute).
    mutating func applyMetadata(from event: ConversationUpdatedEvent) {
        if let title = event.title, type != .direct { self.title = title }
        if let description = event.description { self.description = description }
        if let avatar = event.avatar { self.avatar = avatar }
        if let banner = event.banner { self.banner = banner }
        if let isAnnouncement = event.isAnnouncementChannel { isAnnouncementChannel = isAnnouncement }
        if let writeRole = event.defaultWriteRole { defaultWriteRole = writeRole }
        if let slowMode = event.slowModeSeconds { slowModeSeconds = slowMode }
        if let autoTranslate = event.autoTranslateEnabled { autoTranslateEnabled = autoTranslate }
    }

    /// Appliquée AU MÊME TITRE que l'aperçu, et au même endroit : la paire du
    /// Prisme doit rester cohérente, sinon on recrée le mélange exact que le
    /// tri-état sert à empêcher — texte neuf, carte de l'ancien, et le
    /// résolveur qui préfère la carte. C'est le cas de l'ÉDITION : même
    /// `lastMessageId`, horodatage ÉGAL, contenu changé, `translations: null`
    /// reçu. `.replaced([:])` → `nil` : le résolveur distingue « pas de carte »
    /// d'une carte vide.
    ///
    /// L'horodatage suit l'aperçu quand celui-ci RECULE sur un recalcul
    /// autoritatif du serveur (supprimer le dernier message POUR TOUS fait
    /// redescendre la ligne sur le précédent) ; sans cela la ligne affichait le
    /// bon texte au mauvais rang jusqu'à la synchro suivante. Réservé au
    /// drapeau `previewRecalculated` : sans lui, un horodatage qui recule décrit
    /// une diffusion arrivée dans le désordre et reste ignoré — raison d'être
    /// du `>` strict de l'appelant. Pas de re-tri explicite : les sections
    /// trient à la construction (`conversationsAreInOrder`).
    mutating func applyLastMessagePrismAndClock(
        from event: ConversationUpdatedEvent,
        replacedPrism: (map: [String: String], originalLanguage: String?)?
    ) {
        if let prism = replacedPrism {
            lastMessageTranslations = prism.map.isEmpty ? nil : prism.map
            lastMessageOriginalLanguage = prism.originalLanguage
        }
        if event.previewRecalculated, let recalculatedAt = event.lastMessageAt {
            lastMessageAt = recalculatedAt
        }
    }
}
