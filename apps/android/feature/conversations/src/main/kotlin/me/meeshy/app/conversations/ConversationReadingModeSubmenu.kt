package me.meeshy.app.conversations

import android.content.Context
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.android.EntryPointAccessors
import dagger.hilt.components.SingletonComponent
import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.reading.mode.ReadingModeChoice
import me.meeshy.sdk.model.reading.mode.ReadingModeMenuEntry
import me.meeshy.sdk.model.reading.mode.ReadingModeMenuModel
import me.meeshy.sdk.model.reading.mode.ReadingModePreferenceScope
import me.meeshy.sdk.reading.SharedPreferencesReadingModeStore
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.ui.component.reading.ReadingModeMenuItem
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.feature.conversations.R

/**
 * Le sous-menu « Mode de lecture » de la liste : le MÊME catalogue que la puce du fil
 * ([ReadingModeMenuModel]) lu et écrit dans le MÊME magasin ([SharedPreferencesReadingModeStore]) —
 * une seule préférence par lecteur et conversation, trois portes. `null` quand il n'y a pas de
 * lecteur inscrit ou que l'interrupteur des modes de lecture est coupé : l'entrée est alors absente.
 */
@Singleton
internal class ConversationReadingModes @Inject constructor(
    private val store: SharedPreferencesReadingModeStore,
    private val sessionRepository: SessionRepository,
) {
    private fun scope(): ReadingModePreferenceScope? =
        sessionRepository.currentUser.value?.id?.let { ReadingModePreferenceScope.Registered(it) }

    fun entries(conversation: ApiConversation): List<ReadingModeMenuEntry>? {
        val scope = scope() ?: return null
        if (!store.isReadingModesEnabled) return null
        return ReadingModeMenuModel.forConversation(
            conversationType = conversation.type,
            memberCount = conversation.memberCount,
            isAnonymous = false,
            isFlagEnabled = true,
            isRiverFlagEnabled = store.isRiviereModeEnabled,
            preference = store.mode(conversation.id, scope),
        )
    }

    /** Écrit la préférence : Automatique efface la clé, un mode la fige — comme la puce du fil. */
    fun choose(conversation: ApiConversation, choice: ReadingModeChoice) {
        val scope = scope() ?: return
        val mode = (choice as? ReadingModeChoice.Mode)?.mode
        store.setMode(mode, conversation.id, scope)
    }
}

@EntryPoint
@InstallIn(SingletonComponent::class)
internal interface ConversationReadingModesEntryPoint {
    fun readingModes(): ConversationReadingModes
}

/** Le service de modes de lecture ; `null` hors application Hilt (aperçus, tests) : l'entrée est alors absente. */
@Composable
internal fun rememberConversationReadingModes(): ConversationReadingModes? {
    val context: Context = LocalContext.current.applicationContext
    return remember(context) {
        runCatching {
            EntryPointAccessors.fromApplication(context, ConversationReadingModesEntryPoint::class.java).readingModes()
        }.getOrNull()
    }
}

internal const val READING_MODE_PANEL_TAG = "conversation-menu-reading-mode-panel"

/** Le panneau du sous-menu : retour, puis Auto, Focal, Script, Bulles, Résumé, Rivière. */
@Composable
internal fun ReadingModePanel(
    entries: List<ReadingModeMenuEntry>,
    accent: Color,
    onBack: () -> Unit,
    onChoose: (ReadingModeChoice) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier.testTag(READING_MODE_PANEL_TAG)) {
        DropdownMenuItem(
            text = { Text(stringResource(R.string.lentille_mode_menu_title), style = MaterialTheme.typography.labelLarge) },
            leadingIcon = { Icon(MeeshyIcons.Back, contentDescription = null) },
            onClick = onBack,
            modifier = Modifier.testTag(BACK_TEST_TAG),
        )
        HorizontalDivider()
        entries.forEach { entry ->
            ReadingModeMenuItem(entry = entry, accentColor = accent, onClick = { onChoose(entry.choice) })
        }
    }
}
