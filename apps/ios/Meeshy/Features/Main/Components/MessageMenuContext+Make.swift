import Foundation
import MeeshySDK

// MARK: - Le lecteur et la conversation, tels que la loi les lit (#11214)

/// **CE QU'EST le lecteur dans la conversation ouverte, et ce qu'est la
/// conversation** — les deux entrées de `MessageActionPolicy` qui ne dépendent
/// pas du message. Construite UNE fois par `ConversationView`
/// (`menuAuthority`), remise à l'overlay d'appui long, à la feuille « Plus… »
/// et au double toucher.
///
/// Elle remplace `isCurrentUserAdminOrMod`, un booléen qui oubliait le
/// CRÉATEUR, pliait la casse que la passerelle compare exactement, et ouvrait
/// l'édition du message d'autrui à un rang de conversation que la passerelle
/// refuse.
struct ConversationMenuAuthority: Equatable {
    let viewer: ConversationViewerAuthority
    let conversation: MessageActionPolicy.Conversation

    /// Les rôles voyagent tels que servis ; un invité est lu à sa session,
    /// jamais à son absence de rôle. `isDeclaredMinor` n'est pas servi à
    /// l'app : la passerelle garde seule ce refus.
    static func make(conversation: Conversation?, currentUser: MeeshyUser?, guest: AnonymousSessionContext?) -> ConversationMenuAuthority {
        let viewer = ConversationViewerAuthority(
            id: guest?.participantId ?? currentUser?.id ?? "",
            participantId: guest?.participantId,
            hasAccount: guest == nil && currentUser != nil,
            isAnonymous: guest != nil || currentUser?.isAnonymous == true,
            platformRoleRaw: guest == nil ? currentUser?.role : nil,
            conversationRoleRaw: conversation?.currentUserRole,
            isActiveMember: conversation != nil,
            canSendMessages: guest?.permissions.canSendMessages ?? true,
            isDeclaredMinor: declaresMinor(conversation)
        )
        return ConversationMenuAuthority(viewer: viewer, conversation: policyConversation(of: conversation))
    }

    /// **Le lecteur est-il mineur DANS cette conversation ?** La passerelle le
    /// dit par `viewerWriteRestriction` (calculée de `User.birthDate`, `null` à
    /// 18 ans) ; seule `minor-global` ferme l'écriture. Une restriction inconnue
    /// laisse écrire : c'est la passerelle qui refuse, et le refus dit pourquoi.
    /// Site unique, partagé par le menu d'un message et celui d'une rangée de liste.
    nonisolated static func declaresMinor(_ conversation: Conversation?) -> Bool {
        conversation?.viewerWriteRestriction?.closesComposer ?? false
    }

    /// Sans conversation, rien de ce qui dépend du type ne s'ouvre.
    static func policyConversation(of conversation: Conversation?) -> MessageActionPolicy.Conversation {
        guard let conversation else { return MessageActionPolicy.Conversation(type: "", isActive: false) }
        return MessageActionPolicy.Conversation(
            type: conversation.type.rawValue,
            encryptionMode: conversation.encryptionMode,
            isActive: conversation.isActive,
            closedAt: conversation.closedAt,
            isAnnouncementChannel: conversation.isAnnouncementChannel,
            defaultWriteRole: conversation.defaultWriteRole
        )
    }
}

// MARK: - Ce que le lecteur sait d'un message, hors de la loi

/// Les faits LOCAUX du menu — favori, révisions, accusés, stickers, export —
/// que la loi partagée ne connaît pas : ils vivent sur l'appareil.
struct MessageMenuFacts: Equatable {
    var isStarred = false
    var hasEditRevisions = false
    var showReadReceipts = true
    var stickerFavorite: Bool? = nil
    var stickerAddable = false
    var hasDefaultExportFormat = false
}

// MARK: - La fabrique unique

extension MessageMenuContext {

    /// Le menu FERMÉ — ce qu'un aperçu monté hors de son hôte offre : « Plus… »
    /// seul, aucun verdict ouvert par défaut.
    static var closed: MessageMenuContext {
        MessageMenuContext(
            isMine: false, canEdit: false, canDelete: false, hasText: false, hasMedia: false,
            hasTimebasedMedia: false, isPinned: false, isStarred: false, isEdited: false,
            hasEditRevisions: false, canReply: false, canPin: false, canStar: false,
            canReport: false, canTranslate: false, canReact: false, canDeleteForMe: false, isGone: true
        )
    }

    /// **Le SEUL site de production qui construit le contexte d'un menu de
    /// message** (#11214) — l'overlay d'appui long, la feuille « Plus… », le
    /// double toucher et l'aperçu d'une pièce le lisent tous ici. Quatre règles
    /// locales divergeaient : l'édition sans fenêtre, la suppression composée à
    /// la main, le créateur oublié, l'épinglage ouvert à tous.
    static func make(
        message: Message,
        viewModel: ConversationViewModel,
        authority: ConversationMenuAuthority,
        now: Date = Date()
    ) -> MessageMenuContext {
        let facts = MessageMenuFacts(
            isStarred: viewModel.isStarred(messageId: message.id),
            hasEditRevisions: !viewModel.editRevisions(for: message.id).isEmpty,
            showReadReceipts: GuestViewerAccess.offersWhoSaw(
                prefersReadReceipts: UserPreferencesManager.shared.privacy.showReadReceipts,
                isGuest: !authority.viewer.isRegistered
            ),
            stickerFavorite: MessageStickerFavorite.state(for: message.sticker),
            stickerAddable: ReceivedSticker.offersAdd(for: message, known: ReceivedStickerLedger.shared.ids),
            hasDefaultExportFormat: MessageCardExportMenu.hasDefaultFormat
        )
        return make(message: message, facts: facts, authority: authority, now: now)
    }

    /// Le message visé par son id — un message disparu entre-temps n'ouvre rien.
    static func make(messageId: String, viewModel: ConversationViewModel, authority: ConversationMenuAuthority) -> MessageMenuContext {
        guard let index = viewModel.messageIndex(for: messageId) else { return .closed }
        return make(message: viewModel.messages[index], viewModel: viewModel, authority: authority)
    }

    /// La projection PURE de la loi : aucun singleton, `now` injecté.
    static func make(
        message: Message,
        facts: MessageMenuFacts,
        authority: ConversationMenuAuthority,
        now: Date
    ) -> MessageMenuContext {
        let law = MessageActionPolicy.actions(for: MessageActionPolicy.Input(
            message: MessageMenuPolicyInput.message(of: message, viewerId: authority.viewer.id),
            conversation: authority.conversation,
            viewer: authority.viewer,
            now: now
        ))
        let verdicts = law.verdicts
        let kind = law.content.kind
        let gone = kind == .deleted || (message.expiresAt.map { $0 <= now } ?? false)
        // Un envoi jamais parti (`cid_…`) est OPTIMISTE pour la loi : ni « pour
        // moi » ni « pour tous », mais `.discard` — sans lui, il restait dans le fil.
        let discards = law.groups.destructive.contains(.discard)
        return MessageMenuContext(
            isMine: message.isMe,
            canEdit: verdicts.edit != nil,
            canDelete: verdicts.deleteForEveryone || verdicts.deleteForMe || verdicts.remove != nil || discards,
            hasText: !message.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
            hasMedia: !message.attachments.isEmpty,
            hasTimebasedMedia: message.attachments.contains { AttachmentKind(mimeType: $0.mimeType).hasTimebasedTrack },
            isPinned: message.pinnedAt != nil,
            isStarred: facts.isStarred,
            isEdited: message.isEdited,
            hasEditRevisions: facts.hasEditRevisions,
            hasCallSummary: message.callSummary != nil,
            saveableAttachmentCount: message.attachments.filter { $0.type != .location }.count,
            canComposeMedia: ComposableAttachment.offers(message: message),
            stickerFavorite: facts.stickerFavorite,
            isSticker: message.sticker != nil,
            stickerAddable: facts.stickerAddable,
            showReadReceipts: facts.showReadReceipts,
            // `exits` est LOAD-BEARING (#9573) : son défaut laisse tout sortir.
            exits: message.exitOffer,
            isViewOnce: message.holdsViewOnce,
            isBlurred: message.holdsBlur,
            hasDefaultExportFormat: facts.hasDefaultExportFormat,
            hasPaintableMedia: !MessageCardSubject.paintableMedia(of: message).isEmpty,
            canReply: verdicts.canReply,
            canPin: verdicts.pin != nil,
            canStar: authority.viewer.isRegistered && !gone,
            canReport: verdicts.report,
            // En E2EE la loi rend `.device` : la vue Langue ne sait demander
            // qu'au serveur, qui refuse. « Traduire » reste offert, mais par
            // l'APPAREIL (`DeviceTranslationCoordinator`), jamais par la vue Langue.
            canTranslate: verdicts.translate == .servedSwitch,
            translatesOnDevice: verdicts.translate == .device,
            canReact: verdicts.canReact,
            canRemove: verdicts.remove != nil,
            canDeleteForEveryone: verdicts.deleteForEveryone,
            canDeleteForMe: verdicts.deleteForMe,
            canDiscard: discards,
            canForward: verdicts.forward,
            isFailed: law.content.flags.failed,
            isGone: gone,
            isLocation: kind == .location,
            serverFeaturesAbsent: verdicts.serverFeatureAbsence != nil,
            kindActions: MessageKindTarget.offered(by: law.groups, for: message)
        )
    }
}

// MARK: - Ce que la loi lit d'un message de l'app

enum MessageMenuPolicyInput {

    /// L'auteur se lit d'abord à `isMe`, que l'app pose ; `senderUserId` n'est
    /// pas servi par tous les chemins (cache, NSE).
    static func message(of message: Message, viewerId: String) -> MessageActionPolicy.Message {
        MessageActionPolicy.Message(
            subject: subject(of: message),
            senderId: message.senderId,
            authorUserId: message.isMe ? viewerId : message.senderUserId,
            createdAt: message.createdAt,
            pinnedAt: message.pinnedAt
        )
    }

    /// Un avis (appel, arrivée, capture) est un message SYSTÈME pour la loi,
    /// quelle que soit la colonne qui l'a porté jusqu'à l'app.
    static func subject(of message: Message) -> MessageContentKind.Subject {
        let notice = message.messageSource == .system || message.callSummary != nil
            || message.joinNotice != nil || message.captureNotice != nil || message.arrivalsNotice != nil
        let pieces = message.attachments.map { piece -> MessageContentKind.Piece? in
            MessageContentKind.Piece(
                mimeType: piece.mimeType, originalName: piece.originalName, fileName: piece.fileName,
                isViewOnce: piece.isViewOnce, isBlurred: piece.isBlurred, effectFlags: piece.effectFlags
            )
        }
        return MessageContentKind.Subject(
            id: message.id,
            content: message.content,
            messageType: notice ? "system" : message.messageType.rawValue,
            deletedAt: message.deletedAt,
            isViewOnce: message.holdsViewOnce,
            isBlurred: message.holdsBlur,
            isEncrypted: message.isEncrypted,
            encryptionMode: message.encryptionMode,
            effectFlags: message.effects.flags.rawValue,
            expiresAt: message.expiresAt,
            ephemeralDuration: message.effects.ephemeralDuration.map { Double($0) },
            metadata: MessageContentKind.Metadata(
                kind: noticeKind(of: message),
                carriesSticker: message.sticker != nil,
                carriesLocation: message.location != nil
            ),
            attachments: pieces,
            failed: message.deliveryStatus == .failed
        )
    }

    private static func noticeKind(of message: Message) -> String? {
        if message.callSummary != nil { return "call" }
        return message.captureNotice != nil ? CaptureNoticeMetadata.kind : nil
    }
}

// MARK: - Les cibles des actions du type

/// Ce qu'ouvrent et copient les actions du TYPE : la loi dit qu'elles
/// s'offrent, l'app sait sur quoi elles portent. Une action dont la cible
/// manque ne s'offre pas — un contrôle existe s'il a un effet.
enum MessageKindTarget {

    static func offered(by groups: MessageActionPolicy.Groups, for message: Message) -> [PrimaryAction] {
        let link = firstRawLink(in: message.content) != nil
        let place = message.location != nil
        let opens = link && !linksAreInert(message)
        return (groups.primary + groups.more).compactMap { action -> PrimaryAction? in
            switch action {
            case .openLink: return opens ? .openLink : nil
            case .copyLink: return link ? .copyLink : nil
            case .openInMaps: return place ? .openInMaps : nil
            case .copyAddress: return place ? .copyAddress : nil
            default: return nil
            }
        }
    }

    /// Compilée une fois : la fabrique se rejoue à chaque rendu de l'overlay.
    private static let linkPattern = try? NSRegularExpression(pattern: "https?://[^\\s<>\"]+", options: [.caseInsensitive])

    /// #10286 — le lien d'un invité, ou d'un auteur sans compte prouvé, est
    /// INERTE dans la bulle (`BubbleContentBuilder`) : ni aperçu, ni toucher.
    /// Le menu ne rouvre pas la porte que la bulle garde fermée. Le copier
    /// reste offert : le texte est visible, et « Copier » le donne déjà.
    static func linksAreInert(_ message: Message) -> Bool {
        message.senderIsAnonymous || !message.senderHasAccount
    }

    static func firstRawLink(in text: String) -> String? {
        let range = NSRange(text.startIndex..., in: text)
        guard let match = linkPattern?.firstMatch(in: text, range: range),
              let bounds = Range(match.range, in: text) else { return nil }
        return String(text[bounds])
    }

    static func firstLink(in text: String) -> URL? {
        firstRawLink(in: text).flatMap { URL(string: $0) }
    }

    /// Ce qu'« Ouvrir le lien » ouvre : la redirection SUIVIE quand la
    /// passerelle en a émis une (`/l/<token>`, comme la bulle), sinon
    /// l'adresse ; rien pour un lien inerte.
    static func openableLink(of message: Message) -> URL? {
        guard !linksAreInert(message), let raw = firstRawLink(in: message.content) else { return nil }
        if let token = message.trackedLinkMap[raw], let tracked = TrackedLink.redirectURL(token: token) { return tracked }
        return URL(string: raw)
    }

    static func mapsURL(for place: SharedPlace) -> URL? {
        var components = URLComponents(string: "https://maps.apple.com/")
        let label = [place.name ?? place.address].compactMap { $0 }.map { URLQueryItem(name: "q", value: $0) }
        components?.queryItems = [URLQueryItem(name: "ll", value: "\(place.latitude),\(place.longitude)")] + label
        return components?.url
    }

    /// Le nom avant l'adresse, comme la puce de lieu ; à défaut, les coordonnées.
    static func address(of place: SharedPlace) -> String {
        place.name ?? place.address ?? "\(place.latitude), \(place.longitude)"
    }
}
