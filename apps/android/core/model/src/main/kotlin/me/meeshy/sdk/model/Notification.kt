package me.meeshy.sdk.model

import kotlinx.serialization.EncodeDefault
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Corps de `POST /users/register-device-token` — le schéma de la passerelle
 * (`routes/push-tokens.ts`, `registerDeviceTokenSchema`).
 *
 * Android n'est JAMAIS `apns` : son jeton est un jeton FCM, et la passerelle
 * route l'envoi d'après `type`. `platform` est REQUIS côté serveur ; `platform`
 * et `type` valent leur défaut ici, et `MeeshyApi.json` n'encode pas les
 * défauts — d'où `@EncodeDefault`, sans lequel le corps partirait sans
 * `platform` et la passerelle répondrait 400.
 *
 * Les longueurs sont bornées par le schéma (un dépassement est un 400, donc
 * aucun push pour cet appareil) : [fcm] est la fabrique qui les applique.
 */
@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class RegisterDeviceTokenRequest(
    val token: String,
    @EncodeDefault(EncodeDefault.Mode.ALWAYS) val platform: String = PLATFORM_ANDROID,
    @EncodeDefault(EncodeDefault.Mode.ALWAYS) val type: String = TYPE_FCM,
    val deviceId: String? = null,
    val deviceName: String? = null,
    val appVersion: String? = null,
    val bundleId: String? = null,
) {
    companion object {
        const val PLATFORM_ANDROID = "android"
        const val TYPE_FCM = "fcm"
        const val DEVICE_ID_MAX = 255
        const val DEVICE_NAME_MAX = 100
        const val APP_VERSION_MAX = 50
        const val BUNDLE_ID_MAX = 255

        /**
         * La requête d'un jeton FCM Android : champs optionnels vides retirés,
         * longueurs ramenées aux bornes de la passerelle.
         */
        fun fcm(
            token: String,
            deviceId: String? = null,
            deviceName: String? = null,
            appVersion: String? = null,
            bundleId: String? = null,
        ): RegisterDeviceTokenRequest = RegisterDeviceTokenRequest(
            token = token,
            deviceId = deviceId.cappedOrNull(DEVICE_ID_MAX),
            deviceName = deviceName.cappedOrNull(DEVICE_NAME_MAX),
            appVersion = appVersion.cappedOrNull(APP_VERSION_MAX),
            bundleId = bundleId.cappedOrNull(BUNDLE_ID_MAX),
        )

        /**
         * `null` pour un texte vide, sinon le texte coupé à [max] unités UTF-16
         * — la mesure de `maxLength` côté serveur. Une coupe qui laisserait une
         * moitié de paire de substitution la retire : un emoji tronqué n'est
         * pas un UTF-8 valide.
         */
        private fun String?.cappedOrNull(max: Int): String? {
            val text = this?.takeIf { it.isNotBlank() } ?: return null
            if (text.length <= max) return text
            val cut = text.substring(0, max)
            return if (cut.last().isHighSurrogate()) cut.dropLast(1) else cut
        }
    }
}

/**
 * Corps de `DELETE /users/register-device-token`.
 *
 * La passerelle, face à un corps qui ne nomme NI `token` NI `deviceId`,
 * SUPPRIME tous les jetons de l'utilisateur (« logout from all devices »). Un
 * `{}` envoyé par mégarde déconnecterait donc ses autres appareils : le
 * constructeur refuse ce corps, et les deux fabriques sont la seule façon
 * courante de le construire.
 */
@Serializable
data class UnregisterDeviceTokenRequest(
    val token: String? = null,
    val deviceId: String? = null,
) {
    init {
        require(!token.isNullOrBlank() || !deviceId.isNullOrBlank()) {
            "Un désenregistrement sans token ni deviceId viserait tous les appareils du compte"
        }
    }

    companion object {
        fun byToken(token: String): UnregisterDeviceTokenRequest = UnregisterDeviceTokenRequest(token = token)

        fun byDeviceId(deviceId: String): UnregisterDeviceTokenRequest =
            UnregisterDeviceTokenRequest(deviceId = deviceId)
    }
}

@Serializable
data class RegisterDeviceTokenResponse(
    val id: String? = null,
    val type: String? = null,
    val platform: String? = null,
    val deviceName: String? = null,
    val isNew: Boolean? = null,
    val message: String? = null,
)

/** `data` de `DELETE /users/register-device-token` — combien de jetons la passerelle a supprimés. */
@Serializable
data class UnregisterDeviceTokenResponse(
    val deletedCount: Int? = null,
    val message: String? = null,
)

/** Lightweight notification preferences — port of NotificationPreferences (NotificationModels.swift). */
@Serializable
data class NotificationPreferences(
    val pushEnabled: Boolean = true,
    val messageNotifications: Boolean = true,
    val socialNotifications: Boolean = true,
    val soundEnabled: Boolean = true,
)

/** Notification type — raw values match backend strings — port of MeeshyNotificationType (NotificationModels.swift). */
@Serializable
enum class MeeshyNotificationType(val wire: String) {
    @SerialName("new_message") NEW_MESSAGE("new_message"),
    @SerialName("message_reply") MESSAGE_REPLY("message_reply"),
    @SerialName("message_edited") MESSAGE_EDITED("message_edited"),
    @SerialName("message_deleted") MESSAGE_DELETED("message_deleted"),
    @SerialName("message_pinned") MESSAGE_PINNED("message_pinned"),
    @SerialName("message_forwarded") MESSAGE_FORWARDED("message_forwarded"),
    @SerialName("new_conversation") NEW_CONVERSATION("new_conversation"),
    @SerialName("new_conversation_direct") NEW_CONVERSATION_DIRECT("new_conversation_direct"),
    @SerialName("new_conversation_group") NEW_CONVERSATION_GROUP("new_conversation_group"),
    @SerialName("added_to_conversation") ADDED_TO_CONVERSATION("added_to_conversation"),
    @SerialName("removed_from_conversation") REMOVED_FROM_CONVERSATION("removed_from_conversation"),
    @SerialName("contact_request") CONTACT_REQUEST("contact_request"),
    @SerialName("contact_accepted") CONTACT_ACCEPTED("contact_accepted"),
    @SerialName("friend_request") FRIEND_REQUEST("friend_request"),
    @SerialName("friend_accepted") FRIEND_ACCEPTED("friend_accepted"),
    @SerialName("user_mentioned") USER_MENTIONED("user_mentioned"),
    @SerialName("mention") MENTION("mention"),
    @SerialName("message_reaction") MESSAGE_REACTION("message_reaction"),
    @SerialName("reaction") REACTION("reaction"),
    @SerialName("reply") REPLY("reply"),
    @SerialName("post_like") POST_LIKE("post_like"),
    @SerialName("post_comment") POST_COMMENT("post_comment"),
    @SerialName("post_repost") POST_REPOST("post_repost"),
    @SerialName("story_reaction") STORY_REACTION("story_reaction"),
    @SerialName("status_reaction") STATUS_REACTION("status_reaction"),
    @SerialName("comment_like") COMMENT_LIKE("comment_like"),
    @SerialName("comment_reply") COMMENT_REPLY("comment_reply"),
    @SerialName("comment_reaction") COMMENT_REACTION("comment_reaction"),
    @SerialName("story_new_comment") STORY_NEW_COMMENT("story_new_comment"),
    @SerialName("friend_story_comment") FRIEND_STORY_COMMENT("friend_story_comment"),
    @SerialName("story_thread_reply") STORY_THREAD_REPLY("story_thread_reply"),
    @SerialName("friend_new_story") FRIEND_NEW_STORY("friend_new_story"),
    @SerialName("friend_new_post") FRIEND_NEW_POST("friend_new_post"),
    @SerialName("friend_new_mood") FRIEND_NEW_MOOD("friend_new_mood"),
    @SerialName("missed_call") MISSED_CALL("missed_call"),
    @SerialName("incoming_call") INCOMING_CALL("incoming_call"),
    @SerialName("call_ended") CALL_ENDED("call_ended"),
    @SerialName("call_declined") CALL_DECLINED("call_declined"),
    @SerialName("translation_completed") TRANSLATION_COMPLETED("translation_completed"),
    @SerialName("translation_ready") TRANSLATION_READY("translation_ready"),
    @SerialName("transcription_completed") TRANSCRIPTION_COMPLETED("transcription_completed"),
    @SerialName("voice_clone_ready") VOICE_CLONE_READY("voice_clone_ready"),
    @SerialName("security_alert") SECURITY_ALERT("security_alert"),
    @SerialName("login_new_device") LOGIN_NEW_DEVICE("login_new_device"),
    @SerialName("password_changed") PASSWORD_CHANGED("password_changed"),
    @SerialName("two_factor_enabled") TWO_FACTOR_ENABLED("two_factor_enabled"),
    @SerialName("two_factor_disabled") TWO_FACTOR_DISABLED("two_factor_disabled"),
    @SerialName("community_invite") COMMUNITY_INVITE("community_invite"),
    @SerialName("community_joined") COMMUNITY_JOINED("community_joined"),
    @SerialName("community_left") COMMUNITY_LEFT("community_left"),
    @SerialName("member_joined") MEMBER_JOINED("member_joined"),
    @SerialName("member_left") MEMBER_LEFT("member_left"),
    @SerialName("member_removed") MEMBER_REMOVED("member_removed"),
    @SerialName("member_promoted") MEMBER_PROMOTED("member_promoted"),
    @SerialName("member_demoted") MEMBER_DEMOTED("member_demoted"),
    @SerialName("member_role_changed") MEMBER_ROLE_CHANGED("member_role_changed"),
    @SerialName("system") SYSTEM("system"),
    @SerialName("maintenance") MAINTENANCE("maintenance"),
    @SerialName("update_available") UPDATE_AVAILABLE("update_available"),
    @SerialName("achievement_unlocked") ACHIEVEMENT_UNLOCKED("achievement_unlocked"),
    @SerialName("streak_milestone") STREAK_MILESTONE("streak_milestone"),
    @SerialName("badge_earned") BADGE_EARNED("badge_earned"),
    @SerialName("level_up") LEVEL_UP("level_up"),
    @SerialName("report_resolved") REPORT_RESOLVED("report_resolved"),
    @SerialName("content_removed") CONTENT_REMOVED("content_removed"),
    @SerialName("contact_joined") CONTACT_JOINED("contact_joined"),
    @SerialName("contact_recently_active") CONTACT_RECENTLY_ACTIVE("contact_recently_active"),
    @SerialName("game_duo_invited") GAME_DUO_INVITED("game_duo_invited"),
    @SerialName("game_duo_accepted") GAME_DUO_ACCEPTED("game_duo_accepted"),
    @SerialName("game_league_result") GAME_LEAGUE_RESULT("game_league_result"),
    @SerialName("game_season_step") GAME_SEASON_STEP("game_season_step"),
    @SerialName("game_mission_window") GAME_MISSION_WINDOW("game_mission_window"),
    @SerialName("call") INCOMING_CALL_ALERT("call"),

    // Legacy uppercase (backward compat)
    @SerialName("NEW_MESSAGE") LEGACY_NEW_MESSAGE("NEW_MESSAGE"),
    @SerialName("MENTION") LEGACY_MENTION("MENTION"),
    @SerialName("MESSAGE_REACTION") LEGACY_MESSAGE_REACTION("MESSAGE_REACTION"),
    @SerialName("FRIEND_REQUEST") LEGACY_FRIEND_REQUEST("FRIEND_REQUEST"),
    @SerialName("FRIEND_ACCEPTED") LEGACY_FRIEND_ACCEPTED("FRIEND_ACCEPTED"),
    @SerialName("GROUP_INVITE") LEGACY_GROUP_INVITE("GROUP_INVITE"),
    @SerialName("GROUP_JOINED") LEGACY_GROUP_JOINED("GROUP_JOINED"),
    @SerialName("GROUP_LEFT") LEGACY_GROUP_LEFT("GROUP_LEFT"),
    @SerialName("CALL_MISSED") LEGACY_CALL_MISSED("CALL_MISSED"),
    @SerialName("CALL_INCOMING") LEGACY_CALL_INCOMING("CALL_INCOMING"),
    @SerialName("POST_LIKE") LEGACY_POST_LIKE("POST_LIKE"),
    @SerialName("POST_COMMENT") LEGACY_POST_COMMENT("POST_COMMENT"),
    @SerialName("STORY_REPLY") LEGACY_STORY_REPLY("STORY_REPLY"),
    @SerialName("AFFILIATE_SIGNUP") LEGACY_AFFILIATE_SIGNUP("AFFILIATE_SIGNUP"),
    @SerialName("ACHIEVEMENT_UNLOCKED") LEGACY_ACHIEVEMENT_UNLOCKED("ACHIEVEMENT_UNLOCKED"),
    @SerialName("SYSTEM_ALERT") LEGACY_SYSTEM_ALERT("SYSTEM_ALERT"),
    @SerialName("STATUS_UPDATE") LEGACY_STATUS_UPDATE("STATUS_UPDATE"),
    @SerialName("TRANSLATION_READY") LEGACY_TRANSLATION_READY("TRANSLATION_READY"),
    ;

    companion object {
        private val BY_WIRE: Map<String, MeeshyNotificationType> = entries.associateBy { it.wire }

        /** Le type de [raw], ou `null` pour une valeur inconnue (iOS : `rawValue ?? .system`). */
        fun fromWire(raw: String?): MeeshyNotificationType? = raw?.let(BY_WIRE::get)
    }
}

/** Who triggered a notification — port of NotificationActor (NotificationModels.swift). */
@Serializable
data class NotificationActor(
    val id: String,
    val username: String = "",
    val displayName: String? = null,
    val avatar: String? = null,
) {
    /** Le nom montré : `displayName`, à défaut le pseudonyme. */
    val displayedName: String get() = displayName ?: username
}

/** Where a notification happened — port of NotificationContext (NotificationModels.swift). */
@Serializable
data class NotificationContext(
    val conversationId: String? = null,
    val conversationTitle: String? = null,
    val conversationType: String? = null,
    val messageId: String? = null,
    val originalMessageId: String? = null,
    val callSessionId: String? = null,
    val friendRequestId: String? = null,
    val reactionId: String? = null,
    val postId: String? = null,
    val commentId: String? = null,
    val parentCommentId: String? = null,
    /** Avatar du groupe — repli de la bannière quand l'expéditeur n'a pas d'avatar personnel. */
    val conversationAvatar: String? = null,
    /**
     * URL du 1er attachment du message — la vignette de la bannière quand le mime est une image.
     *
     * **Absent quand le message est protégé** (éphémère, vue unique, flouté, chiffré) : la
     * passerelle le retient EN BLOC derrière `mediaMayTravel` (cycle 125). Le client n'a donc
     * rien à re-garder ici — mais il ne doit pas non plus le FABRIQUER depuis une autre source.
     */
    val firstAttachmentUrl: String? = null,
    val firstAttachmentMimeType: String? = null,
    /** Durée en ms du 1er attachment audio/vidéo. */
    val firstAttachmentDurationMs: Int? = null,
    /** Date ISO de publication de l'entité sociale liée (post/story/réel/mood). */
    val postCreatedAt: String? = null,
    /** Date ISO d'expiration de l'entité sociale liée (story/status éphémère). */
    val postExpiresAt: String? = null,
)

/** Read/lifecycle state of a notification — port of NotificationState (NotificationModels.swift). */
@Serializable
data class NotificationState(
    val isRead: Boolean = false,
    val readAt: String? = null,
    val createdAt: String = "",
    val expiresAt: String? = null,
)

/** Delivery channels used for a notification — port of NotificationDelivery (NotificationModels.swift). */
@Serializable
data class NotificationDelivery(
    val emailSent: Boolean = false,
    val pushSent: Boolean = false,
)

/** Extra metadata attached to a notification — port of NotificationMetadata (NotificationModels.swift). */
@Serializable
data class NotificationMetadata(
    val messagePreview: String? = null,
    val action: String? = null,
    val reactionEmoji: String? = null,
    val callType: String? = null,
    val memberCount: Int? = null,
    val postId: String? = null,
    val commentId: String? = null,
    val commentPreview: String? = null,
    val emoji: String? = null,
    val postType: String? = null,
    /**
     * Discriminant d'entité de la famille `friend_new_*`, que la passerelle a historiquement
     * émis SOUS CE NOM au lieu de `postType`. Lu en repli.
     */
    val contentType: String? = null,
    val parentCommentId: String? = null,
    /** Miniature du contenu visé (post / story / réel) — la vignette de la bannière. */
    val postThumbnailUrl: String? = null,
    /** Nature du média principal du contenu visé — « image » | « video » | « audio ». */
    val mediaType: String? = null,
    val deviceName: String? = null,
    val deviceVendor: String? = null,
    val deviceOS: String? = null,
    val deviceOSVersion: String? = null,
    val deviceType: String? = null,
    val ipAddress: String? = null,
    val country: String? = null,
    val countryName: String? = null,
    val city: String? = null,
    val location: String? = null,
    /** Aperçu de l'entité visée (post/story/réel) — réactions, commentaires, partages. */
    val postPreview: String? = null,
    /** Aperçu du commentaire parent (réponse à un commentaire). */
    val parentCommentPreview: String? = null,
    /** Extrait textuel du contenu publié (`friend_new_*`). */
    val excerpt: String? = null,
    /** Détails du 1er attachment d'un message (durée audio, taille, dimensions). */
    val attachments: NotificationAttachments? = null,
    // Paliers d'engagement (#5809, #10298)
    val achievementKey: String? = null,
    val axisKey: String? = null,
    val threshold: Int? = null,
    val level: Int? = null,
    val tierRank: Int? = null,
    val value: Int? = null,
    // Le jeu (#9490)
    val route: String? = null,
    val gameSection: String? = null,
    val duoId: String? = null,
    val weekKey: String? = null,
    val league: String? = null,
    val outcome: String? = null,
    val cup: String? = null,
    val season: Int? = null,
    val step: Int? = null,
    val completed: Boolean? = null,
    // Retrait par la modération (#11151)
    val contentId: String? = null,
    val reason: String? = null,
)

/** Résumé léger des pièces jointes d'un message — `NotificationMetadata.Attachments` côté iOS. */
@Serializable
data class NotificationAttachments(
    val count: Int? = null,
    /** "image" | "video" | "audio" | "document" | "text" | "code". */
    val firstType: String? = null,
    val firstFilename: String? = null,
    val firstDurationMs: Int? = null,
    val firstFileSize: Int? = null,
    val firstWidth: Int? = null,
    val firstHeight: Int? = null,
)

/** A notification — port of APINotification (NotificationModels.swift). */
@Serializable
data class ApiNotification(
    val id: String,
    val userId: String = "",
    val type: String = "system",
    val priority: String? = null,
    /**
     * Le cadrage d'en-tête composé par la passerelle (`buildPushHeader`) : l'acteur, ou
     * « Meeshy » quand il n'y en a pas.
     */
    val title: String? = null,
    /**
     * La PHRASE D'ACTION localisée par la passerelle (« a commenté votre statut », « veut se
     * connecter ») pour tout ce qui n'est pas un message de conversation ; le NOM DU GROUPE
     * pour un message de groupe.
     *
     * Elle voyageait déjà sur le fil — `buildPushHeader` la promeut en `subtitle` justement
     * parce qu'iOS réécrit le TITRE d'une Communication Notification. Mais aucun décodeur
     * Android ne la DÉCLARAIT : kotlinx la jetait, et la bannière in-app ne pouvait pas dire
     * CE QUI venait d'arriver. Même forme que `lastMessageTranslations` sur `ApiConversation`
     * (cycle 118) — une donnée servie depuis toujours, lue par personne.
     */
    val subtitle: String? = null,
    val content: String? = null,
    val actor: NotificationActor? = null,
    val context: NotificationContext? = null,
    val metadata: NotificationMetadata? = null,
    val state: NotificationState = NotificationState(),
    val delivery: NotificationDelivery? = null,
) {
    /** Le type résolu ; une valeur inconnue se lit `SYSTEM` (iOS : `rawValue ?? .system`). */
    val notificationType: MeeshyNotificationType
        get() = MeeshyNotificationType.fromWire(type) ?: MeeshyNotificationType.SYSTEM

    val senderName: String? get() = actor?.displayedName

    /** Les données de navigation dérivées du contexte ; `null` sans contexte. */
    val data: NotificationData?
        get() = context?.let {
            NotificationData(
                conversationId = it.conversationId,
                messageId = it.messageId,
                postId = it.postId,
                callId = it.callSessionId,
                friendRequestId = it.friendRequestId,
                preview = metadata?.messagePreview,
            )
        }
}

/** Legacy navigation data computed from a notification's context — port of NotificationData (NotificationModels.swift). */
@Serializable
data class NotificationData(
    val conversationId: String? = null,
    val messageId: String? = null,
    val postId: String? = null,
    val achievementId: String? = null,
    val callId: String? = null,
    val friendRequestId: String? = null,
    val preview: String? = null,
)

@Serializable
data class NotificationListResponse(
    val success: Boolean = false,
    val data: List<ApiNotification> = emptyList(),
    val pagination: NotificationPagination? = null,
    val unreadCount: Int? = null,
)

@Serializable
data class NotificationPagination(
    val total: Int = 0,
    val offset: Int = 0,
    val limit: Int = 0,
    val hasMore: Boolean = false,
    /** Ancre de reprise `(createdAt, id)` ; `null` en fin de liste ou en mode offset. */
    val nextCursor: String? = null,
)

@Serializable
data class UnreadCountResponse(
    val success: Boolean = false,
    val count: Int = 0,
)

@Serializable
data class MarkReadResponse(
    val success: Boolean = false,
    val count: Int? = null,
)

/**
 * `data` de `GET /notifications/counts` — les totaux de TOUTE la boîte, groupés
 * par type BRUT (`byType`), calculés sur le même prédicat de visibilité que la
 * liste : un onglet qui annonce « 3 » ne peut pas en montrer deux.
 */
@Serializable
data class NotificationCounts(
    val total: Int = 0,
    val unread: Int = 0,
    val byType: Map<String, Int> = emptyMap(),
)

/**
 * Corps de `POST /notifications/read-by-types`. La passerelle borne la liste
 * (`minItems` 1, `maxItems` 30) : [NotificationTypeSelection.readBatches] est la
 * fabrique qui normalise et découpe, le constructeur refuse une liste hors borne.
 */
@Serializable
data class ReadNotificationsByTypesRequest(val types: List<String>) {
    init {
        require(types.size in 1..MAX_TYPES) { "types doit compter entre 1 et $MAX_TYPES éléments" }
    }

    companion object {
        const val MAX_TYPES = 30
    }
}

/** `data` des accusés de réception de conversation (`mark-as-received`, `mark-as-read`) : le nombre de lignes touchées. */
@Serializable
data class MarkedCountResult(
    val markedCount: Int? = null,
)
