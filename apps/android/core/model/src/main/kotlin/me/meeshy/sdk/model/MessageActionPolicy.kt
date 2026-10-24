package me.meeshy.sdk.model

import me.meeshy.sdk.model.translation.DeviceTranslationEligibility

/**
 * CE QU'UN LECTEUR PEUT FAIRE D'UN MESSAGE (#11205, #11209) — miroir exact de `messageActionsFor`
 * (`packages/shared/utils/message-action-policy.ts`, qui fait foi) et de `MessageActionPolicy.swift`.
 * Loi PURE, horloge injectée : verdicts ET groupes, dans le même ordre.
 * `MessageActionPolicyVectorParityTest` rejoue `fixtures/action-policy/message-actions.vectors.json`.
 *
 * La loi reprend `admitMessageEdit`, `admitMessageDelete` et `admitConversationWriteFor`
 * (passerelle) : elle n'offre jamais ce qu'ils refusent et peut offrir MOINS (E2EE, vue unique,
 * message système). Rôle de plateforme comparé EXACTEMENT pour modérer ; rang de conversation
 * exact, inconnu ⇒ 0. Réagir n'est pas écrire. E2EE au sens de `sharedTranslationServerReadsMessage` :
 * ni édition ni transfert, traduction sur l'appareil, services qui lisent le clair ABSENTS.
 * Transférer, copier, enregistrer : la loi de sortie ([ContentExitLaw]), flou compris.
 *
 * Signaler suit la loi TS (`verifierCible`, #11220) : jamais sur son propre message.
 */
object MessageActionPolicy {

    /** 24 heures, bornes incluses — la fenêtre d'édition de l'AUTEUR (`messageEditAdmission.ts`). */
    const val EDIT_WINDOW_MILLIS: Long = 24L * 60 * 60 * 1000

    /** Au-delà, les actions passent dans « Plus… ». */
    const val MAX_PRIMARY_ACTIONS: Int = 6

    const val GLOBAL_CONVERSATION_TYPE: String = "global"

    /** La conversation telle que la loi la lit. Un type inconnu n'ouvre rien qui dépende du type. */
    data class Conversation(
        /** direct | group | public | global | broadcast. */
        val type: String,
        val encryptionMode: String? = null,
        val isActive: Boolean? = true,
        /** Sa seule PRÉSENCE clôt la conversation. */
        val closedAt: String? = null,
        val isAnnouncementChannel: Boolean? = false,
        val defaultWriteRole: String? = null,
    ) {
        val isClosed: Boolean get() = isActive == false || closedAt != null

        /** Le régime de la CONVERSATION retire-t-il au serveur le clair ? Même loi que la traduction partagée. */
        val isEndToEnd: Boolean
            get() = !DeviceTranslationEligibility.serverReadsMessage(
                conversationEncryptionMode = encryptionMode,
                isEncrypted = false,
                encryptionMode = null,
            )

        val isGlobal: Boolean get() = type == GLOBAL_CONVERSATION_TYPE
    }

    /** Le message tel que la loi le lit : son contenu, son auteur, ses horloges. */
    data class Message(
        val subject: MessageContentKind.Subject,
        /** `Participant.id` de l'auteur. */
        val senderId: String? = null,
        /** `User.id` de l'auteur ; absent pour un invité. */
        val authorUserId: String? = null,
        val createdAtMillis: Long? = null,
        /** Épinglé : le geste devient « Désépingler ». */
        val pinnedAt: String? = null,
        /** Avis de capture : le lecteur a écrit le message qu'il nomme — l'hôte le sait, la loi ne lit rien. */
        val capturedMessageIsMine: Boolean? = null,
    )

    data class Input(
        val message: Message,
        val conversation: Conversation,
        val viewer: ConversationViewerAuthority,
        val nowMillis: Long,
    )

    enum class Action(val wireValue: String) {
        RETRY("retry"),
        REPLY("reply"),
        OPEN_LINK("openLink"),
        COPY_LINK("copyLink"),
        OPEN_IN_MAPS("openInMaps"),
        COPY_ADDRESS("copyAddress"),
        SAVE_CONTACT("saveContact"),
        VIEW_RESULTS("viewResults"),
        EDIT("edit"),
        COPY("copy"),
        FORWARD("forward"),
        TRANSLATE("translate"),
        SAVE("save"),
        TRANSCRIBE("transcribe"),
        SENTIMENT("sentiment"),
        REPORT("report"),
        PIN("pin"),
        UNPIN("unpin"),
        REMOVE("remove"),
        DELETE_FOR_EVERYONE("deleteForEveryone"),
        DELETE_FOR_ME("deleteForMe"),
        DISCARD("discard"),
        ;

        companion object {
            fun fromWire(value: String): Action? = entries.firstOrNull { it.wireValue == value }
        }
    }

    data class Groups(
        val primary: List<Action>,
        val organize: List<Action>,
        val more: List<Action>,
        val moderation: List<Action>,
        val destructive: List<Action>,
    )

    /** [windowEndsAtMillis] : fin de la fenêtre de l'auteur ; `null` quand un rôle l'ouvre sans fenêtre. */
    data class EditVerdict(val asModerator: Boolean, val windowEndsAtMillis: Long?)

    /** Retrait par un tiers modérateur : un motif est exigé, l'auteur en est prévenu. */
    data class RemoveVerdict(val reasonRequired: Boolean) {
        companion object {
            val WithReason: RemoveVerdict = RemoveVerdict(reasonRequired = true)
        }
    }

    enum class TranslateVerdict(val wireValue: String) { SERVED_SWITCH("served-switch"), DEVICE("device") }

    enum class PinVerdict(val wireValue: String, val action: Action) {
        PIN("pin", Action.PIN),
        UNPIN("unpin", Action.UNPIN),
    }

    enum class ServerFeatureAbsence(val wireValue: String) { E2EE_SERVER_FEATURE_ABSENT("e2ee-server-feature-absent") }

    data class Verdicts(
        val edit: EditVerdict?,
        val deleteForEveryone: Boolean,
        val deleteForMe: Boolean,
        val remove: RemoveVerdict?,
        val pin: PinVerdict?,
        /** `verifierCible` : un membre actif, jamais sur son propre message (#11220). */
        val report: Boolean,
        /** Un message vivant, non système, un membre actif d'une conversation ouverte — sans le droit d'écrire. */
        val canReact: Boolean,
        /** Le droit d'écrire en plus (`admitConversationWriteFor`). */
        val canReply: Boolean,
        val translate: TranslateVerdict?,
        /** `null` : le service n'existe pas dans ce mode (voir [serverFeatureAbsence]). */
        val transcribe: Boolean?,
        val sentiment: Boolean?,
        val forward: Boolean,
        val copy: Boolean,
        val save: Boolean,
        val serverFeatureAbsence: ServerFeatureAbsence?,
    )

    data class Result(
        val content: MessageContentKind.Shape,
        val groups: Groups,
        val verdicts: Verdicts,
    )

    fun actionsFor(input: Input): Result {
        val context = MessageActionContext.of(input)
        val verdicts = verdictsOf(context)
        return Result(content = context.content, groups = groupsOf(context, verdicts), verdicts = verdicts)
    }

    /** `admitConversationWriteFor`, plus la permission d'envoi de l'invité ; un rang requis inconnu échoue fermé. */
    fun viewerCanWrite(conversation: Conversation, viewer: ConversationViewerAuthority): Boolean {
        if (conversation.isClosed || !viewer.isActiveMember || !viewer.canSendMessages) return false
        if (conversation.isGlobal) return !viewer.isDeclaredMinor
        if (conversation.type in WRITE_HIERARCHY_FREE_TYPES) return true
        val announcement = conversation.isAnnouncementChannel == true || conversation.type == "broadcast"
        val requiredRole = if (announcement) MemberRole.ADMIN.wireValue else conversation.defaultWriteRole ?: EVERYONE_WRITE_ROLE
        return viewer.memberRank >= requiredWriteRank(requiredRole) || viewer.moderatesPlatform
    }

    /**
     * `WRITE_PERMISSION_HIERARCHY` (`packages/shared/types/role-types.ts`) lu sur [MemberRole] :
     * `everyone` vaut 0, un rang exact son niveau, toute autre valeur exige le créateur (fermé).
     */
    fun requiredWriteRank(role: String): Int {
        if (role == EVERYONE_WRITE_ROLE) return 0
        return ConversationViewerAuthority.exactMemberRole(role)?.level ?: MemberRole.CREATOR.level
    }

    // ── Tables ──

    private const val EVERYONE_WRITE_ROLE = "everyone"
    private val MODERATED_TYPES: Set<String> = setOf("group", "public", "global", "broadcast")
    private val WRITE_HIERARCHY_FREE_TYPES: Set<String> = setOf("global", "direct")
    private val SAVEABLE_KINDS: Set<MessageContentKind> = setOf(
        MessageContentKind.IMAGE, MessageContentKind.VIDEO, MessageContentKind.AUDIO,
        MessageContentKind.FILE, MessageContentKind.MULTI,
    )

    /** Un lieu, un sondage, un sticker : leur texte n'en porte pas la structure (`metadata`). */
    private val EDITABLE_KINDS: Set<MessageContentKind> = setOf(
        MessageContentKind.TEXT, MessageContentKind.LINK, MessageContentKind.IMAGE, MessageContentKind.VIDEO,
        MessageContentKind.AUDIO, MessageContentKind.FILE, MessageContentKind.CONTACT, MessageContentKind.MULTI,
    )

    // ── Verdicts ──

    /** `admitMessageEdit` — auteur 24 h, rôle global au-delà ou sur autrui — plus les refus propres au client. */
    private fun editVerdict(context: MessageActionContext): EditVerdict? {
        val flags = context.content.flags
        val offered = context.live && context.registered && context.hasText &&
            context.content.kind in EDITABLE_KINDS && !context.e2ee && !flags.viewOnce
        if (!offered || context.conversation.isClosed) return null
        if (context.conversation.isGlobal && context.viewer.isDeclaredMinor) return null
        if (!context.isAuthor) {
            val moderates = context.viewer.isActiveMember && context.viewer.moderatesPlatform
            return if (moderates) EditVerdict(asModerator = true, windowEndsAtMillis = null) else null
        }
        val createdAt = context.message.createdAtMillis
            ?: return EditVerdict(asModerator = false, windowEndsAtMillis = null)
        if (context.nowMillis - createdAt <= EDIT_WINDOW_MILLIS) {
            return EditVerdict(asModerator = false, windowEndsAtMillis = createdAt + EDIT_WINDOW_MILLIS)
        }
        return if (context.viewer.moderatesPlatform) EditVerdict(asModerator = false, windowEndsAtMillis = null) else null
    }

    private data class DeleteVerdict(val forEveryone: Boolean, val remove: Boolean)

    /**
     * `admitMessageDelete` : l'auteur sans fenêtre ; un tiers privilégié retire, jamais en direct ;
     * l'auteur du capturé retire l'avis. Plus strict : un avis système ou un résumé d'appel ne
     * s'efface pas pour tous.
     */
    private fun deleteVerdict(context: MessageActionContext): DeleteVerdict {
        val viewer = context.viewer
        val captureNotice = context.content.flags.captureNotice
        if (!context.live || !context.registered || (context.notice && !captureNotice)) {
            return DeleteVerdict(forEveryone = false, remove = false)
        }
        if (context.isAuthor) return DeleteVerdict(forEveryone = !captureNotice, remove = false)
        val privileged = viewer.memberRank >= MemberRole.MODERATOR.level || viewer.moderatesPlatform
        if (privileged) return DeleteVerdict(forEveryone = false, remove = context.conversation.type in MODERATED_TYPES)
        val capturedIsMine = context.message.capturedMessageIsMine == true
        return DeleteVerdict(forEveryone = captureNotice && capturedIsMine && viewer.isActiveMember, remove = false)
    }

    /**
     * `admitMessagePin` (`messages-pin.ts`, #11219) : une épingle se voit de tous, donc épingler et
     * désépingler exigent le droit d'écrire. Plus strict sur les avis, la vue unique et les invités.
     */
    private fun pinVerdict(context: MessageActionContext): PinVerdict? {
        val pinnable = context.live && context.registered && !context.notice && !context.content.flags.viewOnce &&
            viewerCanWrite(context.conversation, context.viewer)
        if (!pinnable) return null
        return if (MessagePinToggle.isPinned(context.message.pinnedAt)) PinVerdict.UNPIN else PinVerdict.PIN
    }

    private fun verdictsOf(context: MessageActionContext): Verdicts {
        val kind = context.content.kind
        val flags = context.content.flags
        val deletion = deleteVerdict(context)
        val reacts = context.live && !context.notice && context.viewer.isActiveMember &&
            context.viewer.canSendMessages && !context.conversation.isClosed
        fun serverFeature(applies: Boolean): Boolean? =
            if (context.e2ee) null else applies && context.live && context.readable
        val translatable = context.hasText && context.readable && context.live
        return Verdicts(
            edit = editVerdict(context),
            deleteForEveryone = deletion.forEveryone,
            deleteForMe = context.registered && context.viewer.isActiveMember && !flags.optimistic,
            remove = if (deletion.remove) RemoveVerdict.WithReason else null,
            pin = pinVerdict(context),
            report = context.live && context.registered && context.viewer.isActiveMember &&
                !context.notice && !context.isMine,
            canReact = reacts,
            canReply = reacts && !flags.viewOnce && viewerCanWrite(context.conversation, context.viewer),
            translate = when {
                !translatable -> null
                context.e2ee -> TranslateVerdict.DEVICE
                else -> TranslateVerdict.SERVED_SWITCH
            },
            transcribe = serverFeature(kind == MessageContentKind.AUDIO),
            sentiment = serverFeature(context.hasText),
            forward = context.live && !context.notice && !context.e2ee &&
                !context.piecesNotServerCopyable && context.forwardable,
            copy = context.hasText && !context.gone && context.exportable,
            save = context.live && context.exportable && kind in SAVEABLE_KINDS,
            serverFeatureAbsence = if (context.e2ee) ServerFeatureAbsence.E2EE_SERVER_FEATURE_ABSENT else null,
        )
    }

    // ── Groupes ──

    private fun kindActions(context: MessageActionContext): List<Action> {
        if (!context.readable) return emptyList()
        val offered: List<Pair<Action, Boolean>> = when (context.content.kind) {
            MessageContentKind.LINK -> listOf(Action.OPEN_LINK to false, Action.COPY_LINK to true)
            MessageContentKind.LOCATION -> listOf(Action.OPEN_IN_MAPS to false, Action.COPY_ADDRESS to true)
            MessageContentKind.CONTACT -> listOf(Action.SAVE_CONTACT to true)
            MessageContentKind.POLL -> listOf(Action.VIEW_RESULTS to false)
            else -> emptyList()
        }
        return offered.filter { (_, exports) -> !exports || context.exportable }.map { it.first }
    }

    private fun MutableList<Action>.addWhen(condition: Boolean, action: Action) {
        if (condition) add(action)
    }

    private fun groupsOf(context: MessageActionContext, verdicts: Verdicts): Groups {
        val kind = context.content.kind
        val failed = context.content.flags.failed
        val destructive = buildList<Action> {
            addWhen(verdicts.deleteForEveryone, Action.DELETE_FOR_EVERYONE)
            addWhen(verdicts.deleteForMe, Action.DELETE_FOR_ME)
            addWhen(failed, Action.DISCARD)
        }
        if (context.gone) {
            return Groups(emptyList(), emptyList(), emptyList(), emptyList(), destructive)
        }
        val candidates = buildList<Action> {
            addWhen(failed, Action.RETRY)
            addWhen(verdicts.canReply, Action.REPLY)
            addAll(kindActions(context))
            addWhen(verdicts.edit != null, Action.EDIT)
            addWhen(verdicts.copy && kind != MessageContentKind.LOCATION, Action.COPY)
            addWhen(verdicts.forward, Action.FORWARD)
            addWhen(verdicts.translate != null, Action.TRANSLATE)
            addWhen(verdicts.save, Action.SAVE)
            addWhen(verdicts.transcribe == true, Action.TRANSCRIBE)
        }
        val more = buildList<Action> {
            addAll(candidates.drop(MAX_PRIMARY_ACTIONS))
            addWhen(verdicts.sentiment == true, Action.SENTIMENT)
            addWhen(verdicts.report, Action.REPORT)
        }
        return Groups(
            primary = candidates.take(MAX_PRIMARY_ACTIONS),
            organize = listOfNotNull(verdicts.pin?.action),
            more = more,
            moderation = if (verdicts.remove != null) listOf(Action.REMOVE) else emptyList(),
            destructive = destructive,
        )
    }
}

/** Ce que la loi dérive UNE fois d'une entrée, avant de rendre ses verdicts. */
internal class MessageActionContext(
    val message: MessageActionPolicy.Message,
    val conversation: MessageActionPolicy.Conversation,
    val viewer: ConversationViewerAuthority,
    val nowMillis: Long,
    val content: MessageContentKind.Shape,
    val registered: Boolean,
    val notice: Boolean,
    val forwardable: Boolean,
    val exportable: Boolean,
    val e2ee: Boolean,
    val gone: Boolean,
    val live: Boolean,
    val isAuthor: Boolean,
    val isMine: Boolean,
    val hasText: Boolean,
    val readable: Boolean,
    /** `sourceIsEncrypted` de `forwardAdmission` : des pièces sous régime `server`/`hybrid` ne se recopient pas. */
    val piecesNotServerCopyable: Boolean,
) {
    companion object {
        private val NOTICE_KINDS: Set<MessageContentKind> = setOf(MessageContentKind.SYSTEM, MessageContentKind.CALL)

        fun of(input: MessageActionPolicy.Input): MessageActionContext {
            val subject = input.message.subject
            val content = MessageContentKind.shapeOf(subject)
            val flags = content.flags
            val viewer = input.viewer
            val registered = viewer.isRegistered
            val expiresAt = subject.expiresAtMillis
            val gone = content.kind == MessageContentKind.DELETED || (expiresAt != null && expiresAt <= input.nowMillis)
            val authorUserId = input.message.authorUserId
            val isAuthor = registered && authorUserId != null && authorUserId == viewer.id
            val participantId = viewer.participantId ?: if (registered) null else viewer.id
            val notice = content.kind in NOTICE_KINDS
            val exit = ContentExitLaw.of(subject.contentExitSubject)
            return MessageActionContext(
                message = input.message,
                conversation = input.conversation,
                viewer = viewer,
                nowMillis = input.nowMillis,
                content = content,
                registered = registered,
                notice = notice,
                forwardable = exit.forward.isAllowed,
                exportable = exit.exportable && !blurredForExport(subject),
                e2ee = flags.encrypted || input.conversation.isEndToEnd,
                gone = gone,
                live = !gone && !flags.optimistic && !flags.failed,
                isAuthor = isAuthor,
                isMine = isAuthor || (participantId != null && input.message.senderId == participantId),
                hasText = !notice && !subject.content.isNullOrBlank(),
                readable = !gone && !flags.viewOnce && !flags.blurred,
                piecesNotServerCopyable = subject.pieces.isNotEmpty() &&
                    (hasRegime(input.conversation.encryptionMode) || hasRegime(subject.encryptionMode) ||
                        subject.isEncrypted == true),
            )
        }

        private fun hasRegime(mode: String?): Boolean = !mode.isNullOrBlank()

        /**
         * D8 (#10949) : un message flouté, ou dont TOUTES les pièces le sont, se transfère mais ne
         * s'exporte pas. `contentExitLaw` le porte côté TypeScript (`BLURRED_ORDINARY`) ;
         * [ContentExitLaw.of] laisse le flou à l'appelant, qui le COMPOSE ici.
         */
        private fun blurredForExport(subject: MessageContentKind.Subject): Boolean {
            fun blurred(column: Boolean?, bits: Long?): Boolean =
                column == true || ((bits ?: 0L) and MessageEffectFlags.BLURRED) != 0L
            val pieces = subject.pieces
            return blurred(subject.isBlurred, subject.effectFlags) ||
                (pieces.isNotEmpty() && pieces.all { blurred(it.isBlurred, it.effectFlags) })
        }
    }
}
