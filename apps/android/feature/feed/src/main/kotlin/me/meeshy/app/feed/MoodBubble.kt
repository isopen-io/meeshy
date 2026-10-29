package me.meeshy.app.feed

import androidx.compose.foundation.background
import android.widget.Toast
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupProperties
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import kotlinx.coroutines.flow.Flow
import me.meeshy.feature.feed.R
import me.meeshy.sdk.model.EmojiCatalog
import me.meeshy.ui.component.chrome.MeeshyGlassSurface
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * La bulle de l'humeur d'un ami, ouverte par un appui sur son badge dans le rail de stories (iOS
 * `StatusBubbleOverlay`, #13662) : l'humeur, puis les trois gestes — réagir (rangée de réactions rapides),
 * republier, répondre. [onDwellEnd] part à la fermeture, quelle que soit la sortie ; l'application qui passe en
 * arrière-plan ferme la bulle, comme le retour système et le toucher extérieur — la durée de lecture ne court
 * jamais écran éteint. Chaque cible tient dans 48 dp ; la rangée de réactions défile.
 */
@Composable
fun MoodBubble(
    model: MoodBubbleModel,
    onReact: (String) -> Unit,
    onRepublish: () -> Unit,
    onReply: () -> Unit,
    onDismiss: () -> Unit,
    onDwellEnd: () -> Unit,
) {
    DisposableEffect(model.statusId) { onDispose(onDwellEnd) }
    LifecycleEventEffect(Lifecycle.Event.ON_STOP) { onDismiss() }
    Popup(
        alignment = Alignment.Center,
        onDismissRequest = onDismiss,
        properties = PopupProperties(focusable = true),
    ) {
        MeeshyGlassSurface(
            shape = RoundedCornerShape(MeeshyRadius.lg),
            modifier = Modifier.widthIn(min = 160.dp, max = 260.dp),
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
                modifier = Modifier.padding(MeeshySpacing.lg),
            ) {
                Text(text = model.moodEmoji, style = MaterialTheme.typography.headlineMedium)
                Text(
                    text = model.username,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = MeeshyTheme.tokens.textPrimary,
                )
                model.content?.let { content ->
                    Text(text = content, style = MaterialTheme.typography.bodySmall, color = MeeshyTheme.tokens.textSecondary)
                }
                model.viaUsername?.let { via ->
                    Text(
                        text = stringResource(R.string.status_bubble_via, via),
                        style = MaterialTheme.typography.labelSmall,
                        color = MeeshyTheme.tokens.textSecondary,
                    )
                }
                if (model.reactions.isNotEmpty()) ReactionChips(model.reactions)
                if (model.canReact) ReactionPicker(onReact)
                if (model.canReply) BubbleAction(
                    label = stringResource(R.string.mood_bubble_reply),
                    icon = MeeshyIcons.Reply,
                    onClick = onReply,
                )
                if (model.canRepublish) BubbleAction(
                    label = stringResource(R.string.status_bubble_republish),
                    icon = MeeshyIcons.Repeat,
                    onClick = onRepublish,
                )
            }
        }
    }
}

@Composable
private fun ReactionChips(chips: List<MoodReactionChip>) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.horizontalScroll(rememberScrollState()),
    ) {
        chips.forEach { chip ->
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(2.dp),
                modifier = Modifier
                    .background(MeeshyPalette.Indigo500.copy(alpha = 0.10f), RoundedCornerShape(MeeshyRadius.pill))
                    .padding(horizontal = MeeshySpacing.sm, vertical = 2.dp),
            ) {
                Text(text = chip.emoji, style = MaterialTheme.typography.labelMedium)
                Text(
                    text = chip.count.toString(),
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = MeeshyTheme.tokens.textSecondary,
                )
            }
        }
    }
}

@Composable
private fun ReactionPicker(onReact: (String) -> Unit) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .background(MeeshyTheme.tokens.textSecondary.copy(alpha = 0.06f), RoundedCornerShape(MeeshyRadius.pill))
            .horizontalScroll(rememberScrollState()),
    ) {
        EmojiCatalog.defaultQuickReactions.forEach { emoji ->
            val label = stringResource(R.string.mood_bubble_react, emoji)
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier
                    .sizeIn(minWidth = MIN_TARGET, minHeight = MIN_TARGET)
                    .clickable(role = Role.Button) { onReact(emoji) }
                    .semantics { contentDescription = label },
            ) {
                Text(text = emoji, style = MaterialTheme.typography.titleMedium)
            }
        }
    }
}

@Composable
private fun BubbleAction(label: String, icon: androidx.compose.ui.graphics.vector.ImageVector, onClick: () -> Unit) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        modifier = Modifier
            .sizeIn(minWidth = MIN_TARGET, minHeight = MIN_TARGET)
            .clickable(role = Role.Button, onClick = onClick)
            .padding(horizontal = MeeshySpacing.sm)
            .semantics { contentDescription = label; role = Role.Button },
    ) {
        Icon(imageVector = icon, contentDescription = null, tint = MeeshyPalette.Indigo400, modifier = Modifier.size(14.dp))
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.Medium,
            color = MeeshyPalette.Indigo400,
        )
    }
}

/** Une réaction refusée se dit, après son retour arrière — le toast `status.reactError` d'iOS (#13662). */
@Composable
fun MoodReactFailureToast(failures: Flow<Unit>) {
    val context = LocalContext.current
    val message = stringResource(R.string.status_react_error)
    LaunchedEffect(failures) {
        failures.collect { Toast.makeText(context, message, Toast.LENGTH_SHORT).show() }
    }
}

private val MIN_TARGET = 48.dp
