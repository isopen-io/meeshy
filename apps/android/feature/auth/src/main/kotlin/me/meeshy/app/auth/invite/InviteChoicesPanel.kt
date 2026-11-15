package me.meeshy.app.auth.invite

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.InviteChoiceCaption
import me.meeshy.sdk.model.InviteChoiceNotice
import me.meeshy.sdk.model.InviteChoicesPanelState
import me.meeshy.sdk.model.InviteLandingChoice
import me.meeshy.ui.haptics.MeeshyHaptics
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.formColumnWidth

/**
 * Le panneau de choix ancré en bas : l'action principale en dégradé indigo vers violet (56 dp, les
 * initiales du compte pour « Rejoindre avec mon compte »), les autres en contour (48 dp), les légendes
 * et l'avis « compte requis » ou « lien fermé ». Il ne décide rien : tout vient de [InviteChoicesPanelState].
 * Haptique moyen pour le principal, léger pour les secondaires. Miroir de `InviteChoicesPanel` (iOS).
 */
@Composable
internal fun InviteChoicesPanel(
    state: InviteChoicesPanelState,
    isDark: Boolean,
    onChoice: (InviteLandingChoice) -> Unit,
    modifier: Modifier = Modifier,
) {
    val haptics = rememberMeeshyHaptics()
    val hairline = InviteInk.hairline(isDark)
    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(if (isDark) MeeshyPalette.Indigo950.copy(alpha = 0.94f) else Color.White.copy(alpha = 0.94f))
            .drawBehind { drawLine(hairline, androidx.compose.ui.geometry.Offset.Zero, androidx.compose.ui.geometry.Offset(size.width, 0f), 1.dp.toPx()) }
            .formColumnWidth()
            .padding(horizontal = MeeshySpacing.lg)
            .padding(top = MeeshySpacing.lg, bottom = MeeshySpacing.md),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus),
    ) {
        state.notice?.let { Notice(it, isDark) }
        state.primary?.let { primary ->
            PrimaryButton(state, primary, isDark) { haptics.medium(); onChoice(primary) }
            state.captionAfterPrimary?.let { Caption(it, isDark) }
            SecondaryButtons(state, isDark, haptics, onChoice)
            state.captionAfterSecondary?.let { Caption(it, isDark) }
        }
    }
}

@Composable
private fun SecondaryButtons(state: InviteChoicesPanelState, isDark: Boolean, haptics: MeeshyHaptics, onChoice: (InviteLandingChoice) -> Unit) {
    if (state.secondary.size == 2) {
        Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus)) {
            state.secondary.forEach { choice ->
                SecondaryButton(state, choice, isDark, Modifier.weight(1f)) { haptics.light(); onChoice(choice) }
            }
        }
    } else {
        state.secondary.forEach { choice ->
            SecondaryButton(state, choice, isDark, Modifier.fillMaxWidth()) { haptics.light(); onChoice(choice) }
        }
    }
}

@Composable
private fun PrimaryButton(state: InviteChoicesPanelState, choice: InviteLandingChoice, isDark: Boolean, onClick: () -> Unit) {
    val shape = RoundedCornerShape(MeeshyRadius.lgPlus)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 56.dp)
            .clip(shape)
            .background(Brush.linearGradient(listOf(MeeshyPalette.Indigo500, MeeshyPalette.Purple600)))
            .clickable(role = Role.Button, onClick = onClick)
            .padding(horizontal = MeeshySpacing.lg),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (state.showsAccountFace) state.accountFace?.let { face ->
            Box(
                modifier = Modifier.size(32.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.22f)).border(1.5.dp, Color.White, CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Text(face.initials, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.ExtraBold, color = Color.White)
            }
        }
        Text(
            text = stringResource(InviteLandingCopy.choice(choice, state.isSignedIn, state.resumesGuestSession)),
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.ExtraBold,
            color = Color.White,
            textAlign = TextAlign.Center,
            maxLines = 2,
        )
    }
}

@Composable
private fun SecondaryButton(state: InviteChoicesPanelState, choice: InviteLandingChoice, isDark: Boolean, modifier: Modifier, onClick: () -> Unit) {
    val shape = RoundedCornerShape(MeeshyRadius.lg)
    Box(
        modifier = modifier
            .heightIn(min = 48.dp)
            .clip(shape)
            .background(if (isDark) Color.Transparent else Color.White)
            .border(1.5.dp, if (isDark) MeeshyPalette.Indigo700 else MeeshyPalette.Indigo200, shape)
            .clickable(role = Role.Button, onClick = onClick)
            .padding(horizontal = MeeshySpacing.sm),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = stringResource(InviteLandingCopy.choice(choice, state.isSignedIn, state.resumesGuestSession)),
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Bold,
            color = if (isDark) MeeshyPalette.Indigo100 else MeeshyPalette.Indigo900,
            textAlign = TextAlign.Center,
            maxLines = 2,
        )
    }
}

@Composable
private fun Caption(caption: InviteChoiceCaption, isDark: Boolean) {
    Text(
        text = stringResource(InviteLandingCopy.caption(caption)),
        modifier = Modifier.fillMaxWidth(),
        style = MaterialTheme.typography.labelMedium,
        color = if (isDark) MeeshyPalette.Indigo200 else MeeshyPalette.Neutral500,
        textAlign = TextAlign.Center,
    )
}

@Composable
private fun Notice(notice: InviteChoiceNotice, isDark: Boolean) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(InviteInk.well(isDark), RoundedCornerShape(MeeshyRadius.md))
            .padding(MeeshySpacing.md)
            .semantics(mergeDescendants = true) {},
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(MeeshyIcons.InfoFilled, contentDescription = null, tint = InviteInk.accent(isDark), modifier = Modifier.size(20.dp))
        Text(
            text = stringResource(InviteLandingCopy.notice(notice)),
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.Medium,
            color = if (isDark) MeeshyPalette.Indigo100 else MeeshyPalette.Indigo900,
        )
    }
}
