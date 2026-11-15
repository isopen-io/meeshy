package me.meeshy.app.chat.share

import android.text.format.Formatter
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.share.ShareCardKind
import me.meeshy.sdk.model.share.ShareContentHeader
import me.meeshy.sdk.model.share.ShareContentSummary
import me.meeshy.sdk.model.share.ShareContentTitle
import me.meeshy.sdk.model.share.ShareInfoCard
import me.meeshy.sdk.model.share.ShareInfoKind
import me.meeshy.sdk.model.share.ShareLimits
import me.meeshy.sdk.model.share.ShareMessagePreview
import me.meeshy.sdk.model.share.ShareMessageRow
import me.meeshy.sdk.model.share.SharePieceKind
import me.meeshy.sdk.model.share.SharePlan
import me.meeshy.sdk.model.share.ShareShortfall
import me.meeshy.sdk.model.share.ShareSubject
import me.meeshy.sdk.model.share.ShareWithdrawReason
import me.meeshy.sdk.model.share.ShareWithdrawnNote
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

internal const val ShareContentMessageTestTag = "share-content-message"
internal const val ShareContentWholeMessageTestTag = "share-content-whole-message"
internal const val ShareContentTrimTestTag = "share-content-trim"
internal const val ShareContentCopyLinkTestTag = "share-content-copy-link"

internal data class ShareContentZoneActions(
    val onRemoveMessage: (messageId: String) -> Unit,
    /** « Tout le message » : la pièce s'élargit sans fermer la feuille. */
    val onWidenToWholeMessage: () -> Unit,
    val onTrimOverflow: () -> Unit,
    val onCopyLink: (url: String) -> Unit,
    val strip: ShareIncomingStripActions,
)

/**
 * **Zone 1 — « Ce qui part »**, dans l'ordre d'envoi (iOS `ShareContentZone`). Sans état : tout vient du
 * sujet, du plan et des messages retirés. Un message protégé retiré d'une sélection y reste, atténué à 40 %,
 * avec son motif, et la note dit que les autres partent ; une pièce seule offre « Tout le message » ; un
 * texte-URL part comme lien, avec « Copier le lien » ; des fichiers entrants forment la bande de vignettes.
 */
@Composable
internal fun ShareContentZone(
    subject: ShareSubject,
    removedMessageIds: Set<String>,
    plan: SharePlan,
    accentColor: Color,
    thumbnailLoader: ShareThumbnailLoader,
    actions: ShareContentZoneActions,
    modifier: Modifier = Modifier,
    shortfalls: List<ShareShortfall> = emptyList(),
) {
    Column(modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.lg), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        ContentHeader(ShareContentSummary.header(subject, plan), accentColor, actions)
        when (subject) {
            is ShareSubject.Messages -> ShareContentSummary.messageRows(subject, removedMessageIds, plan)
                .forEach { row -> MessageCard(row, accentColor, actions.onRemoveMessage) }
            is ShareSubject.Piece -> PieceCard(subject, accentColor)
            is ShareSubject.Incoming -> {
                shortfalls.forEach { Shortfall(it) }
                if (subject.media.isNotEmpty()) {
                    ShareIncomingStripView(
                        media = subject.media,
                        fittingCount = subject.media.size - plan.limits.trimCount,
                        accentColor = accentColor,
                        thumbnailLoader = thumbnailLoader,
                        actions = actions.strip,
                    )
                }
            }
            else -> Unit
        }
        ShareContentSummary.infoCards(subject).forEach { InfoCard(it, accentColor, actions.onCopyLink) }
        ShareContentSummary.withdrawnNote(plan)?.let { WithdrawnNote(it) }
    }
}

@Composable
private fun ContentHeader(header: ShareContentHeader, accentColor: Color, actions: ShareContentZoneActions) {
    val zone = stringResource(R.string.share_zone_content)
    val title = when (val t = header.title) {
        ShareContentTitle.Plain -> zone
        is ShareContentTitle.MessagesKept -> stringResource(R.string.share_content_messages_kept, t.kept, t.total)
        is ShareContentTitle.PieceOf -> "$zone · " + stringResource(R.string.share_content_piece_of, t.index, t.count)
        is ShareContentTitle.IncomingCount -> "$zone · ${t.count}"
    }
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(
            text = title,
            style = MaterialTheme.typography.labelLarge,
            color = MeeshyTheme.tokens.textMuted,
            modifier = Modifier.weight(1f).semantics { heading() },
        )
        header.removeLastCount?.let { count ->
            HeaderAction(stringResource(R.string.share_content_remove_last, count), MeeshyTheme.tokens.error, ShareContentTrimTestTag, actions.onTrimOverflow)
        }
        if (header.offersWholeMessage) {
            HeaderAction(stringResource(R.string.share_content_whole_message), accentColor, ShareContentWholeMessageTestTag, actions.onWidenToWholeMessage)
        }
    }
}

@Composable
private fun HeaderAction(label: String, color: Color, tag: String, onClick: () -> Unit) {
    Box(
        modifier = Modifier.heightIn(min = 48.dp).clip(RoundedCornerShape(MeeshyRadius.xs)).clickable(role = Role.Button, onClick = onClick)
            .padding(horizontal = MeeshySpacing.sm).testTag(tag),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, style = MaterialTheme.typography.labelLarge, color = color)
    }
}

@Composable
private fun MessageCard(row: ShareMessageRow, accentColor: Color, onRemove: (String) -> Unit) {
    val withdrawn = row.withdrawn != null
    val body = row.withdrawn?.let { withdrawnText(it) } ?: previewText(row.preview)
    val remove = stringResource(R.string.share_content_remove)
    val spoken = listOfNotNull(row.senderName, body).joinToString(", ")
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .testTag(ShareContentMessageTestTag)
            .alpha(if (withdrawn) ShareMessageRow.WITHDRAWN_ALPHA else 1f)
            .background(MeeshyTheme.tokens.surfaceFill, RoundedCornerShape(MeeshyRadius.sm))
            .padding(MeeshySpacing.sm)
            .semantics(mergeDescendants = true) {
                contentDescription = spoken
                if (row.removable) customActions = listOf(CustomAccessibilityAction(remove) { onRemove(row.id); true })
            },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Box(Modifier.width(3.dp).size(width = 3.dp, height = 32.dp).background(accentColor, RoundedCornerShape(2.dp)))
        row.thumbnail?.let { piece ->
            val url = piece.thumbnailUrl?.takeIf { it.isNotBlank() } ?: piece.fileUrl?.takeIf { it.isNotBlank() && piece.mimeType.orEmpty().startsWith("image/") }
            if (url != null) {
                AsyncImage(
                    model = url,
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.size(32.dp).clip(RoundedCornerShape(MeeshyRadius.xxs)),
                )
            }
        }
        Column(Modifier.weight(1f)) {
            Text(
                text = row.senderName ?: "?",
                style = MaterialTheme.typography.labelLarge,
                color = accentColor,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(body, style = MaterialTheme.typography.bodySmall, color = MeeshyTheme.tokens.textMuted, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
        if (row.removable) {
            Box(
                modifier = Modifier.size(48.dp).clip(RoundedCornerShape(24.dp)).clickable(role = Role.Button) { onRemove(row.id) },
                contentAlignment = Alignment.Center,
            ) {
                Icon(MeeshyIcons.CloseCircleFilled, contentDescription = remove, tint = MeeshyTheme.tokens.textMuted)
            }
        }
    }
}

@Composable
private fun PieceCard(subject: ShareSubject.Piece, accentColor: Color) {
    val piece = subject.message.attachments.firstOrNull { it.id == subject.attachmentId } ?: return
    val kind = SharePieceKind.of(piece.mimeType)
    val label = stringResource(kindLabelRes(kind))
    val sender = subject.message.sender?.name.orEmpty()
    val url = piece.thumbnailUrl?.takeIf { it.isNotBlank() } ?: piece.fileUrl?.takeIf { it.isNotBlank() && kind == SharePieceKind.IMAGE }
    Row(
        modifier = Modifier.fillMaxWidth().semantics(mergeDescendants = true) {},
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        Box(
            Modifier.size(64.dp).clip(RoundedCornerShape(MeeshyRadius.xxs)).background(accentColor.copy(alpha = 0.12f)),
            contentAlignment = Alignment.Center,
        ) {
            if (url != null) {
                AsyncImage(model = url, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.size(64.dp))
            } else {
                Icon(kindIcon(kind), contentDescription = null, tint = accentColor)
            }
        }
        Column {
            Text(label, style = MaterialTheme.typography.titleSmall, color = MeeshyTheme.tokens.textPrimary)
            if (sender.isNotEmpty()) Text(sender, style = MaterialTheme.typography.labelMedium, color = MeeshyTheme.tokens.textMuted)
        }
    }
}

@Composable
private fun InfoCard(card: ShareInfoCard, accentColor: Color, onCopyLink: (String) -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(MeeshyTheme.tokens.surfaceFill, RoundedCornerShape(MeeshyRadius.sm))
            .padding(MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        Box(
            Modifier.size(48.dp).clip(RoundedCornerShape(MeeshyRadius.xs)).background(accentColor.copy(alpha = 0.12f)),
            contentAlignment = Alignment.Center,
        ) {
            if (card.imageUrl != null) {
                AsyncImage(model = card.imageUrl, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.size(48.dp))
            } else {
                Icon(infoIcon(card), contentDescription = null, tint = accentColor)
            }
        }
        Column(Modifier.weight(1f).semantics(mergeDescendants = true) {}) {
            Text(card.title, style = MaterialTheme.typography.titleSmall, color = MeeshyTheme.tokens.textPrimary, maxLines = 3, overflow = TextOverflow.Ellipsis)
            card.subtitle?.let {
                Text(it, style = MaterialTheme.typography.labelMedium, color = MeeshyTheme.tokens.textMuted, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        card.copyableLink?.let { link ->
            HeaderAction(stringResource(R.string.share_action_copy_link), accentColor, ShareContentCopyLinkTestTag) { onCopyLink(link) }
        }
    }
}

private fun infoIcon(card: ShareInfoCard) = when {
    card.kind == ShareInfoKind.TEXT -> MeeshyIcons.Notes
    card.kind == ShareInfoKind.LINK -> MeeshyIcons.Link
    card.cardKind == ShareCardKind.PROFILE || card.cardKind == ShareCardKind.INVITATION -> MeeshyIcons.Person
    card.cardKind == ShareCardKind.REEL -> MeeshyIcons.Video
    else -> MeeshyIcons.Link
}

@Composable
private fun WithdrawnNote(note: ShareWithdrawnNote) {
    val text = withdrawnText(note.reason) + " " + stringResource(R.string.share_withdrawn_others_leave, note.othersLeaving)
    Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm), verticalAlignment = Alignment.Top) {
        Icon(MeeshyIcons.EyeOff, contentDescription = null, tint = MeeshyTheme.tokens.textMuted, modifier = Modifier.size(16.dp))
        Text(text, style = MaterialTheme.typography.labelMedium, color = MeeshyTheme.tokens.textMuted)
    }
}

@Composable
private fun Shortfall(shortfall: ShareShortfall) {
    val context = LocalContext.current
    val text = when (shortfall) {
        ShareShortfall.Unprepared -> stringResource(R.string.share_content_unprepared)
        is ShareShortfall.OverBudget -> stringResource(
            R.string.share_content_over_budget,
            shortfall.uncopied,
            ShareLimits.MAX_FILES,
            Formatter.formatFileSize(context, ShareLimits.MAX_TOTAL_BYTES),
        )
        ShareShortfall.RefusedSource -> stringResource(R.string.share_content_refused_source)
    }
    Text(text, style = MaterialTheme.typography.labelMedium, color = MeeshyTheme.tokens.textMuted)
}

@Composable
private fun previewText(preview: ShareMessagePreview): String = when (preview) {
    is ShareMessagePreview.Text -> preview.text
    ShareMessagePreview.Sticker -> stringResource(R.string.attachment_sticker)
    ShareMessagePreview.Placeholder -> stringResource(R.string.forward_media_placeholder)
    is ShareMessagePreview.Media -> {
        val kind = stringResource(kindLabelRes(preview.kind))
        if (preview.count > 1) "$kind · ${preview.count}" else kind
    }
}

@Composable
internal fun withdrawnText(reason: ShareWithdrawReason): String = stringResource(
    when (reason) {
        ShareWithdrawReason.VIEW_ONCE -> R.string.share_withdrawn_view_once
        ShareWithdrawReason.AFTER_READ -> R.string.share_withdrawn_after_read
        ShareWithdrawReason.UNAVAILABLE -> R.string.share_withdrawn_unavailable
    },
)
