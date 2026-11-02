package me.meeshy.app.chat.mediahub

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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.DialogWindowProvider
import android.view.WindowManager
import me.meeshy.app.chat.ChatAudioPlayer
import me.meeshy.app.chat.LinkPreviewCard
import me.meeshy.feature.chat.R
import me.meeshy.sdk.link.LinkPreviewState
import me.meeshy.sdk.model.mediahub.MediaHubAttachment
import me.meeshy.sdk.model.mediahub.MediaHubItem
import me.meeshy.sdk.model.mediahub.MediaHubPayload
import me.meeshy.sdk.model.mediahub.MediaHubRendering
import me.meeshy.sdk.model.mediahub.MediaHubRowRules
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.bubble.AudioBubble
import me.meeshy.ui.component.bubble.BubbleAudio
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** La pièce du hub telle que le lecteur de vocaux du fil la lit. */
internal fun MediaHubAttachment.toBubbleAudio(): BubbleAudio = BubbleAudio(
    attachmentId = id,
    url = url.takeUnless { isEncrypted },
    durationSeconds = durationMs?.let { it / 1000 },
    sizeBytes = sizeBytes?.toInt(),
)

/**
 * Un vocal ou un son LU DANS LA RANGÉE (iOS `AudioMediaView`) : la même ligne que la bulle du fil, pilotée par
 * LE lecteur du fil — une seule lecture à la fois, la session média et la carte de l'écran verrouillé comprises.
 */
@Composable
internal fun MediaHubAudioBody(attachment: MediaHubAttachment, player: ChatAudioPlayer, modifier: Modifier = Modifier) {
    val audio = remember(attachment) { attachment.toBubbleAudio() }
    AudioBubble(
        audio = audio,
        playback = player.bubbleFor(audio),
        onColor = MeeshyTheme.tokens.textPrimary,
        onClick = if (audio.isPlayable) ({ player.toggle(audio) }) else null,
        modifier = modifier.fillMaxWidth(),
    )
}

/** Une carte de contact (iOS `ContactCardView`) : le nom du fichier, « Contact partagé », un appui ouvre la fiche. */
@Composable
internal fun MediaHubContactBody(attachment: MediaHubAttachment, accent: Color, mayOpen: Boolean, onOpen: () -> Unit) {
    val name = remember(attachment.name) { MediaHubRowRules.contactName(attachment.name).ifBlank { "—" } }
    val shared = stringResource(R.string.contact_card_shared)
    val spoken = stringResource(R.string.contact_card_a11y_label, name)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(MeeshyRadius.md))
            .background(accent.copy(alpha = 0.10f))
            .clickable(role = Role.Button, onClick = onOpen)
            .padding(MeeshySpacing.md)
            .heightIn(min = 48.dp)
            .semantics { contentDescription = spoken },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        MeeshyAvatar(name = name, size = 44.dp, containerColor = accent)
        Column(Modifier.weight(1f)) {
            Text(name, color = MeeshyTheme.tokens.textPrimary, fontSize = MeeshyFontSize.body, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(shared, color = MeeshyTheme.tokens.textSecondary, fontSize = MeeshyFontSize.footnote, maxLines = 1)
        }
        Icon(if (mayOpen) MeeshyIcons.Person else MeeshyIcons.Lock, null, tint = accent, modifier = Modifier.size(20.dp))
    }
}

/** La carte d'une adresse web : celle du fil (`LinkPreviewCard`), ouverte par le chemin des liens du fil. */
@Composable
internal fun MediaHubWebLinkBody(payload: MediaHubPayload.Link, accent: Color, onOpen: (String) -> Unit) {
    LinkPreviewCard(
        state = LinkPreviewState.BareLink(payload.url),
        isOutgoing = false,
        accentColor = accent,
        onOpenUrl = onOpen,
        inBubble = true,
    )
}

/** La carte d'une adresse de conversation Meeshy (iOS `ConversationLinkCard`) : un fond à l'accent, l'adresse, un chevron. */
@Composable
internal fun MediaHubConversationLinkBody(payload: MediaHubPayload.Link, accent: Color, onOpen: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(MeeshyRadius.md))
            .background(accent.copy(alpha = 0.12f))
            .clickable(role = Role.Button, onClick = onOpen)
            .padding(MeeshySpacing.md)
            .heightIn(min = 48.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        Box(
            Modifier.size(44.dp).clip(RoundedCornerShape(MeeshyRadius.smPlus)).background(accent.copy(alpha = 0.18f)),
            contentAlignment = Alignment.Center,
        ) { Icon(MeeshyIcons.Forum, null, tint = accent, modifier = Modifier.size(22.dp)) }
        Column(Modifier.weight(1f)) {
            Text(payload.host, color = MeeshyTheme.tokens.textPrimary, fontSize = MeeshyFontSize.body, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(payload.url, color = MeeshyTheme.tokens.textSecondary, fontSize = MeeshyFontSize.footnote, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Icon(MeeshyIcons.ChevronForward, null, tint = accent, modifier = Modifier.size(18.dp))
    }
}

/** Le pied d'une rangée riche : « expéditeur · date » et « Aller au message ». */
@Composable
internal fun MediaHubRowFooter(meta: String, accent: Color, onGoToMessage: (() -> Unit)?) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(meta, color = MeeshyTheme.tokens.textSecondary, fontSize = MeeshyFontSize.caption, maxLines = 1, modifier = Modifier.weight(1f))
        if (onGoToMessage != null) {
            val goTo = stringResource(R.string.media_hub_go_to_message)
            Box(
                modifier = Modifier.size(48.dp).clickable(role = Role.Button, onClick = onGoToMessage).semantics { contentDescription = goTo },
                contentAlignment = Alignment.Center,
            ) { Icon(MeeshyIcons.Reply, null, tint = accent, modifier = Modifier.size(18.dp)) }
        }
    }
}

/**
 * La couche sécurisée (#9574) : tant que l'écran montre la pièce, la vignette, le nom ou la transcription d'un contenu
 * qui disparaît, la fenêtre du hub est exclue des captures et de l'aperçu des applications récentes. Android ne
 * protège qu'une fenêtre entière, jamais une rangée : un seul porteur protégé suffit à fermer celle du hub.
 */
@Composable
internal fun HubCaptureShield(active: Boolean) {
    val view = LocalView.current
    DisposableEffect(active, view) {
        val window = (view.parent as? DialogWindowProvider)?.window
        if (active) window?.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        onDispose { if (active) window?.clearFlags(WindowManager.LayoutParams.FLAG_SECURE) }
    }
}

/**
 * Une rangée du hub, rendue comme la carte du fil pour le même genre. Le portillon de sortie du porteur ([mayLeave])
 * gouverne ce qui s'emporte : un vocal se joue toujours (il reste dans Meeshy), un fichier ou un contact d'un contenu
 * qui disparaît ne s'ouvre pas hors de Meeshy.
 */
@Composable
internal fun MediaHubRichRow(
    item: MediaHubItem,
    meta: String,
    accent: Color,
    rendering: MediaHubRendering,
    mayLeave: Boolean,
    audioPlayer: ChatAudioPlayer,
    onOpen: () -> Unit,
    onOpenLink: (String) -> Unit,
    onGoToMessage: (() -> Unit)?,
) {
    val payload = item.payload
    when {
        rendering == MediaHubRendering.AUDIO && payload is MediaHubPayload.Attachment ->
            Column(Modifier.padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xs)) {
                MediaHubAudioBody(payload.attachment, audioPlayer)
                MediaHubRowFooter(meta, accent, onGoToMessage)
            }
        rendering == MediaHubRendering.CONTACT_CARD && payload is MediaHubPayload.Attachment ->
            Column(Modifier.padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xs)) {
                MediaHubContactBody(payload.attachment, accent, mayOpen = mayLeave, onOpen = onOpen)
                MediaHubRowFooter(meta, accent, onGoToMessage)
            }
        rendering == MediaHubRendering.WEB_LINK && payload is MediaHubPayload.Link ->
            Column(Modifier.padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xs)) {
                MediaHubWebLinkBody(payload, accent, onOpenLink)
                MediaHubRowFooter(meta, accent, onGoToMessage)
            }
        rendering == MediaHubRendering.CONVERSATION_LINK && payload is MediaHubPayload.Link ->
            Column(Modifier.padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xs)) {
                MediaHubConversationLinkBody(payload, accent, onOpen)
                MediaHubRowFooter(meta, accent, onGoToMessage)
            }
        else -> MediaHubRow(item, meta, accent, onOpen = onOpen, onGoToMessage = onGoToMessage)
    }
}
