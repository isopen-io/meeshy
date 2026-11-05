package me.meeshy.ui.component.bubble

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.sdk.model.JoinNoticePresentation
import me.meeshy.ui.R
import me.meeshy.ui.format.bubbleClockLabel
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * « X a rejoint la conversation » — une NOTICE, pas un message (iOS `BubbleJoinNoticeView`) : capsule
 * CENTRÉE, sans avatar ni côté, l'heure du fil gravée en premier. Le texte vient du catalogue, jamais
 * du `content` stocké (repli français du serveur). Le glyphe de tête et la mention « sans compte »
 * vont ENSEMBLE pour un visiteur de lien public.
 *
 * Un DOUBLE toucher ouvre la fiche de participation (pas un toucher simple : la rangée occupe toute
 * la largeur du fil, et pas l'appui long, qui garde partout les options du message). Le retour
 * haptique moyen confirme la prise ; TalkBack reçoit l'action « Voir la fiche » et son conseil.
 */
@Composable
internal fun JoinNoticeCard(
    join: JoinNoticePresentation,
    createdAtIso: String?,
    onOpenProfile: ((participantId: String) -> Unit)?,
    modifier: Modifier = Modifier,
    onSayHi: (() -> Unit)? = null,
) {
    val muted = MeeshyTheme.tokens.textMuted
    val label = stringResource(R.string.bubble_joinNotice_joined, join.primaryName)
    val noAccount = stringResource(R.string.bubble_joinNotice_noAccount)
    val openLabel = stringResource(R.string.bubble_joinNotice_openProfile)
    val hint = stringResource(R.string.bubble_joinNotice_openProfile_hint_doubleTap)
    val clock = remember(createdAtIso) { bubbleClockLabel(createdAtIso) }
    val haptics = rememberMeeshyHaptics()
    val open = onOpenProfile?.takeIf { join.opensProfile }
    val openAction = open?.let { callback ->
        {
            haptics.medium()
            callback(join.participantId)
        }
    }
    val spoken = buildString {
        append(label)
        if (join.showsNoAccountBadge) append(", ").append(noAccount)
        if (openAction != null) append(". ").append(hint)
    }
    val shape = RoundedCornerShape(if (join.hasDetailRow) 14.dp else MeeshyRadius.pill)
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs),
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs),
    ) {
        if (clock != null) {
            Text(text = clock, fontSize = 9.5.sp, fontWeight = FontWeight.SemiBold, color = muted.copy(alpha = muted.alpha * 0.7f))
        }
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs),
            modifier = Modifier
                .clip(shape)
                .background(MeeshyTheme.tokens.surfaceFill)
                .border(0.5.dp, MeeshyTheme.tokens.hairline, shape)
                .let { base ->
                    if (openAction == null) base
                    else base.pointerInput(openAction) { detectTapGestures(onDoubleTap = { openAction() }) }
                }
                .padding(horizontal = MeeshySpacing.md, vertical = if (join.hasDetailRow) 8.dp else 7.dp)
                .semantics(mergeDescendants = true) {
                    contentDescription = spoken
                    if (openAction != null) {
                        role = Role.Button
                        onClick(label = openLabel) {
                            openAction()
                            true
                        }
                    }
                },
        ) {
            JoinHeadline(join = join, label = label, noAccount = noAccount)
            JoinDetailRow(join = join)
        }
        val greet = onSayHi?.takeIf { join.greetHandle != null }
        if (greet != null) ArrivalGreetingInvite(text = stringResource(R.string.bubble_joinNotice_sayHi), onTap = greet)
    }
}

/**
 * **L'invite « dis-lui salut »** (#16338) : en GRAS, hors de la capsule (son toucher simple ne se confond pas avec le
 * double toucher de la fiche), une cible de 48 dp ; elle écrit les `@mentions` des arrivants dans le composeur.
 */
@Composable
internal fun ArrivalGreetingInvite(text: String, onTap: () -> Unit) {
    val haptics = rememberMeeshyHaptics()
    Text(
        text = text,
        fontSize = 12.5.sp,
        fontWeight = FontWeight.Bold,
        color = MeeshyTheme.tokens.textSecondary,
        textAlign = TextAlign.Center,
        modifier = Modifier
            .heightIn(min = 48.dp)
            .clip(RoundedCornerShape(MeeshyRadius.pill))
            .clickable(role = Role.Button) {
                haptics.light()
                onTap()
            }
            .wrapContentHeight(Alignment.CenterVertically)
            .padding(horizontal = MeeshySpacing.md)
            .testTag(ARRIVAL_GREETING_INVITE_TAG),
    )
}

/** L'invite « dis-lui salut » d'un message d'arrivée, pour les témoins. */
const val ARRIVAL_GREETING_INVITE_TAG: String = "arrival-greeting-invite"

@Composable
private fun JoinHeadline(join: JoinNoticePresentation, label: String, noAccount: String) {
    val muted = MeeshyTheme.tokens.textMuted
    val masked = join.glyph == JoinNoticePresentation.Glyph.Masks
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Icon(
            imageVector = if (masked) MeeshyIcons.Theater else MeeshyIcons.PersonAdd,
            contentDescription = null,
            tint = if (masked) MeeshyPalette.Purple700 else muted,
            modifier = Modifier.size(12.dp),
        )
        Text(
            text = label,
            style = MaterialTheme.typography.bodySmall,
            fontWeight = FontWeight.Medium,
            color = muted,
            textAlign = TextAlign.Center,
            modifier = Modifier.weight(1f, fill = false),
        )
        if (join.showsNoAccountBadge) {
            Text(
                text = noAccount,
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.SemiBold,
                color = MeeshyPalette.Purple700,
                modifier = Modifier
                    .clip(RoundedCornerShape(MeeshyRadius.pill))
                    .background(MeeshyPalette.Purple700.copy(alpha = 0.12f))
                    .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xxs),
            )
        }
    }
}

@Composable
private fun JoinDetailRow(join: JoinNoticePresentation) {
    if (!join.hasDetailRow) return
    val muted = MeeshyTheme.tokens.textMuted
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        join.handle?.let { handle ->
            Text(text = handle, style = MaterialTheme.typography.labelSmall, color = muted)
        }
        join.rules?.let { rules ->
            if (join.handle != null) {
                Text(text = "·", style = MaterialTheme.typography.labelSmall, color = muted.copy(alpha = muted.alpha * 0.6f))
            }
            BubbleJoinRulesStrip(rules = rules)
        }
    }
}
