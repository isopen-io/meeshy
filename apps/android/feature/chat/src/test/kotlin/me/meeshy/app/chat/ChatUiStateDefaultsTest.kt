package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import java.lang.reflect.Modifier
import me.meeshy.sdk.mention.MentionAutocompleteState
import me.meeshy.sdk.model.ComposerLanguage
import me.meeshy.sdk.model.ComposerLanguageState
import me.meeshy.sdk.model.EmojiCatalog
import me.meeshy.sdk.model.LiveLocationSessions
import me.meeshy.sdk.model.MessageEffects
import org.junit.Test

/**
 * Instantané de [ChatUiState] : le découpage du ViewModel en contrôleurs ne doit
 * ni ajouter, ni retirer, ni réordonner un champ, ni changer une valeur par défaut.
 * Un lot qui a besoin d'un état de plus apporte SON contrôleur et SON StateFlow —
 * jamais un champ ici, et ce test le dit en rougissant.
 */
class ChatUiStateDefaultsTest {

    @Test
    fun `the state keeps exactly its fifty-one stored fields`() {
        val stored = ChatUiState::class.java.declaredFields
            .filterNot { it.isSynthetic || Modifier.isStatic(it.modifiers) }
            .map { it.name }

        assertThat(stored).containsExactlyElementsIn(STORED_FIELDS)
        assertThat(stored).hasSize(51)
    }

    @Test
    fun `a fresh state equals a state spelled out with every documented default`() {
        val spelledOut = ChatUiState(
            conversationId = "",
            messages = emptyList(),
            activeCall = null,
            draft = "",
            draftRevision = 0,
            isSyncing = false,
            showSkeleton = false,
            errorMessage = null,
            typingParticipants = emptyList(),
            conversationTitle = null,
            memberCount = 0,
            isGroup = false,
            accentColorHex = null,
            actionMessageId = null,
            emojiPickerMessageId = null,
            quickReactions = EmojiCatalog.defaultQuickReactions,
            editingMessageId = null,
            replyingToMessageId = null,
            ownReactions = emptyMap(),
            isLoadingOlder = false,
            hasMoreOlder = true,
            imageViewer = null,
            scrollToMessageId = null,
            firstUnreadMessageId = null,
            unreadBoundaryResolved = false,
            encryptionMode = null,
            search = ChatSearchState(),
            mention = MentionAutocompleteState(),
            mentionDisplayNames = emptyMap(),
            reactionDetails = null,
            isPinnedSheetOpen = false,
            replyThreadParentId = null,
            forward = null,
            explorerMessageId = null,
            translatingLanguages = emptySet(),
            languageExplorer = null,
            reportForm = null,
            pendingEffects = MessageEffects(),
            isEffectsPickerOpen = false,
            clipboardContent = null,
            liveLocations = LiveLocationSessions.EMPTY,
            composerPermissions = null,
            slowModeSeconds = null,
            slowModeExempt = false,
            lastSelfSentAtMillis = null,
            directPeerUserId = null,
            presenceByUserId = emptyMap(),
            isOffline = false,
            composerLanguage = ComposerLanguageState(),
            composerLanguageSeed = ComposerLanguage.DEFAULT,
            fileDownload = null,
        )

        assertThat(ChatUiState()).isEqualTo(spelledOut)
    }

    @Test
    fun `a fresh state opens on the full-history, nothing-armed posture`() {
        val fresh = ChatUiState()

        assertThat(fresh.hasMoreOlder).isTrue()
        assertThat(fresh.quickReactions).containsExactlyElementsIn(EmojiCatalog.defaultQuickReactions).inOrder()
        assertThat(fresh.canSend).isFalse()
        assertThat(fresh.isEditing).isFalse()
        assertThat(fresh.hasPendingEffects).isFalse()
        assertThat(fresh.composerSentiment).isNull()
        assertThat(fresh.composerLanguageCode).isEqualTo(ComposerLanguage.DEFAULT)
        assertThat(fresh.pinnedBanner).isNull()
        assertThat(fresh.pinnedMessages).isEmpty()
        assertThat(fresh.replyThreadOverlay).isNull()
        assertThat(fresh.showEncryptionDisclaimer).isFalse()
        assertThat(fresh.liveLocationBadges).isEmpty()
        assertThat(fresh.headerPresence(nowEpochMillis = 0L)).isNull()
    }

    private companion object {
        val STORED_FIELDS = listOf(
            "conversationId",
            "messages",
            "activeCall",
            "draft",
            "draftRevision",
            "isSyncing",
            "showSkeleton",
            "errorMessage",
            "typingParticipants",
            "conversationTitle",
            "memberCount",
            "isGroup",
            "accentColorHex",
            "actionMessageId",
            "emojiPickerMessageId",
            "quickReactions",
            "editingMessageId",
            "replyingToMessageId",
            "ownReactions",
            "isLoadingOlder",
            "hasMoreOlder",
            "imageViewer",
            "scrollToMessageId",
            "firstUnreadMessageId",
            "unreadBoundaryResolved",
            "encryptionMode",
            "search",
            "mention",
            "mentionDisplayNames",
            "reactionDetails",
            "isPinnedSheetOpen",
            "replyThreadParentId",
            "forward",
            "explorerMessageId",
            "translatingLanguages",
            "languageExplorer",
            "reportForm",
            "pendingEffects",
            "isEffectsPickerOpen",
            "clipboardContent",
            "liveLocations",
            "composerPermissions",
            "slowModeSeconds",
            "slowModeExempt",
            "lastSelfSentAtMillis",
            "directPeerUserId",
            "presenceByUserId",
            "isOffline",
            "composerLanguage",
            "composerLanguageSeed",
            "fileDownload",
        )
    }
}
