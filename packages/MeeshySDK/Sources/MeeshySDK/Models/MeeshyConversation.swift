import Foundation
import UIKit

public struct MeeshyConversation: Identifiable, Hashable, Codable, Sendable {
    public let id: String
    public let identifier: String
    public let type: ConversationType
    public var title: String?
    public var description: String?
    public var avatar: String?
    public var avatarThumbHash: String?
    public var banner: String?
    public var bannerThumbHash: String?
    public var communityId: String?
    public var isActive: Bool = true
    public var memberCount: Int = 0
    /// Vrai quand `memberCount` est plafonné à 199 par le serveur (lecteur non
    /// admin plateforme) — l'affichage rend « 199+ ». Doit survivre au
    /// round-trip Codable : la conversation est persistée telle quelle en GRDB.
    public var memberCountCapped: Bool = false
    public var lastMessageAt: Date
    public var encryptionMode: String?
    /// L'instant où le chiffrement de bout en bout a été activé (#9224, #11380).
    /// Un message antérieur est de l'HISTORIQUE en clair, légitime ; un message
    /// en clair postérieur se signale (`EndToEndPlaintextLaw`). Servi par la
    /// liste et le détail ; absent d'une ligne mise en cache par une version
    /// antérieure, jusqu'au prochain rafraîchissement.
    public var encryptionEnabledAt: Date? = nil
    public let createdAt: Date
    public var updatedAt: Date

    /// Per-user state (read state, preferences, organization, sync meta).
    ///
    /// Source of truth for the legacy inline flags (`isPinned`, `isMuted`,
    /// `mentionsOnly`, `isArchivedByUser`, `customName`, `reaction`,
    /// `sectionId`, `unreadCount`) — those are now deprecated computed
    /// proxies into this struct. Wire format stays flat: each field
    /// continues to appear as a top-level key in conversation JSON. See
    /// the custom `init(from:)` / `encode(to:)` below.
    public var userState: ConversationUserState

    public var lastMessagePreview: String?
    /// B1 (Prisme Linguistique) — `[targetLanguage: translatedContent]`
    /// pairs for the last message, bundled at the conversation level so
    /// the list row can resolve the preview in the viewer's preferred
    /// language without a per-row GRDB lookup.
    ///
    /// Deux sources, désormais :
    /// - REST — `GET /conversations` expédie `lastMessageTranslations`, déjà
    ///   restreint par le gateway aux langues du prisme du lecteur et tronqué au
    ///   plafond d'aperçu ; `APIConversation.toDomain()` le câble ici. C'est le
    ///   chemin du démarrage à froid, celui où la ligne n'avait AUCUNE
    ///   traduction disponible et retombait toujours sur le texte de
    ///   l'expéditeur.
    /// - Socket — `ConversationSyncEngine.previewTranslations(from:viewerLanguages:)`
    ///   dérive la même carte du `message:new` reçu, via `LastMessageFacet`, en
    ///   appliquant les MÊMES quatre exclusions que le gateway (hors prisme,
    ///   langue d'origine, traduction chiffrée, texte inexploitable) et le même
    ///   plafond d'aperçu. Sans cette parité, le texte de la ligne dépendrait du
    ///   transport qui l'a apportée.
    ///
    /// `nil` reste un état normal (aucune traduction vers une langue du prisme,
    /// ou message déjà dans cette langue) : la liste affiche alors
    /// `lastMessagePreview` brut, ce qui EST la règle #3 du Prisme.
    ///
    /// `[String: String]` (not `[APITextTranslation]`) is intentional:
    /// `APITextTranslation` is `Decodable`-only, but `MeeshyConversation`
    /// must stay `Codable` for the cache round-trip. Language codes are
    /// stored lower-cased to make resolution case-insensitive.
    public var lastMessageTranslations: [String: String]? = nil
    /// B1 — original language of the last message. Combined with
    /// `lastMessageTranslations` and the viewer's preferred languages by
    /// `resolvedLastMessagePreview` to apply the Prisme Linguistique.
    public var lastMessageOriginalLanguage: String? = nil
    public var lastMessageAttachments: [MeeshyMessageAttachment] = []
    public var lastMessageAttachmentCount: Int = 0
    public var lastMessageId: String? = nil
    public var lastMessageSenderName: String? = nil
    /// Le `User.id` du PAIR dont `lastMessageSenderName` est le nom (#9359) —
    /// `nil` quand l'auteur est le lecteur (« Vous ») ou inconnu. C'est ce sur
    /// quoi `user:updated` apparie l'aperçu « Bob : … » d'un groupe : sans lui,
    /// le nom resterait figé jusqu'à la synchro suivante.
    public var lastMessageSenderUserId: String? = nil
    public var lastMessageIsBlurred: Bool = false
    public var lastMessageIsViewOnce: Bool = false
    public var lastMessageExpiresAt: Date? = nil
    /// Position du dernier message (hissée par le gateway). Un message
    /// position-seule a un `lastMessagePreview` vide : la ligne d'aperçu
    /// compose alors son libellé depuis ce champ (nom du lieu ou « Position »).
    public var lastMessageLocation: SharedPlace? = nil
    /// Nature du dernier message (#7545) — membre du groupe « dernier message »,
    /// écrit avec lui par `applyLastMessage`. `nil` : serveur antérieur.
    public var lastMessageNature: LastMessageNature? = nil
    /// Dernière réaction de la conversation (#7545). HORS du groupe : elle ne
    /// décrit pas le dernier message et vit sa propre vie sur le fil.
    public var lastReaction: ConversationLastReaction? = nil
    /// La dernière réaction vise un message du LECTEUR — posé là où le lecteur
    /// est connu (REST, socket), lu par `listActivityAt` pour le rang.
    public var lastReactionTargetsReader: Bool = false
    /// Le rang SERVI de la ligne (#9026) : max(`lastMessageAt`, `lastActivityAt`)
    /// — une réaction, un appel ou une épingle remonte la ligne pour TOUS les
    /// participants. `nil` : serveur antérieur, ou aucune activité connue.
    public var listRankAt: Date? = nil
    /// Appel en cours (#7545) — ligne 1 de la priorité de la ligne d'aperçu.
    public var activeCall: ConversationActiveCall? = nil
    /// « 🔥 série · N (M) » du lecteur (#8906) — `viewerEngagement` de la liste
    /// et du détail. Gardé en cache : la pastille s'affiche avant le réseau.
    public var viewerEngagement: ConversationEngagementSnapshot? = nil
    /// Ce que le lecteur ne peut pas écrire ici (#9929) — servi par la liste et
    /// le détail, gardé en cache pour que le bandeau précède le réseau.
    public var viewerWriteRestriction: ConversationWriteRestriction? = nil
    public var recentMessages: [RecentMessagePreview] = []
    /// Display-layer tags (separate concept from `userState.tags`, which
    /// is the wire-format `String[]` from `UserConversationPreferences`).
    /// Phase 6/7 will reconcile these into a single source.
    public var tags: [MeeshyConversationTag] = []

    /// Le pont ✦ de la Lentille — ce que le lecteur a manqué (contrat §3.2).
    ///
    /// `nil` est l'état NORMAL et le défaut : le gateway omet le champ quand
    /// `unreadCount == 0`, et rien ne l'émet tant que la Lentille n'est pas
    /// allumée. Absent du `init` pour la même raison que
    /// `lastMessageTranslations` : c'est une facette expédiée par le
    /// transport, pas un paramètre de construction.
    public var bridge: ConversationBridge? = nil

    public var isAnnouncementChannel: Bool = false
    public var defaultWriteRole: String? = nil
    public var slowModeSeconds: Int? = nil
    public var autoTranslateEnabled: Bool? = nil

    public var participantUserId: String? = nil
    public var participantUsername: String? = nil
    public var participantAvatarURL: String? = nil
    public var participantBanner: String? = nil
    /// Le contour d'avatar équipé du pair d'une directe (#10713) — posé après l'init, comme `bridge`.
    public var participantRing: ServedProfileDecorItem? = nil
    public var lastSeenAt: Date? = nil

    public var closedAt: Date? = nil
    public var closedBy: String? = nil

    public var currentUserRole: String? = nil
    public var currentUserJoinedAt: Date? = nil

    public var language: ConversationContext.ConversationLanguage = .french
    public var theme: ConversationContext.ConversationTheme = .general

    // (Removed 2026-06-06, inc. 5b) Deprecated per-user shims (`conv.isPinned`,
    // `conv.unreadCount`, …) forwarding to `userState`. The app + SDK migrated
    // fully to `userState.X` (0 deprecation warnings at build), so the proxies
    // are dead API surface — deleted. Read per-user state via `userState`.

    public enum ConversationType: String, Codable, CaseIterable, Sendable {
        case direct, group, `public`, global, community, channel, bot, broadcast
    }

    public let colorPalette: ConversationColorPalette

    public var accentColor: String { displayPrimary }
    public var name: String { title ?? identifier }
    public var displayName: String { userState.customName ?? title ?? identifier }
    public var isArchived: Bool { !isActive }

    /// L'identifiant de World Wide, la conversation globale ouverte au monde
    /// (miroir de `WORLD_IDENTIFIER`, `apps/web/src/lib/lens/world-pin.ts`).
    /// Meeshy Global (`meeshy`) est une AUTRE conversation globale.
    public static let worldWideIdentifier = "world"
    public var isWorldWide: Bool { identifier == Self.worldWideIdentifier }

    /// Présence du pair d'une conversation directe, dérivée du SEUL signal que
    /// le modèle porte (`lastSeenAt`) via la règle produit 1/3/5.
    ///
    /// C'est de la DONNÉE, pas un libellé : le rendu (couleur du dot, texte,
    /// silence) appartient aux surfaces. Le libellé humain correspondant vit
    /// dans `MeeshyUI` (`MeeshyConversation.lastSeenLabel`), qui a un catalogue
    /// de chaînes — la cible `MeeshySDK` n'en a pas, et c'est pourquoi le
    /// prédécesseur de cette propriété (`lastSeenText`) était du français codé
    /// en dur servi à tous les utilisateurs, toutes langues confondues.
    ///
    /// `isOnline: false` : le modèle de conversation ne transporte pas le flag
    /// backend, seulement l'horodatage. Une surface qui dispose de la présence
    /// temps réel (`PresenceManager`) doit la préférer à ce calcul.
    public var lastSeenPresence: PresenceState? {
        guard let lastSeenAt else { return nil }
        return UserPresence(isOnline: false, lastActiveAt: lastSeenAt).state
    }

    /// B1 — applies the Prisme Linguistique to `lastMessagePreview`.
    ///
    /// Twin of `resolveLastMessagePreview` in
    /// `packages/shared/utils/conversation-helpers.ts` — both platforms render
    /// the same row from the same REST payload, so any divergence here would
    /// show one account two different texts depending on the client.
    ///
    /// 1. Walk the viewer's preferred languages IN ORDER.
    /// 2. The original language competes at its own RANK: reaching it returns
    ///    the raw preview (the message already IS in that language).
    /// 3. Otherwise, return the first matching translation found in
    ///    `lastMessageTranslations`.
    /// 4. If no preferred language is served, return the original
    ///    `lastMessagePreview` (the message in its source language).
    ///
    /// **Critical Prisme rule**: never fall back to `translations.first`.
    /// The absence of a preferred-language translation means the content
    /// is already in that language OR no translation has been generated —
    /// surfacing an unrelated language would be worse than the original.
    ///
    /// `preferredLanguages` must be ordered: systemLanguage first, then
    /// regionalLanguage, then customDestinationLanguage. Empty/nil entries
    /// are tolerated and skipped.
    public func resolvedLastMessagePreview(preferredLanguages: [String]) -> String? {
        guard let translations = lastMessageTranslations, !translations.isEmpty else {
            return lastMessagePreview
        }
        // La descente elle-même vit dans `PrismTranslationResolver` — UNE
        // fonction, dont cette ligne de liste est une projection, comme la
        // citation (`APIMessageReplyTo.toReplyReference`). C'est la
        // réécriture de la boucle qui a produit trois familles divergentes.
        return PrismTranslationResolver.resolve(
            originalLanguage: lastMessageOriginalLanguage,
            translations: translations,
            preferredLanguages: preferredLanguages
        )?.text ?? lastMessagePreview
    }

    /// Vide TOUT ce que la ligne de liste dit du dernier message — ce lecteur
    /// n'en a plus AUCUN de visible ici.
    ///
    /// Le seul geste qui produit cet état est PERSONNEL (suppression pour soi
    /// ou purge d'historique portant sur le dernier message restant) : la
    /// conversation n'est pas supprimée, elle n'a simplement plus rien à
    /// montrer à ce lecteur. Le serveur le dit en posant `lastMessageId` à
    /// `null` sur `conversation:updated` (cf. `LastMessageIdentity`).
    ///
    /// Central, et non recopié dans chaque consommateur : la ligne dit bien
    /// plus que son texte — pastille de pièce jointe, nom d'expéditeur, épingle
    /// de position, et le libellé que `lastMessageSummaryKind` compose depuis
    /// les drapeaux éphémères. Un vidage PARTIEL est pire que pas de vidage :
    /// il laisse « Message expiré » ou une épingle décrire un message que le
    /// lecteur ne voit plus, ce qui se lit comme un bug plutôt que comme un
    /// résidu.
    ///
    /// `lastMessageAt` ne bouge délibérément PAS : il porte le RANG de la
    /// conversation dans la liste, une donnée GLOBALE
    /// (`Conversation.lastMessageAt`, non nullable en base) qu'un masquage
    /// personnel ne change pour personne. Un `GET /conversations` juste après
    /// rendrait exactement la valeur conservée ici — la reculer ferait plonger
    /// la ligne au fond de la liste jusqu'à la synchro suivante, qui la
    /// remonterait.
    ///
    /// Rend `false` quand il n'y avait déjà rien à vider, pour qu'un doublon
    /// d'événement ne republie pas la ligne.
    @discardableResult
    public mutating func clearLastMessage() -> Bool {
        let hadLastMessage = lastMessageId != nil
            || lastMessagePreview != nil
            || lastMessageTranslations != nil
            || lastMessageOriginalLanguage != nil
            || !lastMessageAttachments.isEmpty
            || lastMessageAttachmentCount != 0
            || lastMessageSenderName != nil
            || lastMessageSenderUserId != nil
            || lastMessageIsBlurred
            || lastMessageIsViewOnce
            || lastMessageExpiresAt != nil
            || lastMessageLocation != nil
            || lastMessageNature != nil
        guard hadLastMessage else { return false }

        lastMessageId = nil
        lastMessagePreview = nil
        lastMessageTranslations = nil
        lastMessageOriginalLanguage = nil
        lastMessageAttachments = []
        lastMessageAttachmentCount = 0
        lastMessageSenderName = nil
        lastMessageSenderUserId = nil
        lastMessageIsBlurred = false
        lastMessageIsViewOnce = false
        lastMessageExpiresAt = nil
        lastMessageLocation = nil
        lastMessageNature = nil
        return true
    }

    /// Hash des champs visuels — utilisé dans ThemedConversationRow.== pour détecter les changements de contenu.
    /// Mettre à jour ce hash quand un nouveau champ est affiché dans ThemedConversationRow.
    public var renderFingerprint: Int {
        var h = Hasher()
        h.combine(lastMessagePreview)
        h.combine(userState.unreadCount)
        h.combine(userState.appearance?.accent)
        h.combine(lastMessageAt)
        h.combine(lastMessageSenderName)
        h.combine(lastMessageAttachmentCount)
        h.combine(lastMessageAttachments.first?.id)
        h.combine(lastMessageIsBlurred)
        h.combine(lastMessageIsViewOnce)
        h.combine(lastMessageExpiresAt)
        // B1 — make the row re-render when a fresh translation arrives.
        //
        // La VALEUR est repliée, pas seulement la clé : c'est elle que la ligne
        // affiche (`resolvedLastMessagePreview`). Le gateway ne ré-émet
        // `conversation:updated` qu'aux lecteurs dont la carte porte la langue
        // qui vient d'atterrir (`PreviewUpdateScope.onlyIfPreviewCarriesLanguage`),
        // et une RETRADUCTION garde le même `lastMessageId`, le même
        // `lastMessagePreview` (l'original ne bouge pas), le même
        // `lastMessageAt` et le même jeu de clés. Hasher les seules clés gelait
        // donc la ligne sur la traduction d'avant, définitivement : le portillon
        // `.equatable()` renvoyait `true` et SwiftUI n'appelait pas `body`.
        //
        // Tri par clé : `Dictionary` n'a pas d'ordre d'itération stable, et un
        // hash non déterministe ouvrirait le portillon au hasard. Chaque clé et
        // chaque valeur sont combinées SÉPARÉMENT — une concaténation confondrait
        // `["a": "bc"]` et `["ab": "c"]`.
        if let translations = lastMessageTranslations {
            for key in translations.keys.sorted() {
                h.combine(key)
                h.combine(translations[key])
            }
        }
        h.combine(lastMessageOriginalLanguage)
        // Position hissée : un message position-seule a un `lastMessagePreview`
        // vide par construction et la ligne compose son libellé depuis ce champ
        // (`ThemedConversationRow`, branche `.standard`, + label VoiceOver). La
        // présence est repliée en plus du nom : une position sans nom affiche
        // quand même « Position », que `name` seul (nil des deux côtés) raterait.
        h.combine(lastMessageLocation != nil)
        h.combine(lastMessageLocation?.name)
        h.combine(lastMessageNature)
        h.combine(lastReaction)
        h.combine(activeCall)
        h.combine(viewerEngagement)
        h.combine(name)
        // Effectif — AFFICHÉ des deux côtés du drapeau Lentille : badge de
        // type du rang historique (`ThemedConversationRow.typeBadge`,
        // « 12 »/« 199+ ») ET ligne d'effectif du rang plat
        // (`LentilleConversationRow.memberCountLine`, « 12 membres »). Il
        // n'était replié nulle part : le portillon gelait donc l'effectif sur
        // sa première valeur, sans qu'aucun test ne rougisse — défaut de la
        // même famille que B1 (traduction) et que la position hissée.
        //
        // Les TROIS champs comptent, et séparément : `memberCountCapped`
        // distingue « 199 » de « 199+ » à nombre EXACTEMENT égal, et `type`
        // décide si l'effectif est rendu du tout (aucun sur `.direct`) autant
        // que du glyphe du badge historique.
        h.combine(type)
        h.combine(memberCount)
        h.combine(memberCountCapped)
        h.combine(userState.isMuted)
        h.combine(userState.isPinned)
        h.combine(userState.isArchived)
        h.combine(userState.mentionsOnly)
        h.combine(userState.customName)
        h.combine(avatar)
        h.combine(participantUsername)
        h.combine(participantAvatarURL)
        h.combine(participantBanner)
        h.combine(participantRing)
        h.combine(tags)
        h.combine(userState.reaction)
        // Catégorie — AFFICHÉE par l'encoche haut-gauche de la carte de focus
        // magnifiée (réintroduite le 2026-08-22), qui en peint le NOM résolu
        // depuis `userCategories`. Non repliée, elle se figeait sur sa
        // première valeur : `LentilleFocusCard.==` ne compare la conversation
        // QUE par ce hash, donc déplacer la conversation depuis l'encoche
        // elle-même laissait l'ancien nom à l'écran. Repli INCONDITIONNEL,
        // comme les autres drapeaux de `userState` juste au-dessus : c'est
        // aussi la sortie de catégorie (`nil`) qui doit rouvrir le portillon.
        h.combine(userState.sectionId)
        // New userState fields surfaced to the row (locked, draft, pending sync).
        h.combine(userState.isLocked)
        h.combine(userState.hasDraft)
        h.combine(userState.hasPendingSync)
        // Lentille (E13) — le pont ✦ est AFFICHÉ par la ligne, il doit donc
        // replier ici. Sans ce repli, le portillon `.equatable()` gèlerait le
        // pont sur sa première valeur : régression JUMELLE de B1 ci-dessus,
        // avec le même mécanisme exact — un pont ré-émis garde le même
        // `lastMessageId`, le même `lastMessagePreview`, le même
        // `lastMessageAt`, et seule la phrase du pont change.
        //
        // Le repli est ENTIÈREMENT sous `if let` : pont `nil` ⇒ pas un seul
        // `combine` de plus ⇒ le fingerprint est bit pour bit celui d'avant
        // ce lot. Drapeau éteint ⇒ zéro invalidation nouvelle. Un
        // `h.combine(bridge)` inconditionnel aurait replié `Optional.none` et
        // décalé le hash de TOUTES les lignes, y compris celles qui n'ont
        // jamais vu de pont.
        if let bridge {
            h.combine(bridge.kind)
            h.combine(bridge.unreadCount)
            h.combine(bridge.suggestedMode)
            // La partialité est AFFICHÉE (« sur les N derniers messages ») :
            // un pont qui passe d'incomplet à complet à données égales est un
            // autre rendu, et doit rouvrir le portillon. Le repli reste sous
            // `if let bridge` — pont absent ⇒ pas un `combine` de plus.
            h.combine(bridge.isComplete)
            h.combine(bridge.text)
            h.combine(bridge.originalLanguage)
            // Même patron que les traductions de l'aperçu ci-dessus, et pour
            // la même raison : c'est la VALEUR que la ligne affiche, une
            // retraduction ne change QUE elle, `Dictionary` n'a pas d'ordre
            // d'itération stable, et coller clé+valeur confondrait
            // `["a": "bc"]` avec `["ab": "c"]`.
            if let translations = bridge.translations {
                for key in translations.keys.sorted() {
                    h.combine(key)
                    h.combine(translations[key])
                }
            }
            if let data = bridge.data {
                // `Array.hash(into:)` replie le nombre d'éléments avant les
                // éléments : ["a", "b"] et ["ab"] restent distincts.
                h.combine(data.authors)
                h.combine(data.extraAuthorCount)
                h.combine(data.messageCount)
                h.combine(data.mediaCounts?.images)
                h.combine(data.mediaCounts?.audio)
                h.combine(data.mediaCounts?.files)
            }
        }
        return h.finalize()
    }

    public static func computeColorPalette(type: ConversationType, title: String?, identifier: String,
                                               language: ConversationContext.ConversationLanguage,
                                               theme: ConversationContext.ConversationTheme,
                                               memberCount: Int) -> ConversationColorPalette {
        let ctxType: ConversationContext.ConversationType
        switch type {
        case .direct: ctxType = .direct
        case .group: ctxType = .group
        case .public, .global, .community, .broadcast: ctxType = .community
        case .channel: ctxType = .channel
        case .bot: ctxType = .bot
        }
        let context = ConversationContext(name: title ?? identifier, type: ctxType, language: language, theme: theme, memberCount: memberCount)
        return DynamicColorGenerator.colorFor(context: context)
    }

    public init(id: String = UUID().uuidString, identifier: String, type: ConversationType = .direct,
                title: String? = nil, description: String? = nil, avatar: String? = nil, avatarThumbHash: String? = nil, banner: String? = nil, bannerThumbHash: String? = nil,
                communityId: String? = nil, isActive: Bool = true, memberCount: Int = 2,
                memberCountCapped: Bool = false,
                lastMessageAt: Date = Date(), encryptionMode: String? = nil,
                createdAt: Date = Date(), updatedAt: Date = Date(),
                unreadCount: Int = 0, lastMessagePreview: String? = nil,
                lastMessageAttachments: [MeeshyMessageAttachment] = [],
                lastMessageAttachmentCount: Int = 0,
                lastMessageId: String? = nil,
                lastMessageSenderName: String? = nil,
                lastMessageSenderUserId: String? = nil,
                lastMessageIsBlurred: Bool = false,
                lastMessageIsViewOnce: Bool = false,
                lastMessageExpiresAt: Date? = nil,
                lastMessageLocation: SharedPlace? = nil,
                recentMessages: [RecentMessagePreview] = [],
                tags: [MeeshyConversationTag] = [], isAnnouncementChannel: Bool = false, defaultWriteRole: String? = nil, slowModeSeconds: Int? = nil, autoTranslateEnabled: Bool? = nil, isPinned: Bool = false, sectionId: String? = nil,
                isMuted: Bool = false, mentionsOnly: Bool = false, isArchivedByUser: Bool = false, customName: String? = nil,
                participantUserId: String? = nil, participantUsername: String? = nil, participantAvatarURL: String? = nil, participantBanner: String? = nil, lastSeenAt: Date? = nil,
                closedAt: Date? = nil, closedBy: String? = nil,
                currentUserRole: String? = nil, currentUserJoinedAt: Date? = nil, reaction: String? = nil,
                language: ConversationContext.ConversationLanguage = .french,
                theme: ConversationContext.ConversationTheme = .general,
                colorPalette: ConversationColorPalette? = nil,
                userState: ConversationUserState? = nil) {
        self.id = id; self.identifier = identifier; self.type = type
        self.title = title; self.description = description; self.avatar = avatar; self.avatarThumbHash = avatarThumbHash; self.banner = banner; self.bannerThumbHash = bannerThumbHash
        self.communityId = communityId; self.isActive = isActive; self.memberCount = memberCount
        self.memberCountCapped = memberCountCapped
        self.lastMessageAt = lastMessageAt; self.encryptionMode = encryptionMode
        self.createdAt = createdAt; self.updatedAt = updatedAt
        self.isAnnouncementChannel = isAnnouncementChannel
        self.defaultWriteRole = defaultWriteRole; self.slowModeSeconds = slowModeSeconds; self.autoTranslateEnabled = autoTranslateEnabled
        self.participantUserId = participantUserId; self.participantUsername = participantUsername; self.participantAvatarURL = participantAvatarURL; self.participantBanner = participantBanner; self.lastSeenAt = lastSeenAt
        self.closedAt = closedAt; self.closedBy = closedBy
        self.currentUserRole = currentUserRole; self.currentUserJoinedAt = currentUserJoinedAt
        self.lastMessagePreview = lastMessagePreview
        self.lastMessageAttachments = lastMessageAttachments
        self.lastMessageAttachmentCount = lastMessageAttachmentCount
        self.lastMessageId = lastMessageId
        self.lastMessageSenderName = lastMessageSenderName
        self.lastMessageSenderUserId = lastMessageSenderUserId
        self.lastMessageIsBlurred = lastMessageIsBlurred
        self.lastMessageIsViewOnce = lastMessageIsViewOnce
        self.lastMessageExpiresAt = lastMessageExpiresAt
        self.lastMessageLocation = lastMessageLocation
        self.recentMessages = recentMessages
        self.tags = tags
        self.language = language; self.theme = theme
        self.colorPalette = colorPalette ?? Self.computeColorPalette(
            type: type, title: title, identifier: identifier,
            language: language, theme: theme, memberCount: memberCount
        )
        // Build userState from either the explicit parameter (preferred,
        // used by Phase 4+ code) or from the legacy inline params for
        // backward compatibility with all current call sites.
        self.userState = userState ?? ConversationUserState(
            unreadCount: unreadCount,
            isPinned: isPinned,
            isMuted: isMuted,
            mentionsOnly: mentionsOnly,
            isArchived: isArchivedByUser,
            customName: customName,
            reaction: reaction,
            sectionId: sectionId
        )
    }

    public func hash(into hasher: inout Hasher) { hasher.combine(id) }
    public static func == (lhs: MeeshyConversation, rhs: MeeshyConversation) -> Bool { lhs.id == rhs.id }

    // MARK: - Codable
    //
    // Custom Codable preserves the wire format: every `userState` field
    // appears as a top-level key (`isPinned`, `isMuted`, `unreadCount`,
    // ...) for backward compatibility with `/conversations` responses,
    // the GRDB cache rows, and the iOS samples in `SampleData.swift`.
    // New userState fields (lastReadAt, version, deletedForUserAt,
    // clearHistoryBefore, orderInCategory, tagsLite, lastSyncedAt,
    // pendingMutationCount, isLocked, hasDraft, draftPreview) become new
    // top-level keys, optional on decode with sensible defaults.

    private enum CodingKeys: String, CodingKey {
        // Conversation-level
        case id, identifier, type, title, description, avatar, avatarThumbHash, banner, bannerThumbHash
        case communityId, isActive, memberCount, memberCountCapped, lastMessageAt, encryptionMode, encryptionEnabledAt, createdAt, updatedAt
        case lastMessagePreview, lastMessageTranslations, lastMessageOriginalLanguage
        case lastMessageAttachments, lastMessageAttachmentCount, lastMessageId
        case lastMessageSenderName, lastMessageSenderUserId, lastMessageIsBlurred, lastMessageIsViewOnce, lastMessageExpiresAt
        case lastMessageLocation
        case lastMessageNature, lastReaction, lastReactionTargetsReader, activeCall, listRankAt
        case viewerEngagement, viewerWriteRestriction
        case recentMessages, tags
        case bridge
        case isAnnouncementChannel, defaultWriteRole, slowModeSeconds, autoTranslateEnabled
        case participantUserId, participantUsername, participantAvatarURL, participantBanner, participantRing, lastSeenAt
        case closedAt, closedBy, currentUserRole, currentUserJoinedAt
        case language, theme, colorPalette

        // Per-user (flat) — legacy wire keys
        case unreadCount, isPinned, isMuted, mentionsOnly, customName, reaction
        case sectionId
        case isArchivedByUser

        // New per-user wire keys (introduced in Phase 2)
        case lastReadAt, lastDeliveredAt
        // La frontière de lecture servie par G1 (#7198, #7222).
        case lastReadMessageId, lastReadMessageCreatedAt
        case deletedForUserAt, clearHistoryBefore
        case orderInCategory
        case userStateTags
        case version, lastSyncedAt, pendingMutationCount
        case isLocked, hasDraft, draftPreview
        // Le fond et l'accent personnels (#10631) : le cache disque les garde, le premier rendu hors ligne aussi.
        case appearance
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.id = try c.decode(String.self, forKey: .id)
        self.identifier = try c.decode(String.self, forKey: .identifier)
        self.type = try c.decode(ConversationType.self, forKey: .type)
        self.title = try c.decodeIfPresent(String.self, forKey: .title)
        self.description = try c.decodeIfPresent(String.self, forKey: .description)
        self.avatar = try c.decodeIfPresent(String.self, forKey: .avatar)
        self.avatarThumbHash = try c.decodeIfPresent(String.self, forKey: .avatarThumbHash)
        self.banner = try c.decodeIfPresent(String.self, forKey: .banner)
        self.bannerThumbHash = try c.decodeIfPresent(String.self, forKey: .bannerThumbHash)
        self.communityId = try c.decodeIfPresent(String.self, forKey: .communityId)
        self.isActive = try c.decodeIfPresent(Bool.self, forKey: .isActive) ?? true
        self.memberCount = try c.decodeIfPresent(Int.self, forKey: .memberCount) ?? 0
        self.memberCountCapped = try c.decodeIfPresent(Bool.self, forKey: .memberCountCapped) ?? false
        self.lastMessageAt = try c.decode(Date.self, forKey: .lastMessageAt)
        self.encryptionMode = try c.decodeIfPresent(String.self, forKey: .encryptionMode); self.encryptionEnabledAt = (try? c.decodeIfPresent(Date.self, forKey: .encryptionEnabledAt)) ?? nil
        self.createdAt = try c.decode(Date.self, forKey: .createdAt)
        self.updatedAt = try c.decode(Date.self, forKey: .updatedAt)

        self.lastMessagePreview = try c.decodeIfPresent(String.self, forKey: .lastMessagePreview)?.meeshyPreviewTruncated
        self.lastMessageTranslations = try c.decodeIfPresent([String: String].self, forKey: .lastMessageTranslations)
        self.lastMessageOriginalLanguage = try c.decodeIfPresent(String.self, forKey: .lastMessageOriginalLanguage)
        self.lastMessageAttachments = try c.decodeIfPresent([MeeshyMessageAttachment].self, forKey: .lastMessageAttachments) ?? []
        self.lastMessageAttachmentCount = try c.decodeIfPresent(Int.self, forKey: .lastMessageAttachmentCount) ?? 0
        self.lastMessageId = try c.decodeIfPresent(String.self, forKey: .lastMessageId)
        self.lastMessageSenderName = try c.decodeIfPresent(String.self, forKey: .lastMessageSenderName)
        self.lastMessageSenderUserId = try c.decodeIfPresent(String.self, forKey: .lastMessageSenderUserId)
        self.lastMessageIsBlurred = try c.decodeIfPresent(Bool.self, forKey: .lastMessageIsBlurred) ?? false
        self.lastMessageIsViewOnce = try c.decodeIfPresent(Bool.self, forKey: .lastMessageIsViewOnce) ?? false
        self.lastMessageExpiresAt = try c.decodeIfPresent(Date.self, forKey: .lastMessageExpiresAt)
        self.lastMessageLocation = try c.decodeIfPresent(SharedPlace.self, forKey: .lastMessageLocation)
        // `try?` : une ligne en cache écrite par une version dont la forme a
        // bougé ne doit pas jeter la liste entière — le prochain sync la repose.
        self.lastMessageNature = (try? c.decodeIfPresent(LastMessageNature.self, forKey: .lastMessageNature))
        self.lastReaction = (try? c.decodeIfPresent(ConversationLastReaction.self, forKey: .lastReaction))
        self.lastReactionTargetsReader = (try? c.decodeIfPresent(Bool.self, forKey: .lastReactionTargetsReader)) ?? false
        self.listRankAt = (try? c.decodeIfPresent(Date.self, forKey: .listRankAt)) ?? nil
        self.activeCall = (try? c.decodeIfPresent(ConversationActiveCall.self, forKey: .activeCall))
        self.viewerEngagement = (try? c.decodeIfPresent(ConversationEngagementSnapshot.self, forKey: .viewerEngagement))
        self.viewerWriteRestriction = (try? c.decodeIfPresent(ConversationWriteRestriction.self, forKey: .viewerWriteRestriction)) ?? nil
        self.recentMessages = try c.decodeIfPresent([RecentMessagePreview].self, forKey: .recentMessages) ?? []
        self.tags = try c.decodeIfPresent([MeeshyConversationTag].self, forKey: .tags) ?? []
        // Tolérance dans les DEUX sens, même patron que `callSummary` /
        // `location` plus bas : un client ancien ignore le champ (absent ⇒
        // `nil`), et un pont malformé — ou d'une forme future, `kind` inconnu
        // par exemple — rend `nil` au lieu de faire échouer le décodage de la
        // conversation ENTIÈRE. Une ligne sans pont reste une ligne ; une
        // ligne perdue est un trou dans la liste.
        self.bridge = try? c.decodeIfPresent(ConversationBridge.self, forKey: .bridge)

        self.isAnnouncementChannel = try c.decodeIfPresent(Bool.self, forKey: .isAnnouncementChannel) ?? false
        self.defaultWriteRole = try c.decodeIfPresent(String.self, forKey: .defaultWriteRole)
        self.slowModeSeconds = try c.decodeIfPresent(Int.self, forKey: .slowModeSeconds)
        self.autoTranslateEnabled = try c.decodeIfPresent(Bool.self, forKey: .autoTranslateEnabled)

        self.participantUserId = try c.decodeIfPresent(String.self, forKey: .participantUserId)
        self.participantUsername = try c.decodeIfPresent(String.self, forKey: .participantUsername)
        self.participantAvatarURL = try c.decodeIfPresent(String.self, forKey: .participantAvatarURL)
        self.participantBanner = try c.decodeIfPresent(String.self, forKey: .participantBanner)
        self.participantRing = try? c.decodeIfPresent(ServedProfileDecorItem.self, forKey: .participantRing)
        self.lastSeenAt = try c.decodeIfPresent(Date.self, forKey: .lastSeenAt)
        self.closedAt = try c.decodeIfPresent(Date.self, forKey: .closedAt)
        self.closedBy = try c.decodeIfPresent(String.self, forKey: .closedBy)
        self.currentUserRole = try c.decodeIfPresent(String.self, forKey: .currentUserRole)
        self.currentUserJoinedAt = try c.decodeIfPresent(Date.self, forKey: .currentUserJoinedAt)

        self.language = try c.decodeIfPresent(ConversationContext.ConversationLanguage.self, forKey: .language) ?? .french
        self.theme = try c.decodeIfPresent(ConversationContext.ConversationTheme.self, forKey: .theme) ?? .general

        // colorPalette is non-optional in storage; if absent (e.g. legacy
        // cache row from before this field shipped) recompute from context.
        if let palette = try c.decodeIfPresent(ConversationColorPalette.self, forKey: .colorPalette) {
            self.colorPalette = palette
        } else {
            self.colorPalette = Self.computeColorPalette(
                type: self.type, title: self.title, identifier: self.identifier,
                language: self.language, theme: self.theme, memberCount: self.memberCount
            )
        }

        // Per-user — assemble userState from flat wire keys.
        self.userState = ConversationUserState(
            unreadCount: try c.decodeIfPresent(Int.self, forKey: .unreadCount) ?? 0,
            lastReadAt: try c.decodeIfPresent(Date.self, forKey: .lastReadAt),
            lastDeliveredAt: try c.decodeIfPresent(Date.self, forKey: .lastDeliveredAt),
            lastReadMessageId: try c.decodeIfPresent(String.self, forKey: .lastReadMessageId),
            lastReadMessageCreatedAt: try c.decodeIfPresent(Date.self, forKey: .lastReadMessageCreatedAt),
            isPinned: try c.decodeIfPresent(Bool.self, forKey: .isPinned) ?? false,
            isMuted: try c.decodeIfPresent(Bool.self, forKey: .isMuted) ?? false,
            mentionsOnly: try c.decodeIfPresent(Bool.self, forKey: .mentionsOnly) ?? false,
            isArchived: try c.decodeIfPresent(Bool.self, forKey: .isArchivedByUser) ?? false,
            deletedForUserAt: try c.decodeIfPresent(Date.self, forKey: .deletedForUserAt),
            clearHistoryBefore: try c.decodeIfPresent(Date.self, forKey: .clearHistoryBefore),
            customName: try c.decodeIfPresent(String.self, forKey: .customName),
            reaction: try c.decodeIfPresent(String.self, forKey: .reaction),
            appearance: try? c.decodeIfPresent(ConversationAppearance.self, forKey: .appearance),
            tags: try c.decodeIfPresent([String].self, forKey: .userStateTags) ?? [],
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

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(identifier, forKey: .identifier)
        try c.encode(type, forKey: .type)
        try c.encodeIfPresent(title, forKey: .title)
        try c.encodeIfPresent(description, forKey: .description)
        try c.encodeIfPresent(avatar, forKey: .avatar)
        try c.encodeIfPresent(avatarThumbHash, forKey: .avatarThumbHash)
        try c.encodeIfPresent(banner, forKey: .banner)
        try c.encodeIfPresent(bannerThumbHash, forKey: .bannerThumbHash)
        try c.encodeIfPresent(communityId, forKey: .communityId)
        try c.encode(isActive, forKey: .isActive)
        try c.encode(memberCount, forKey: .memberCount)
        try c.encode(memberCountCapped, forKey: .memberCountCapped)
        try c.encode(lastMessageAt, forKey: .lastMessageAt)
        try c.encodeIfPresent(encryptionMode, forKey: .encryptionMode); try c.encodeIfPresent(encryptionEnabledAt, forKey: .encryptionEnabledAt)
        try c.encode(createdAt, forKey: .createdAt)
        try c.encode(updatedAt, forKey: .updatedAt)

        try c.encodeIfPresent(lastMessagePreview, forKey: .lastMessagePreview)
        try c.encodeIfPresent(lastMessageTranslations, forKey: .lastMessageTranslations)
        try c.encodeIfPresent(lastMessageOriginalLanguage, forKey: .lastMessageOriginalLanguage)
        try c.encode(lastMessageAttachments, forKey: .lastMessageAttachments)
        try c.encode(lastMessageAttachmentCount, forKey: .lastMessageAttachmentCount)
        try c.encodeIfPresent(lastMessageId, forKey: .lastMessageId)
        try c.encodeIfPresent(lastMessageSenderName, forKey: .lastMessageSenderName)
        try c.encodeIfPresent(lastMessageSenderUserId, forKey: .lastMessageSenderUserId)
        try c.encode(lastMessageIsBlurred, forKey: .lastMessageIsBlurred)
        try c.encode(lastMessageIsViewOnce, forKey: .lastMessageIsViewOnce)
        try c.encodeIfPresent(lastMessageExpiresAt, forKey: .lastMessageExpiresAt)
        try c.encodeIfPresent(lastMessageLocation, forKey: .lastMessageLocation)
        try c.encodeIfPresent(lastMessageNature, forKey: .lastMessageNature)
        try c.encodeIfPresent(lastReaction, forKey: .lastReaction)
        try c.encode(lastReactionTargetsReader, forKey: .lastReactionTargetsReader)
        try c.encodeIfPresent(listRankAt, forKey: .listRankAt)
        try c.encodeIfPresent(activeCall, forKey: .activeCall)
        try c.encodeIfPresent(viewerEngagement, forKey: .viewerEngagement)
        try c.encodeIfPresent(viewerWriteRestriction, forKey: .viewerWriteRestriction)
        try c.encode(recentMessages, forKey: .recentMessages)
        try c.encode(tags, forKey: .tags)
        try c.encodeIfPresent(bridge, forKey: .bridge)

        try c.encode(isAnnouncementChannel, forKey: .isAnnouncementChannel)
        try c.encodeIfPresent(defaultWriteRole, forKey: .defaultWriteRole)
        try c.encodeIfPresent(slowModeSeconds, forKey: .slowModeSeconds)
        try c.encodeIfPresent(autoTranslateEnabled, forKey: .autoTranslateEnabled)

        try c.encodeIfPresent(participantUserId, forKey: .participantUserId)
        try c.encodeIfPresent(participantUsername, forKey: .participantUsername)
        try c.encodeIfPresent(participantAvatarURL, forKey: .participantAvatarURL)
        try c.encodeIfPresent(participantBanner, forKey: .participantBanner)
        try c.encodeIfPresent(participantRing, forKey: .participantRing)
        try c.encodeIfPresent(lastSeenAt, forKey: .lastSeenAt)
        try c.encodeIfPresent(closedAt, forKey: .closedAt)
        try c.encodeIfPresent(closedBy, forKey: .closedBy)
        try c.encodeIfPresent(currentUserRole, forKey: .currentUserRole)
        try c.encodeIfPresent(currentUserJoinedAt, forKey: .currentUserJoinedAt)

        try c.encode(language, forKey: .language)
        try c.encode(theme, forKey: .theme)
        try c.encode(colorPalette, forKey: .colorPalette)

        // Per-user — flat top-level wire keys (legacy + new).
        try c.encode(userState.unreadCount, forKey: .unreadCount)
        try c.encode(userState.isPinned, forKey: .isPinned)
        try c.encode(userState.isMuted, forKey: .isMuted)
        try c.encode(userState.mentionsOnly, forKey: .mentionsOnly)
        try c.encode(userState.isArchived, forKey: .isArchivedByUser)
        try c.encodeIfPresent(userState.customName, forKey: .customName)
        try c.encodeIfPresent(userState.reaction, forKey: .reaction)
        try c.encodeIfPresent(userState.sectionId, forKey: .sectionId)

        try c.encodeIfPresent(userState.lastReadAt, forKey: .lastReadAt)
        try c.encodeIfPresent(userState.lastDeliveredAt, forKey: .lastDeliveredAt)
        try c.encodeIfPresent(userState.lastReadMessageId, forKey: .lastReadMessageId)
        try c.encodeIfPresent(userState.lastReadMessageCreatedAt, forKey: .lastReadMessageCreatedAt)
        try c.encodeIfPresent(userState.deletedForUserAt, forKey: .deletedForUserAt)
        try c.encodeIfPresent(userState.clearHistoryBefore, forKey: .clearHistoryBefore)
        try c.encodeIfPresent(userState.orderInCategory, forKey: .orderInCategory)
        try c.encode(userState.tags, forKey: .userStateTags)
        try c.encode(userState.version, forKey: .version)
        try c.encodeIfPresent(userState.lastSyncedAt, forKey: .lastSyncedAt)
        try c.encode(userState.pendingMutationCount, forKey: .pendingMutationCount)
        try c.encode(userState.isLocked, forKey: .isLocked)
        try c.encode(userState.hasDraft, forKey: .hasDraft)
        try c.encodeIfPresent(userState.draftPreview, forKey: .draftPreview)
        try c.encodeIfPresent(userState.appearance, forKey: .appearance)
    }
}

extension MeeshyConversation: CacheIdentifiable {}
