package me.meeshy.app.profile

import androidx.annotation.StringRes
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.relation.CircleProgressSummary
import me.meeshy.sdk.model.relation.ProfileCircle
import me.meeshy.sdk.model.relation.RelationLevel
import me.meeshy.ui.R as UiR
import me.meeshy.ui.component.circles.levelIcon
import me.meeshy.ui.component.circles.levelTitle
import me.meeshy.ui.component.circles.summaryText
import me.meeshy.ui.component.circles.tint
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.motion.pressable
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Le bloc du cercle sur le profil d'un autre (#13940, #14910) — iso `ProfileCircleSection.swift` : le niveau commun et ce qui
 * manque pour monter ; puis, en bas du bloc, le libellé impératif du cercle visé (« Soyons proches », seulement quand
 * c'est possible) au-dessus de celui du cercle d'arrivée (« Restons amis » — « Annuler le lien » à Connaissance —), ce
 * dernier toujours confirmé par un dialogue destructif ([ProfileCircleWording]).
 * [allowPromote] est faux quand la fiche offre déjà le geste de connexion : une seule porte pour la même demande.
 */
@Composable
internal fun ProfileCircleRow(
    circle: ProfileCircle,
    displayName: String,
    onRaise: () -> Unit,
    onLower: () -> Unit,
    allowPromote: Boolean = true,
) {
    var confirming by rememberSaveable(circle.level) { mutableStateOf(false) }
    val level = circle.level
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(level.tint().copy(alpha = 0.12f))
            .padding(MeeshySpacing.md),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        CircleHeader(circle)
        circle.offeredRaise?.takeIf { allowPromote }?.let { target ->
            ProfileCircleWording.promote(target)?.let { label -> PromoteButton(target, label, displayName, onRaise) }
        }
        circle.lowering?.let { target -> LowerButton(target, onClick = { confirming = true }) }
    }
    val target = circle.lowering
    if (confirming && target != null) {
        LowerConfirmDialog(
            name = displayName,
            from = level,
            to = target,
            onConfirm = {
                confirming = false
                onLower()
            },
            onDismiss = { confirming = false },
        )
    }
}

@Composable
private fun CircleHeader(circle: ProfileCircle) {
    val level = circle.level
    val title = levelTitle(level, null)
    val summary = summaryText(CircleProgressSummary.of(circle.link), null)
    val description = listOfNotNull(title, summary).joinToString(", ")
    Row(verticalAlignment = Alignment.CenterVertically) {
        Column(
            modifier = Modifier
                .weight(1f)
                .semantics(mergeDescendants = true) { contentDescription = description },
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(text = levelIcon(level, null), modifier = Modifier.clearAndSetSemantics {})
                Text(
                    text = title,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Bold,
                    color = level.tint(),
                )
            }
            summary?.let {
                Text(text = it, style = MaterialTheme.typography.bodySmall, color = MeeshyTheme.tokens.textSecondary)
            }
        }
        circle.pending?.let { waiting ->
            Spacer(Modifier.width(MeeshySpacing.sm))
            Text(
                text = stringResource(UiR.string.circles_pending, levelTitle(waiting, null)),
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.SemiBold,
                color = MeeshyTheme.tokens.textSecondary,
                textAlign = TextAlign.End,
                modifier = Modifier.widthIn(max = 120.dp),
            )
        }
    }
}

@Composable
private fun PromoteButton(target: RelationLevel, @StringRes label: Int, name: String, onRaise: () -> Unit) {
    val text = stringResource(label)
    val a11y = ProfileCircleWording.promoteA11y(target)?.let { stringResource(it, name) } ?: text
    CircleActionButton(
        label = text,
        color = target.tint(),
        filled = true,
        a11y = a11y,
        onClick = onRaise,
    )
}

@Composable
private fun LowerButton(target: RelationLevel, onClick: () -> Unit) {
    val label = stringResource(ProfileCircleWording.lower(target))
    CircleActionButton(label = label, color = MeeshyPalette.Error, filled = false, a11y = label, onClick = onClick)
}

@Composable
private fun CircleActionButton(label: String, color: Color, filled: Boolean, a11y: String, onClick: () -> Unit) {
    val shape = RoundedCornerShape(12.dp)
    val haptics = rememberMeeshyHaptics()
    Text(
        text = label,
        style = MaterialTheme.typography.bodyMedium,
        fontWeight = FontWeight.SemiBold,
        color = if (filled) Color.White else color,
        textAlign = TextAlign.Center,
        modifier = Modifier
            .fillMaxWidth()
            .pressable()
            .heightIn(min = 44.dp)
            .clip(shape)
            .background(if (filled) color else color.copy(alpha = 0.10f))
            .border(1.dp, color.copy(alpha = if (filled) 0f else 0.25f), shape)
            .clickable(role = Role.Button) {
                haptics.medium()
                onClick()
            }
            .semantics { contentDescription = a11y }
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
    )
}

/** Le dialogue destructif de la spec #14910 : départ, arrivée, ce qu'on perd, l'autre non prévenu, 30 jours. */
@Composable
private fun LowerConfirmDialog(
    name: String,
    from: RelationLevel,
    to: RelationLevel,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    val unlink = to == RelationLevel.PUBLIC
    val fromTitle = levelTitle(from, null)
    val toTitle = levelTitle(to, null)
    val title = stringResource(ProfileCircleWording.lowerTitle(to), name)
    val body = if (unlink) {
        stringResource(UiR.string.circles_unlink_confirm_body, name)
    } else {
        stringResource(UiR.string.circles_demote_confirm_body, name, fromTitle, toTitle)
    }
    val action = ProfileCircleWording.lower(to)
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { Text(body) },
        confirmButton = {
            TextButton(onClick = onConfirm) {
                Text(stringResource(action), color = MeeshyPalette.Error, fontWeight = FontWeight.SemiBold)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(UiR.string.circles_confirm_cancel)) }
        },
    )
}
