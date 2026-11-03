package me.meeshy.ui.component.bubble

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontStyle
import me.meeshy.sdk.model.piece.PieceBadge
import me.meeshy.ui.theme.MeeshyMotion
import me.meeshy.ui.theme.MeeshyTheme
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.contacts.vcard.ContactCardFile
import me.meeshy.ui.R
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

/**
 * One generic file attachment: a paperclip, the file name (or a generic label), its size, and — like iOS
 * `DownloadBadgeView` — the state of its transfer carried by the row itself (#13492): to download → progress → ready,
 * or a failure to retry. A sealed (end-to-end encrypted) piece is drawn as such and never offers a download (#13493).
 * A null [onClick] (no url yet, or no host callback) leaves the row non-interactive.
 */
@Composable
public fun BubbleFileRow(
    file: BubbleFile,
    onColor: Color,
    onClick: (() -> Unit)?,
    modifier: Modifier = Modifier,
    transfers: BubbleFileTransfers = LocalBubbleFileTransfers.current,
) {
    if (file.isSealed) {
        BubbleSealedPieceRow(onColor, modifier)
        return
    }
    if (file.isContactCard) {
        BubbleContactCardRow(file, onColor, onClick, transfers, modifier)
        return
    }
    val badge = rememberVideoAutoDownloadBadge(file, remember(file, transfers) { transfers.badgeOf(file) })
    val actionLabel = when (badge) {
        is PieceBadge.Downloading -> stringResource(R.string.bubble_file_cancel)
        PieceBadge.Failed -> stringResource(R.string.bubble_file_download_failed)
        is PieceBadge.Idle -> stringResource(R.string.bubble_file_download)
        else -> stringResource(R.string.bubble_file_open)
    }
    val stateText = badgeStateText(badge)
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(MeeshyRadius.sm))
            .background(onColor.copy(alpha = 0.1f))
            .let { base ->
                if (onClick == null) base
                else base.clickable(onClick = onClick).semantics {
                    role = Role.Button
                    contentDescription = actionLabel
                    stateText?.let { stateDescription = it }
                }
            }
            .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xs)
            .animateContentSize(MeeshyMotion.springDefault()),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        DocumentFileCard(file = file, onColor = onColor, trailing = { FileBadgeView(badge = badge, onColor = onColor) })
    }
}

/** Où en est le téléchargement de la vidéo que la rangée a lancé ELLE-MÊME (#14652). */
private enum class VideoAutoDownload { IDLE, RUNNING, DONE }

/**
 * La rangée d'une vidéo que la politique laisse descendre seule (#14652) la met dans le cache du lecteur dès qu'elle
 * paraît, et le dit par son badge : progression, puis « prêt ». Hors politique, le badge de l'hôte est rendu tel quel.
 */
@Composable
internal fun rememberVideoAutoDownloadBadge(file: BubbleFile, hostBadge: PieceBadge): PieceBadge {
    val starts = bubbleAutoDownloadsVideo(LocalBubbleMediaAutoDownload.current, file, hostBadge)
    val prefetcher = rememberBubbleVideoPrefetcher()
    var progress by remember(file.attachmentId, file.url) { mutableStateOf(VideoAutoDownload.IDLE) }
    val url = file.url
    if (starts && url != null) {
        LaunchedEffect(url) {
            if (progress != VideoAutoDownload.IDLE) return@LaunchedEffect
            progress = VideoAutoDownload.RUNNING
            progress = if (prefetcher.prefetch(url)) VideoAutoDownload.DONE else VideoAutoDownload.IDLE
        }
    }
    if (hostBadge !is PieceBadge.Idle) return hostBadge
    return when (progress) {
        VideoAutoDownload.IDLE -> hostBadge
        VideoAutoDownload.RUNNING -> PieceBadge.Downloading(null)
        VideoAutoDownload.DONE -> PieceBadge.Ready
    }
}

@Composable
private fun badgeStateText(badge: PieceBadge): String? = when (badge) {
    is PieceBadge.Downloading -> badge.percent?.let { stringResource(R.string.bubble_file_downloading, it) }
        ?: stringResource(R.string.bubble_file_downloading_unknown)
    PieceBadge.Ready -> stringResource(R.string.bubble_file_ready)
    PieceBadge.Failed -> stringResource(R.string.bubble_file_download_failed)
    else -> null
}

/** Le badge à droite de la rangée : il apparaît, change d'état et disparaît en fondu ressort (iOS `.scale(0.8) + .opacity`). */
@Composable
private fun FileBadgeView(badge: PieceBadge, onColor: Color) {
    val kind = when (badge) {
        is PieceBadge.Idle -> 1
        is PieceBadge.Downloading -> 2
        PieceBadge.Ready -> 3
        PieceBadge.Failed -> 4
        else -> 0
    }
    AnimatedContent(
        targetState = kind,
        transitionSpec = {
            (fadeIn(tween(150)) + scaleIn(MeeshyMotion.springFast(), initialScale = 0.8f)) togetherWith
                (fadeOut(tween(150)) + scaleOut(targetScale = 0.8f))
        },
        label = "file-badge",
        modifier = Modifier.clearAndSetSemantics {},
    ) { shown ->
        when (shown) {
            1 -> BadgeDisc(onColor) {
                Icon(MeeshyIcons.ArrowDown, null, tint = onColor, modifier = Modifier.size(16.dp))
            }
            2 -> DownloadProgressRing((badge as? PieceBadge.Downloading)?.percent, onColor)
            3 -> BadgeDisc(onColor) {
                Icon(MeeshyIcons.Check, null, tint = onColor, modifier = Modifier.size(16.dp))
            }
            4 -> BadgeDisc(onColor) {
                Icon(MeeshyIcons.Refresh, null, tint = MeeshyTheme.tokens.error, modifier = Modifier.size(16.dp))
            }
            else -> Spacer(Modifier.size(0.dp))
        }
    }
}

@Composable
private fun BadgeDisc(onColor: Color, content: @Composable () -> Unit) {
    Box(
        modifier = Modifier.size(28.dp).clip(CircleShape).background(onColor.copy(alpha = 0.15f)),
        contentAlignment = Alignment.Center,
    ) { content() }
}

/** L'anneau de progression : l'arc glisse vers chaque nouvelle valeur au lieu de sauter ; indéterminé tant que la taille est inconnue. */
@Composable
private fun DownloadProgressRing(percent: Int?, onColor: Color) {
    Box(modifier = Modifier.size(28.dp), contentAlignment = Alignment.Center) {
        if (percent == null) {
            CircularProgressIndicator(modifier = Modifier.size(24.dp), strokeWidth = 2.dp, color = onColor)
        } else {
            val animated by animateFloatAsState(percent / 100f, tween(200, easing = LinearEasing), label = "file-progress")
            CircularProgressIndicator(
                progress = { animated },
                modifier = Modifier.size(24.dp),
                strokeWidth = 2.dp,
                color = onColor,
                trackColor = onColor.copy(alpha = 0.2f),
            )
            Icon(MeeshyIcons.Close, null, tint = onColor, modifier = Modifier.size(10.dp))
        }
    }
}

/**
 * **Une pièce chiffrée de bout en bout** (#13493, miroir de la mention scellée du fil) : un cadenas et « Pièce chiffrée »,
 * sans nom de fichier, sans taille ni adresse, et aucun appui — l'Android natif ne déchiffre pas encore, donc rien ne
 * s'ouvre ni ne se télécharge. Dite à TalkBack comme telle.
 */
@Composable
internal fun BubbleSealedPieceRow(onColor: Color, modifier: Modifier = Modifier) {
    val spoken = stringResource(R.string.bubble_piece_sealed_a11y)
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(MeeshyRadius.sm))
            .background(onColor.copy(alpha = 0.1f))
            .semantics(mergeDescendants = true) { contentDescription = spoken }
            .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        Icon(MeeshyIcons.LockFilled, null, tint = onColor.copy(alpha = 0.8f), modifier = Modifier.size(16.dp))
        Text(
            text = stringResource(R.string.bubble_piece_sealed),
            style = MaterialTheme.typography.bodySmall,
            fontStyle = FontStyle.Italic,
            color = onColor.copy(alpha = 0.8f),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

/**
 * Une carte de visite du fil (miroir de `ContactCardView`, iOS) : l'initiale du contact, son nom (le fichier sans
 * extension ni préfixe temporaire) et « Contact partagé » ; un appui ouvre sa fiche.
 */
@Composable
private fun BubbleContactCardRow(file: BubbleFile, onColor: Color, onClick: (() -> Unit)?, transfers: BubbleFileTransfers, modifier: Modifier) {
    val name = remember(file.name) { file.name?.let(ContactCardFile::displayName).orEmpty() }
    val shared = stringResource(R.string.bubble_contact_card_shared)
    val account = rememberMeeshyAccount(file, isDownloaded = file.attachmentId in transfers.readyAttachmentIds)
    val card = stringResource(R.string.a11y_message_contact_card, name.ifBlank { shared })
    val spoken = meeshyAccountSpoken(account)?.let { "$card, $it" } ?: card
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(MeeshyRadius.md))
            .background(onColor.copy(alpha = 0.1f))
            .let { base ->
                if (onClick == null) base.semantics(mergeDescendants = true) { contentDescription = spoken }
                else base.clickable(role = Role.Button, onClick = onClick).semantics(mergeDescendants = true) { contentDescription = spoken }
            }
            .padding(MeeshySpacing.sm)
            .animateContentSize(MeeshyMotion.springDefault()),
    ) {
        Row(
            modifier = Modifier.heightIn(min = 44.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        ) {
            MeeshyAvatar(name = name.ifBlank { shared }, size = 40.dp)
            Column {
                if (name.isNotBlank()) {
                    Text(name, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, color = onColor, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                Text(shared, style = MaterialTheme.typography.labelSmall, color = onColor.copy(alpha = 0.7f), maxLines = 1)
            }
        }
        BubbleMeeshyAccountRow(account, onColor)
    }
}

@Composable
@ReadOnlyComposable
internal fun formatFileSize(bytes: Int): String = when {
    bytes >= 1_048_576 ->
        stringResource(R.string.bubble_file_size_mb, "%.1f".format(bytes / 1_048_576f))
    bytes >= 1_024 ->
        stringResource(R.string.bubble_file_size_kb, "%.0f".format(bytes / 1_024f))
    else -> stringResource(R.string.bubble_file_size_bytes, bytes.toString())
}
