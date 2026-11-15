package me.meeshy.app.chat

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
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
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.guest.GuestAttachmentAllowance
import me.meeshy.sdk.model.guest.GuestAttachmentKind
import me.meeshy.sdk.model.guest.GuestAttachmentRefusal
import me.meeshy.sdk.model.guest.GuestAttachmentScreening
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** Les types que le selecteur de fichiers propose pour une famille (iOS `GuestAttachmentContentTypes`). */
internal fun GuestAttachmentKind.mimeTypes(): Array<String> = when (this) {
    GuestAttachmentKind.TEXT -> arrayOf("text/plain")
    GuestAttachmentKind.AUDIO -> arrayOf("audio/*")
    GuestAttachmentKind.IMAGE -> arrayOf("image/jpeg", "image/png", "image/gif", "image/webp")
    GuestAttachmentKind.PDF -> arrayOf("application/pdf")
}

/**
 * **La feuille « Partager dans … »** d'un invite restreint (iOS `GuestAttachmentSheet`, #10006) : une tuile par famille
 * OUVERTE, la phrase qui dit ce qui passe, et — quand un fichier choisi ne passe pas — la raison, nommee, sans fermer la
 * feuille. Le serveur reste juge du contenu reel ; ce tri n'offre que ce qui peut passer.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun GuestAttachmentSheet(
    conversationTitle: String,
    allowance: GuestAttachmentAllowance,
    onAccepted: (List<Uri>) -> Unit,
    onDismiss: () -> Unit,
) {
    val context = LocalContext.current
    val kinds = allowance.kinds ?: GuestAttachmentKind.entries
    var refusal by remember { mutableStateOf<GuestAttachmentScreening.Refusal?>(null) }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        if (uris.isEmpty()) return@rememberLauncherForActivityResult
        val candidates = uris.map { GuestAttachmentScreening.Candidate(displayName(context, it), byteCount(context, it)) }
        val screening = GuestAttachmentScreening.of(candidates, allowance)
        val accepted = screening.acceptedIndices.map(uris::get)
        if (accepted.isNotEmpty()) onAccepted(accepted)
        refusal = screening.refusals.firstOrNull()
        if (refusal == null) onDismiss()
    }
    val tokens = MeeshyTheme.tokens
    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = tokens.backgroundPrimary) {
        Column(
            modifier = Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = MeeshySpacing.lg).padding(bottom = MeeshySpacing.xxl),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.mdPlus),
        ) {
            Text(
                text = stringResource(R.string.guest_attach_title, conversationTitle),
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
                color = tokens.textPrimary,
                modifier = Modifier.semantics { heading() },
            )
            kinds.chunked(2).forEach { row ->
                Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus)) {
                    row.forEach { kind ->
                        KindTile(kind, Modifier.weight(1f)) {
                            refusal = null
                            picker.launch(kind.mimeTypes())
                        }
                    }
                    if (row.size == 1) Box(Modifier.weight(1f))
                }
            }
            Note(conversationTitle, kinds)
            refusal?.let { RefusalRow(GuestAttachmentCopy.refusal(context, it.fileName, it.reason, kinds)) }
            OutlinedButton(
                onClick = onDismiss,
                shape = RoundedCornerShape(MeeshyRadius.md),
                border = BorderStroke(1.dp, MeeshyPalette.Indigo300.copy(alpha = 0.42f)),
                modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp),
            ) {
                Text(stringResource(R.string.guest_attach_cancel), color = tokens.textPrimary, fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

@Composable
private fun KindTile(kind: GuestAttachmentKind, modifier: Modifier, onClick: () -> Unit) {
    val tint = tint(kind)
    Column(
        modifier = modifier
            .heightIn(min = 96.dp)
            .clip(RoundedCornerShape(MeeshyRadius.lg))
            .background(MeeshyTheme.tokens.backgroundSecondary)
            .clickable(onClick = onClick)
            .padding(MeeshySpacing.md),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Box(Modifier.size(32.dp).clip(CircleShape).background(tint.copy(alpha = 0.14f)), contentAlignment = Alignment.Center) {
            Icon(icon(kind), contentDescription = null, tint = tint, modifier = Modifier.size(18.dp))
        }
        Text(
            text = stringResource(GuestAttachmentCopy.tileLabelRes(kind)),
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = FontWeight.SemiBold,
            color = MeeshyTheme.tokens.textPrimary,
            modifier = Modifier.padding(top = MeeshySpacing.sm),
        )
    }
}

@Composable
private fun Note(conversationTitle: String, kinds: List<GuestAttachmentKind>) {
    val context = LocalContext.current
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(MeeshyRadius.md))
            .background(MeeshyTheme.tokens.backgroundSecondary)
            .padding(horizontal = MeeshySpacing.mdPlus, vertical = MeeshySpacing.md),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        Text(GuestAttachmentCopy.note(context, conversationTitle, kinds), style = MaterialTheme.typography.bodyMedium, color = MeeshyTheme.tokens.textSecondary)
        Text(stringResource(R.string.guest_attach_create_account), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, color = MeeshyTheme.tokens.textSecondary)
    }
}

@Composable
private fun RefusalRow(message: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(MeeshyRadius.md))
            .background(MeeshyPalette.Error.copy(alpha = 0.08f))
            .padding(horizontal = MeeshySpacing.mdPlus, vertical = MeeshySpacing.md)
            .semantics { liveRegion = LiveRegionMode.Polite },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        Box(Modifier.size(32.dp).clip(CircleShape).background(MeeshyPalette.Error.copy(alpha = 0.18f)), contentAlignment = Alignment.Center) {
            Icon(MeeshyIcons.Block, contentDescription = null, tint = MeeshyPalette.Error, modifier = Modifier.size(18.dp))
        }
        Text(message, style = MaterialTheme.typography.bodyMedium, color = MeeshyTheme.tokens.textPrimary, modifier = Modifier.weight(1f))
    }
}

private fun icon(kind: GuestAttachmentKind): ImageVector = when (kind) {
    GuestAttachmentKind.TEXT -> MeeshyIcons.Article
    GuestAttachmentKind.AUDIO -> MeeshyIcons.MusicNote
    GuestAttachmentKind.IMAGE -> MeeshyIcons.Photo
    GuestAttachmentKind.PDF -> MeeshyIcons.Document
}

private fun tint(kind: GuestAttachmentKind): Color = when (kind) {
    GuestAttachmentKind.TEXT -> MeeshyPalette.Indigo400
    GuestAttachmentKind.AUDIO -> MeeshyPalette.Success
    GuestAttachmentKind.IMAGE -> MeeshyPalette.Warning
    GuestAttachmentKind.PDF -> MeeshyPalette.Info
}

private fun displayName(context: Context, uri: Uri): String =
    query(context, uri, OpenableColumns.DISPLAY_NAME) ?: uri.lastPathSegment.orEmpty()

private fun byteCount(context: Context, uri: Uri): Long = query(context, uri, OpenableColumns.SIZE)?.toLongOrNull() ?: 0L

private fun query(context: Context, uri: Uri, column: String): String? = runCatching {
    context.contentResolver.query(uri, arrayOf(column), null, null, null)?.use { cursor ->
        if (cursor.moveToFirst()) cursor.getString(0) else null
    }
}.getOrNull()
