package me.meeshy.app.onboarding.illustrations

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.feature.auth.R
import me.meeshy.sdk.model.avatar.AvatarContext
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.meeshyText

internal const val ONBOARDING_FRIENDS_TAG = "onboarding.illustration.friends"

/** La bande : jusqu'à trois avatars qui se chevauchent et la prime d'amitié (iOS `OnboardingFriendsIllustration`). */
@Composable
internal fun OnboardingFriendsIllustration(
    names: List<String>,
    rewardPoints: Int,
    modifier: Modifier = Modifier,
) {
    val isDark = MeeshyTheme.isDark
    val rim = if (isDark) MeeshyPalette.Indigo950 else MeeshyPalette.White
    Box(
        modifier = modifier.fillMaxWidth().height(110.dp).testTag(ONBOARDING_FRIENDS_TAG),
        contentAlignment = Alignment.Center,
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy((-18).dp), verticalAlignment = Alignment.CenterVertically) {
            names.take(3).forEach { name ->
                MeeshyAvatar(
                    name = name,
                    context = AvatarContext.ConversationList,
                    modifier = Modifier.border(3.dp, rim, CircleShape),
                )
            }
        }
        Text(
            text = stringResource(R.string.onboarding_friends_badge, rewardPoints),
            color = MeeshyPalette.White,
            maxLines = 1,
            style = meeshyText(MeeshyFontSize.subhead, FontWeight.ExtraBold, rounded = true),
            modifier = Modifier
                .wrapContentSize(unbounded = true)
                .offset(x = 64.dp, y = (-40).dp)
                .clip(CircleShape)
                .background(MeeshyPalette.Success)
                .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.xsPlus),
        )
    }
}
