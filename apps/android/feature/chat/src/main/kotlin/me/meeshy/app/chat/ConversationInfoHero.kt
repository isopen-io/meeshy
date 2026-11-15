package me.meeshy.app.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.ShareLinkDateFormat
import me.meeshy.sdk.model.conversationinfo.ConversationInfoHero
import me.meeshy.sdk.model.conversationinfo.ConversationTypeKind
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

private val BANNER_HEIGHT = 140.dp

internal fun ConversationTypeKind.labelRes(): Int = when (this) {
    ConversationTypeKind.DIRECT -> R.string.conversation_type_direct
    ConversationTypeKind.GROUP -> R.string.conversation_type_group
    ConversationTypeKind.PUBLIC -> R.string.conversation_type_public
    ConversationTypeKind.GLOBAL -> R.string.conversation_type_global
    ConversationTypeKind.COMMUNITY -> R.string.conversation_type_community
    ConversationTypeKind.CHANNEL -> R.string.conversation_type_channel
    ConversationTypeKind.BROADCAST -> R.string.conversation_type_broadcast
    ConversationTypeKind.BOT -> R.string.conversation_type_bot
}

internal fun ConversationTypeKind.icon(): ImageVector = when (this) {
    ConversationTypeKind.DIRECT -> MeeshyIcons.PersonFilled
    ConversationTypeKind.GROUP -> MeeshyIcons.GroupsFilled
    ConversationTypeKind.PUBLIC, ConversationTypeKind.GLOBAL, ConversationTypeKind.BROADCAST -> MeeshyIcons.Public
    ConversationTypeKind.COMMUNITY -> MeeshyIcons.Groups
    ConversationTypeKind.CHANNEL -> MeeshyIcons.Campaign
    ConversationTypeKind.BOT -> MeeshyIcons.Memory
}

/** La bannière des fils qui en ont une (iOS `heroBannerImage`) : l'image, sinon le dégradé de l'accent. Décorative. */
@Composable
internal fun ConversationInfoBanner(bannerUrl: String?, accentColor: Color, modifier: Modifier = Modifier) {
    val shape = RoundedCornerShape(MeeshyRadius.xl)
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(BANNER_HEIGHT)
            .clip(shape)
            .background(Brush.linearGradient(listOf(accentColor.copy(alpha = 0.4f), accentColor.copy(alpha = 0.1f), accentColor.copy(alpha = 0.2f))))
            .clearAndSetSemantics { },
    ) {
        if (bannerUrl != null) {
            AsyncImage(model = bannerUrl, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.matchParentSize())
        }
    }
}

/** Genre et effectif, indicateur muet, date de création (iOS `conversationInfoRow` + `muteIndicator` + « Créé le »). */
@Composable
internal fun ConversationInfoHeroDetails(hero: ConversationInfoHero, accentColor: Color) {
    val tokens = MeeshyTheme.tokens
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus)) {
            Icon(hero.kind.icon(), contentDescription = null, tint = accentColor, modifier = Modifier.size(14.dp))
            Text(stringResource(hero.kind.labelRes()), fontSize = MeeshyFontSize.small, color = tokens.textSecondary)
            hero.memberCountLabel?.let { count ->
                Text("·", fontSize = MeeshyFontSize.small, color = tokens.textMuted)
                Icon(MeeshyIcons.Groups, contentDescription = null, tint = tokens.textMuted, modifier = Modifier.size(14.dp))
                Text(count, fontSize = MeeshyFontSize.small, color = tokens.textSecondary)
            }
        }
        if (hero.muted) {
            Row(
                modifier = Modifier
                    .clip(CircleShape)
                    .background(tokens.textMuted.copy(alpha = 0.12f))
                    .padding(horizontal = MeeshySpacing.smPlus, vertical = MeeshySpacing.xs),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
            ) {
                Icon(MeeshyIcons.BellOff, contentDescription = null, tint = tokens.textMuted, modifier = Modifier.size(12.dp))
                Text(stringResource(R.string.conversation_info_muted), fontSize = MeeshyFontSize.footnote, color = tokens.textMuted)
            }
        }
        hero.createdAtEpochMillis?.let { millis ->
            Text(
                text = stringResource(R.string.conversation_info_created_on, ShareLinkDateFormat.day(millis)),
                fontSize = MeeshyFontSize.footnote,
                color = tokens.textMuted,
            )
        }
    }
}
