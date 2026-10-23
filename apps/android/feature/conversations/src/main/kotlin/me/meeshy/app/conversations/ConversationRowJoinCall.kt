package me.meeshy.app.conversations

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.background
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import me.meeshy.feature.conversations.R
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing

/** Quand la ligne propose « Rejoindre » l'appel en cours de la conversation. */
internal object ConversationRowJoinCall {

    /**
     * Visible dès qu'un appel est en cours là, sauf si la ligne est verrouillée (son contenu est
     * masqué : on ne révèle pas qu'un appel y a lieu) ou si le pair est en train d'écrire (la rangée
     * dit déjà la frappe : un seul signal vivant à la fois).
     */
    fun isVisible(callInProgress: Boolean, isLocked: Boolean, isTyping: Boolean): Boolean =
        callInProgress && !isLocked && !isTyping
}

/** Le bouton « Rejoindre » à droite de la ligne du titre, à la place des non-lus (iOS `joinLiveCallButton`). */
@Composable
internal fun ConversationRowJoinButton(accent: Color, onClick: () -> Unit) {
    val description = stringResource(R.string.row_join_call_a11y)
    Text(
        text = stringResource(R.string.row_join_call),
        style = MaterialTheme.typography.labelMedium,
        fontWeight = FontWeight.SemiBold,
        color = MeeshyPalette.White,
        modifier = Modifier
            .padding(start = MeeshySpacing.sm)
            .clip(CircleShape)
            .background(accent)
            .clickable(role = Role.Button, onClick = onClick)
            .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.xs)
            .semantics {
                role = Role.Button
                contentDescription = description
            },
    )
}
