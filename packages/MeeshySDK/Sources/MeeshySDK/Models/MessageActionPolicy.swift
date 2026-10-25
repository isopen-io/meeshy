import Foundation

/// CE QU'UN LECTEUR PEUT FAIRE D'UN MESSAGE (#11205, #11209) — miroir exact de
/// `messageActionsFor` (`packages/shared/utils/message-action-policy.ts`), loi
/// PURE, `now` injecté : verdicts ET groupes, dans le même ordre.
/// `MessageActionPolicyVectorTests` rejoue les vecteurs que la loi TypeScript a
/// produits ; toute évolution touche les deux sites.
///
/// La loi reprend `admitMessageEdit`, `admitMessageDelete` et
/// `admitConversationWriteFor` (passerelle), qui font foi : elle n'offre jamais
/// ce qu'ils refusent et peut offrir MOINS (E2EE, vue unique, message système).
/// Rôle de plateforme comparé EXACTEMENT pour modérer ; rang de conversation
/// exact, inconnu ⇒ 0. Réagir n'est pas écrire. E2EE au sens de
/// `sharedTranslationServerReadsMessage` : ni édition ni transfert, traduction
/// sur l'appareil, services qui lisent le clair ABSENTS. Transférer, copier,
/// enregistrer : la loi de sortie, flou compris (D8, #10949).
public enum MessageActionPolicy {

    /// 24 heures, bornes incluses — la fenêtre d'édition de l'AUTEUR.
    public static let editWindow: TimeInterval = 24 * 60 * 60

    /// Au-delà, les actions passent dans « Plus… ».
    public static let maxPrimaryActions = 6

    /// La conversation telle que la loi la lit.
    public struct Conversation: Equatable, Sendable {
        /// direct | group | public | global | broadcast ; un type inconnu n'ouvre rien qui dépende du type.
        public let type: String
        public let encryptionMode: String?
        public let isActive: Bool?
        public let closedAt: Date?
        public let isAnnouncementChannel: Bool?
        public let defaultWriteRole: String?

        public init(
            type: String,
            encryptionMode: String? = nil,
            isActive: Bool? = true,
            closedAt: Date? = nil,
            isAnnouncementChannel: Bool? = false,
            defaultWriteRole: String? = nil
        ) {
            self.type = type
            self.encryptionMode = encryptionMode
            self.isActive = isActive
            self.closedAt = closedAt
            self.isAnnouncementChannel = isAnnouncementChannel
            self.defaultWriteRole = defaultWriteRole
        }

        public var isClosed: Bool { isActive == false || closedAt != nil }

        /// Le régime de la CONVERSATION retire-t-il au serveur le clair ? Même loi que la traduction partagée.
        public var isEndToEnd: Bool {
            !DeviceTranslationEligibility.serverReadsMessage(
                conversationEncryptionMode: encryptionMode, isEncrypted: false, encryptionMode: nil
            )
        }

        var isGlobal: Bool { type == "global" }
    }

    /// Le message tel que la loi le lit : son contenu, son auteur, ses horloges.
    public struct Message: Equatable, Sendable {
        public let subject: MessageContentKind.Subject
        /// `Participant.id` de l'auteur.
        public let senderId: String?
        /// `User.id` de l'auteur ; absent pour un invité.
        public let authorUserId: String?
        public let createdAt: Date?
        /// Épinglé : le geste devient « Désépingler ».
        public let pinnedAt: Date?
        /// Avis de capture : le lecteur a écrit le message qu'il nomme — l'hôte le sait, la loi ne lit rien.
        public let capturedMessageIsMine: Bool?

        public init(
            subject: MessageContentKind.Subject,
            senderId: String? = nil,
            authorUserId: String? = nil,
            createdAt: Date? = nil,
            pinnedAt: Date? = nil,
            capturedMessageIsMine: Bool? = nil
        ) {
            self.subject = subject
            self.senderId = senderId
            self.authorUserId = authorUserId
            self.createdAt = createdAt
            self.pinnedAt = pinnedAt
            self.capturedMessageIsMine = capturedMessageIsMine
        }
    }

    public struct Input: Equatable, Sendable {
        public let message: Message
        public let conversation: Conversation
        public let viewer: ConversationViewerAuthority
        public let now: Date

        public init(message: Message, conversation: Conversation, viewer: ConversationViewerAuthority, now: Date) {
            self.message = message
            self.conversation = conversation
            self.viewer = viewer
            self.now = now
        }
    }

    public enum Action: String, CaseIterable, Sendable {
        case retry, reply, openLink, copyLink, openInMaps, copyAddress, saveContact, viewResults
        case edit, copy, forward, translate, save, transcribe, sentiment, report, pin, unpin
        case remove, deleteForEveryone, deleteForMe, discard
    }

    public struct Groups: Equatable, Sendable {
        public let primary: [Action]
        public let organize: [Action]
        public let more: [Action]
        public let moderation: [Action]
        public let destructive: [Action]

        public init(primary: [Action], organize: [Action], more: [Action], moderation: [Action], destructive: [Action]) {
            self.primary = primary
            self.organize = organize
            self.more = more
            self.moderation = moderation
            self.destructive = destructive
        }
    }

    /// `windowEndsAt` : fin de la fenêtre de l'auteur ; `nil` quand un rôle l'ouvre sans fenêtre.
    public struct EditVerdict: Equatable, Sendable {
        public let asModerator: Bool
        public let windowEndsAt: Date?

        public init(asModerator: Bool, windowEndsAt: Date?) {
            self.asModerator = asModerator
            self.windowEndsAt = windowEndsAt
        }
    }

    /// Retrait par un tiers modérateur : un motif est exigé, l'auteur en est prévenu.
    public struct RemoveVerdict: Equatable, Sendable {
        public let reasonRequired: Bool

        public static let withReason = RemoveVerdict(reasonRequired: true)
    }

    public enum TranslateVerdict: String, Equatable, Sendable {
        case servedSwitch = "served-switch"
        case device
    }

    public enum PinVerdict: String, Equatable, Sendable {
        case pin, unpin

        var action: Action { self == .pin ? .pin : .unpin }
    }

    public enum ServerFeatureAbsence: String, Equatable, Sendable {
        case e2eeServerFeatureAbsent = "e2ee-server-feature-absent"
    }

    public struct Verdicts: Equatable, Sendable {
        public let edit: EditVerdict?
        public let deleteForEveryone: Bool
        public let deleteForMe: Bool
        public let remove: RemoveVerdict?
        public let pin: PinVerdict?
        public let report: Bool
        /// Un message vivant, non système, un membre actif d'une conversation ouverte — sans le droit d'écrire.
        public let canReact: Bool
        /// Le droit d'écrire en plus (`admitConversationWriteFor`).
        public let canReply: Bool
        public let translate: TranslateVerdict?
        /// `nil` : le service n'existe pas dans ce mode (voir `serverFeatureAbsence`).
        public let transcribe: Bool?
        public let sentiment: Bool?
        public let forward: Bool
        public let copy: Bool
        public let save: Bool
        public let serverFeatureAbsence: ServerFeatureAbsence?
    }

    public struct Result: Equatable, Sendable {
        public let content: MessageContentKind.Shape
        public let groups: Groups
        public let verdicts: Verdicts
    }

    public static func actions(for input: Input) -> Result {
        let context = MessageActionContext(input)
        let decided = verdicts(of: context)
        return Result(content: context.content, groups: groups(of: context, verdicts: decided), verdicts: decided)
    }

    /// `admitConversationWriteFor`, plus la permission d'envoi de l'invité ; un rang requis inconnu échoue fermé.
    public static func viewerCanWrite(in conversation: Conversation, viewer: ConversationViewerAuthority) -> Bool {
        if conversation.isClosed || !viewer.isActiveMember || !viewer.canSendMessages { return false }
        if conversation.isGlobal { return !viewer.isDeclaredMinor }
        if writeHierarchyFreeTypes.contains(conversation.type) { return true }
        let announcement = conversation.isAnnouncementChannel == true || conversation.type == "broadcast"
        let requiredRole = announcement ? MemberRole.admin.rawValue : conversation.defaultWriteRole ?? everyoneWriteRole
        return viewer.memberRank >= requiredWriteRank(of: requiredRole) || viewer.moderatesPlatform
    }

    /// `WRITE_PERMISSION_HIERARCHY` (`packages/shared/types/role-types.ts`) lu sur
    /// `MemberRole` : `everyone` vaut 0, un rang exact son niveau, tout autre
    /// valeur exige le créateur (fermé par défaut).
    static func requiredWriteRank(of role: String) -> Int {
        if role == everyoneWriteRole { return 0 }
        return MemberRole(rawValue: role)?.level ?? MemberRole.creator.level
    }

    // MARK: - Tables

    private static let moderatedTypes: Set<String> = ["group", "public", "global", "broadcast"]
    /// `server`/`hybrid` (#11374, #11381) : la passerelle refuse toute édition (`server-encrypted-at-rest`).
    private static let atRestRegimes: Set<String> = ["server", "hybrid"]

    private static func sealedAtRest(_ mode: String?) -> Bool {
        atRestRegimes.contains((mode ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased())
    }
    private static let writeHierarchyFreeTypes: Set<String> = ["global", "direct"]
    private static let everyoneWriteRole = "everyone"
    private static let saveableKinds: Set<MessageContentKind> = [.image, .video, .audio, .file, .multi]
    /// Un lieu, un sondage, un sticker : leur texte n'en porte pas la structure (`metadata`).
    private static let editableKinds: Set<MessageContentKind> = [.text, .link, .image, .video, .audio, .file, .contact, .multi]

    // MARK: - Verdicts

    /// `admitMessageEdit` — auteur 24 h, rôle global au-delà ou sur autrui — plus les refus propres au client.
    private static func editVerdict(_ context: MessageActionContext) -> EditVerdict? {
        let flags = context.content.flags
        let atRest = sealedAtRest(context.conversation.encryptionMode)
            || sealedAtRest(context.message.subject.encryptionMode)
        let offered = context.live && context.registered && context.hasText
            && editableKinds.contains(context.content.kind) && !context.e2ee && !atRest && !flags.viewOnce
        guard offered, !context.conversation.isClosed else { return nil }
        if context.conversation.isGlobal && context.viewer.isDeclaredMinor { return nil }
        guard context.isAuthor else {
            let moderates = context.viewer.isActiveMember && context.viewer.moderatesPlatform
            return moderates ? EditVerdict(asModerator: true, windowEndsAt: nil) : nil
        }
        guard let createdAt = context.message.createdAt else { return EditVerdict(asModerator: false, windowEndsAt: nil) }
        if !(context.now.timeIntervalSince(createdAt) > editWindow) {
            return EditVerdict(asModerator: false, windowEndsAt: createdAt.addingTimeInterval(editWindow))
        }
        return context.viewer.moderatesPlatform ? EditVerdict(asModerator: false, windowEndsAt: nil) : nil
    }

    /// `admitMessageDelete` : l'auteur sans fenêtre ; un tiers privilégié retire, jamais en direct ; l'auteur du
    /// capturé retire l'avis. Plus strict : un avis système ou un résumé d'appel ne s'efface pas pour tous.
    private static func deleteVerdict(_ context: MessageActionContext) -> (forEveryone: Bool, remove: Bool) {
        let viewer = context.viewer
        let captureNotice = context.content.flags.captureNotice
        if !context.live || !context.registered || (context.notice && !captureNotice) { return (false, false) }
        if context.isAuthor { return (!captureNotice, false) }
        let privileged = viewer.memberRank >= MemberRole.moderator.level || viewer.moderatesPlatform
        if privileged { return (false, moderatedTypes.contains(context.conversation.type)) }
        let capturedIsMine = context.message.capturedMessageIsMine == true
        return (captureNotice && capturedIsMine && viewer.isActiveMember, false)
    }

    /// `admitMessagePin` (`messages-pin.ts`, #11219) : une épingle se voit de tous, donc épingler et désépingler
    /// exigent le droit d'écrire (`viewerCanWrite`). Plus strict sur les avis, la vue unique et les invités.
    private static func pinVerdict(_ context: MessageActionContext) -> PinVerdict? {
        let pinnable = context.live && context.registered && !context.notice && !context.content.flags.viewOnce
            && viewerCanWrite(in: context.conversation, viewer: context.viewer)
        guard pinnable else { return nil }
        return context.message.pinnedAt != nil ? PinVerdict.unpin : PinVerdict.pin
    }

    private static func verdicts(of context: MessageActionContext) -> Verdicts {
        let kind = context.content.kind
        let flags = context.content.flags
        let deletion = deleteVerdict(context)
        let reacts = context.live && !context.notice && context.viewer.isActiveMember
            && context.viewer.canSendMessages && !context.conversation.isClosed
        let serverFeature: (Bool) -> Bool? = { applies in
            context.e2ee ? nil : applies && context.live && context.readable
        }
        let translatable = context.hasText && context.readable && context.live
        return Verdicts(
            edit: editVerdict(context),
            deleteForEveryone: deletion.forEveryone,
            deleteForMe: context.registered && context.viewer.isActiveMember && !flags.optimistic,
            remove: deletion.remove ? RemoveVerdict.withReason : nil,
            pin: pinVerdict(context),
            report: context.live && context.registered && context.viewer.isActiveMember
                && !context.notice && !context.isMine,
            canReact: reacts,
            canReply: reacts && !flags.viewOnce && viewerCanWrite(in: context.conversation, viewer: context.viewer),
            translate: translatable ? (context.e2ee ? TranslateVerdict.device : TranslateVerdict.servedSwitch) : nil,
            transcribe: serverFeature(kind == .audio),
            sentiment: serverFeature(context.hasText),
            forward: context.live && !context.notice && !context.e2ee && !context.piecesNotServerCopyable && context.forwardable,
            copy: context.hasText && !context.gone && context.exportable,
            save: context.live && context.exportable && saveableKinds.contains(kind),
            serverFeatureAbsence: context.e2ee ? ServerFeatureAbsence.e2eeServerFeatureAbsent : nil
        )
    }

    // MARK: - Groupes

    private static func kindActions(_ context: MessageActionContext) -> [Action] {
        guard context.readable else { return [] }
        let offered: [(action: Action, exports: Bool)]
        switch context.content.kind {
        case .link: offered = [(.openLink, false), (.copyLink, true)]
        case .location: offered = [(.openInMaps, false), (.copyAddress, true)]
        case .contact: offered = [(.saveContact, true)]
        case .poll: offered = [(.viewResults, false)]
        default: offered = []
        }
        return offered.filter { !$0.exports || context.exportable }.map { $0.action }
    }

    private static func when(_ condition: Bool, _ action: Action) -> [Action] {
        condition ? [action] : []
    }

    private static func groups(of context: MessageActionContext, verdicts: Verdicts) -> Groups {
        let kind = context.content.kind
        let failed = context.content.flags.failed
        let destructive: [Action] = [
            when(verdicts.deleteForEveryone, .deleteForEveryone),
            when(verdicts.deleteForMe, .deleteForMe),
            when(failed, .discard),
        ].flatMap { $0 }
        if context.gone { return Groups(primary: [], organize: [], more: [], moderation: [], destructive: destructive) }
        let candidates: [Action] = [
            when(failed, .retry),
            when(verdicts.canReply, .reply),
            kindActions(context),
            when(verdicts.edit != nil, .edit),
            when(verdicts.copy && kind != .location, .copy),
            when(verdicts.forward, .forward),
            when(verdicts.translate != nil, .translate),
            when(verdicts.save, .save),
            when(verdicts.transcribe == true, .transcribe),
        ].flatMap { $0 }
        let more: [Action] = [
            Array(candidates.dropFirst(maxPrimaryActions)),
            when(verdicts.sentiment == true, .sentiment),
            when(verdicts.report, .report),
        ].flatMap { $0 }
        return Groups(
            primary: Array(candidates.prefix(maxPrimaryActions)),
            organize: verdicts.pin.map { [$0.action] } ?? [],
            more: more,
            moderation: when(verdicts.remove != nil, .remove),
            destructive: destructive
        )
    }
}

/// Ce que la loi dérive UNE fois d'une entrée, avant de rendre ses verdicts.
private struct MessageActionContext {
    let message: MessageActionPolicy.Message
    let conversation: MessageActionPolicy.Conversation
    let viewer: ConversationViewerAuthority
    let now: Date
    let content: MessageContentKind.Shape
    let registered: Bool
    let notice: Bool
    let forwardable: Bool
    let exportable: Bool
    let e2ee: Bool
    let gone: Bool
    let live: Bool
    let isAuthor: Bool
    let isMine: Bool
    let hasText: Bool
    let readable: Bool
    /// `sourceIsEncrypted` de `forwardAdmission` : des pièces sous régime `server`/`hybrid` ne se recopient pas côté serveur.
    let piecesNotServerCopyable: Bool

    private static let noticeKinds: Set<MessageContentKind> = [.system, .call]

    init(_ input: MessageActionPolicy.Input) {
        let subject = input.message.subject
        let content = MessageContentKind.shape(of: subject)
        let flags = content.flags
        let viewer = input.viewer
        let registered = viewer.isRegistered
        let gone = content.kind == .deleted || (subject.expiresAt.map { $0 <= input.now } ?? false)
        let isAuthor = registered && input.message.authorUserId != nil && input.message.authorUserId == viewer.id
        let participantId = viewer.participantId ?? (registered ? nil : viewer.id)
        let notice = MessageActionContext.noticeKinds.contains(content.kind)
        let exit = ContentExitLaw.of(subject.contentExitSubject)
        let exportable = exit.exportable && !MessageActionContext.blurredForExport(subject)
        self.message = input.message
        self.conversation = input.conversation
        self.viewer = viewer
        self.now = input.now
        self.content = content
        self.registered = registered
        self.notice = notice
        self.forwardable = exit.forward.isAllowed
        self.exportable = exportable
        self.e2ee = flags.encrypted || input.conversation.isEndToEnd
        self.gone = gone
        self.live = !gone && !flags.optimistic && !flags.failed
        self.isAuthor = isAuthor
        self.isMine = isAuthor || (participantId.map { input.message.senderId == $0 } ?? false)
        self.hasText = !notice && !(subject.content ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        self.readable = !gone && !flags.viewOnce && !flags.blurred
        self.piecesNotServerCopyable = !subject.pieces.isEmpty
            && (MessageActionContext.hasRegime(input.conversation.encryptionMode)
                || MessageActionContext.hasRegime(subject.encryptionMode)
                || subject.isEncrypted == true)
    }

    private static func hasRegime(_ mode: String?) -> Bool {
        !(mode ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    /// D8 (#10949) : un message flouté, ou dont TOUTES les pièces le sont, se
    /// transfère mais ne s'exporte pas. `contentExitLaw` le porte côté
    /// TypeScript ; `ContentExitLaw.of` laisse le flou à l'appelant, qui le
    /// COMPOSE ici.
    private static func blurredForExport(_ subject: MessageContentKind.Subject) -> Bool {
        let blurred: (Bool?, UInt32?) -> Bool = { column, bits in
            column == true || ((bits ?? 0) & MessageEffectFlags.blurred.rawValue) != 0
        }
        let pieces = subject.pieces
        return blurred(subject.isBlurred, subject.effectFlags)
            || (!pieces.isEmpty && pieces.allSatisfy { blurred($0.isBlurred, $0.effectFlags) })
    }
}
