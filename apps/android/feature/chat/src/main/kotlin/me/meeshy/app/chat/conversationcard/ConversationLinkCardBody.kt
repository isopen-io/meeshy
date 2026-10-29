package me.meeshy.app.chat.conversationcard

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import java.util.Locale
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.conversationcard.ConversationCard
import me.meeshy.sdk.model.conversationcard.ConversationCardInviter
import me.meeshy.sdk.model.conversationcard.ConversationCardKind
import me.meeshy.sdk.model.conversationcard.ConversationCardStats
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

private val BannerHeight = 76.dp
private val AvatarSide = 52.dp
private const val MaxLanguagePills = 3

/**
 * Le contenu de la carte, sans ses boutons (iOS `ConversationLinkCardBody`) : la CITATION de
 * l'invitation (lien de partage) puis la carte du groupe — bannière, avatar en chevauchement, titre,
 * description courte, statistiques. TalkBack la lit d'un seul tenant.
 */
@Composable
internal fun ConversationLinkCardBody(card: ConversationCard, accent: Color) {
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        if (card.kind == ConversationCardKind.SHARE_LINK) {
            card.inviter?.let { ConversationInviteQuote(it, card.inviteMessage, accent) }
        }
        GroupCard(card, accent)
    }
}

@Composable
private fun GroupCard(card: ConversationCard, accent: Color) {
    val tokens = MeeshyTheme.tokens
    val title = card.title.trim().ifEmpty { stringResource(R.string.conversation_card_private_title) }
    val description = card.description?.trim()?.takeIf { it.isNotEmpty() }
    val spoken = groupCardSpokenText(card, title, description)
    val gradient = Brush.linearGradient(listOf(accent, accent.copy(alpha = 0.7f)))
    Column(
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(MeeshyRadius.smPlus))
            .background(tokens.backgroundSecondary)
            .alpha(if (card.isLinkExpired) 0.6f else 1f)
            .padding(bottom = MeeshySpacing.sm)
            .clearAndSetSemantics { contentDescription = spoken },
    ) {
        Box(Modifier.fillMaxWidth().height(BannerHeight + AvatarSide / 2)) {
            Box(Modifier.fillMaxWidth().height(BannerHeight).background(gradient)) {
                card.bannerUrl?.let { url ->
                    AsyncImage(model = url, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
                }
            }
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .padding(start = MeeshySpacing.sm)
                    .size(AvatarSide)
                    .clip(RoundedCornerShape(MeeshyRadius.md))
                    .background(gradient)
                    .border(BorderStroke(3.dp, tokens.backgroundPrimary), RoundedCornerShape(MeeshyRadius.md)),
            ) {
                Text(initials(title), color = MeeshyPalette.White, fontSize = MeeshyFontSize.subtitle, fontWeight = FontWeight.Black)
                card.avatarUrl?.let { url ->
                    AsyncImage(model = url, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
                }
            }
        }
        Column(
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
            modifier = Modifier.padding(horizontal = MeeshySpacing.sm),
        ) {
            Text(
                title,
                color = tokens.textPrimary,
                fontSize = MeeshyFontSize.body,
                fontWeight = FontWeight.ExtraBold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            description?.let {
                Text(it, color = tokens.textSecondary, fontSize = MeeshyFontSize.subhead, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
            if (!card.isLinkExpired) StatsRow(card.stats, accent)
        }
    }
}

@Composable
private fun groupCardSpokenText(card: ConversationCard, title: String, description: String?): String {
    val parts = buildList {
        add(stringResource(R.string.conversation_card_a11y_label, title))
        description?.let(::add)
        if (card.isLinkExpired) {
            add(stringResource(R.string.conversation_card_expired))
        } else {
            add(stringResource(R.string.conversation_card_a11y_members, card.stats.memberCount))
            card.stats.messageCount?.let { add(stringResource(R.string.conversation_card_a11y_messages, it)) }
            if (card.stats.languages.isNotEmpty()) {
                val names = card.stats.languages.joinToString(", ") { code ->
                    Locale.forLanguageTag(code).getDisplayLanguage(Locale.getDefault()).ifEmpty { code.uppercase() }
                }
                add(stringResource(R.string.conversation_card_a11y_languages, names))
            }
        }
    }
    return parts.joinToString(". ")
}

private fun initials(title: String): String =
    title.split(Regex("\\s+")).filter { it.isNotEmpty() }.take(2).joinToString("") { it.first().uppercase() }

@Composable
private fun StatsRow(stats: ConversationCardStats, accent: Color) {
    val tokens = MeeshyTheme.tokens
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        Metric(MeeshyIcons.GroupFilled, stats.memberCount)
        stats.messageCount?.let { Metric(MeeshyIcons.ForumFilled, it) }
        stats.languages.take(MaxLanguagePills).forEach { code ->
            Text(
                code.uppercase(),
                color = accent,
                fontSize = MeeshyFontSize.footnote,
                fontWeight = FontWeight.Bold,
                modifier = Modifier
                    .clip(RoundedCornerShape(50))
                    .background(accent.copy(alpha = 0.14f))
                    .padding(horizontal = MeeshySpacing.xs, vertical = 2.dp),
            )
        }
        if (stats.languages.size > MaxLanguagePills) {
            Text("+${stats.languages.size - MaxLanguagePills}", color = tokens.textSecondary, fontSize = MeeshyFontSize.footnote, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun Metric(icon: ImageVector, value: Int) {
    val ink = MeeshyTheme.tokens.textSecondary
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(2.dp)) {
        Icon(icon, contentDescription = null, tint = ink, modifier = Modifier.size(12.dp))
        Text(compact(value), color = ink, fontSize = MeeshyFontSize.small, fontWeight = FontWeight.SemiBold)
    }
}

private fun compact(value: Int): String = when {
    value >= 1_000_000 -> String.format(Locale.getDefault(), "%.1fM", value / 1_000_000.0)
    value >= 10_000 -> "${value / 1_000}k"
    value >= 1_000 -> String.format(Locale.getDefault(), "%.1fk", value / 1_000.0)
    else -> value.toString()
}

/** Qui invite, puis son message en citation — même barre d'accent que la réponse citée d'une bulle. */
@Composable
private fun ConversationInviteQuote(inviter: ConversationCardInviter, message: String?, accent: Color) {
    val tokens = MeeshyTheme.tokens
    val invites = stringResource(R.string.conversation_card_invites_you)
    val text = message?.trim()?.takeIf { it.isNotEmpty() }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .semantics(mergeDescendants = true) {}
            .drawBehind { drawRoundRect(accent, size = Size(3.dp.toPx(), size.height), cornerRadius = CornerRadius(2.dp.toPx())) }
            .padding(start = 3.dp + MeeshySpacing.sm),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs), modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
                MeeshyAvatar(name = inviter.displayName, size = 28.dp, containerColor = accent, imageUrl = inviter.avatarUrl)
                Column {
                    Text(inviter.displayName, color = accent, fontSize = MeeshyFontSize.subhead, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(invites, color = tokens.textSecondary, fontSize = MeeshyFontSize.small)
                }
            }
            text?.let {
                Text(
                    "“$it”",
                    color = tokens.textPrimary,
                    fontSize = MeeshyFontSize.body,
                    fontWeight = FontWeight.Medium,
                    fontStyle = FontStyle.Italic,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(MeeshyRadius.smPlus))
                        .background(accent.copy(alpha = 0.08f))
                        .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xs),
                )
            }
        }
    }
}

/** Un bouton de la carte : 48 dp de cible, le libellé TalkBack dit la phrase entière (« Rejoindre en anonyme »). */
@Composable
internal fun CardButton(
    title: String,
    spoken: String,
    icon: ImageVector,
    tint: Color,
    filled: Boolean,
    enabled: Boolean,
    busy: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    val ink = if (filled) MeeshyPalette.White else tint
    val shape = RoundedCornerShape(MeeshyRadius.smPlus)
    val inProgress = stringResource(R.string.conversation_card_in_progress)
    val surface = if (filled) {
        Modifier.background(Brush.horizontalGradient(listOf(tint, tint.copy(alpha = 0.85f))), shape)
    } else {
        Modifier.border(BorderStroke(1.5.dp, tint.copy(alpha = 0.6f)), shape)
    }
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs, Alignment.CenterHorizontally),
        modifier = modifier
            .heightIn(min = 48.dp)
            .clip(shape)
            .then(surface)
            .alpha(if (enabled || busy) 1f else 0.5f)
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
            .clearAndSetSemantics {
                contentDescription = if (busy) inProgress else spoken
                role = Role.Button
            }
            .padding(horizontal = MeeshySpacing.sm),
    ) {
        if (busy) {
            CircularProgressIndicator(color = ink, strokeWidth = 2.dp, modifier = Modifier.size(16.dp))
        } else {
            Icon(icon, contentDescription = null, tint = ink, modifier = Modifier.size(16.dp))
        }
        Text(title, color = ink, fontSize = MeeshyFontSize.subhead, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}
