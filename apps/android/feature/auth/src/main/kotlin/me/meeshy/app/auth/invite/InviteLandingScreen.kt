package me.meeshy.app.auth.invite

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import me.meeshy.feature.auth.R
import me.meeshy.sdk.model.InviteAccountFace
import me.meeshy.sdk.model.InviteChoicesPanelState
import me.meeshy.sdk.model.InviteLandingChoice
import me.meeshy.sdk.model.InviteLandingState
import me.meeshy.sdk.model.ShareLinkInfo
import me.meeshy.ui.component.MeeshySkeletonBox
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.formColumnWidth

/**
 * La page d'invitation, identique avec ou sans compte : en-tête fixe, contenu défilant (invitant,
 * groupe, faits, droits d'un invité) et panneau de choix ancré en bas. Un building block sans
 * navigation : l'hôte reçoit le choix par [onChoice]. Miroir de `InviteLandingView` (iOS).
 */
@Composable
internal fun InviteLandingPage(
    info: ShareLinkInfo,
    isSignedIn: Boolean,
    onChoice: (InviteLandingChoice) -> Unit,
    onClose: () -> Unit,
    modifier: Modifier = Modifier,
    resumesGuestSession: Boolean = false,
    accountFace: InviteAccountFace? = null,
) {
    val isDark = isSystemInDarkTheme()
    val now = remember(info) { System.currentTimeMillis() }
    val landing = remember(info, now) { InviteLandingState.from(info, now) }
    val panel = remember(info, now, isSignedIn, resumesGuestSession, accountFace) {
        InviteChoicesPanelState.from(info, now, isSignedIn, resumesGuestSession, accountFace)
    }
    InviteLandingFrame(isDark, onClose, modifier, bottom = { InviteChoicesPanel(panel, isDark, onChoice) }) {
        landing.inviter?.let {
            InviteInviterHeader(it, isDark, Modifier.padding(horizontal = MeeshySpacing.xl).padding(top = MeeshySpacing.lg))
        }
        landing.group?.let {
            InviteGroupCard(it, isDark, Modifier.padding(horizontal = MeeshySpacing.lg).padding(top = MeeshySpacing.xl))
        }
        InviteGroupFacts(landing.facts, isDark, Modifier.padding(horizontal = MeeshySpacing.lg).padding(top = MeeshySpacing.lg))
        InviteGuestRightsCard(landing.terms, isDark, Modifier.padding(horizontal = MeeshySpacing.lg).padding(top = MeeshySpacing.smPlus))
    }
}

/** Le squelette de la page tant que le lien se résout (cache froid seulement). */
@Composable
internal fun InviteLandingSkeleton(onClose: () -> Unit, modifier: Modifier = Modifier) {
    val isDark = isSystemInDarkTheme()
    InviteLandingFrame(isDark, onClose, modifier, bottom = {}) {
        Column(Modifier.padding(MeeshySpacing.lg), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg)) {
            Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md), verticalAlignment = Alignment.CenterVertically) {
                MeeshySkeletonBox(Modifier.size(56.dp), CircleShape)
                MeeshySkeletonBox(Modifier.fillMaxWidth().height(28.dp))
            }
            MeeshySkeletonBox(Modifier.fillMaxWidth().height(260.dp), RoundedCornerShape(InviteCardRadius))
            MeeshySkeletonBox(Modifier.fillMaxWidth().height(96.dp), RoundedCornerShape(20.dp))
        }
    }
}

/** L'erreur de résolution, avec « Réessayer ». */
@Composable
internal fun InviteLandingError(onRetry: () -> Unit, onClose: () -> Unit, modifier: Modifier = Modifier) {
    val isDark = isSystemInDarkTheme()
    InviteLandingFrame(isDark, onClose, modifier, bottom = {}) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(MeeshySpacing.xl),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        ) {
            Text(
                text = stringResource(R.string.guest_join_preview_error),
                style = MaterialTheme.typography.titleMedium,
                color = InviteInk.title(isDark),
                textAlign = TextAlign.Center,
            )
            OutlinedButton(onClick = onRetry) { Text(stringResource(R.string.guest_join_retry)) }
        }
    }
}

@Composable
private fun InviteLandingFrame(
    isDark: Boolean,
    onClose: () -> Unit,
    modifier: Modifier,
    bottom: @Composable () -> Unit,
    content: @Composable () -> Unit,
) {
    val gradient = if (isDark) listOf(MeeshyPalette.Indigo950, Color.Black) else listOf(MeeshyPalette.Indigo50, Color.White)
    Scaffold(
        modifier = modifier.fillMaxSize().background(Brush.verticalGradient(gradient)),
        containerColor = Color.Transparent,
        topBar = { InviteLandingHeader(isDark, onClose) },
        bottomBar = bottom,
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .formColumnWidth()
                .padding(bottom = MeeshySpacing.xxl),
        ) { content() }
    }
}

@Composable
private fun InviteLandingHeader(isDark: Boolean, onClose: () -> Unit) {
    val haptics = rememberMeeshyHaptics()
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .background((if (isDark) MeeshyPalette.Indigo950 else MeeshyPalette.Indigo50).copy(alpha = 0.94f))
            .windowInsetsPadding(WindowInsets.statusBars)
            .padding(horizontal = MeeshySpacing.xl)
            .padding(top = MeeshySpacing.md, bottom = MeeshySpacing.xs),
    ) {
        Box(
            modifier = Modifier
                .size(48.dp)
                .align(Alignment.CenterStart)
                .shadow(if (isDark) 0.dp else 4.dp, CircleShape)
                .background(if (isDark) MeeshyPalette.Indigo900.copy(alpha = 0.7f) else Color.White, CircleShape)
                .clip(CircleShape)
                .clickable(role = Role.Button) { haptics.light(); onClose() },
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                MeeshyIcons.Close,
                contentDescription = stringResource(R.string.join_flow_close_accessibility_label),
                tint = if (isDark) MeeshyPalette.Indigo200 else MeeshyPalette.Indigo600,
            )
        }
        Text(
            text = stringResource(R.string.invite_landing_header_title).uppercase(),
            modifier = Modifier.align(Alignment.Center),
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.Bold,
            letterSpacing = scriptSafeSpacing(1f),
            color = if (isDark) MeeshyPalette.Indigo300 else MeeshyPalette.Indigo500,
        )
    }
}
