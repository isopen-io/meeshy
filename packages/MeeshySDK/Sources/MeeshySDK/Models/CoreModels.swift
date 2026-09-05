import Foundation
import UIKit

// MARK: - Tag Model

public struct MeeshyConversationTag: Identifiable, Hashable, Codable, Sendable {
    public let id: String
    public let name: String
    public let color: String

    public init(id: String = UUID().uuidString, name: String, color: String) {
        self.id = id
        self.name = name
        self.color = color
    }

    public var estimatedWidth: CGFloat {
        let charWidth: CGFloat = 7
        let padding: CGFloat = 22
        return CGFloat(name.count) * charWidth + padding
    }

    public static let colors: [String] = [
        "FF6B6B", "4ECDC4", "9B59B6", "F8B500", "2ECC71",
        "E91E63", "3498DB", "FF7F50", "00CED1", "45B7D1",
    ]

    public static let samples: [MeeshyConversationTag] = [
        MeeshyConversationTag(name: "Travail", color: "3498DB"),
        MeeshyConversationTag(name: "Famille", color: "2ECC71"),
        MeeshyConversationTag(name: "Important", color: "FF6B6B"),
        MeeshyConversationTag(name: "Amis", color: "9B59B6"),
        MeeshyConversationTag(name: "Projet", color: "F8B500"),
        MeeshyConversationTag(name: "Urgent", color: "E91E63"),
        MeeshyConversationTag(name: "Perso", color: "4ECDC4"),
        MeeshyConversationTag(name: "Sport", color: "2ECC71"),
        MeeshyConversationTag(name: "Musique", color: "FF7F50"),
        MeeshyConversationTag(name: "Tech", color: "45B7D1"),
    ]
}

// MARK: - Conversation Section Model

public struct MeeshyConversationSection: Identifiable, Hashable, Sendable {
    public let id: String
    public let name: String
    public let icon: String
    public let color: String
    public var isExpanded: Bool = true
    public let order: Int

    public init(id: String = UUID().uuidString, name: String, icon: String, color: String, isExpanded: Bool = true, order: Int = 0) {
        self.id = id
        self.name = name
        self.icon = icon
        self.color = color
        self.isExpanded = isExpanded
        self.order = order
    }

    public static let pinned = MeeshyConversationSection(id: "pinned", name: "Epingles", icon: "pin.fill", color: "FF6B6B", order: 0)
    public static let work = MeeshyConversationSection(id: "work", name: "Travail", icon: "briefcase.fill", color: "3498DB", order: 1)
    public static let family = MeeshyConversationSection(id: "family", name: "Famille", icon: "house.fill", color: "2ECC71", order: 2)
    public static let friends = MeeshyConversationSection(id: "friends", name: "Amis", icon: "person.2.fill", color: "9B59B6", order: 3)
    public static let groups = MeeshyConversationSection(id: "groups", name: "Groupes", icon: "person.3.fill", color: "F8B500", order: 4)
    public static let other = MeeshyConversationSection(id: "other", name: "Mes conversations", icon: "tray.fill", color: "45B7D1", order: 5)

    public static let allSections: [MeeshyConversationSection] = [.pinned, .work, .family, .friends, .groups, .other]
}

// MARK: - Recent Message Preview

public struct RecentMessagePreview: Identifiable, Hashable, Codable, Sendable {
    public let id: String
    public let content: String
    public let senderName: String
    public let messageType: String
    public let createdAt: Date
    public let attachmentMimeType: String?
    public let attachmentCount: Int

    public init(id: String, content: String, senderName: String, messageType: String = "text",
                createdAt: Date = Date(), attachmentMimeType: String? = nil, attachmentCount: Int = 0) {
        self.id = id; self.content = content; self.senderName = senderName
        self.messageType = messageType; self.createdAt = createdAt
        self.attachmentMimeType = attachmentMimeType; self.attachmentCount = attachmentCount
    }
}

// MARK: - Bridge ✦ (Lentille)

/// Comptage des médias de la fenêtre non lue, porté par l'étage `fallback`
/// du pont. Chaque compteur est ABSENT — pas zéro — quand la catégorie n'a
/// rien à annoncer.
///
/// Miroir Swift de `mediaCounts` dans
/// `packages/shared/types/conversation-bridge.ts`.
public struct ConversationBridgeMediaCounts: Codable, Equatable, Sendable {
    public let images: Int?
    public let audio: Int?
    public let files: Int?

    public init(images: Int? = nil, audio: Int? = nil, files: Int? = nil) {
        self.images = images
        self.audio = audio
        self.files = files
    }

    private enum CodingKeys: String, CodingKey {
        case images, audio, files
    }
}

/// Les DONNÉES de l'étage `fallback` — jamais une phrase.
///
/// Le client les formate avec sa propre i18n : la phrase naît déjà dans la
/// langue du lecteur, donc il n'y a rien à traduire et un changement de
/// langue la reformate sans aller-retour serveur.
///
/// Miroir Swift de `ConversationBridgeData`
/// (`packages/shared/types/conversation-bridge.ts`). `authors` est plafonné
/// à 2 côté serveur (`.max(2)` dans le schéma Zod) et le surplus voyage
/// dans `extraAuthorCount` — le « +N » de la ligne.
public struct ConversationBridgeData: Codable, Equatable, Sendable {
    public let authors: [String]
    public let extraAuthorCount: Int
    public let messageCount: Int
    public let mediaCounts: ConversationBridgeMediaCounts?

    public init(authors: [String] = [], extraAuthorCount: Int = 0,
                messageCount: Int = 0, mediaCounts: ConversationBridgeMediaCounts? = nil) {
        self.authors = authors
        self.extraAuthorCount = extraAuthorCount
        self.messageCount = messageCount
        self.mediaCounts = mediaCounts
    }

    private enum CodingKeys: String, CodingKey {
        case authors, extraAuthorCount, messageCount, mediaCounts
    }
}

/// Le pont ✦ — ce que le lecteur a manqué, sous une forme qui survit au
/// Prisme Linguistique.
///
/// Miroir Swift de `ConversationBridge`
/// (`packages/shared/types/conversation-bridge.ts`, contrat §3.2). Deux
/// étages, un seul champ :
/// - `kind == .fallback` — des DONNÉES (`data`), formatées par l'i18n du
///   client. Cet étage n'a pas de langue : rien à traduire.
/// - `kind == .agent` — une vraie phrase (`text`), donc soumise au Prisme.
///   Elle voyage avec la MÊME paire que `lastMessagePreview`
///   (`translations` + `originalLanguage`) précisément pour que le lecteur
///   puisse la RE-résoudre : une chaîne unique « déjà dans la bonne langue »
///   serait un instantané, figé dès qu'une traduction atterrit tardivement
///   ou que le lecteur change de langue principale.
///
/// **Aucun résolveur ici, volontairement.** L'étage agent se résout
/// EXCLUSIVEMENT par le résolveur existant (`resolvedLastMessagePreview` /
/// `resolveLastMessagePreview()`) : le chantier Lentille n'écrit pas une
/// seconde loi de langue (contrat §5.2, conséquence 2).
///
/// Le champ est **absent** — pas vide — quand `unreadCount == 0` : un
/// client ancien l'ignore, et la Lentille n'affiche rien. Zéro rupture de
/// compatibilité dans les deux sens (voir le décodage tolérant de
/// `MeeshyConversation.bridge`).
public struct ConversationBridge: Codable, Equatable, Sendable {
    /// Nichée dans `ConversationBridge` plutôt que déclarée au premier
    /// niveau : le miroir Swift complet de `ConversationReadingMode`
    /// (`packages/shared/types/reading-modes.ts`, 4 modes) appartient à un
    /// autre fichier du chantier, et deux types voisins nommés `…Mode` au
    /// premier niveau se disputeraient l'espace de noms du module.
    public enum Kind: String, Codable, Sendable {
        case agent, fallback
    }

    /// Décision d'orchestrateur PRÉCALCULÉE — un sous-ensemble strict des
    /// modes de lecture, les deux seuls qu'un pont peut suggérer.
    public enum SuggestedMode: String, Codable, Sendable {
        case focal, resume
    }

    public let kind: Kind
    /// Le chiffre vit ICI, plus dans un badge.
    public let unreadCount: Int
    public let suggestedMode: SuggestedMode

    /// La fenêtre de calcul du producteur couvre-t-elle TOUT l'intervalle non
    /// lu ? **`nil` = complet** — c'est le cas du gateway, qui calcule sur la
    /// fenêtre entière et n'a donc rien à annoncer, et c'est aussi ce que lit
    /// un client qui ignore le champ.
    ///
    /// `false` vient d'un producteur borné (le substitut client, limité aux
    /// messages déjà en cache) : la ligne porte alors « sur les N derniers
    /// messages », jamais un chiffre extrapolé au-delà de ce qui a réellement
    /// été vu. La qualification voyage SUR le pont, et pas dans une enveloppe
    /// de retour de provider, précisément pour survivre au cache, au socket et
    /// au modèle de liste jusqu'au rang (miroir de
    /// `ConversationBridgeSchema.isComplete`, REV-1 blocage 6).
    public let isComplete: Bool?

    /// `kind == .fallback`.
    public let data: ConversationBridgeData?

    /// `kind == .agent` — la phrase et sa paire de résolution.
    public let text: String?
    public let translations: [String: String]?
    public let originalLanguage: String?

    public init(kind: Kind, unreadCount: Int, suggestedMode: SuggestedMode,
                isComplete: Bool? = nil,
                data: ConversationBridgeData? = nil,
                text: String? = nil,
                translations: [String: String]? = nil,
                originalLanguage: String? = nil) {
        self.kind = kind
        self.unreadCount = unreadCount
        self.suggestedMode = suggestedMode
        self.isComplete = isComplete
        self.data = data
        self.text = text
        self.translations = translations
        self.originalLanguage = originalLanguage
    }

    private enum CodingKeys: String, CodingKey {
        case kind, unreadCount, suggestedMode, isComplete, data, text, translations, originalLanguage
    }
}

// MARK: - Conversation Model

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
    public var lastMessageIsBlurred: Bool = false
    public var lastMessageIsViewOnce: Bool = false
    public var lastMessageExpiresAt: Date? = nil
    /// Position du dernier message (hissée par le gateway). Un message
    /// position-seule a un `lastMessagePreview` vide : la ligne d'aperçu
    /// compose alors son libellé depuis ce champ (nom du lieu ou « Position »).
    public var lastMessageLocation: SharedPlace? = nil
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

    public var accentColor: String { colorPalette.primary }
    public var name: String { title ?? identifier }
    public var displayName: String { userState.customName ?? title ?? identifier }
    public var isArchived: Bool { !isActive }

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
            || lastMessageIsBlurred
            || lastMessageIsViewOnce
            || lastMessageExpiresAt != nil
            || lastMessageLocation != nil
        guard hadLastMessage else { return false }

        lastMessageId = nil
        lastMessagePreview = nil
        lastMessageTranslations = nil
        lastMessageOriginalLanguage = nil
        lastMessageAttachments = []
        lastMessageAttachmentCount = 0
        lastMessageSenderName = nil
        lastMessageIsBlurred = false
        lastMessageIsViewOnce = false
        lastMessageExpiresAt = nil
        lastMessageLocation = nil
        return true
    }

    /// Hash des champs visuels — utilisé dans ThemedConversationRow.== pour détecter les changements de contenu.
    /// Mettre à jour ce hash quand un nouveau champ est affiché dans ThemedConversationRow.
    public var renderFingerprint: Int {
        var h = Hasher()
        h.combine(lastMessagePreview)
        h.combine(userState.unreadCount)
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
        case communityId, isActive, memberCount, memberCountCapped, lastMessageAt, encryptionMode, createdAt, updatedAt
        case lastMessagePreview, lastMessageTranslations, lastMessageOriginalLanguage
        case lastMessageAttachments, lastMessageAttachmentCount, lastMessageId
        case lastMessageSenderName, lastMessageIsBlurred, lastMessageIsViewOnce, lastMessageExpiresAt
        case lastMessageLocation
        case recentMessages, tags
        case bridge
        case isAnnouncementChannel, defaultWriteRole, slowModeSeconds, autoTranslateEnabled
        case participantUserId, participantUsername, participantAvatarURL, participantBanner, lastSeenAt
        case closedAt, closedBy, currentUserRole, currentUserJoinedAt
        case language, theme, colorPalette

        // Per-user (flat) — legacy wire keys
        case unreadCount, isPinned, isMuted, mentionsOnly, customName, reaction
        case sectionId
        case isArchivedByUser

        // New per-user wire keys (introduced in Phase 2)
        case lastReadAt, lastDeliveredAt
        case deletedForUserAt, clearHistoryBefore
        case orderInCategory
        case userStateTags
        case version, lastSyncedAt, pendingMutationCount
        case isLocked, hasDraft, draftPreview
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
        self.encryptionMode = try c.decodeIfPresent(String.self, forKey: .encryptionMode)
        self.createdAt = try c.decode(Date.self, forKey: .createdAt)
        self.updatedAt = try c.decode(Date.self, forKey: .updatedAt)

        self.lastMessagePreview = try c.decodeIfPresent(String.self, forKey: .lastMessagePreview)?.meeshyPreviewTruncated
        self.lastMessageTranslations = try c.decodeIfPresent([String: String].self, forKey: .lastMessageTranslations)
        self.lastMessageOriginalLanguage = try c.decodeIfPresent(String.self, forKey: .lastMessageOriginalLanguage)
        self.lastMessageAttachments = try c.decodeIfPresent([MeeshyMessageAttachment].self, forKey: .lastMessageAttachments) ?? []
        self.lastMessageAttachmentCount = try c.decodeIfPresent(Int.self, forKey: .lastMessageAttachmentCount) ?? 0
        self.lastMessageId = try c.decodeIfPresent(String.self, forKey: .lastMessageId)
        self.lastMessageSenderName = try c.decodeIfPresent(String.self, forKey: .lastMessageSenderName)
        self.lastMessageIsBlurred = try c.decodeIfPresent(Bool.self, forKey: .lastMessageIsBlurred) ?? false
        self.lastMessageIsViewOnce = try c.decodeIfPresent(Bool.self, forKey: .lastMessageIsViewOnce) ?? false
        self.lastMessageExpiresAt = try c.decodeIfPresent(Date.self, forKey: .lastMessageExpiresAt)
        self.lastMessageLocation = try c.decodeIfPresent(SharedPlace.self, forKey: .lastMessageLocation)
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
            isPinned: try c.decodeIfPresent(Bool.self, forKey: .isPinned) ?? false,
            isMuted: try c.decodeIfPresent(Bool.self, forKey: .isMuted) ?? false,
            mentionsOnly: try c.decodeIfPresent(Bool.self, forKey: .mentionsOnly) ?? false,
            isArchived: try c.decodeIfPresent(Bool.self, forKey: .isArchivedByUser) ?? false,
            deletedForUserAt: try c.decodeIfPresent(Date.self, forKey: .deletedForUserAt),
            clearHistoryBefore: try c.decodeIfPresent(Date.self, forKey: .clearHistoryBefore),
            customName: try c.decodeIfPresent(String.self, forKey: .customName),
            reaction: try c.decodeIfPresent(String.self, forKey: .reaction),
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
        try c.encodeIfPresent(encryptionMode, forKey: .encryptionMode)
        try c.encode(createdAt, forKey: .createdAt)
        try c.encode(updatedAt, forKey: .updatedAt)

        try c.encodeIfPresent(lastMessagePreview, forKey: .lastMessagePreview)
        try c.encodeIfPresent(lastMessageTranslations, forKey: .lastMessageTranslations)
        try c.encodeIfPresent(lastMessageOriginalLanguage, forKey: .lastMessageOriginalLanguage)
        try c.encode(lastMessageAttachments, forKey: .lastMessageAttachments)
        try c.encode(lastMessageAttachmentCount, forKey: .lastMessageAttachmentCount)
        try c.encodeIfPresent(lastMessageId, forKey: .lastMessageId)
        try c.encodeIfPresent(lastMessageSenderName, forKey: .lastMessageSenderName)
        try c.encode(lastMessageIsBlurred, forKey: .lastMessageIsBlurred)
        try c.encode(lastMessageIsViewOnce, forKey: .lastMessageIsViewOnce)
        try c.encodeIfPresent(lastMessageExpiresAt, forKey: .lastMessageExpiresAt)
        try c.encodeIfPresent(lastMessageLocation, forKey: .lastMessageLocation)
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
    }
}

// MARK: - Community Model

public struct MeeshyCommunity: Identifiable, Hashable, Sendable {
    public let id: String
    public let identifier: String
    public let name: String
    public var description: String?
    public var avatar: String?
    public var avatarThumbHash: String?
    public var banner: String?
    public var bannerThumbHash: String?
    public var isPrivate: Bool = true
    public var isActive: Bool = true
    public var deletedAt: Date?
    public let createdBy: String
    public let createdAt: Date
    public var updatedAt: Date
    public var memberCount: Int = 0
    public var conversationCount: Int = 0
    public var emoji: String = ""
    public var color: String = "4ECDC4"
    public var theme: ConversationContext.ConversationTheme = .general
    public var language: ConversationContext.ConversationLanguage = .french

    public init(id: String = UUID().uuidString, identifier: String, name: String,
                description: String? = nil, avatar: String? = nil, avatarThumbHash: String? = nil, banner: String? = nil, bannerThumbHash: String? = nil,
                isPrivate: Bool = true, isActive: Bool = true, deletedAt: Date? = nil,
                createdBy: String = "", createdAt: Date = Date(), updatedAt: Date = Date(),
                memberCount: Int = 0, conversationCount: Int = 0,
                emoji: String = "", color: String = "4ECDC4",
                theme: ConversationContext.ConversationTheme = .general,
                language: ConversationContext.ConversationLanguage = .french) {
        self.id = id; self.identifier = identifier; self.name = name
        self.description = description; self.avatar = avatar; self.avatarThumbHash = avatarThumbHash; self.banner = banner; self.bannerThumbHash = bannerThumbHash
        self.isPrivate = isPrivate; self.isActive = isActive; self.deletedAt = deletedAt
        self.createdBy = createdBy; self.createdAt = createdAt; self.updatedAt = updatedAt
        self.memberCount = memberCount; self.conversationCount = conversationCount
        self.emoji = emoji; self.color = color; self.theme = theme; self.language = language
    }
}

// MARK: - Ephemeral Duration

public enum EphemeralDuration: Int, CaseIterable, Identifiable {
    case thirtySeconds = 30
    case oneMinute = 60
    case fiveMinutes = 300
    case oneHour = 3600
    case twentyFourHours = 86400

    public var id: Int { rawValue }

    public var label: String {
        switch self {
        case .thirtySeconds: return "30s"
        case .oneMinute: return "1min"
        case .fiveMinutes: return "5min"
        case .oneHour: return "1h"
        case .twentyFourHours: return "24h"
        }
    }

    public var displayLabel: String {
        switch self {
        case .thirtySeconds: return "30 secondes"
        case .oneMinute: return "1 minute"
        case .fiveMinutes: return "5 minutes"
        case .oneHour: return "1 heure"
        case .twentyFourHours: return "24 heures"
        }
    }

    public var expiresAt: Date {
        Date().addingTimeInterval(TimeInterval(rawValue))
    }
}

// MARK: - Message Attachment

/// D4 — a responsive downscaled WebP variant of an image attachment, used to
/// pick the smallest sufficient image instead of fetching the multi-MB original
/// for inline previews. Non-encrypted images only. Mirrors the gateway payload.
public struct MeeshyImageVariant: Codable, Sendable, Hashable {
    public let width: Int
    public let height: Int
    public let url: String
    public let size: Int
    public let format: String

    public init(width: Int, height: Int, url: String, size: Int, format: String = "webp") {
        self.width = width
        self.height = height
        self.url = url
        self.size = size
        self.format = format
    }

    private enum CodingKeys: String, CodingKey {
        case width, height, url, size, format
    }

    /// Le repli `"webp"` vit ICI et pas seulement dans l'init memberwise :
    /// `format` est le seul champ que le fil peut légitimement taire (une
    /// variante responsive EST une WebP — `UploadProcessor` la pose en dur),
    /// et un défaut d'init ne décode rien.
    ///
    /// Les quatre autres champs restent EXIGÉS : un élément sans `url`, sans
    /// dimension ou sans poids ne peut être ni élu ni mesuré — il n'est pas une
    /// variante. Son absence n'est pas fatale pour autant : les porteurs le
    /// décodent par `LossyImageVariants`, qui l'IGNORE au lieu de faire tomber
    /// le message ou le post entier.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        width = try c.decode(Int.self, forKey: .width)
        height = try c.decode(Int.self, forKey: .height)
        url = try c.decode(String.self, forKey: .url)
        size = try c.decode(Int.self, forKey: .size)
        format = try c.decodeIfPresent(String.self, forKey: .format) ?? "webp"
    }
}

/// Consomme un élément sans l'inspecter — avance le curseur au-delà d'un
/// élément malformé (jumeau de `_StorySkippedElement`, l'autre décodage lossy
/// du module).
private struct _SkippedImageVariant: Decodable {
    init(from decoder: Decoder) throws {}
}

/// Décodage TOLÉRANT PAR ÉLÉMENT de `imageVariants` — le SITE UNIQUE de cette
/// tolérance, déclaré par les quatre porteurs du champ
/// (`MeeshyMessageAttachment`, `APIMessageAttachment`, `FeedMedia`,
/// `APIPostMedia`).
///
/// Le fil ne garantit RIEN de la forme d'un élément : `api-schemas.ts` ne pose
/// aucun `required` sur les items et Prisma stocke un `Json?` libre. Un modèle
/// plus STRICT que son fil ne perd pas le champ — il perd le CONTENU PORTEUR :
/// une seule variante écrite à moitié faisait échouer le décodage du post ou du
/// message entier, qui DISPARAISSAIT de la liste (précédent Android, mémoire
/// `reference_android_model_stricter_than_the_wire`).
///
/// Sémantique conservée à l'identique de `decodeIfPresent` : clé absente ou
/// valeur `null` → `nil` (jamais un tableau vide inventé) ; présente → la liste
/// des éléments VALIDES, `[]` si aucun ne l'est. À l'encodage, la clé est omise
/// quand la valeur est `nil` (cf. la surcharge `KeyedEncodingContainer.encode`
/// ci-dessous) : les blobs de cache gardent exactement la forme d'avant.
@propertyWrapper
public struct LossyImageVariants: Codable, Sendable, Hashable {
    public var wrappedValue: [MeeshyImageVariant]?

    public init(wrappedValue: [MeeshyImageVariant]?) {
        self.wrappedValue = wrappedValue
    }

    public init(from decoder: Decoder) throws {
        guard var unkeyed = try? decoder.unkeyedContainer() else {
            wrappedValue = nil
            return
        }
        var kept: [MeeshyImageVariant] = []
        while !unkeyed.isAtEnd {
            if let variant = try? unkeyed.decode(MeeshyImageVariant.self) {
                kept.append(variant)
            } else {
                _ = try? unkeyed.decode(_SkippedImageVariant.self)
            }
        }
        wrappedValue = kept
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(wrappedValue)
    }
}

/// Sans ces deux surcharges, le `Codable` SYNTHÉTISÉ d'un porteur appellerait
/// `decode`/`encode` (le type enveloppe n'est pas optionnel) : une clé absente
/// lèverait `keyNotFound` et une valeur nulle écrirait `"imageVariants": null`
/// là où le champ était simplement omis. Elles rendent le wrapper transparent —
/// même contrat que `decodeIfPresent`/`encodeIfPresent`.
public extension KeyedDecodingContainer {
    func decode(_ type: LossyImageVariants.Type, forKey key: Key) throws -> LossyImageVariants {
        try decodeIfPresent(type, forKey: key) ?? LossyImageVariants(wrappedValue: nil)
    }
}

public extension KeyedEncodingContainer {
    mutating func encode(_ value: LossyImageVariants, forKey key: Key) throws {
        guard let variants = value.wrappedValue else { return }
        try encode(variants, forKey: key)
    }
}

/// The current user's OWN playback progress for a media attachment, surfaced
/// per-request by the gateway (mirror of `currentUserReactions`). Lets a client
/// seed the in-bubble waveform tint (audio) / progress bar (video) on load,
/// synced across devices. `nil` = the current user never consumed this media.
/// @see CurrentUserAttachmentConsumption in packages/shared/types/attachment.ts
public struct MeeshyMediaConsumption: Codable, Sendable, Equatable {
    public var lastPlayPositionMs: Int?
    public var listenedComplete: Bool
    public var lastWatchPositionMs: Int?
    public var watchedComplete: Bool

    public init(
        lastPlayPositionMs: Int? = nil,
        listenedComplete: Bool = false,
        lastWatchPositionMs: Int? = nil,
        watchedComplete: Bool = false
    ) {
        self.lastPlayPositionMs = lastPlayPositionMs
        self.listenedComplete = listenedComplete
        self.lastWatchPositionMs = lastWatchPositionMs
        self.watchedComplete = watchedComplete
    }
}

public struct MeeshyMessageAttachment: Identifiable, Codable, Sendable {
    public let id: String
    public var messageId: String?
    public let fileName: String
    public let originalName: String
    public let mimeType: String
    public let fileSize: Int
    public let filePath: String
    public let fileUrl: String
    public var title: String?
    public var alt: String?
    public var caption: String?
    public var forwardedFromAttachmentId: String?
    public var isForwarded: Bool = false
    /// Le fichier sort de la caméra ou du micro DE L'APPLICATION.
    ///
    /// Déclaré par le client qui a capturé, à l'envoi — lui seul le sait, et
    /// seulement à cet instant — puis rendu par la passerelle sur la pièce
    /// jointe. La feuille de partage le lit pour décider si PUBLIER ce média
    /// demande confirmation : une capture n'a encore été vue par personne.
    ///
    /// Défaut `false` : les blobs `attachmentsJson` en cache écrits avant ce
    /// champ décodent donc en « pas une capture », ce qui est la lecture juste
    /// — l'absence ne peut pas valoir capture.
    /// @see `PublicationTargetRule.needsCaptureConfirmation`
    public var capturedInApp: Bool = false
    public var isViewOnce: Bool = false
    public var maxViewOnceCount: Int?
    public var viewOnceCount: Int = 0
    public var isBlurred: Bool = false
    public var width: Int?
    public var height: Int?
    /// D4 — responsive downscaled WebP variants for picking a lighter image.
    /// Décodage tolérant par élément (`LossyImageVariants`) : un blob
    /// `attachmentsJson` dont une variante est partielle rend quand même la
    /// pièce jointe.
    @LossyImageVariants public var imageVariants: [MeeshyImageVariant]?
    /// BUG2 A' — réactions par-image agrégées (emoji→count), miroir du reactionSummary
    /// message-level. Vit dans attachmentsJson (Codable synthétisé), pas de colonne GRDB.
    public var reactionSummary: [String: Int]?
    /// BUG2 A' — emojis posés par l'utilisateur courant sur cette pièce jointe.
    public var currentUserReactions: [String]?
    public var thumbnailPath: String?
    public var thumbnailUrl: String?
    public var thumbHash: String?
    public var duration: Int?
    public var bitrate: Int?
    public var sampleRate: Int?
    public var codec: String?
    public var channels: Int?
    public var fps: Float?
    public var videoCodec: String?
    public var pageCount: Int?
    public var lineCount: Int?
    public let uploadedBy: String
    public var isAnonymous: Bool = false
    public let createdAt: Date
    public var isEncrypted: Bool = false
    public var encryptionMode: String?
    public var latitude: Double?
    public var longitude: Double?
    public var thumbnailColor: String = "4ECDC4"

    // Persisted transcription/translation metadata so GRDB load surfaces
    // these fields instantly without waiting for a REST round-trip.
    public var transcription: EmbeddedTranscription?
    public var audioTranslations: [String: EmbeddedAudioTranslation]?

    // ===== CONSUMPTION AGGREGATES (all-or-nothing) =====
    // Server-computed denormalized state surfaced in the message-info sheet:
    // who has viewed / downloaded / listened / watched this attachment. The
    // `…ByAllAt` markers are stamped by the gateway only once EVERY active
    // recipient has completed that action (WhatsApp-style). Optional so old
    // cached `attachmentsJson` blobs (written before these shipped) decode to
    // nil. Vit dans attachmentsJson (Codable synthétisé), pas de colonne GRDB.
    public var deliveredToAllAt: Date?
    public var viewedByAllAt: Date?
    public var downloadedByAllAt: Date?
    public var listenedByAllAt: Date?
    public var watchedByAllAt: Date?
    public var viewedCount: Int?
    public var downloadedCount: Int?
    public var consumedCount: Int?

    // ===== CURRENT-USER CONSUMPTION (per-request, cross-device sync) =====
    /// The current user's own playback progress (position + completion).
    /// Optional so old cached `attachmentsJson` blobs decode to nil.
    public var currentUserConsumption: MeeshyMediaConsumption?

    /// Lightweight Codable transcription embedded in attachmentsJson.
    public struct EmbeddedTranscription: Codable, Sendable {
        public var text: String
        public var language: String
        public var confidence: Double?
        public var durationMs: Int?
        public var speakerCount: Int?
        public var segments: [TranscriptionSegmentData]?

        public struct TranscriptionSegmentData: Codable, Sendable {
            public var text: String
            public var startTime: Double?
            public var endTime: Double?
            public var speakerId: String?
        }
    }

    /// Lightweight Codable audio translation embedded in attachmentsJson.
    public struct EmbeddedAudioTranslation: Codable, Sendable {
        public var url: String
        public var transcription: String?
        public var durationMs: Int?
        public var format: String?
        public var cloned: Bool?
        public var quality: Double?
        public var voiceModelId: String?
        public var ttsModel: String?
        public var segments: [EmbeddedTranscription.TranscriptionSegmentData]?
    }

    public var type: AttachmentType {
        if mimeType.starts(with: "image/") { return .image }
        if mimeType.starts(with: "video/") { return .video }
        if mimeType.starts(with: "audio/") { return .audio }
        if mimeType == "application/x-location" { return .location }
        return .file
    }

    public enum AttachmentType: String, Codable {
        case image, video, audio, file, location
    }

    public init(id: String = UUID().uuidString, messageId: String? = nil,
                fileName: String = "", originalName: String = "",
                mimeType: String = "application/octet-stream", fileSize: Int = 0,
                filePath: String = "", fileUrl: String = "",
                title: String? = nil, alt: String? = nil, caption: String? = nil,
                forwardedFromAttachmentId: String? = nil, isForwarded: Bool = false,
                capturedInApp: Bool = false,
                isViewOnce: Bool = false, maxViewOnceCount: Int? = nil, viewOnceCount: Int = 0, isBlurred: Bool = false,
                width: Int? = nil, height: Int? = nil, thumbnailPath: String? = nil, thumbnailUrl: String? = nil, thumbHash: String? = nil,
                duration: Int? = nil, bitrate: Int? = nil, sampleRate: Int? = nil, codec: String? = nil, channels: Int? = nil,
                fps: Float? = nil, videoCodec: String? = nil, pageCount: Int? = nil, lineCount: Int? = nil,
                uploadedBy: String = "", isAnonymous: Bool = false, createdAt: Date = Date(),
                isEncrypted: Bool = false, encryptionMode: String? = nil,
                latitude: Double? = nil, longitude: Double? = nil, thumbnailColor: String = "4ECDC4",
                transcription: EmbeddedTranscription? = nil,
                audioTranslations: [String: EmbeddedAudioTranslation]? = nil,
                imageVariants: [MeeshyImageVariant]? = nil,
                reactionSummary: [String: Int]? = nil,
                currentUserReactions: [String]? = nil,
                deliveredToAllAt: Date? = nil, viewedByAllAt: Date? = nil,
                downloadedByAllAt: Date? = nil, listenedByAllAt: Date? = nil,
                watchedByAllAt: Date? = nil, viewedCount: Int? = nil,
                downloadedCount: Int? = nil, consumedCount: Int? = nil,
                currentUserConsumption: MeeshyMediaConsumption? = nil) {
        self.id = id; self.messageId = messageId; self.fileName = fileName; self.originalName = originalName
        self.mimeType = mimeType; self.fileSize = fileSize; self.filePath = filePath; self.fileUrl = fileUrl
        self.title = title; self.alt = alt; self.caption = caption
        self.forwardedFromAttachmentId = forwardedFromAttachmentId; self.isForwarded = isForwarded
        self.capturedInApp = capturedInApp
        self.isViewOnce = isViewOnce; self.maxViewOnceCount = maxViewOnceCount
        self.viewOnceCount = viewOnceCount; self.isBlurred = isBlurred
        self.width = width; self.height = height; self.thumbnailPath = thumbnailPath; self.thumbnailUrl = thumbnailUrl; self.thumbHash = thumbHash
        self.duration = duration; self.bitrate = bitrate; self.sampleRate = sampleRate; self.codec = codec; self.channels = channels
        self.fps = fps; self.videoCodec = videoCodec; self.pageCount = pageCount; self.lineCount = lineCount
        self.uploadedBy = uploadedBy; self.isAnonymous = isAnonymous; self.createdAt = createdAt
        self.isEncrypted = isEncrypted; self.encryptionMode = encryptionMode
        self.latitude = latitude; self.longitude = longitude; self.thumbnailColor = thumbnailColor
        self.transcription = transcription; self.audioTranslations = audioTranslations
        self.imageVariants = imageVariants
        self.reactionSummary = reactionSummary
        self.currentUserReactions = currentUserReactions
        self.deliveredToAllAt = deliveredToAllAt
        self.viewedByAllAt = viewedByAllAt
        self.downloadedByAllAt = downloadedByAllAt
        self.listenedByAllAt = listenedByAllAt
        self.watchedByAllAt = watchedByAllAt
        self.viewedCount = viewedCount
        self.downloadedCount = downloadedCount
        self.consumedCount = consumedCount
        self.currentUserConsumption = currentUserConsumption
    }

    public static func image(color: String = "4ECDC4") -> MeeshyMessageAttachment {
        MeeshyMessageAttachment(mimeType: "image/jpeg", thumbnailColor: color)
    }

    public static func video(durationMs: Int, color: String = "FF6B6B") -> MeeshyMessageAttachment {
        MeeshyMessageAttachment(mimeType: "video/mp4", duration: durationMs, thumbnailColor: color)
    }

    public static func audio(durationMs: Int, color: String = "9B59B6") -> MeeshyMessageAttachment {
        MeeshyMessageAttachment(mimeType: "audio/mp4", duration: durationMs, channels: 2, thumbnailColor: color)
    }

    public static func file(name: String, size: Int, color: String = "F8B500") -> MeeshyMessageAttachment {
        MeeshyMessageAttachment(fileName: name, originalName: name, mimeType: "application/octet-stream", fileSize: size, thumbnailColor: color)
    }

    public static func location(latitude: Double = 0, longitude: Double = 0, color: String = "2ECC71") -> MeeshyMessageAttachment {
        MeeshyMessageAttachment(mimeType: "application/x-location", latitude: latitude, longitude: longitude, thumbnailColor: color)
    }

    public var durationFormatted: String? {
        guard let d = duration else { return nil }
        let seconds = d / 1000
        return String(format: "%d:%02d", seconds / 60, seconds % 60)
    }

    public var fileSizeFormatted: String {
        let kb = Double(fileSize) / 1024
        if kb < 1024 { return String(format: "%.1f KB", kb) }
        return String(format: "%.1f MB", kb / 1024)
    }
}

public extension Array where Element == MeeshyMessageAttachment {
    /// L'attachement qu'une CITATION représente et qu'un tap média cité OUVRE :
    /// le premier média (hors localisation), sinon le premier tout court.
    ///
    /// L'ICÔNE d'une citation (les trois constructeurs de `ReplyReference` :
    /// serveur `uiReplyTo`, optimiste `makeReplyReference`, bannière swipe
    /// `triggerReply`) et l'OUVERTURE (`MessageListViewController
    /// .openQuotedMedia`) DOIVENT résoudre la MÊME pièce jointe. Avant
    /// (2026-08-27) l'icône lisait `attachments.first` et l'ouverture
    /// `attachments.first(where: type != .location)` : dès qu'une localisation
    /// précédait le média, l'icône décrivait une pièce jointe et le plein
    /// écran en ouvrait une autre. Un seul point de vérité pour les deux.
    var quotedRepresentative: MeeshyMessageAttachment? {
        first(where: { $0.type != .location }) ?? first
    }
}

// MARK: - Reaction Model

public struct MeeshyReaction: Identifiable, Codable, Sendable {
    public let id: String
    public let messageId: String
    public var participantId: String?
    public let emoji: String
    public let createdAt: Date
    public var updatedAt: Date

    public init(id: String = UUID().uuidString, messageId: String, participantId: String? = nil,
                emoji: String, createdAt: Date = Date(), updatedAt: Date = Date()) {
        self.id = id; self.messageId = messageId; self.participantId = participantId
        self.emoji = emoji; self.createdAt = createdAt; self.updatedAt = updatedAt
    }

    @available(*, deprecated, renamed: "participantId")
    public var userId: String? { participantId }
}

public extension MeeshyReaction {
    /// Reconstruct synthetic per-reaction rows from the gateway's AGGREGATED
    /// reaction payload (`reactionSummary` emoji→count + `currentUserReactions`
    /// emojis the authenticated user reacted with). The aggregated payload does
    /// not enumerate individual reactors, so each emoji yields `count` rows; the
    /// FIRST row of an emoji the current user reacted with is tagged with the
    /// current user's `currentUserId` so the downstream ownership check
    /// (`participantId == currentUserId`) lights up "I reacted". Every other row
    /// carries `nil` ownership (the payload can't attribute them).
    ///
    /// Single source of truth shared by both ingestion paths —
    /// `APIMessage.toMessage(currentUserId:)` and
    /// `MessagePersistenceActor.upsertFromAPIMessages` — so they can never
    /// diverge again (T7: the persistence path used to tag the current user's
    /// own reaction with the message AUTHOR's participantId, breaking the
    /// "I reacted" highlight after a cache/REST reload).
    static func reconstructFromSummary(
        messageId: String,
        reactionSummary: [String: Int]?,
        currentUserReactions: [String]?,
        currentUserId: String?
    ) -> [MeeshyReaction] {
        guard let summary = reactionSummary else { return [] }
        let mine = Set(currentUserReactions ?? [])
        return summary.flatMap { emoji, count -> [MeeshyReaction] in
            let meReacted = mine.contains(emoji)
            return (0..<count).map { index in
                MeeshyReaction(
                    messageId: messageId,
                    participantId: (meReacted && index == 0) ? currentUserId : nil,
                    emoji: emoji
                )
            }
        }
    }
}

// MARK: - Reaction Summary

public struct MeeshyReactionSummary: Sendable {
    public let emoji: String
    public let count: Int
    public let includesMe: Bool

    public init(emoji: String, count: Int, includesMe: Bool = false) {
        self.emoji = emoji; self.count = count; self.includesMe = includesMe
    }
}

public typealias MeeshyMessageReaction = MeeshyReactionSummary

// MARK: - Enriched Reaction Models

public struct ReactionUserDetail: Codable, Identifiable, Sendable {
    public let userId: String
    public let username: String
    public let avatar: String?
    public let createdAt: Date

    public var id: String { userId }

    public init(userId: String, username: String, avatar: String? = nil, createdAt: Date = Date()) {
        self.userId = userId
        self.username = username
        self.avatar = avatar
        self.createdAt = createdAt
    }
}

public struct ReactionGroup: Codable, Identifiable, Sendable {
    public let emoji: String
    public let count: Int
    public let users: [ReactionUserDetail]

    public var id: String { emoji }

    public init(emoji: String, count: Int, users: [ReactionUserDetail]) {
        self.emoji = emoji
        self.count = count
        self.users = users
    }
}

public struct ReactionSyncResponse: Codable, Sendable {
    public let messageId: String
    public let reactions: [ReactionGroup]
    public let totalCount: Int
    public let userReactions: [String]
}

// MARK: - Feed Item Model

public struct MeeshyFeedItem: Identifiable, Sendable {
    public let id = UUID()
    public let author: String
    public let content: String
    public let timestamp: Date
    public let likes: Int
    public let color: String

    public init(author: String, content: String, timestamp: Date = Date(), likes: Int = 0, color: String? = nil) {
        self.author = author; self.content = content; self.timestamp = timestamp; self.likes = likes
        self.color = color ?? DynamicColorGenerator.colorForName(author)
    }
}

// MARK: - Conversation Filter

public enum MeeshyConversationFilter: String, CaseIterable, Identifiable, Sendable {
    case all = "Tous"
    case unread = "Non lus"
    case personnel = "Personnel"
    case privee = "Privee"
    case ouvertes = "Ouvertes"
    case globales = "Globales"
    case channels = "Channels"
    case favoris = "Favoris"
    case archived = "Archives"

    public var id: String { self.rawValue }

    public var color: String {
        switch self {
        case .all: return "4ECDC4"
        case .unread: return "FF6B6B"
        case .personnel: return "3498DB"
        case .privee: return "F8B500"
        case .ouvertes: return "2ECC71"
        case .globales: return "E74C3C"
        case .channels: return "1ABC9C"
        case .favoris: return "F59E0B"
        case .archived: return "9B59B6"
        }
    }
}

// MARK: - Shared Contact Model

public struct SharedContact: Codable, Identifiable, Sendable {
    public let id: String
    public let fullName: String
    public var phoneNumbers: [String]
    public var emails: [String]

    public init(id: String = UUID().uuidString, fullName: String, phoneNumbers: [String] = [], emails: [String] = []) {
        self.id = id
        self.fullName = fullName
        self.phoneNumbers = phoneNumbers
        self.emails = emails
    }
}

// MARK: - ConversationColorPalette Codable + Hashable

extension ConversationColorPalette: Codable, Hashable {
    enum CodingKeys: String, CodingKey {
        case primary, secondary, accent, saturationBoost
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let primary = try container.decode(String.self, forKey: .primary)
        let secondary = try container.decode(String.self, forKey: .secondary)
        let accent = try container.decode(String.self, forKey: .accent)
        let saturationBoost = try container.decode(Double.self, forKey: .saturationBoost)
        self.init(primary: primary, secondary: secondary, accent: accent, saturationBoost: saturationBoost)
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(primary, forKey: .primary)
        try container.encode(secondary, forKey: .secondary)
        try container.encode(accent, forKey: .accent)
        try container.encode(saturationBoost, forKey: .saturationBoost)
    }

    public func hash(into hasher: inout Hasher) {
        hasher.combine(primary)
        hasher.combine(secondary)
        hasher.combine(accent)
        hasher.combine(saturationBoost)
    }

    public static func == (lhs: ConversationColorPalette, rhs: ConversationColorPalette) -> Bool {
        lhs.primary == rhs.primary && lhs.secondary == rhs.secondary
            && lhs.accent == rhs.accent && lhs.saturationBoost == rhs.saturationBoost
    }
}

// MARK: - CacheIdentifiable Conformance

extension MeeshyConversation: CacheIdentifiable {}
extension MeeshyMessage: CacheIdentifiable {}
