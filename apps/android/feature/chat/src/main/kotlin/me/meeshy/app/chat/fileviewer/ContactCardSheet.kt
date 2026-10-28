package me.meeshy.app.chat.fileviewer

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.ContactsContract
import android.widget.Toast
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.net.toUri
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.contacts.vcard.ContactCardField
import me.meeshy.sdk.model.contacts.vcard.VCard
import me.meeshy.sdk.model.fileviewer.ContactInsertDraft
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

private sealed interface CardLoad {
    data object Loading : CardLoad
    data object Unreadable : CardLoad
    data class Ready(val card: VCard) : CardLoad
}

/**
 * La fiche d'une carte de visite (miroir de `ContactCardDetailSheet`, iOS) : une carte flottante sur la conversation
 * qui liste TOUS les champs de la vCard. Un appui long sur un champ le copie (retour haptique + message ; le presse-papiers
 * qui refuse est dit, jamais avalé). « Ajouter aux contacts » ouvre l'écran d'ajout du système, prérempli : aucune
 * autorisation d'accès au carnet n'est demandée.
 */
@Composable
internal fun ContactCardSheet(request: FileViewerRequest, accent: Color, onDismiss: () -> Unit) {
    val context = LocalContext.current
    var load by remember(request.localUri) { mutableStateOf<CardLoad>(CardLoad.Loading) }
    LaunchedEffect(request.localUri) {
        load = runCatching { FileViewerIo.readCard(context, request.localUri.toUri()) }.getOrNull()
            ?.let { CardLoad.Ready(it) } ?: CardLoad.Unreadable
    }
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Box(
            Modifier.fillMaxSize().clickable(onClick = onDismiss, indication = null, interactionSource = remember { MutableInteractionSource() }),
            contentAlignment = Alignment.Center,
        ) {
            Column(
                modifier = Modifier
                    .padding(horizontal = MeeshySpacing.lg)
                    .widthIn(max = 520.dp)
                    .fillMaxWidth()
                    .heightIn(max = 600.dp)
                    .clip(RoundedCornerShape(28.dp))
                    .background(MeeshyTheme.tokens.backgroundPrimary)
                    .clickable(indication = null, interactionSource = remember { MutableInteractionSource() }) {},
            ) {
                when (val state = load) {
                    CardLoad.Loading -> Box(Modifier.fillMaxWidth().padding(MeeshySpacing.xl), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = accent, strokeWidth = 2.dp)
                    }
                    CardLoad.Unreadable -> UnreadableCard(request.fileName, onDismiss)
                    is CardLoad.Ready -> ReadyCard(state.card, accent, onDismiss)
                }
            }
        }
    }
}

@Composable
private fun UnreadableCard(fileName: String, onDismiss: () -> Unit) {
    CardHeader(name = fileName, subtitle = null, accent = MeeshyTheme.tokens.textSecondary, onDismiss = onDismiss)
    Text(
        stringResource(R.string.viewer_contact_unreadable),
        color = MeeshyTheme.tokens.textSecondary,
        modifier = Modifier.padding(MeeshySpacing.lg),
    )
}

@Composable
private fun ReadyCard(card: VCard, accent: Color, onDismiss: () -> Unit) {
    val context = LocalContext.current
    val fields = remember(card) { ContactCardField.fields(card) }
    val subtitle = listOfNotNull(card.title, card.organization).joinToString(" · ").takeIf { it.isNotBlank() }
    CardHeader(name = card.displayName, subtitle = subtitle, accent = accent, onDismiss = onDismiss)
    Column(
        modifier = Modifier.verticalScroll(rememberScrollState()).padding(MeeshySpacing.lg),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
    ) {
        if (fields.isNotEmpty()) {
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(MeeshyRadius.md)).background(MeeshyTheme.tokens.backgroundSecondary),
            ) {
                fields.forEachIndexed { index, field ->
                    ContactCardFieldRow(field, accent)
                    if (index < fields.lastIndex) {
                        Box(Modifier.padding(start = 48.dp).fillMaxWidth().height(1.dp).background(MeeshyTheme.tokens.textSecondary.copy(alpha = 0.15f)))
                    }
                }
            }
        }
        val draft = remember(card) { ContactInsertDraft.of(card) }
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 48.dp)
                .clip(CircleShape)
                .background(accent.copy(alpha = 0.15f))
                .clickable(role = Role.Button) { startAddToContacts(context, draft) },
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(MeeshyIcons.PersonAdd, null, tint = accent, modifier = Modifier.size(18.dp))
            Text(
                stringResource(R.string.viewer_contact_add),
                color = accent,
                fontSize = MeeshyFontSize.label,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(start = MeeshySpacing.xs),
            )
        }
    }
}

@Composable
private fun CardHeader(name: String, subtitle: String?, accent: Color, onDismiss: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(start = MeeshySpacing.lg, top = MeeshySpacing.lg, end = MeeshySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        MeeshyAvatar(name = name, size = 52.dp, containerColor = accent)
        Column(Modifier.weight(1f)) {
            Text(
                name,
                color = MeeshyTheme.tokens.textPrimary,
                fontSize = MeeshyFontSize.title3,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.semantics { heading() },
            )
            if (subtitle != null) {
                Text(subtitle, color = MeeshyTheme.tokens.textSecondary, fontSize = MeeshyFontSize.label)
            }
        }
        val closeLabel = stringResource(R.string.viewer_contact_close)
        Box(
            Modifier.size(48.dp).clickable(role = Role.Button, onClick = onDismiss).semantics { contentDescription = closeLabel },
            contentAlignment = Alignment.Center,
        ) { Icon(MeeshyIcons.Close, null, tint = MeeshyTheme.tokens.textPrimary, modifier = Modifier.size(20.dp)) }
    }
}

/** Une ligne de la fiche. Appui long ⇒ copie + haptique + message ; TalkBack lit « libellé, valeur » et propose « Copier ». */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun ContactCardFieldRow(field: ContactCardField, accent: Color) {
    val context = LocalContext.current
    val haptics = rememberMeeshyHaptics()
    val label = field.labelText(known = { knownLabel(context, it) }, kindTitle = { kindTitle(context, it) })
    val copiedMessage = stringResource(R.string.viewer_contact_copied, label)
    val copyLabel = stringResource(R.string.viewer_contact_copy)
    val hint = stringResource(R.string.viewer_contact_copy_hint)
    val spoken = "$label, ${field.value}. $hint"
    val copy = {
        val copied = copyToClipboard(context, label, field.value)
        if (copied) haptics.success() else haptics.error()
        Toast.makeText(context, if (copied) copiedMessage else context.getString(R.string.viewer_load_error), Toast.LENGTH_SHORT).show()
    }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .combinedClickable(onClick = {}, onLongClick = copy)
            .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm)
            .clearAndSetSemantics {
                contentDescription = spoken
                customActions = listOf(CustomAccessibilityAction(copyLabel) { copy(); true })
            },
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        Icon(field.kind.icon(), null, tint = accent, modifier = Modifier.size(24.dp))
        Column(Modifier.weight(1f)) {
            Text(label, color = MeeshyTheme.tokens.textSecondary, fontSize = MeeshyFontSize.caption)
            Text(field.value, color = MeeshyTheme.tokens.textPrimary, fontSize = MeeshyFontSize.body)
        }
    }
}

private fun ContactCardField.Kind.icon(): ImageVector = when (this) {
    ContactCardField.Kind.PHONE -> MeeshyIcons.Call
    ContactCardField.Kind.EMAIL -> MeeshyIcons.Mail
    ContactCardField.Kind.ADDRESS -> MeeshyIcons.Location
    ContactCardField.Kind.ORGANIZATION -> MeeshyIcons.Public
    ContactCardField.Kind.TITLE -> MeeshyIcons.Person
    ContactCardField.Kind.URL -> MeeshyIcons.Link
    ContactCardField.Kind.BIRTHDAY -> MeeshyIcons.Gift
    ContactCardField.Kind.NOTE -> MeeshyIcons.Notes
}

private fun kindTitle(context: Context, kind: ContactCardField.Kind): String = context.getString(
    when (kind) {
        ContactCardField.Kind.PHONE -> R.string.viewer_field_phone
        ContactCardField.Kind.EMAIL -> R.string.viewer_field_email
        ContactCardField.Kind.ADDRESS -> R.string.viewer_field_address
        ContactCardField.Kind.ORGANIZATION -> R.string.viewer_field_organization
        ContactCardField.Kind.TITLE -> R.string.viewer_field_title
        ContactCardField.Kind.URL -> R.string.viewer_field_url
        ContactCardField.Kind.BIRTHDAY -> R.string.viewer_field_birthday
        ContactCardField.Kind.NOTE -> R.string.viewer_field_note
    },
)

private fun knownLabel(context: Context, key: String): String? = when (key) {
    "mobile" -> R.string.viewer_label_mobile
    "home" -> R.string.viewer_label_home
    "work" -> R.string.viewer_label_work
    "main" -> R.string.viewer_label_main
    "fax" -> R.string.viewer_label_fax
    "pager" -> R.string.viewer_label_pager
    "other" -> R.string.viewer_label_other
    else -> null
}?.let(context::getString)

/** Le presse-papiers peut refuser (application en arrière-plan, contenu trop gros) : `false` plutôt qu'un plantage. */
private fun copyToClipboard(context: Context, label: String, value: String): Boolean = runCatching {
    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    clipboard.setPrimaryClip(ClipData.newPlainText(label, value))
}.isSuccess

private fun startAddToContacts(context: Context, draft: ContactInsertDraft) {
    val intent = Intent(ContactsContract.Intents.Insert.ACTION).apply {
        type = ContactsContract.RawContacts.CONTENT_TYPE
        draft.name?.let { putExtra(ContactsContract.Intents.Insert.NAME, it) }
        draft.phones.getOrNull(0)?.let { putExtra(ContactsContract.Intents.Insert.PHONE, it) }
        draft.phones.getOrNull(1)?.let { putExtra(ContactsContract.Intents.Insert.SECONDARY_PHONE, it) }
        draft.email?.let { putExtra(ContactsContract.Intents.Insert.EMAIL, it) }
        draft.company?.let { putExtra(ContactsContract.Intents.Insert.COMPANY, it) }
        draft.jobTitle?.let { putExtra(ContactsContract.Intents.Insert.JOB_TITLE, it) }
        draft.notes?.let { putExtra(ContactsContract.Intents.Insert.NOTES, it) }
        draft.postal?.let { putExtra(ContactsContract.Intents.Insert.POSTAL, it) }
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    runCatching { context.startActivity(intent) }
}
