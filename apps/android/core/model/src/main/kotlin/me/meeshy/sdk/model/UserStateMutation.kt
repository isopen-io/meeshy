package me.meeshy.sdk.model

import java.util.UUID
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive

/**
 * Une unité de travail de l'utilisateur sur l'état d'une conversation — port de
 * `UserStateMutation` (`packages/MeeshySDK/.../Models/UserStateMutation.swift`).
 *
 * Les préférences passent par un instantané complet (file `UPDATE_CONVERSATION_PREFS`),
 * [MarkAsRead]/[MarkAsUnread] par leurs routes dédiées, [DeleteForUser] et [Leave] ne se
 * fusionnent JAMAIS, et [SetLocked] reste local à l'appareil : il ne part jamais au serveur.
 */
sealed interface UserStateMutation {
    data class SetPinned(val value: Boolean) : UserStateMutation
    data class SetMuted(val value: Boolean) : UserStateMutation
    data class SetMentionsOnly(val value: Boolean) : UserStateMutation
    data class SetArchived(val value: Boolean) : UserStateMutation
    data class SetCustomName(val value: String?) : UserStateMutation
    data class SetReaction(val value: String?) : UserStateMutation
    data class SetSection(val categoryId: String?) : UserStateMutation
    data class SetOrderInCategory(val value: Int?) : UserStateMutation
    data class SetTags(val value: List<String>) : UserStateMutation
    data class AddTag(val value: String) : UserStateMutation
    data class RemoveTag(val value: String) : UserStateMutation
    data class SetClearHistoryBefore(val value: String?) : UserStateMutation
    data object MarkAsRead : UserStateMutation
    data object MarkAsUnread : UserStateMutation
    data object DeleteForUser : UserStateMutation
    data object Leave : UserStateMutation
    data class SetLocked(val value: Boolean) : UserStateMutation

    /**
     * Même clé ⇒ le dernier écrivain gagne dans la file. `addTag`/`removeTag`/`setTags` partagent
     * `tags`, `markAsRead`/`markAsUnread` partagent `readState` ; [DeleteForUser] et [Leave]
     * rendent une clé UNIQUE ([nonce]) pour ne jamais fusionner.
     */
    fun coalescingKey(nonce: () -> String = { UUID.randomUUID().toString() }): String = when (this) {
        is SetPinned -> "setPinned"
        is SetMuted -> "setMuted"
        is SetMentionsOnly -> "setMentionsOnly"
        is SetArchived -> "setArchived"
        is SetCustomName -> "setCustomName"
        is SetReaction -> "setReaction"
        is SetSection -> "setSection"
        is SetOrderInCategory -> "setOrderInCategory"
        is SetTags, is AddTag, is RemoveTag -> "tags"
        is SetClearHistoryBefore -> "setClearHistoryBefore"
        MarkAsRead, MarkAsUnread -> "readState"
        DeleteForUser -> "deleteForUser-${nonce()}"
        Leave -> "leave-${nonce()}"
        is SetLocked -> "setLocked"
    }

    /** Vrai quand la mutation ne touche que l'appareil : la file l'ignore. */
    val isLocalOnly: Boolean get() = this is SetLocked

    /** Vrai quand la mutation passe par l'instantané de préférences (`UPDATE_CONVERSATION_PREFS`). */
    val isPreferencesSnapshot: Boolean
        get() = when (this) {
            is SetPinned, is SetMuted, is SetMentionsOnly, is SetArchived, is SetCustomName,
            is SetReaction, is SetSection, is SetOrderInCategory, is SetTags, is AddTag,
            is RemoveTag, is SetClearHistoryBefore,
            -> true
            MarkAsRead, MarkAsUnread, DeleteForUser, Leave, is SetLocked -> false
        }

    /** Forme persistée `{"type": "...", "value": ...}` ; [categoryId] pour [SetSection]. */
    fun encode(): String = Json.encodeToString(JsonObject.serializer(), toJson())

    private fun toJson(): JsonObject {
        fun obj(type: String, value: JsonElement? = null, key: String = "value") =
            JsonObject(buildMap { put("type", JsonPrimitive(type)); if (value != null) put(key, value) })
        fun str(v: String?): JsonElement? = v?.let(::JsonPrimitive)
        return when (this) {
            is SetPinned -> obj("setPinned", JsonPrimitive(value))
            is SetMuted -> obj("setMuted", JsonPrimitive(value))
            is SetMentionsOnly -> obj("setMentionsOnly", JsonPrimitive(value))
            is SetArchived -> obj("setArchived", JsonPrimitive(value))
            is SetCustomName -> obj("setCustomName", str(value))
            is SetReaction -> obj("setReaction", str(value))
            is SetSection -> obj("setSection", str(categoryId), key = "categoryId")
            is SetOrderInCategory -> obj("setOrderInCategory", value?.let(::JsonPrimitive))
            is SetTags -> obj("setTags", JsonArray(value.map(::JsonPrimitive)))
            is AddTag -> obj("addTag", JsonPrimitive(value))
            is RemoveTag -> obj("removeTag", JsonPrimitive(value))
            is SetClearHistoryBefore -> obj("setClearHistoryBefore", str(value))
            MarkAsRead -> obj("markAsRead")
            MarkAsUnread -> obj("markAsUnread")
            DeleteForUser -> obj("deleteForUser")
            Leave -> obj("leave")
            is SetLocked -> obj("setLocked", JsonPrimitive(value))
        }
    }

    companion object {
        /**
         * Lecture TOLÉRANTE : un `type` inconnu (cas né dans une version plus récente, resté dans
         * la file) ou une charge illisible rend `null` — la file l'écarte au lieu de planter.
         */
        fun decode(raw: String): UserStateMutation? = runCatching {
            val o = Json.parseToJsonElement(raw) as? JsonObject ?: return null
            val value = o["value"]?.takeUnless { it is JsonNull }
            fun bool(): Boolean? = value?.jsonPrimitive?.booleanOrNull
            fun text(): String? = value?.jsonPrimitive?.contentOrNull
            when (o["type"]?.jsonPrimitive?.contentOrNull) {
                "setPinned" -> bool()?.let(::SetPinned)
                "setMuted" -> bool()?.let(::SetMuted)
                "setMentionsOnly" -> bool()?.let(::SetMentionsOnly)
                "setArchived" -> bool()?.let(::SetArchived)
                "setCustomName" -> SetCustomName(text())
                "setReaction" -> SetReaction(text())
                "setSection" -> SetSection(o["categoryId"]?.takeUnless { it is JsonNull }?.jsonPrimitive?.contentOrNull)
                "setOrderInCategory" -> SetOrderInCategory(value?.jsonPrimitive?.intOrNull)
                "setTags" -> value?.jsonArray?.map { it.jsonPrimitive.content }?.let(::SetTags)
                "addTag" -> text()?.let(::AddTag)
                "removeTag" -> text()?.let(::RemoveTag)
                "setClearHistoryBefore" -> SetClearHistoryBefore(text())
                "markAsRead" -> MarkAsRead
                "markAsUnread" -> MarkAsUnread
                "deleteForUser" -> DeleteForUser
                "leave" -> Leave
                "setLocked" -> bool()?.let(::SetLocked)
                else -> null
            }
        }.getOrNull()
    }
}

/**
 * Application OPTIMISTE pure de [mutation] sur l'état : la ligne se met à jour avant la
 * confirmation réseau. [nowIso] date la suppression pour soi. [UserStateMutation.Leave] ne
 * change rien localement (la ligne disparaît à la confirmation).
 */
fun ConversationUserState.applying(mutation: UserStateMutation, nowIso: String): ConversationUserState =
    when (mutation) {
        is UserStateMutation.SetPinned -> copy(isPinned = mutation.value)
        is UserStateMutation.SetMuted -> copy(isMuted = mutation.value)
        is UserStateMutation.SetMentionsOnly -> copy(mentionsOnly = mutation.value)
        is UserStateMutation.SetArchived -> copy(isArchived = mutation.value)
        is UserStateMutation.SetCustomName -> copy(customName = mutation.value)
        is UserStateMutation.SetReaction -> copy(reaction = mutation.value)
        is UserStateMutation.SetSection -> copy(sectionId = mutation.categoryId)
        is UserStateMutation.SetOrderInCategory -> copy(orderInCategory = mutation.value)
        is UserStateMutation.SetTags -> copy(tags = mutation.value)
        is UserStateMutation.AddTag -> copy(tags = (tags + mutation.value).distinct())
        is UserStateMutation.RemoveTag -> copy(tags = tags - mutation.value)
        is UserStateMutation.SetClearHistoryBefore -> copy(clearHistoryBefore = mutation.value)
        UserStateMutation.MarkAsRead -> copy(unreadCount = 0)
        UserStateMutation.MarkAsUnread -> copy(unreadCount = maxOf(unreadCount, 1))
        UserStateMutation.DeleteForUser -> copy(deletedForUserAt = nowIso)
        UserStateMutation.Leave -> this
        is UserStateMutation.SetLocked -> copy(isLocked = mutation.value)
    }
