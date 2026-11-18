import Foundation

/// Unified per-user state attached to a `MeeshyConversation`.
///
/// Source of truth for everything the gateway returns under
/// `UserConversationPreferences` plus client-only flags (lock, draft) and
/// the sync metadata used by `ConversationStore` (Phase 4) to resolve
/// optimistic updates against socket broadcasts.
///
/// Wire format compatibility: this struct is **flat-encoded** by
/// `MeeshyConversation` (its fields appear as top-level keys in the
/// conversation JSON). That preserves backward compatibility with
/// `/conversations` responses and existing GRDB cache rows while letting
/// the in-memory representation be a single cohesive value.
///
/// See `docs/superpowers/specs/2026-05-22-conversation-user-state-unification-design.md` §4.1.
public struct ConversationUserState: Codable, Hashable, Sendable {
    // MARK: - Read state

    public var unreadCount: Int
    public var lastReadAt: Date?
    public var lastDeliveredAt: Date?
    /// Dernier message lu par le lecteur (#7198/#7222) — le curseur SERVEUR,
    /// distinct de `lastReadAt` (l'horloge de l'ACTION de lecture) : c'est lui
    /// que `FirstUnreadBoundary.resolve` EXCLUT explicitement des candidats
    /// (défense contre un décalage d'horloge entre le curseur et la fenêtre
    /// chargée). `nil` sans curseur connu — jamais fabriqué.
    public var lastReadMessageId: String?
    /// `createdAt` de `lastReadMessageId` — la clé CHRONOLOGIQUE du curseur,
    /// rang 1 de `FirstUnreadBoundary.resolve` (avant `lastReadAt`, avant
    /// `joinedAt`). Servie par G1 (`packages/shared/utils/first-unread.ts`
    /// doc-comment, § rangs) — voir son doc-comment pour la loi complète.
    public var lastReadMessageCreatedAt: Date?

    // MARK: - Notification preferences

    public var isPinned: Bool
    public var isMuted: Bool
    public var mentionsOnly: Bool

    // MARK: - Visibility & lifecycle

    public var isArchived: Bool
    /// Soft-delete timestamp. `nil` = visible.
    public var deletedForUserAt: Date?
    /// Hide all messages before this point (clear-history feature).
    public var clearHistoryBefore: Date?

    // MARK: - Personal display

    public var customName: String?
    public var reaction: String?
    /// Le fond et l'accent PERSONNELS de la conversation (#10631). `nil` =
    /// Signature + accent calculé ; jamais partagé avec les autres membres.
    public var appearance: ConversationAppearance?
    /// User-defined free-form tags (matches the Prisma `String[]` shape).
    /// `MeeshyConversation.tags` (the existing `[MeeshyConversationTag]`
    /// field) remains a separate display-layer concern until Phase 6/7
    /// reconciles them.
    public var tags: [String]

    // MARK: - Organization

    /// Assigned category id (legacy field name `sectionId` is shimmed on
    /// `MeeshyConversation`).
    public var sectionId: String?
    public var orderInCategory: Int?

    // MARK: - Local-only (per-device, never synced)

    public var isLocked: Bool
    public var hasDraft: Bool
    public var draftPreview: String?

    // MARK: - Sync metadata

    /// Monotonic version emitted by the gateway on every
    /// `UserConversationPreferences` write. Used to gate stale broadcasts
    /// (`incoming.version <= local -> drop`).
    public var version: Int
    public var lastSyncedAt: Date?
    /// Number of outbox entries queued for this conversation. `> 0` means
    /// a write is in flight or waiting for retry; the row shows the
    /// "pending sync" UI affordance.
    public var pendingMutationCount: Int

    // MARK: - Init with defaults

    public init(
        unreadCount: Int = 0,
        lastReadAt: Date? = nil,
        lastDeliveredAt: Date? = nil,
        lastReadMessageId: String? = nil,
        lastReadMessageCreatedAt: Date? = nil,
        isPinned: Bool = false,
        isMuted: Bool = false,
        mentionsOnly: Bool = false,
        isArchived: Bool = false,
        deletedForUserAt: Date? = nil,
        clearHistoryBefore: Date? = nil,
        customName: String? = nil,
        reaction: String? = nil,
        appearance: ConversationAppearance? = nil,
        tags: [String] = [],
        sectionId: String? = nil,
        orderInCategory: Int? = nil,
        isLocked: Bool = false,
        hasDraft: Bool = false,
        draftPreview: String? = nil,
        version: Int = 0,
        lastSyncedAt: Date? = nil,
        pendingMutationCount: Int = 0
    ) {
        self.unreadCount = unreadCount
        self.lastReadAt = lastReadAt
        self.lastDeliveredAt = lastDeliveredAt
        self.lastReadMessageId = lastReadMessageId
        self.lastReadMessageCreatedAt = lastReadMessageCreatedAt
        self.isPinned = isPinned
        self.isMuted = isMuted
        self.mentionsOnly = mentionsOnly
        self.isArchived = isArchived
        self.deletedForUserAt = deletedForUserAt
        self.clearHistoryBefore = clearHistoryBefore
        self.customName = customName
        self.reaction = reaction
        self.appearance = appearance
        self.tags = tags
        self.sectionId = sectionId
        self.orderInCategory = orderInCategory
        self.isLocked = isLocked
        self.hasDraft = hasDraft
        self.draftPreview = draftPreview
        self.version = version
        self.lastSyncedAt = lastSyncedAt
        self.pendingMutationCount = pendingMutationCount
    }

    public static let defaults = ConversationUserState()

    // MARK: - Convenience

    public var hasUnreadIndicator: Bool { unreadCount > 0 }
    public var hasPendingSync: Bool { pendingMutationCount > 0 }
    public var isVisible: Bool { deletedForUserAt == nil && !isArchived }

    // MARK: - Version gating

    /// Greffe la moitié PRÉFÉRENCES de `self` sur `incoming`, dont la moitié
    /// LECTURE (`unreadCount`, `lastReadAt`, `lastDeliveredAt`) est conservée.
    ///
    /// `version` ne versionne QUE les préférences : ni `applyReadReceipt`, ni le
    /// zéro d'ouverture, ni le compteur servi par `conversation:unread-updated`
    /// ne le bumpent jamais (§9 du design). Préserver le `userState` local EN
    /// BLOC parce qu'une préférence est en vol figeait donc aussi le compteur —
    /// pastille gelée sur toute conversation épinglée, muette ou archivée, et
    /// définitivement, puisque rien ne rebaisse une version.
    ///
    /// La frontière de lecture locale n'a pas besoin d'être greffée ici : elle
    /// est monotone et `ConversationSyncEngine.reconcileUnread`, qui s'applique
    /// juste après chez les deux appelants, en reprend le MAX. La lui recopier
    /// ici ferait deux règles pour un seul fait.
    public func preferencesGrafted(onto incoming: ConversationUserState) -> ConversationUserState {
        var merged = incoming
        merged.isPinned = isPinned
        merged.isMuted = isMuted
        merged.mentionsOnly = mentionsOnly
        merged.isArchived = isArchived
        merged.deletedForUserAt = deletedForUserAt
        merged.clearHistoryBefore = clearHistoryBefore
        merged.customName = customName
        merged.reaction = reaction
        merged.appearance = appearance
        merged.tags = tags
        merged.sectionId = sectionId
        merged.orderInCategory = orderInCategory
        // Local-only, par appareil : un instantané serveur ne les porte jamais,
        // les prendre de `incoming` les effacerait à chaque rafraîchissement.
        merged.isLocked = isLocked
        merged.hasDraft = hasDraft
        merged.draftPreview = draftPreview
        // Les métadonnées de sync suivent la moitié qu'elles décrivent.
        merged.version = version
        merged.lastSyncedAt = lastSyncedAt
        merged.pendingMutationCount = pendingMutationCount
        return merged
    }

    /// Les préférences locales gagnent sur la ligne servie `incoming` quand elles sont plus récentes, OU quand un geste
    /// est encore en file sous une version non dépassée (#19307) : l'accusé d'un autre geste ramène la version à la
    /// valeur servie, et à version égale la ligne servie effaçait sinon le geste en file et les champs de l'appareil.
    func holdsLocalPreferences(over incoming: ConversationUserState) -> Bool {
        version > incoming.version || (pendingMutationCount > 0 && version >= incoming.version)
    }

    // MARK: - La ligne de conversation (#7198, #18925)

    /// Ce que la ligne de `GET /conversations` et `GET /conversations/:id` sert de l'état du lecteur, projeté
    /// après l'init memberwise de `APIConversation.toConversation` : la frontière de lecture, et les préférences
    /// que la diffusion `user:preferences-updated` porte déjà — version, ordre manuel, effacement d'historique
    /// (#18925). Une ligne synthétisée vaut la version 0 ; un serveur antérieur n'en sert rien, et rien n'est
    /// fabriqué.
    func servingRow(
        lastReadMessageId: String?, lastReadMessageCreatedAt: Date?, preferences: APIConversationPreferences?
    ) -> ConversationUserState {
        var served = self
        served.lastReadMessageId = lastReadMessageId
        served.lastReadMessageCreatedAt = lastReadMessageCreatedAt
        served.appearance = preferences?.appearance
        served.version = preferences?.version ?? 0
        served.orderInCategory = preferences?.orderInCategory
        served.clearHistoryBefore = preferences?.clearHistoryBefore
        return served
    }

    // MARK: - Served row (#18916)

    /// Adopte une ligne SERVIE par `/user-preferences/conversations` : les seuls
    /// champs que la route sert, et sa version.
    ///
    /// `deletedForUserAt` n'y est pas servi, et `clearHistoryBefore` ne l'est que
    /// depuis #18925 : un serveur antérieur l'omet, et `nil` ne distingue pas
    /// l'absent du « jamais effacé » — l'écrire d'ici rouvrirait un historique
    /// effacé. La lecture et les champs propres à l'appareil n'en viennent pas.
    /// Un booléen ou une liste absents gardent la valeur locale ; un champ
    /// NULLABLE servi `null` dit « aucun », comme sur la diffusion vive.
    func adoptingServed(_ served: APIConversationPreferences) -> ConversationUserState {
        var adopted = self
        adopted.isPinned = served.isPinned ?? isPinned
        adopted.isMuted = served.isMuted ?? isMuted
        adopted.mentionsOnly = served.mentionsOnly ?? mentionsOnly
        adopted.isArchived = served.isArchived ?? isArchived
        adopted.tags = served.tags ?? tags
        adopted.sectionId = served.categoryId
        adopted.orderInCategory = served.orderInCategory
        adopted.customName = served.customName
        adopted.reaction = served.reaction
        adopted.appearance = served.appearance
        adopted.version = served.version ?? version
        return adopted
    }

    /// L'accusé d'un geste : la ligne que l'adaptateur a relue après le PUT.
    ///
    /// Quand sa version a sauté par-dessus le candidat local, d'autres écritures
    /// ont eu lieu ailleurs pendant la coupure, et seule la ligne relue les
    /// porte : elle est adoptée. Sinon, seule la version l'est — l'état
    /// optimiste EST la ligne servie. Un autre geste encore en file garde son
    /// état optimiste : l'adopter le ferait reculer à l'écran jusqu'à son
    /// propre accusé.
    func acknowledging(_ served: APIConversationPreferences?, keepingOptimistic: Bool) -> ConversationUserState {
        guard let served, let servedVersion = served.version else { return self }
        guard servedVersion > version, !keepingOptimistic else {
            var acknowledged = self
            acknowledged.version = servedVersion
            return acknowledged
        }
        return adoptingServed(served)
    }

    // MARK: - Codable (lenient decoder)

    /// Custom decoder that falls back to the init defaults for any
    /// missing key. Legacy `/conversations` payloads (cached before the
    /// Phase 4 unification added `version`, `isLocked`, `hasDraft`,
    /// `lastSyncedAt`, etc.) must continue to decode cleanly — refusing
    /// them would invalidate every persisted GRDB row written by a prior
    /// build. The synthesized decoder cannot express this because every
    /// non-Optional stored property is required by default.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.init(
            unreadCount: try c.decodeIfPresent(Int.self, forKey: .unreadCount) ?? 0,
            lastReadAt: try c.decodeIfPresent(Date.self, forKey: .lastReadAt),
            lastDeliveredAt: try c.decodeIfPresent(Date.self, forKey: .lastDeliveredAt),
            lastReadMessageId: try c.decodeIfPresent(String.self, forKey: .lastReadMessageId),
            lastReadMessageCreatedAt: try c.decodeIfPresent(Date.self, forKey: .lastReadMessageCreatedAt),
            isPinned: try c.decodeIfPresent(Bool.self, forKey: .isPinned) ?? false,
            isMuted: try c.decodeIfPresent(Bool.self, forKey: .isMuted) ?? false,
            mentionsOnly: try c.decodeIfPresent(Bool.self, forKey: .mentionsOnly) ?? false,
            isArchived: try c.decodeIfPresent(Bool.self, forKey: .isArchived) ?? false,
            deletedForUserAt: try c.decodeIfPresent(Date.self, forKey: .deletedForUserAt),
            clearHistoryBefore: try c.decodeIfPresent(Date.self, forKey: .clearHistoryBefore),
            customName: try c.decodeIfPresent(String.self, forKey: .customName),
            reaction: try c.decodeIfPresent(String.self, forKey: .reaction),
            appearance: try c.decodeIfPresent(ConversationAppearance.self, forKey: .appearance),
            tags: try c.decodeIfPresent([String].self, forKey: .tags) ?? [],
            sectionId: try c.decodeIfPresent(String.self, forKey: .sectionId),
            orderInCategory: try c.decodeIfPresent(Int.self, forKey: .orderInCategory),
            isLocked: try c.decodeIfPresent(Bool.self, forKey: .isLocked) ?? false,
            hasDraft: try c.decodeIfPresent(Bool.self, forKey: .hasDraft) ?? false,
            draftPreview: try c.decodeIfPresent(String.self, forKey: .draftPreview),
            version: try c.decodeIfPresent(Int.self, forKey: .version) ?? 0,
            lastSyncedAt: try c.decodeIfPresent(Date.self, forKey: .lastSyncedAt),
            pendingMutationCount: try c.decodeIfPresent(Int.self, forKey: .pendingMutationCount) ?? 0
        )
    }
}
