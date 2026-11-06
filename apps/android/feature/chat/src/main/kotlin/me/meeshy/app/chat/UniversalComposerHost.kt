package me.meeshy.app.chat

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import java.io.File
import me.meeshy.sdk.composer.ComposerAttachmentPolicy
import me.meeshy.sdk.composer.SlowModeState
import me.meeshy.ui.component.composer.UniversalComposerSpec

/**
 * **LE COMPOSEUR DES CONVERSATIONS, PRÊTÉ À UNE AUTRE SURFACE** (#14265) — miroir d'iOS `UniversalComposerBar(mode:)`.
 * Les commentaires du fil, des réels et des stories le montent par `LocalUniversalComposer`, que l'application relie
 * à cette fonction : le même verre, la même rangée, les mêmes portes, sous le réglage de la surface.
 */
@Composable
public fun UniversalComposerHost(
    spec: UniversalComposerSpec,
    modifier: Modifier = Modifier,
    locationSettingsSheet: @Composable (accent: Color, onDismiss: () -> Unit) -> Unit = { _, onDismiss -> LaunchedEffect(Unit) { onDismiss() } },
) {
    val revision = remember { ExternalDraftRevision() }
    val draftRevision = revision.of(spec.draft)
    var placePickerOpen by rememberSaveable { mutableStateOf(false) }
    var composerPanelOpen by remember { mutableStateOf(false) }
    val reportPanelOpen by rememberUpdatedState(spec.onPanelOpenChange)
    val panelOpen = composerPanelOpen || placePickerOpen
    LaunchedEffect(panelOpen) { reportPanelOpen(panelOpen) }
    DisposableEffect(Unit) { onDispose { reportPanelOpen(false) } }
    Box(modifier) {
        ChatComposer(
            draft = spec.draft,
            draftRevision = draftRevision,
            canSend = spec.canSend,
            isEditing = false,
            affordances = ComposerAttachmentPolicy.affordances(null),
            slowMode = SlowModeState.UNTHROTTLED,
            replyBanner = null,
            clipboardContent = null,
            languageCode = spec.languageCode,
            accentColor = spec.accentColor,
            onDraftChange = { text ->
                revision.typed(text)
                spec.onDraftChange(text)
            },
            onPickLanguage = spec.onPickLanguage ?: {},
            onSend = spec.onSend,
            onCancelEdit = {},
            onCancelReply = {},
            onRemoveClipboard = {},
            onPickFile = spec.onAttachFile ?: ::discardUnreceived,
            hasPendingAttachments = spec.hasPendingAttachments,
            onPickUris = spec.onAttachUris,
            pendingSlot = pendingSlotOf(spec),
            pendingAttachmentCount = spec.pendingAttachmentCount,
            focusTrigger = spec.focusTrigger,
            configuration = spec.effectiveConfiguration,
            placeholder = spec.placeholder,
            onQuickEmoji = spec.onQuickEmoji,
            foldable = spec.foldable,
            effects = spec.effects,
            onToggleEffect = spec.onToggleEffect ?: {},
            onClearEffects = spec.onClearEffects,
            onLocationRequest = spec.onPickPlace?.let { { placePickerOpen = true } },
            onPanelOpenChange = { composerPanelOpen = it },
        )
    }
    val onPickPlace = spec.onPickPlace
    if (placePickerOpen && onPickPlace != null) {
        LocationPickerDialog(
            accent = spec.accentColor,
            settingsSheet = locationSettingsSheet,
            onSelect = onPickPlace,
            onDismiss = { placePickerOpen = false },
        )
    }
}

/** Une surface qui ne reçoit pas de pièce n'en garde aucune trace. */
private fun discardUnreceived(file: File, fileName: String, mimeType: String?) {
    file.delete()
}

/**
 * Le champ du composeur ne relit le brouillon de l'hôte qu'à un changement de révision. Un texte que le champ vient
 * d'écrire ne la change pas (le curseur reste où il est) ; un texte posé par l'hôte (mention choisie, @auteur d'une
 * réponse, champ vidé après l'envoi) la change, et le champ le reprend.
 */
internal class ExternalDraftRevision {
    private var known: String? = null
    private var revision = 0

    fun typed(text: String) {
        known = text
    }

    fun of(draft: String): Int {
        if (known != null && draft != known) revision += 1
        known = draft
        return revision
    }
}

/** Au-dessus de la saisie : la pastille du lieu en attente (#14387), puis ce que la surface y pose. */
private fun pendingSlotOf(spec: UniversalComposerSpec): (@Composable () -> Unit)? {
    val place = spec.pendingPlace ?: return spec.topSlot
    return {
        Column {
            ComposerPlaceChip(place, spec.accentColor, onRemove = spec.onRemovePlace)
            spec.topSlot?.invoke()
        }
    }
}
