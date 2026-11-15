package me.meeshy.app.chat

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.app.chat.appearance.ConversationAppearanceSheet
import me.meeshy.app.chat.options.rememberConversationOptionsSlots
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.e2ee.ConversationEncryptionRegime

/** Ce que la liste sait d'une conversation au moment d'en ouvrir la fiche, sans entrer dans son fil. */
data class ConversationInfoSeed(
    val conversationId: String,
    val title: String,
    val avatarUrl: String?,
    val accentColor: Color,
    val accentHex: String?,
    /** Le pair d'un direct ; `null` pour une conversation à plusieurs. */
    val peerUserId: String?,
    val memberCount: Int,
    /** Le régime servi (`e2ee`, `server`, `hybrid`, absent) ; inconnu = de bout en bout (fail-closed). */
    val encryptionMode: String?,
)

/**
 * La fiche Conversation ouverte HORS de son fil — le toucher de l'avatar d'une ligne (#15989, iOS
 * `ConversationListModalPresentations`, fiche posée au-dessus de la liste avec `messages: []`). Les mêmes
 * onglets que la fiche du fil ([conversationInfoTabSlots]), sans monter le fil : aucun ChatViewModel, aucune
 * salle socket, aucun `viewing:*`, rien de marqué lu. Ce qui exige le fil (numéro de sécurité, épinglés,
 * statistiques des messages chargés) en est absent ; « Aller au message » rejoint le fil à ce message.
 */
@Composable
fun ConversationInfoPresenter(
    seed: ConversationInfoSeed,
    onDismiss: () -> Unit,
    onOpenMessage: (messageId: String) -> Unit,
    onShare: () -> Unit,
) {
    var sheet by rememberSaveable(seed.conversationId) { mutableStateOf(InfoSubSheet.INFO) }
    val isGroup = seed.peerUserId == null
    when (sheet) {
        InfoSubSheet.INFO -> InfoSheet(seed, isGroup, onDismiss, onOpenMessage, onShare) { sheet = it }
        InfoSubSheet.ENCRYPTION -> ConversationEncryptionSheet(
            conversationId = seed.conversationId,
            isDirect = !isGroup,
            accentColor = seed.accentColor,
            onDismiss = onDismiss,
        )
        InfoSubSheet.APPEARANCE -> ConversationAppearanceSheet(
            conversationId = seed.conversationId,
            computedAccentHex = seed.accentHex,
            onDismiss = onDismiss,
        )
    }
}

private enum class InfoSubSheet { INFO, ENCRYPTION, APPEARANCE }

@Composable
private fun InfoSheet(
    seed: ConversationInfoSeed,
    isGroup: Boolean,
    onDismiss: () -> Unit,
    onOpenMessage: (messageId: String) -> Unit,
    onShare: () -> Unit,
    open: (InfoSubSheet) -> Unit,
) {
    val regime = ConversationEncryptionRegime.of(seed.encryptionMode)
    val options = rememberConversationOptionsSlots(
        conversationId = seed.conversationId,
        peerUserId = seed.peerUserId,
        title = seed.title,
        accentColor = seed.accentColor,
        onOpenAppearance = { open(InfoSubSheet.APPEARANCE) },
        onShare = { onDismiss(); onShare() },
        onExit = { onDismiss() },
    )
    val tabs = conversationInfoTabSlots(
        conversationId = seed.conversationId,
        accentColor = seed.accentColor,
        isEndToEnd = regime == ConversationEncryptionRegime.END_TO_END,
        conversationTitle = seed.title,
        clientMessages = emptyList(),
        onGoToMessage = { messageId -> onDismiss(); onOpenMessage(messageId) },
        onOpenFile = { carrier, _ -> onDismiss(); onOpenMessage(carrier.id) },
        options = options,
    )
    val infoViewModel: ConversationInfoViewModel = hiltViewModel(key = "conversation-info-from-list")
    LaunchedEffect(seed.conversationId) { infoViewModel.start(seed.conversationId) }
    val hero by infoViewModel.hero.collectAsStateWithLifecycle()
    ConversationInfoSheet(
        hero = hero,
        title = seed.title,
        subtitle = if (isGroup && seed.memberCount > 0) {
            pluralStringResource(R.plurals.chat_header_members, seed.memberCount, seed.memberCount)
        } else {
            null
        },
        avatarUrl = seed.avatarUrl,
        accentColor = seed.accentColor,
        peerUserId = seed.peerUserId,
        conversationId = seed.conversationId,
        entries = listOf(
            ConversationInfoEntry(
                icon = regime.icon(),
                label = stringResource(R.string.encryption_detail_title),
                subtitle = stringResource(regime.summaryRes()),
                onClick = { open(InfoSubSheet.ENCRYPTION) },
            ),
        ),
        tabs = tabs,
        onDismiss = onDismiss,
        headerActions = options.header,
    )
}
