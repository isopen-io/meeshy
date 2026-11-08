package me.meeshy.ui.component.comments

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.ui.R
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** Ce que la file dit d'un commentaire qui n'est pas encore parti (iOS `CommentUnsentBadge`). */
@Immutable
public sealed interface CommentUnsentState {
    /** Écrit hors ligne : il partira au retour du réseau. Atténué, icône horloge, « Annuler l'envoi ». */
    public data object Pending : CommentUnsentState

    /** La file a renoncé : « Réessayer » d'un toucher, ou « Supprimer ». [reason] est la raison lue du registre des limites. */
    public data class Failed(val reason: String? = null) : CommentUnsentState

    /** Une ligne héritée d'une version sans auteur : elle ne partira jamais, son texte se « Reprend » dans le composer. */
    public data class Inherited(val reason: String? = null) : CommentUnsentState
}

/**
 * La marque d'un commentaire qui porte encore son identifiant client. Sans état propre : l'hôte relit la FILE
 * (donc la marque survit à la fermeture de la feuille et au redémarrage) et lui passe [state]. [accent] est l'accent de la
 * conversation, passé en paramètre ; l'erreur reste la couleur sémantique statique.
 */
@Composable
public fun CommentUnsentBadge(
    state: CommentUnsentState,
    accent: Color,
    onRetry: () -> Unit,
    onResume: () -> Unit,
    onDelete: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val haptics = rememberMeeshyHaptics()
    val tokens = MeeshyTheme.tokens
    when (state) {
        CommentUnsentState.Pending -> Row(
            modifier = modifier.alpha(PENDING_ALPHA).semantics(mergeDescendants = true) {},
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        ) {
            Icon(MeeshyIcons.Schedule, contentDescription = null, tint = tokens.textSecondary, modifier = Modifier.size(14.dp))
            Text(
                text = stringResource(R.string.comment_unsent_pending),
                style = MaterialTheme.typography.labelMedium,
                color = tokens.textSecondary,
            )
            BadgeAction(stringResource(R.string.comment_unsent_cancel_send), tokens.error) {
                haptics.medium()
                onDelete()
            }
        }
        is CommentUnsentState.Failed, is CommentUnsentState.Inherited -> Row(
            modifier = modifier.padding(top = MeeshySpacing.xs),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        ) {
            Icon(MeeshyIcons.ErrorFilled, contentDescription = null, tint = tokens.error, modifier = Modifier.size(14.dp))
            Text(
                text = failureText(state),
                style = MaterialTheme.typography.labelMedium,
                color = tokens.error,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.widthIn(max = 220.dp),
            )
            if (state is CommentUnsentState.Inherited) {
                BadgeAction(stringResource(R.string.comment_unsent_resume), accent) {
                    haptics.light()
                    onResume()
                }
            } else {
                BadgeAction(stringResource(R.string.comment_unsent_retry), accent) {
                    haptics.light()
                    onRetry()
                }
            }
            BadgeAction(stringResource(R.string.comment_unsent_delete), tokens.error) {
                haptics.medium()
                onDelete()
            }
        }
    }
}

@Composable
private fun failureText(state: CommentUnsentState): String {
    val reason = when (state) {
        is CommentUnsentState.Failed -> state.reason
        is CommentUnsentState.Inherited -> state.reason
        CommentUnsentState.Pending -> null
    }
    return reason?.takeIf { it.isNotBlank() } ?: stringResource(R.string.comment_unsent_error)
}

@Composable
private fun BadgeAction(label: String, color: Color, onClick: () -> Unit) {
    TextButton(onClick = onClick, modifier = Modifier.heightIn(min = 48.dp)) {
        Text(text = label, color = color, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold)
    }
}

private const val PENDING_ALPHA = 0.6f
