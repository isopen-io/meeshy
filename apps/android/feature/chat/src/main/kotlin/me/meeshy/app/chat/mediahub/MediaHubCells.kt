package me.meeshy.app.chat.mediahub

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.mediahub.ConversationMediaKind
import me.meeshy.sdk.model.mediahub.MediaHubItem
import me.meeshy.sdk.model.mediahub.MediaHubPayload
import me.meeshy.ui.component.MeeshySkeletonBox
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** L'icône d'un genre — celle de son segment et de son état vide. */
internal fun ConversationMediaKind.icon(): ImageVector = when (this) {
    ConversationMediaKind.VISUAL -> MeeshyIcons.PhotoLibrary
    ConversationMediaKind.AUDIO -> MeeshyIcons.Waveform
    ConversationMediaKind.DOCUMENT -> MeeshyIcons.Document
    ConversationMediaKind.LINK -> MeeshyIcons.Link
    ConversationMediaKind.CONTACT -> MeeshyIcons.Person
    ConversationMediaKind.CONVERSATION -> MeeshyIcons.Forum
    ConversationMediaKind.LOCATION -> MeeshyIcons.Location
}

@Composable
internal fun ConversationMediaKind.label(): String = stringResource(
    when (this) {
        ConversationMediaKind.VISUAL -> R.string.media_hub_kind_visual
        ConversationMediaKind.AUDIO -> R.string.media_hub_kind_audio
        ConversationMediaKind.DOCUMENT -> R.string.media_hub_kind_document
        ConversationMediaKind.LINK -> R.string.media_hub_kind_link
        ConversationMediaKind.CONTACT -> R.string.media_hub_kind_contact
        ConversationMediaKind.CONVERSATION -> R.string.media_hub_kind_conversation
        ConversationMediaKind.LOCATION -> R.string.media_hub_kind_location
    },
)

/** Une vignette carrée de la grille : appui = léger rebond (ressort), plus petite variante suffisante. */
@Composable
internal fun MediaHubVisualTile(item: MediaHubItem, description: String, accent: Color, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val attachment = item.attachment ?: return
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val scale by animateFloatAsState(if (pressed) 0.94f else 1f, spring(dampingRatio = 0.6f, stiffness = 500f), label = "tile-press")
    val widthPx = with(LocalDensity.current) { 140.dp.roundToPx() }
    val url = remember(attachment.id) { attachment.tileUrl(widthPx) }
    Box(
        modifier = modifier
            .aspectRatio(1f)
            .scale(scale)
            .background(MeeshyTheme.tokens.backgroundTertiary)
            .clickable(interactionSource = source, indication = null, role = Role.Button, onClick = onClick)
            .semantics { contentDescription = description },
        contentAlignment = Alignment.Center,
    ) {
        when {
            attachment.isEncrypted -> Icon(MeeshyIcons.Lock, stringResource(R.string.media_hub_encrypted_tile), tint = accent, modifier = Modifier.size(28.dp))
            url != null -> AsyncImage(model = url, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
            else -> Icon(MeeshyIcons.Movie, null, tint = accent, modifier = Modifier.size(28.dp))
        }
        if (attachment.isVideo && !attachment.isEncrypted) {
            Icon(MeeshyIcons.PlayCircleFilled, null, tint = Color.White, modifier = Modifier.size(30.dp).align(Alignment.Center))
        }
    }
}

/** Une rangée (audio, document, contact, lien, conversation, lieu) : icône de genre, titre, ligne « expéditeur · date ». */
@Composable
internal fun MediaHubRow(
    item: MediaHubItem,
    meta: String,
    accent: Color,
    onOpen: () -> Unit,
    onGoToMessage: (() -> Unit)?,
) {
    val (title, subtitle) = when (val payload = item.payload) {
        is MediaHubPayload.Attachment -> payload.attachment.name.ifBlank { item.kind.label() } to meta
        is MediaHubPayload.Link -> payload.host to payload.url
        is MediaHubPayload.Place -> (payload.name ?: stringResource(R.string.media_hub_place_fallback)) to meta
    }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(MeeshyRadius.md))
            .clickable(role = Role.Button, onClick = onOpen)
            .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xsPlus)
            .heightIn(min = 48.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier.size(44.dp).clip(RoundedCornerShape(MeeshyRadius.smPlus)).background(accent.copy(alpha = 0.14f)),
            contentAlignment = Alignment.Center,
        ) { Icon(item.kind.icon(), null, tint = accent, modifier = Modifier.size(22.dp)) }
        Spacer(Modifier.width(MeeshySpacing.md))
        Column(Modifier.weight(1f)) {
            Text(title, color = MeeshyTheme.tokens.textPrimary, fontSize = MeeshyFontSize.body, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(subtitle, color = MeeshyTheme.tokens.textSecondary, fontSize = MeeshyFontSize.footnote, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (item.payload !is MediaHubPayload.Attachment && item.payload !is MediaHubPayload.Place) {
                Text(meta, color = MeeshyTheme.tokens.textSecondary, fontSize = MeeshyFontSize.caption, maxLines = 1)
            }
        }
        if (onGoToMessage != null) {
            val goTo = stringResource(R.string.media_hub_go_to_message)
            Box(
                modifier = Modifier.size(48.dp).clickable(role = Role.Button, onClick = onGoToMessage).semantics { contentDescription = goTo },
                contentAlignment = Alignment.Center,
            ) { Icon(MeeshyIcons.Reply, null, tint = accent, modifier = Modifier.size(18.dp)) }
        }
    }
}

/** L'état d'un segment vide : icône, message, et « Réessayer » quand l'échec peut se rejouer. */
@Composable
internal fun MediaHubStateView(icon: ImageVector, message: String, accent: Color, actionLabel: String? = null, onAction: (() -> Unit)? = null) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.xxl, vertical = MeeshySpacing.xxxl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        Icon(icon, null, tint = accent, modifier = Modifier.size(36.dp))
        Text(message, color = MeeshyTheme.tokens.textSecondary, fontSize = MeeshyFontSize.subhead, textAlign = TextAlign.Center)
        if (actionLabel != null && onAction != null) {
            OutlinedButton(onClick = onAction, border = BorderStroke(1.dp, accent)) { Text(actionLabel, color = accent) }
        }
    }
}

/** Le squelette du premier chargement — jamais de spinner : la forme de ce qui vient (grille ou rangées). */
@Composable
internal fun MediaHubRowSkeleton() {
    Row(Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xsPlus), verticalAlignment = Alignment.CenterVertically) {
        MeeshySkeletonBox(Modifier.size(44.dp))
        Spacer(Modifier.width(MeeshySpacing.md))
        Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
            MeeshySkeletonBox(Modifier.fillMaxWidth(0.6f).size(width = 180.dp, height = 14.dp))
            MeeshySkeletonBox(Modifier.size(width = 110.dp, height = 10.dp))
        }
    }
}

@Composable
internal fun MediaHubTileSkeleton(modifier: Modifier = Modifier) {
    MeeshySkeletonBox(modifier.aspectRatio(1f), shape = RoundedCornerShape(0.dp))
}

internal fun Modifier.hubA11yHidden(): Modifier = clearAndSetSemantics { }
