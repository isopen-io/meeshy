package me.meeshy.app.auth

import androidx.activity.compose.BackHandler
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.res.stringResource
import me.meeshy.feature.auth.R
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette

/**
 * **« Meeshy est réservé aux 13 ans et plus »** (iOS `AgeGateView`, #9929) : l'écran plein, sans autre sortie que
 * « J'ai compris », qui ferme aussi la session encore ouverte. Il ne se contourne pas : le geste Retour est absorbé.
 */
@Composable
fun AgeRefusalScreen(onAcknowledge: () -> Unit, modifier: Modifier = Modifier) {
    BackHandler {}
    RefusalPage(
        icon = MeeshyIcons.Hand,
        title = stringResource(R.string.onboarding_age_refused_title),
        message = stringResource(R.string.ageGate_body),
        action = stringResource(R.string.onboarding_age_refused_signOut),
        onAction = onAcknowledge,
        modifier = modifier,
        iconBrush = Brush.linearGradient(MeeshyPalette.BrandGradient),
    )
}
