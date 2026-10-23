package me.meeshy.app.onboarding.illustrations

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MarkEmailUnread
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

internal const val ONBOARDING_ENVELOPE_TAG = "onboarding.illustration.envelope"

/** L'enveloppe de la carte e-mail : fixe, décorative, au dégradé de la marque (iOS `OnboardingEmailIllustration`). */
@Composable
internal fun OnboardingEnvelopeIllustration(modifier: Modifier = Modifier) {
    BrandIcon(
        imageVector = Icons.Filled.MarkEmailUnread,
        size = scaledDp(72.sp, cap = 110.dp),
        modifier = modifier.testTag(ONBOARDING_ENVELOPE_TAG).clearAndSetSemantics {},
    )
}
