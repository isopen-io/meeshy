package me.meeshy.app.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import me.meeshy.feature.chat.R
import me.meeshy.ui.theme.MeeshyGradients

/** Le bouton flottant de la barre repliée : « Écrire » (ou « Micro » quand le champ est vide). */
@Composable
internal fun ComposerMinimizedButton(
    showMic: Boolean,
    accentColor: Color,
    secondaryColor: Color,
    onTap: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val label = stringResource(if (showMic) R.string.composer_shell_minimized_mic else R.string.composer_shell_minimized_write)
    Box(
        modifier = modifier
            .size(56.dp)
            .clip(CircleShape)
            .background(MeeshyGradients.conversationAccent(accentColor, secondaryColor))
            .clickable(onClick = onTap)
            .semantics {
                contentDescription = label
                role = Role.Button
            },
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = if (showMic) Icons.Filled.Mic else Icons.Filled.Edit,
            contentDescription = null,
            tint = Color.White,
        )
    }
}
