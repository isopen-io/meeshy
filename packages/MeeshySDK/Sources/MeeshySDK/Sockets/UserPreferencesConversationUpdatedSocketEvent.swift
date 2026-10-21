import Foundation

// Extrait de `MessageSocketManager.swift` (hors budget, #10631) : le fichier ne
// reçoit plus de champ, la charge du scope conversation vit chez elle.

/// `user:preferences-updated` — **conversation scope**. Mirrors the gateway's
/// `UserPreferencesConversationUpdatedEventData` (versioned per-conversation
/// preferences). The same socket event name also carries a flat **category
/// scope** (`{ userId, category }`) decoded by `UserPreferencesUpdatedEvent`;
/// the decode site discriminates on the presence of `conversationId`.
///
/// `version` drives optimistic-vs-socket resolution in `ConversationStore`
/// (drop when `version <= local`). `reset == true` (DELETE) carries
/// `preferences == nil` — the client restores its local defaults.
public struct UserPreferencesConversationUpdatedSocketEvent: Decodable, Sendable {
    public struct Preferences: Decodable, Sendable {
        public let isPinned: Bool
        public let isMuted: Bool
        public let mentionsOnly: Bool
        public let isArchived: Bool
        public let tags: [String]
        public let categoryId: String?
        public let orderInCategory: Int?
        public let customName: String?
        public let reaction: String?
        public let deletedForUserAt: Date?
        public let clearHistoryBefore: Date?
        /// `ReadingModePreference` (raw : `auto|focal|script|resume|riviere`) —
        /// G-124, champ requis du payload gelé `ConversationPreferencesPayload`
        /// (`packages/shared/types/socketio-events.ts`, « payload complet »,
        /// jamais omis par le gateway sur ce scope). Décodé en `String` brute
        /// ici (pas `ReadingModeOrchestrator.ReadingModePreference` — ce type
        /// vit dans l'app, `MeeshySDK` ne le connaît pas) ; l'app-level
        /// consommateur (`ConversationStoreSocketBridge`
        /// `.onReadingModePreferenceChanged`) fait le `RawRepresentable` sur
        /// SES 5 cas gelés, une valeur inconnue y rendant simplement `nil`.
        ///
        /// Défaut `"auto"` dans l'init memberwise ci-dessous UNIQUEMENT pour
        /// les call sites de test antérieurs à G-124 (le décodage JSON, lui,
        /// exige TOUJOURS la clé — le champ n'est pas optionnel sur le fil).
        public let readingMode: String
        /// Fond + accent personnels (#10631) — additif : absent d'un ancien serveur.
        public let appearance: ConversationAppearance?

        public init(
            isPinned: Bool, isMuted: Bool, mentionsOnly: Bool, isArchived: Bool,
            tags: [String], categoryId: String?, orderInCategory: Int?,
            customName: String?, reaction: String?,
            deletedForUserAt: Date?, clearHistoryBefore: Date?,
            readingMode: String = "auto",
            appearance: ConversationAppearance? = nil
        ) {
            self.appearance = appearance
            self.isPinned = isPinned; self.isMuted = isMuted
            self.mentionsOnly = mentionsOnly; self.isArchived = isArchived
            self.tags = tags; self.categoryId = categoryId; self.orderInCategory = orderInCategory
            self.customName = customName; self.reaction = reaction
            self.deletedForUserAt = deletedForUserAt; self.clearHistoryBefore = clearHistoryBefore
            self.readingMode = readingMode
        }
    }
    public let userId: String
    public let conversationId: String
    public let version: Int
    public let reset: Bool
    public let preferences: Preferences?
}
