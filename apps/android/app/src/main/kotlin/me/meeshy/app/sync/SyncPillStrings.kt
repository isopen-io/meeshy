package me.meeshy.app.sync

import androidx.annotation.StringRes
import me.meeshy.app.R

/**
 * La clé iOS d'un libellé de la pastille (`connection.*`, `sync.pill.*`) vers sa ressource Android. Un `when` explicite
 * plutôt qu'une recherche par nom : il survit au rétrécissement des ressources et il ne compile pas si une clé
 * du catalogue disparaît du manifeste.
 */
internal object SyncPillStrings {
    @StringRes
    fun resFor(key: String): Int = when (key) {
        "connection.connecting" -> R.string.connection_connecting
        "connection.offline" -> R.string.connection_offline
        "connection.online" -> R.string.connection_online
        "connection.reconnecting" -> R.string.connection_reconnecting
        "connection.syncing" -> R.string.connection_syncing
        "sync.pill.deleting.message" -> R.string.sync_pill_deleting_message
        "sync.pill.editing.message" -> R.string.sync_pill_editing_message
        "sync.pill.failed.attachmentStatus" -> R.string.sync_pill_failed_attachmentStatus
        "sync.pill.failed.block" -> R.string.sync_pill_failed_block
        "sync.pill.failed.comment" -> R.string.sync_pill_failed_comment
        "sync.pill.failed.createConversation" -> R.string.sync_pill_failed_createConversation
        "sync.pill.failed.createPost" -> R.string.sync_pill_failed_createPost
        "sync.pill.failed.createReel" -> R.string.sync_pill_failed_createReel
        "sync.pill.failed.createStatus" -> R.string.sync_pill_failed_createStatus
        "sync.pill.failed.delete" -> R.string.sync_pill_failed_delete
        "sync.pill.failed.deleteComment" -> R.string.sync_pill_failed_deleteComment
        "sync.pill.failed.edit" -> R.string.sync_pill_failed_edit
        "sync.pill.failed.friendRequest" -> R.string.sync_pill_failed_friendRequest
        "sync.pill.failed.friendResponse" -> R.string.sync_pill_failed_friendResponse
        "sync.pill.failed.generic" -> R.string.sync_pill_failed_generic
        "sync.pill.failed.markAsRead" -> R.string.sync_pill_failed_markAsRead
        "sync.pill.failed.markStoryViewed" -> R.string.sync_pill_failed_markStoryViewed
        "sync.pill.failed.message" -> R.string.sync_pill_failed_message
        "sync.pill.failed.postReaction" -> R.string.sync_pill_failed_postReaction
        "sync.pill.failed.reaction" -> R.string.sync_pill_failed_reaction
        "sync.pill.failed.story" -> R.string.sync_pill_failed_story
        "sync.pill.failed.unblock" -> R.string.sync_pill_failed_unblock
        "sync.pill.failed.updateConversation" -> R.string.sync_pill_failed_updateConversation
        "sync.pill.failed.updateProfile" -> R.string.sync_pill_failed_updateProfile
        "sync.pill.failed.updateSettings" -> R.string.sync_pill_failed_updateSettings
        "sync.pill.other.attachmentStatus" -> R.string.sync_pill_other_attachmentStatus
        "sync.pill.other.block" -> R.string.sync_pill_other_block
        "sync.pill.other.createConversation" -> R.string.sync_pill_other_createConversation
        "sync.pill.other.createPost" -> R.string.sync_pill_other_createPost
        "sync.pill.other.createReel" -> R.string.sync_pill_other_createReel
        "sync.pill.other.createStatus" -> R.string.sync_pill_other_createStatus
        "sync.pill.other.deleteComment" -> R.string.sync_pill_other_deleteComment
        "sync.pill.other.friendRequest" -> R.string.sync_pill_other_friendRequest
        "sync.pill.other.friendResponse" -> R.string.sync_pill_other_friendResponse
        "sync.pill.other.generic" -> R.string.sync_pill_other_generic
        "sync.pill.other.markAsRead" -> R.string.sync_pill_other_markAsRead
        "sync.pill.other.markStoryViewed" -> R.string.sync_pill_other_markStoryViewed
        "sync.pill.other.unblock" -> R.string.sync_pill_other_unblock
        "sync.pill.other.updateConversation" -> R.string.sync_pill_other_updateConversation
        "sync.pill.other.updateProfile" -> R.string.sync_pill_other_updateProfile
        "sync.pill.other.updateSettings" -> R.string.sync_pill_other_updateSettings
        "sync.pill.publishing.story" -> R.string.sync_pill_publishing_story
        "sync.pill.publishing.story.video" -> R.string.sync_pill_publishing_story_video
        "sync.pill.reacting.post" -> R.string.sync_pill_reacting_post
        "sync.pill.sending.audio" -> R.string.sync_pill_sending_audio
        "sync.pill.sending.comment" -> R.string.sync_pill_sending_comment
        "sync.pill.sending.comment.audio" -> R.string.sync_pill_sending_comment_audio
        "sync.pill.sending.file" -> R.string.sync_pill_sending_file
        "sync.pill.sending.image" -> R.string.sync_pill_sending_image
        "sync.pill.sending.message" -> R.string.sync_pill_sending_message
        "sync.pill.sending.reaction" -> R.string.sync_pill_sending_reaction
        "sync.pill.sending.sticker" -> R.string.sync_pill_sending_sticker
        "sync.pill.sending.video" -> R.string.sync_pill_sending_video
        else -> R.string.sync_pill_other_generic
    }
}
