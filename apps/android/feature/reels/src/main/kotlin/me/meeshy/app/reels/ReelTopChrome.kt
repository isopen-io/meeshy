package me.meeshy.app.reels

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import me.meeshy.app.stories.StoryVideoExportMenuEntries
import me.meeshy.app.stories.rememberSceneVideoExport
import me.meeshy.feature.reels.R
import me.meeshy.sdk.model.ReelMenu
import me.meeshy.sdk.model.fullscreen.FullscreenChromeSymbol
import me.meeshy.ui.component.chrome.FullscreenTopBar
import me.meeshy.ui.component.fullscreen.FullscreenChromeButton
import me.meeshy.ui.component.fullscreen.FullscreenChromeVisibility
import me.meeshy.ui.component.fullscreen.icon
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette

/**
 * La barre haute du lecteur de réels : sortie à l'extrémité de début, puis le son (seulement
 * pour un réel qui en porte : un bouton sur un réel sans piste serait du chrome mort) et le menu « … » du réel
 * affiché. Elle s'efface avec le reste du chrome en mode immersif et rend le chrome au toucher
 * (relais TalkBack compris).
 */
@Composable
internal fun ReelTopChrome(
    reel: ReelPresentation?,
    chromeHidden: Boolean,
    muted: Boolean,
    showsMute: Boolean,
    viewModel: ReelsViewModel,
    onClose: () -> Unit,
    onToggleMute: () -> Unit,
    onReveal: () -> Unit,
    onOpen: (String) -> Unit,
    onShare: (ReelPresentation) -> Unit,
) {
    FullscreenChromeVisibility(visible = !chromeHidden, modifier = Modifier, onReveal = onReveal) {
        FullscreenTopBar(
            onClose = onClose,
            trailing = {
                if (showsMute) FullscreenChromeButton(
                    icon = if (muted) MeeshyIcons.VolumeOff else MeeshyIcons.VolumeUp,
                    label = stringResource(if (muted) R.string.reels_unmute else R.string.reels_mute),
                    onClick = onToggleMute,
                    isActive = !muted,
                    activeTint = MeeshyPalette.White,
                )
                if (reel != null) {
                    ReelMenuButton(reel = reel, viewModel = viewModel, onOpen = onOpen, onShare = onShare)
                }
            },
        )
    }
}

@Composable
private fun ReelMenuButton(
    reel: ReelPresentation,
    viewModel: ReelsViewModel,
    onOpen: (String) -> Unit,
    onShare: (ReelPresentation) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    val haptics = rememberMeeshyHaptics()
    val context = LocalContext.current
    val text = reel.captionOriginal ?: reel.caption
    // Le réel ENTIER, scène ou vidéo, sort par le moteur d'export des stories (#13896).
    val export = rememberSceneVideoExport { listOfNotNull(reel.export) }
    Box {
        FullscreenChromeButton(
            icon = FullscreenChromeSymbol.More.icon,
            label = stringResource(R.string.reels_menu_hint),
            onClick = { expanded = true },
            isActive = expanded,
        )
        DropdownMenu(expanded = expanded && !export.busy, onDismissRequest = { expanded = false }) {
            ReelMenu.actions(isOwn = viewModel.isOwn(reel), hasText = !text.isNullOrBlank(), exportable = reel.export != null).forEach { action ->
                if (action == ReelMenu.Action.EXPORT) {
                    StoryVideoExportMenuEntries(onPick = { mode ->
                        expanded = false
                        haptics.light()
                        export.start(mode)
                    })
                    return@forEach
                }
                ReelMenuEntry(action) {
                    expanded = false
                    when (action) {
                        ReelMenu.Action.OPEN -> onOpen(reel.id)
                        ReelMenu.Action.COPY_TEXT -> {
                            val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                            clipboard.setPrimaryClip(ClipData.newPlainText(null, text.orEmpty()))
                            haptics.success()
                        }
                        ReelMenu.Action.SHARE -> {
                            haptics.light()
                            onShare(reel)
                        }
                        ReelMenu.Action.PIN -> {
                            haptics.light()
                            viewModel.pin(reel.id)
                        }
                        ReelMenu.Action.DELETE -> {
                            haptics.medium()
                            viewModel.delete(reel.id)
                        }
                        ReelMenu.Action.REPORT -> {
                            haptics.medium()
                            viewModel.report(reel.id)
                        }
                        ReelMenu.Action.EXPORT -> Unit
                    }
                }
            }
        }
    }
}

/** Une entrée du menu, son icône et son libellé ; l'export y pose ses trois sorties à part ([StoryVideoExportMenuEntries]). */
@Composable
private fun ReelMenuEntry(action: ReelMenu.Action, onClick: () -> Unit) {
    val label = stringResource(
        when (action) {
            ReelMenu.Action.OPEN -> R.string.reels_menu_open
            ReelMenu.Action.COPY_TEXT -> R.string.reels_menu_copy_text
            ReelMenu.Action.SHARE, ReelMenu.Action.EXPORT -> R.string.reels_menu_share
            ReelMenu.Action.PIN -> R.string.reels_menu_pin
            ReelMenu.Action.DELETE -> R.string.reels_menu_delete
            ReelMenu.Action.REPORT -> R.string.reels_menu_report
        },
    )
    val destructive = action == ReelMenu.Action.DELETE
    DropdownMenuItem(
        leadingIcon = {
            Icon(
                imageVector = when (action) {
                    ReelMenu.Action.OPEN -> MeeshyIcons.OpenExternal
                    ReelMenu.Action.COPY_TEXT -> MeeshyIcons.Copy
                    ReelMenu.Action.SHARE, ReelMenu.Action.EXPORT -> MeeshyIcons.Share
                    ReelMenu.Action.PIN -> MeeshyIcons.Pin
                    ReelMenu.Action.DELETE -> MeeshyIcons.Delete
                    ReelMenu.Action.REPORT -> MeeshyIcons.Warning
                },
                contentDescription = null,
                tint = if (destructive) MeeshyPalette.Error else androidx.compose.material3.LocalContentColor.current,
            )
        },
        text = { Text(text = label, color = if (destructive) MeeshyPalette.Error else androidx.compose.ui.graphics.Color.Unspecified) },
        onClick = onClick,
    )
}
