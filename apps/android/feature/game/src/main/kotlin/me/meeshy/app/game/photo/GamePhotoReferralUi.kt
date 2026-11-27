package me.meeshy.app.game.photo

import android.content.Context
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.android.EntryPointAccessors
import dagger.hilt.components.SingletonComponent
import me.meeshy.feature.game.R
import me.meeshy.sdk.game.ReferralLinkProviding
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing

internal const val PHOTO_LINK_TOGGLE_TAG = "game.photo.link_toggle"

@EntryPoint
@InstallIn(SingletonComponent::class)
internal interface GamePhotoReferralEntryPoint {
    fun referralLinks(): ReferralLinkProviding
}

/** Le lien de parrainage du compte (iOS `ReferralLinkService.shared`) ; `null` hors application Hilt (aperçus, tests). */
@Composable
internal fun rememberReferralLinks(): ReferralLinkProviding? {
    val context = LocalContext.current
    return remember(context) { referralLinksOf(context) }
}

private fun referralLinksOf(context: Context): ReferralLinkProviding? = runCatching {
    EntryPointAccessors.fromApplication(context.applicationContext, GamePhotoReferralEntryPoint::class.java).referralLinks()
}.getOrNull()

/** Les phrases du bandeau et du partage, dans la langue de l'interface (catalogue iOS `game.referral.*`). */
@Composable
internal fun rememberPhotoReferralText(): PhotoReferralText {
    val context = LocalContext.current
    val title = stringResource(R.string.game_referral_title)
    val qrLabel = stringResource(R.string.game_photo_referral_qr_label)
    return remember(context, title, qrLabel) {
        PhotoReferralText(title, qrLabel) { link -> context.getString(R.string.game_referral_share_text, link) }
    }
}

/**
 * « Mon lien d'invitation sur la carte » (iOS `game.photo.link_toggle`, conformité H-2) : le lien se retire d'un geste,
 * et l'utilisateur voit la carte telle qu'elle partira.
 */
@Composable
internal fun PhotoLinkToggle(checked: Boolean, onToggle: (Boolean) -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 44.dp)
            .toggleable(value = checked, role = Role.Switch, onValueChange = onToggle)
            .padding(horizontal = MeeshySpacing.xl)
            .testTag(PHOTO_LINK_TOGGLE_TAG),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        Text(
            stringResource(R.string.game_referral_link_toggle),
            Modifier.weight(1f),
            color = Color.White,
            fontWeight = FontWeight.Medium,
        )
        Switch(
            checked = checked,
            onCheckedChange = null,
            colors = SwitchDefaults.colors(checkedTrackColor = MeeshyPalette.Indigo500),
        )
    }
}
