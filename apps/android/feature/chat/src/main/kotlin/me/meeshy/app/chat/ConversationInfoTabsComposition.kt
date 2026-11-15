package me.meeshy.app.chat

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.graphics.Color
import me.meeshy.app.chat.mediahub.ConversationMediaHubContent
import me.meeshy.app.chat.options.ConversationOptionsSlots
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.ClientStatMessage
import me.meeshy.ui.theme.MeeshySpacing

/**
 * Les onglets de la fiche Conversation (iOS #13785 : Membres, Médias, Stats, Options), composés UNE fois
 * pour ses deux hôtes : le fil ([ChatSheetsHost]) et la liste ([ConversationInfoPresenter], #15989).
 * Tout s'adresse par [conversationId] ; seul le fil a des messages à donner aux statistiques.
 */
internal fun conversationInfoTabSlots(
    conversationId: String,
    accentColor: Color,
    isEndToEnd: Boolean,
    conversationTitle: String?,
    clientMessages: List<ClientStatMessage>,
    onGoToMessage: ((String) -> Unit)?,
    onOpenFile: (carrier: ApiMessage, attachment: ApiMessageAttachment) -> Unit,
    options: ConversationOptionsSlots,
    onLeft: () -> Unit = {},
): ConversationInfoTabSlots = ConversationInfoTabSlots(
    members = { modifier -> ConversationMembersContent(conversationId, accentColor, modifier, onLeft = onLeft) },
    media = { modifier ->
        ConversationMediaHubContent(
            conversationId = conversationId,
            accentColor = accentColor,
            isEndToEnd = isEndToEnd,
            conversationTitle = conversationTitle,
            onGoToMessage = onGoToMessage,
            onOpenFile = onOpenFile,
            modifier = modifier,
        )
    },
    stats = { modifier ->
        ConversationDashboardContent(
            conversationId = conversationId,
            accentColor = accentColor,
            clientMessages = clientMessages,
            modifier = modifier,
        )
    },
    options = { modifier ->
        Column(modifier.verticalScroll(rememberScrollState()).padding(horizontal = MeeshySpacing.lg).padding(bottom = MeeshySpacing.xl)) {
            options.body()
        }
    },
)
