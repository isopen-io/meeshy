package me.meeshy.app.chat.options

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.conversationoptions.ArchiveGesture
import me.meeshy.sdk.model.conversationoptions.ConversationOptionsPlan
import me.meeshy.ui.component.settings.SettingsRow
import me.meeshy.ui.component.settings.SettingsSeparator
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette

internal enum class OptionsDialog { FAVORITE, ARCHIVE, DELETE, OBSOLETE, LEAVE, BLOCK }

/** Ce que la section « Actions » range derrière « Plus » : les gestes rares, chacun avec sa confirmation de conséquence. */
internal fun ConversationOptionsPlan.hasRareActions(): Boolean =
    leave || blockUserId != null || deleteForMe || obsolete

/**
 * Les rangées de la section « Actions » des Options (épure #17697, règle 6) : au repos, Archiver et « Plus » ;
 * Quitter, Bloquer, Supprimer pour moi et Rendre obsolète se déplient depuis « Plus », en un geste, et ouvrent
 * la même confirmation qu'avant. Une action que la passerelle refuserait n'est jamais listée.
 */
@Composable
internal fun OptionsActionRows(plan: ConversationOptionsPlan, archiveGesture: ArchiveGesture, onAsk: (OptionsDialog) -> Unit) {
    var moreOpen by remember { mutableStateOf(false) }
    val rare = buildList {
        if (plan.leave) add(Triple(MeeshyIcons.SignOut, R.string.conversation_options_leave, OptionsDialog.LEAVE))
        if (plan.blockUserId != null) add(Triple(MeeshyIcons.GppMaybe, R.string.conversation_options_block_title, OptionsDialog.BLOCK))
        if (plan.deleteForMe) add(Triple(MeeshyIcons.DeleteFilled, R.string.conversation_options_delete_for_me, OptionsDialog.DELETE))
        if (plan.obsolete) add(Triple(MeeshyIcons.DeleteFilled, R.string.conversation_options_obsolete, OptionsDialog.OBSOLETE))
    }
    Column {
        if (plan.toggleArchive) {
            val archived = archiveGesture == ArchiveGesture.UNARCHIVE
            SettingsRow(
                icon = MeeshyIcons.Inbox,
                title = stringResource(if (archived) R.string.conversation_options_unarchive else R.string.conversation_options_archive),
                color = MeeshyPalette.Amber500,
                modifier = Modifier.clickable(role = Role.Button) { onAsk(OptionsDialog.ARCHIVE) },
            )
        }
        if (rare.isNotEmpty()) {
            if (plan.toggleArchive) SettingsSeparator(MeeshyPalette.Neutral500)
            SettingsRow(
                icon = MeeshyIcons.MoreHorizontal,
                title = stringResource(R.string.action_more),
                color = MeeshyPalette.Neutral500,
                modifier = Modifier.clickable(role = Role.Button) { moreOpen = !moreOpen },
            )
            if (moreOpen) {
                rare.forEach { (icon, label, dialog) ->
                    SettingsSeparator(MeeshyPalette.Neutral500)
                    SettingsRow(
                        icon = icon,
                        title = stringResource(label),
                        color = MeeshyPalette.Error,
                        modifier = Modifier.clickable(role = Role.Button) { moreOpen = false; onAsk(dialog) },
                    )
                }
            }
        }
    }
}
