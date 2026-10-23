package me.meeshy.sdk.model.socket

/**
 * Catalogue central des noms d'événements Socket.IO que le client Android parle.
 *
 * Source de vérité : `packages/shared/types/socketio-events/ (fichiers event-names.ts)` (miroir iOS :
 * `SocketEvent.swift`). Format `entité:action-mot`, traits d'union, jamais d'underscore.
 * `SocketEventNamesParityTest` relit le fichier TypeScript : un nom absent du contrat échoue.
 * Aucune autre classe ne doit épeler un nom en clair — une famille ajoute ici sa ligne, puis
 * enregistre sa route par `SocketEventRouter`.
 */
object SocketEventNames {
    // audio
    const val AUDIO_TRANSCRIPTION_READY = "audio:transcription-ready"
    const val AUDIO_TRANSLATION_READY = "audio:translation-ready"

    // auth
    const val AUTH_SESSION_REVOKED = "auth:session-revoked"
    const val AUTH_TOKEN_EXPIRED = "auth:token-expired"

    // call
    const val CALL_ALREADY_ANSWERED = "call:already-answered"
    const val CALL_ANALYTICS = "call:analytics"
    const val CALL_BACKGROUNDED = "call:backgrounded"
    const val CALL_CHECK_ACTIVE = "call:check-active"
    const val CALL_END = "call:end"
    const val CALL_ENDED = "call:ended"
    const val CALL_ERROR = "call:error"
    const val CALL_FORCE_LEAVE = "call:force-leave"
    const val CALL_FOREGROUNDED = "call:foregrounded"
    const val CALL_FRAME_SELECT = "call:frame-select"
    const val CALL_FRAME_SELECTED = "call:frame-selected"
    const val CALL_HEARTBEAT = "call:heartbeat"
    const val CALL_ICE_SERVERS_REFRESHED = "call:ice-servers-refreshed"
    const val CALL_INITIATE = "call:initiate"
    const val CALL_INITIATED = "call:initiated"
    const val CALL_INVITE_DECLINED = "call:invite-declined"
    const val CALL_INVITE_EXPIRED = "call:invite-expired"
    const val CALL_INVITE_PARTICIPANT = "call:invite-participant"
    const val CALL_JOIN = "call:join"
    const val CALL_LEAVE = "call:leave"
    const val CALL_MEDIA_TOGGLED = "call:media-toggled"
    const val CALL_MISSED = "call:missed"
    const val CALL_MUTE_PARTICIPANT = "call:mute-participant"
    const val CALL_MUTED_BY_MODERATOR = "call:muted-by-moderator"
    const val CALL_PARTICIPANT_INVITED = "call:participant-invited"
    const val CALL_PARTICIPANT_JOINED = "call:participant-joined"
    const val CALL_PARTICIPANT_LEFT = "call:participant-left"
    const val CALL_PREVIEW_REQUEST = "call:preview-request"
    const val CALL_PREVIEW_REQUESTED = "call:preview-requested"
    const val CALL_PREVIEW_SIGNAL = "call:preview-signal"
    const val CALL_QUALITY_ALERT = "call:quality-alert"
    const val CALL_QUALITY_FEEDBACK = "call:quality-feedback"
    const val CALL_QUALITY_REPORT = "call:quality-report"
    const val CALL_REACTION = "call:reaction"
    const val CALL_REACTION_RECEIVED = "call:reaction-received"
    const val CALL_RECONNECTED = "call:reconnected"
    const val CALL_RECONNECTING = "call:reconnecting"
    const val CALL_RECORDING_CONSENT = "call:recording-consent"
    const val CALL_RECORDING_REQUEST = "call:recording-request"
    const val CALL_RECORDING_REQUESTED = "call:recording-requested"
    const val CALL_RECORDING_STARTED = "call:recording-started"
    const val CALL_RECORDING_STOP = "call:recording-stop"
    const val CALL_RECORDING_STOPPED = "call:recording-stopped"
    const val CALL_REQUEST_ICE_SERVERS = "call:request-ice-servers"
    const val CALL_SCREEN_CAPTURE_ALERT = "call:screen-capture-alert"
    const val CALL_SCREEN_CAPTURE_DETECTED = "call:screen-capture-detected"
    const val CALL_SIGNAL = "call:signal"
    const val CALL_TOGGLE_AUDIO = "call:toggle-audio"
    const val CALL_TOGGLE_SCREEN = "call:toggle-screen"
    const val CALL_TOGGLE_VIDEO = "call:toggle-video"
    const val CALL_TRANSCRIPTION_ACTIVE = "call:transcription-active"
    const val CALL_TRANSCRIPTION_SEGMENT = "call:transcription-segment"
    const val CALL_TRANSLATED_SEGMENT = "call:translated-segment"

    // categories
    const val CATEGORIES_REORDERED = "categories:reordered"

    // category
    const val CATEGORY_CREATED = "category:created"
    const val CATEGORY_DELETED = "category:deleted"
    const val CATEGORY_UPDATED = "category:updated"

    // comment
    const val COMMENT_ADDED = "comment:added"
    const val COMMENT_DELETED = "comment:deleted"
    const val COMMENT_LIKED = "comment:liked"
    const val COMMENT_REACTION_ADDED = "comment:reaction-added"
    const val COMMENT_REACTION_REMOVED = "comment:reaction-removed"
    const val COMMENT_TRANSLATION_UPDATED = "comment:translation-updated"
    const val COMMENT_UNLIKED = "comment:unliked"
    const val COMMENT_UPDATED = "comment:updated"

    // conversation
    const val CONVERSATION_CLOSED = "conversation:closed"
    const val CONVERSATION_DELETED = "conversation:deleted"
    const val CONVERSATION_PARTICIPANT_BANNED = "conversation:participant-banned"
    const val CONVERSATION_PARTICIPANT_LEFT = "conversation:participant-left"
    const val CONVERSATION_RESTORED = "conversation:restored"
    const val CONVERSATION_UNREAD_UPDATED = "conversation:unread-updated"
    const val CONVERSATION_UPDATED = "conversation:updated"

    // location
    const val LOCATION_LIVE_STARTED = "location:live-started"
    const val LOCATION_LIVE_STOPPED = "location:live-stopped"
    const val LOCATION_LIVE_UPDATED = "location:live-updated"

    // media
    const val MEDIA_CAPTION_TRANSLATION_UPDATED = "media:caption-translation-updated"

    // message
    const val MESSAGE_ATTACHMENT_UPDATED = "message:attachment-updated"
    const val MESSAGE_DELETED = "message:deleted"
    const val MESSAGE_EDITED = "message:edited"
    const val MESSAGE_EXPIRED = "message:expired"
    const val MESSAGE_NEW = "message:new"
    const val MESSAGE_PINNED = "message:pinned"
    const val MESSAGE_TRANSLATION = "message:translation"
    const val MESSAGE_UNPINNED = "message:unpinned"

    // notification
    const val NOTIFICATION_COUNTS = "notification:counts"
    const val NOTIFICATION_DELETED = "notification:deleted"
    const val NOTIFICATION_DELETED_BULK = "notification:deleted-bulk"
    const val NOTIFICATION_NEW = "notification:new"
    const val NOTIFICATION_READ = "notification:read"
    const val NOTIFICATION_READ_BULK = "notification:read-bulk"

    // participant
    const val PARTICIPANT_ROLE_UPDATED = "participant:role-updated"

    // post
    const val POST_BOOKMARKED = "post:bookmarked"
    const val POST_CREATED = "post:created"
    const val POST_DELETED = "post:deleted"
    const val POST_JOIN = "post:join"
    const val POST_LEAVE = "post:leave"
    const val POST_LIKED = "post:liked"
    const val POST_REPOSTED = "post:reposted"
    const val POST_TRANSLATION_UPDATED = "post:translation-updated"
    const val POST_UNLIKED = "post:unliked"
    const val POST_UPDATED = "post:updated"

    // presence
    const val PRESENCE_APP_STATE = "presence:app-state"
    const val PRESENCE_SNAPSHOT = "presence:snapshot"

    // reaction
    const val REACTION_ADDED = "reaction:added"
    const val REACTION_REMOVED = "reaction:removed"

    // read-status
    const val READ_STATUS_UPDATED = "read-status:updated"

    // status
    const val STATUS_CREATED = "status:created"
    const val STATUS_DELETED = "status:deleted"
    const val STATUS_REACTED = "status:reacted"
    const val STATUS_UNREACTED = "status:unreacted"
    const val STATUS_UPDATED = "status:updated"

    // story
    const val STORY_CREATED = "story:created"
    const val STORY_DELETED = "story:deleted"
    const val STORY_REACTED = "story:reacted"
    const val STORY_TRANSLATION_UPDATED = "story:translation-updated"
    const val STORY_UNREACTED = "story:unreacted"
    const val STORY_UPDATED = "story:updated"
    const val STORY_VIEWED = "story:viewed"

    // typing
    const val TYPING_START = "typing:start"
    const val TYPING_STOP = "typing:stop"

    // user
    const val USER_PREFERENCES_UPDATED = "user:preferences-updated"
    const val USER_STATUS = "user:status"
    const val USER_UPDATED = "user:updated"

    /** Tous les noms du catalogue, dans l'ordre de déclaration. */
    val all: List<String> = listOf(
        AUDIO_TRANSCRIPTION_READY,
        AUDIO_TRANSLATION_READY,
        AUTH_SESSION_REVOKED,
        AUTH_TOKEN_EXPIRED,
        CALL_ALREADY_ANSWERED,
        CALL_ANALYTICS,
        CALL_BACKGROUNDED,
        CALL_CHECK_ACTIVE,
        CALL_END,
        CALL_ENDED,
        CALL_ERROR,
        CALL_FORCE_LEAVE,
        CALL_FOREGROUNDED,
        CALL_FRAME_SELECT,
        CALL_FRAME_SELECTED,
        CALL_HEARTBEAT,
        CALL_ICE_SERVERS_REFRESHED,
        CALL_INITIATE,
        CALL_INITIATED,
        CALL_INVITE_DECLINED,
        CALL_INVITE_EXPIRED,
        CALL_INVITE_PARTICIPANT,
        CALL_JOIN,
        CALL_LEAVE,
        CALL_MEDIA_TOGGLED,
        CALL_MISSED,
        CALL_MUTE_PARTICIPANT,
        CALL_MUTED_BY_MODERATOR,
        CALL_PARTICIPANT_INVITED,
        CALL_PARTICIPANT_JOINED,
        CALL_PARTICIPANT_LEFT,
        CALL_PREVIEW_REQUEST,
        CALL_PREVIEW_REQUESTED,
        CALL_PREVIEW_SIGNAL,
        CALL_QUALITY_ALERT,
        CALL_QUALITY_FEEDBACK,
        CALL_QUALITY_REPORT,
        CALL_REACTION,
        CALL_REACTION_RECEIVED,
        CALL_RECONNECTED,
        CALL_RECONNECTING,
        CALL_RECORDING_CONSENT,
        CALL_RECORDING_REQUEST,
        CALL_RECORDING_REQUESTED,
        CALL_RECORDING_STARTED,
        CALL_RECORDING_STOP,
        CALL_RECORDING_STOPPED,
        CALL_REQUEST_ICE_SERVERS,
        CALL_SCREEN_CAPTURE_ALERT,
        CALL_SCREEN_CAPTURE_DETECTED,
        CALL_SIGNAL,
        CALL_TOGGLE_AUDIO,
        CALL_TOGGLE_SCREEN,
        CALL_TOGGLE_VIDEO,
        CALL_TRANSCRIPTION_ACTIVE,
        CALL_TRANSCRIPTION_SEGMENT,
        CALL_TRANSLATED_SEGMENT,
        CATEGORIES_REORDERED,
        CATEGORY_CREATED,
        CATEGORY_DELETED,
        CATEGORY_UPDATED,
        COMMENT_ADDED,
        COMMENT_DELETED,
        COMMENT_LIKED,
        COMMENT_REACTION_ADDED,
        COMMENT_REACTION_REMOVED,
        COMMENT_TRANSLATION_UPDATED,
        COMMENT_UNLIKED,
        COMMENT_UPDATED,
        CONVERSATION_CLOSED,
        CONVERSATION_DELETED,
        CONVERSATION_PARTICIPANT_BANNED,
        CONVERSATION_PARTICIPANT_LEFT,
        CONVERSATION_RESTORED,
        CONVERSATION_UNREAD_UPDATED,
        CONVERSATION_UPDATED,
        LOCATION_LIVE_STARTED,
        LOCATION_LIVE_STOPPED,
        LOCATION_LIVE_UPDATED,
        MEDIA_CAPTION_TRANSLATION_UPDATED,
        MESSAGE_ATTACHMENT_UPDATED,
        MESSAGE_DELETED,
        MESSAGE_EDITED,
        MESSAGE_EXPIRED,
        MESSAGE_NEW,
        MESSAGE_PINNED,
        MESSAGE_TRANSLATION,
        MESSAGE_UNPINNED,
        NOTIFICATION_COUNTS,
        NOTIFICATION_DELETED,
        NOTIFICATION_DELETED_BULK,
        NOTIFICATION_NEW,
        NOTIFICATION_READ,
        NOTIFICATION_READ_BULK,
        PARTICIPANT_ROLE_UPDATED,
        POST_BOOKMARKED,
        POST_CREATED,
        POST_DELETED,
        POST_JOIN,
        POST_LEAVE,
        POST_LIKED,
        POST_REPOSTED,
        POST_TRANSLATION_UPDATED,
        POST_UNLIKED,
        POST_UPDATED,
        PRESENCE_APP_STATE,
        PRESENCE_SNAPSHOT,
        REACTION_ADDED,
        REACTION_REMOVED,
        READ_STATUS_UPDATED,
        STATUS_CREATED,
        STATUS_DELETED,
        STATUS_REACTED,
        STATUS_UNREACTED,
        STATUS_UPDATED,
        STORY_CREATED,
        STORY_DELETED,
        STORY_REACTED,
        STORY_TRANSLATION_UPDATED,
        STORY_UNREACTED,
        STORY_UPDATED,
        STORY_VIEWED,
        TYPING_START,
        TYPING_STOP,
        USER_PREFERENCES_UPDATED,
        USER_STATUS,
        USER_UPDATED,
    )
}
