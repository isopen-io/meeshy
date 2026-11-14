package me.meeshy.app.stories

import me.meeshy.ui.icons.MeeshyIcons
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.time.ZoneId
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.story.StoryNotificationContext
import me.meeshy.sdk.theme.DynamicColorGenerator
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.format.RelativeTimeFormat
import me.meeshy.ui.format.rememberRelativeTimeStrings
import me.meeshy.ui.theme.MeeshyOpacity
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.hexColor
import me.meeshy.ui.theme.readableInk

/**
 * L'écran vide d'une notification dont la story n'est plus lisible (miroir de iOS `StoryExpiredContent`) :
 * acteur, déclencheur (l'emoji d'une réaction, la bulle et l'extrait d'un commentaire), titre et sous-titre,
 * « Créer une story » et le lien retour. Le fond est tiré une fois dans [StoryBackgroundPalette] (par le
 * ViewModel), l'encre en est déduite par luminance.
 */
@Composable
internal fun StoryExpiredContent(
    context: StoryNotificationContext,
    backgroundHex: String,
    nowMillis: Long,
    onCreateStory: () -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val ink = readableInk(backgroundHex)
    Box(modifier.fillMaxSize().background(hexColor(backgroundHex))) {
        Column(
            Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().padding(horizontal = MeeshySpacing.xxxl),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxl),
        ) {
            Spacer(Modifier.weight(1f))
            ActorHeader(context, nowMillis, ink)
            TriggerVisual(context.trigger, ink)
            (context.trigger as? StoryNotificationContext.Trigger.Comment)?.preview?.takeIf { it.isNotEmpty() }?.let { preview ->
                Text(
                    text = "« $preview »",
                    color = ink,
                    style = MaterialTheme.typography.bodyLarge,
                    fontStyle = FontStyle.Italic,
                    textAlign = TextAlign.Center,
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Column(
                Modifier.semantics(mergeDescendants = true) {},
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
            ) {
                Text(
                    stringResource(R.string.story_notification_expired_title),
                    color = ink,
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    textAlign = TextAlign.Center,
                )
            }
            Spacer(Modifier.weight(1f))
            Box(
                Modifier.fillMaxWidth().heightIn(min = 48.dp)
                    .clip(RoundedCornerShape(MeeshyRadius.md))
                    .background(ink)
                    .clickable(role = Role.Button, onClick = onCreateStory)
                    .padding(vertical = MeeshySpacing.mdPlus),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    stringResource(R.string.story_notification_expired_cta_create),
                    color = hexColor(backgroundHex),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                )
            }
            Box(
                Modifier.fillMaxWidth().heightIn(min = 48.dp).clickable(role = Role.Button, onClick = onBack)
                    .padding(bottom = MeeshySpacing.xxl),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    stringResource(R.string.story_notification_expired_back),
                    color = ink.copy(alpha = MeeshyOpacity.intense),
                    style = MaterialTheme.typography.bodyMedium,
                    textDecoration = TextDecoration.Underline,
                )
            }
        }
    }
}

@Composable
private fun ActorHeader(context: StoryNotificationContext, nowMillis: Long, ink: androidx.compose.ui.graphics.Color) {
    val strings = rememberRelativeTimeStrings()
    val locale = LocalConfiguration.current.locales[0]
    val relative = RelativeTimeFormat.short(context.occurredAtMillis, nowMillis, ZoneId.systemDefault(), locale, strings)
    Row(
        Modifier.fillMaxWidth().semantics(mergeDescendants = true) {},
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        MeeshyAvatar(
            name = context.actorDisplayName,
            modifier = Modifier.clearAndSetSemantics {},
            size = 32.dp,
            containerColor = hexColor(DynamicColorGenerator.colorForName(context.actorDisplayName)),
            imageUrl = context.actorAvatar,
        )
        Column(Modifier.weight(1f)) {
            Text(context.actorDisplayName, color = ink, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Text(relative, color = ink.copy(alpha = MeeshyOpacity.intense), style = MaterialTheme.typography.labelMedium)
        }
    }
}

@Composable
private fun TriggerVisual(trigger: StoryNotificationContext.Trigger, ink: androidx.compose.ui.graphics.Color) {
    when (trigger) {
        is StoryNotificationContext.Trigger.Reaction -> Text(
            trigger.emoji,
            fontSize = 64.sp,
            modifier = Modifier.semantics { contentDescription = trigger.emoji },
        )
        is StoryNotificationContext.Trigger.Comment -> Icon(
            MeeshyIcons.ChatBubble,
            contentDescription = null,
            tint = ink.copy(alpha = MeeshyOpacity.intense),
            modifier = Modifier.size(56.dp),
        )
    }
}
