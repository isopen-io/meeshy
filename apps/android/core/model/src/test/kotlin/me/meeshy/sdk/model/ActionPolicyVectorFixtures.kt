package me.meeshy.sdk.model

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put

/**
 * Décodage des vecteurs `fixtures/action-policy/` (générés en EXÉCUTANT la loi TypeScript) vers
 * les entrées Kotlin, et rendu des sorties Kotlin dans la FORME JSON des attendus — pour que la
 * comparaison porte sur le document entier, verdict par verdict. Miroir de
 * `ActionPolicyVectorFixtures.swift`.
 */
internal object ActionPolicyVectorFixtures {

    const val MESSAGE_VECTORS = "action-policy/message-actions.vectors.json"
    const val CONVERSATION_VECTORS = "action-policy/conversation-actions.vectors.json"

    private fun JsonObject.present(key: String): Boolean = this[key] != null && this[key] !is JsonNull

    private fun JsonObject.str(key: String): String? = (this[key] as? JsonPrimitive)?.contentOrNull

    private fun JsonObject.bool(key: String): Boolean? = (this[key] as? JsonPrimitive)?.booleanOrNull

    private fun JsonObject.long(key: String): Long? = (this[key] as? JsonPrimitive)?.longOrNull

    private fun JsonObject.double(key: String): Double? = (this[key] as? JsonPrimitive)?.doubleOrNull

    fun conversation(json: JsonObject): MessageActionPolicy.Conversation = MessageActionPolicy.Conversation(
        type = json.str("type") ?: "",
        encryptionMode = json.str("encryptionMode"),
        isActive = json.bool("isActive"),
        closedAt = json.str("closedAt"),
        isAnnouncementChannel = json.bool("isAnnouncementChannel"),
        defaultWriteRole = json.str("defaultWriteRole"),
    )

    fun viewer(json: JsonObject): ConversationViewerAuthority = ConversationViewerAuthority(
        id = json.str("id") ?: "",
        participantId = json.str("participantId"),
        hasAccount = json.bool("hasAccount") ?: false,
        isAnonymous = json.bool("isAnonymous") ?: false,
        platformRoleRaw = json.str("platformRole"),
        conversationRoleRaw = json.str("conversationRole"),
        isActiveMember = json.bool("isActiveMember") ?: false,
        canSendMessages = json.bool("canSendMessages") ?: false,
        isDeclaredMinor = json.bool("isDeclaredMinor") ?: false,
    )

    private fun piece(json: JsonElement): MessageContentKind.Piece? {
        val obj = json as? JsonObject ?: return null
        return MessageContentKind.Piece(
            mimeType = obj.str("mimeType"),
            originalName = obj.str("originalName"),
            fileName = obj.str("fileName"),
            isViewOnce = obj.bool("isViewOnce"),
            isBlurred = obj.bool("isBlurred"),
            effectFlags = obj.long("effectFlags"),
        )
    }

    private fun metadata(json: JsonObject): MessageContentKind.Metadata {
        val obj = json["metadata"] as? JsonObject ?: return MessageContentKind.Metadata.Empty
        return MessageContentKind.Metadata(
            kind = obj.str("kind"),
            carriesSticker = obj.present("sticker"),
            carriesLocation = obj.present("location"),
            carriesPoll = obj.present("poll"),
        )
    }

    fun message(json: JsonObject): MessageActionPolicy.Message = MessageActionPolicy.Message(
        subject = MessageContentKind.Subject(
            id = json.str("id") ?: "",
            content = json.str("content"),
            messageType = json.str("messageType"),
            deletedAt = json.str("deletedAt"),
            isViewOnce = json.bool("isViewOnce"),
            isBlurred = json.bool("isBlurred"),
            isEncrypted = json.bool("isEncrypted"),
            encryptionMode = json.str("encryptionMode"),
            effectFlags = json.long("effectFlags"),
            expiresAt = json.str("expiresAt"),
            ephemeralDuration = json.double("ephemeralDuration"),
            metadata = metadata(json),
            attachments = (json["attachments"] as? JsonArray)?.map(::piece),
            failed = json.bool("failed"),
        ),
        senderId = json.str("senderId"),
        authorUserId = json.str("authorUserId"),
        createdAtMillis = isoToEpochMillisOrNull(json.str("createdAt")),
        pinnedAt = json.str("pinnedAt"),
        capturedMessageIsMine = json.bool("capturedMessageIsMine"),
    )

    fun messageInput(input: JsonObject): MessageActionPolicy.Input = MessageActionPolicy.Input(
        message = message(input.getValue("message").jsonObject),
        conversation = conversation(input.getValue("conversation").jsonObject),
        viewer = viewer(input.getValue("viewer").jsonObject),
        nowMillis = input.long("now") ?: 0L,
    )

    fun conversationInput(input: JsonObject): ConversationActionPolicy.Input = ConversationActionPolicy.Input(
        conversation = conversation(input.getValue("conversation").jsonObject),
        viewer = viewer(input.getValue("viewer").jsonObject),
    )

    // ── Rendu dans la forme des attendus ──

    private fun actions(list: List<MessageActionPolicy.Action>): JsonArray =
        JsonArray(list.map { JsonPrimitive(it.wireValue) })

    private fun nullableBool(value: Boolean?): JsonElement = if (value == null) JsonNull else JsonPrimitive(value)

    private fun nullableString(value: String?): JsonElement = if (value == null) JsonNull else JsonPrimitive(value)

    fun render(result: MessageActionPolicy.Result): JsonObject = buildJsonObject {
        put("content", buildJsonObject {
            put("kind", result.content.kind.wireValue)
            put("flags", buildJsonObject {
                val flags = result.content.flags
                put("viewOnce", flags.viewOnce)
                put("blurred", flags.blurred)
                put("encrypted", flags.encrypted)
                put("ephemeral", flags.ephemeral)
                put("optimistic", flags.optimistic)
                put("failed", flags.failed)
                put("captureNotice", flags.captureNotice)
            })
        })
        put("groups", buildJsonObject {
            put("primary", actions(result.groups.primary))
            put("organize", actions(result.groups.organize))
            put("more", actions(result.groups.more))
            put("moderation", actions(result.groups.moderation))
            put("destructive", actions(result.groups.destructive))
        })
        put("verdicts", renderVerdicts(result.verdicts))
    }

    private fun renderVerdicts(verdicts: MessageActionPolicy.Verdicts): JsonObject = buildJsonObject {
        val edit = verdicts.edit
        put(
            "edit",
            if (edit == null) {
                JsonNull
            } else {
                buildJsonObject {
                    put("asModerator", edit.asModerator)
                    put("windowEndsAt", edit.windowEndsAtMillis?.let { JsonPrimitive(it) } ?: JsonNull)
                }
            },
        )
        put("deleteForEveryone", verdicts.deleteForEveryone)
        put("deleteForMe", verdicts.deleteForMe)
        val remove = verdicts.remove
        put("remove", if (remove == null) JsonNull else buildJsonObject { put("reasonRequired", remove.reasonRequired) })
        put("pin", nullableString(verdicts.pin?.wireValue))
        put("report", verdicts.report)
        put("canReact", verdicts.canReact)
        put("canReply", verdicts.canReply)
        put("translate", nullableString(verdicts.translate?.wireValue))
        put("transcribe", nullableBool(verdicts.transcribe))
        put("sentiment", nullableBool(verdicts.sentiment))
        put("forward", verdicts.forward)
        put("copy", verdicts.copy)
        put("save", verdicts.save)
        put("serverFeatureAbsence", nullableString(verdicts.serverFeatureAbsence?.wireValue))
    }

    fun render(actions: ConversationActionPolicy.Actions): JsonObject = buildJsonObject {
        put("rename", actions.rename)
        put("invite", actions.invite)
        put("leave", actions.leave)
        put("deleteForAll", actions.deleteForAll)
        put("hide", actions.hide)
        put("report", actions.report)
        put("manageMembers", actions.manageMembers)
        put("adminOpen", actions.adminOpen)
        put("call", actions.call)
        put("videoCall", actions.videoCall)
        put("e2eeBadge", actions.e2eeBadge)
    }
}
