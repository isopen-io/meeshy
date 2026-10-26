package me.meeshy.app.chat

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Keyboard
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import me.meeshy.feature.chat.R
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyGradients
import me.meeshy.ui.theme.MeeshyMotion
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * La rangée de saisie (iOS `inputRow`) : [ (+) de verre 44 ] [ champ de verre, micro dedans ]
 * [ emplacement d'action 44 : bande d'emojis rapides si rien à envoyer, sinon l'envoi ].
 * Alignée en bas, espacement 12, marges h12 v10. Tout arrive en paramètre.
 */
@Composable
internal fun ComposerInputRow(
    isEditing: Boolean,
    hasAttachmentTiles: Boolean,
    attachmentTrayOpen: Boolean,
    fieldValue: TextFieldValue,
    showMic: Boolean,
    hasSomethingToSend: Boolean,
    sendEnabled: Boolean,
    accentColor: Color,
    onToggleTray: () -> Unit,
    onFieldChange: (TextFieldValue) -> Unit,
    onRequestVoice: () -> Unit,
    onSend: () -> Unit,
    secondaryColor: Color = MeeshyPalette.Indigo600,
    iconTint: Color = MeeshyTheme.tokens.textSecondary,
    protectionTint: Color? = null,
    quickEmojis: List<String> = emptyList(),
    onQuickEmoji: ((String) -> Unit)? = null,
    onQuickEmojiLongPress: () -> Unit = {},
    focusRequester: FocusRequester = remember { FocusRequester() },
    onFocusChange: (Boolean) -> Unit = {},
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.smPlus),
        verticalAlignment = Alignment.Bottom,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        if (!isEditing && hasAttachmentTiles) {
            ComposerAttachButton(trayOpen = attachmentTrayOpen, tint = iconTint, onClick = onToggleTray)
        }
        ComposerInputCapsule(
            value = fieldValue,
            onValueChange = onFieldChange,
            accentColor = accentColor,
            onSend = { if (hasSomethingToSend && sendEnabled) onSend() },
            modifier = Modifier.weight(1f),
            showMic = showMic,
            iconTint = iconTint,
            protectionTint = protectionTint,
            onRequestVoice = onRequestVoice,
            focusRequester = focusRequester,
            onFocusChange = onFocusChange,
        )
        val showQuickEmoji = !isEditing && !hasSomethingToSend && onQuickEmoji != null && quickEmojis.isNotEmpty()
        ComposerActionSlot(
            showQuickEmoji = showQuickEmoji,
            quickEmojis = quickEmojis,
            onQuickEmoji = { onQuickEmoji?.invoke(it) },
            onQuickEmojiLongPress = onQuickEmojiLongPress,
            isEditing = isEditing,
            sendReady = hasSomethingToSend && sendEnabled,
            accentColor = protectionTint ?: accentColor,
            secondaryColor = if (protectionTint != null) protectionTint.copy(alpha = 0.75f) else secondaryColor,
            onSend = onSend,
        )
    }
}

/**
 * Le (+) des pièces jointes : rond de VERRE de 44, glyphe 20 qui tourne d'un quart de tour à
 * chaque ouverture ; carrousel ouvert, il devient le clavier qui le referme.
 */
@Composable
private fun ComposerAttachButton(trayOpen: Boolean, tint: Color, onClick: () -> Unit) {
    var turns by remember { mutableIntStateOf(0) }
    LaunchedEffect(trayOpen) { if (trayOpen) turns += 1 }
    val reduceMotion = LocalReduceMotion.current
    val rotation by animateFloatAsState(
        targetValue = if (reduceMotion) 0f else turns * 90f,
        animationSpec = spring(dampingRatio = 0.7f, stiffness = MeeshyMotion.stiffnessForResponse(0.3f)),
        label = "composer-attach-rotation",
    )
    val label = stringResource(if (trayOpen) R.string.composer_show_keyboard else R.string.chat_attach_open)
    Box(
        modifier = Modifier
            .size(44.dp)
            .composerInnerGlass(CircleShape)
            .clickable(role = Role.Button, onClick = onClick)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        if (trayOpen) {
            Icon(Icons.Filled.Keyboard, contentDescription = null, tint = tint, modifier = Modifier.size(19.dp))
        } else {
            Icon(MeeshyIcons.Add, contentDescription = null, tint = tint, modifier = Modifier.size(24.dp).rotate(rotation))
        }
    }
}

/**
 * L'emplacement d'action, toujours monté à 44 de haut (iOS `ComposerActionSlot`) : la bande
 * d'emojis rapides quand rien n'est à envoyer, sinon le bouton d'envoi ; bascule en
 * « tourbillon » (échelle 0,6 + rotation ±40° + fondu).
 */
@Composable
private fun ComposerActionSlot(
    showQuickEmoji: Boolean,
    quickEmojis: List<String>,
    onQuickEmoji: (String) -> Unit,
    onQuickEmojiLongPress: () -> Unit,
    isEditing: Boolean,
    sendReady: Boolean,
    accentColor: Color,
    secondaryColor: Color,
    onSend: () -> Unit,
) {
    val reduceMotion = LocalReduceMotion.current
    AnimatedContent(
        targetState = showQuickEmoji,
        transitionSpec = {
            val spec = spring<Float>(dampingRatio = 0.86f, stiffness = MeeshyMotion.stiffnessForResponse(0.3f))
            if (reduceMotion) {
                fadeIn() togetherWith fadeOut()
            } else {
                (scaleIn(spec, initialScale = 0.6f) + fadeIn()) togetherWith (scaleOut(spec, targetScale = 0.6f) + fadeOut())
            }
        },
        contentAlignment = Alignment.BottomEnd,
        label = "composer-action-slot",
    ) { quick ->
        if (quick) {
            ComposerQuickEmojiBand(quickEmojis, onQuickEmoji, onQuickEmojiLongPress)
        } else {
            ComposerSendButton(
                isEditing = isEditing,
                enabled = sendReady,
                accentColor = accentColor,
                secondaryColor = secondaryColor,
                onSend = onSend,
            )
        }
    }
}

/**
 * La bande d'emojis rapides (iOS `QuickEmojiGrid`) : cadre de verre 110 × 44, rayon 16, 3,5
 * emojis visibles. Un toucher envoie l'emoji (garde de 0,5 s après l'arrivée de la bande), un
 * appui long ouvre la feuille d'emojis.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun ComposerQuickEmojiBand(
    emojis: List<String>,
    onPick: (String) -> Unit,
    onLongPress: () -> Unit,
) {
    var arrivedAt by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) { arrivedAt = System.currentTimeMillis() }
    LazyRow(
        modifier = Modifier
            .width(110.dp)
            .height(44.dp)
            .composerInnerGlass(RoundedCornerShape(MeeshyRadius.lg)),
        horizontalArrangement = Arrangement.spacedBy(3.dp),
        verticalAlignment = Alignment.CenterVertically,
        contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = MeeshySpacing.xs),
    ) {
        items(emojis, key = { it }) { emoji ->
            val label = stringResource(R.string.composer_quick_emoji_send, emoji)
            Box(
                modifier = Modifier
                    .size(width = 27.dp, height = 36.dp)
                    .clip(RoundedCornerShape(MeeshyRadius.xs))
                    .combinedClickable(
                        role = Role.Button,
                        onClickLabel = label,
                        onLongClick = onLongPress,
                        onClick = {
                            if (System.currentTimeMillis() - arrivedAt >= QUICK_EMOJI_ARRIVAL_GUARD_MS) onPick(emoji)
                        },
                    )
                    .semantics { contentDescription = label },
                contentAlignment = Alignment.Center,
            ) {
                Text(text = emoji, fontSize = 20.sp)
            }
        }
    }
}

private const val QUICK_EMOJI_ARRIVAL_GUARD_MS = 500L

/**
 * Le bouton d'envoi (iOS `sendButton`) : cercle plein de 44 au dégradé accent -> secondaire,
 * ombre de l'accent à 40 %, avion en papier blanc ; en édition, la coche sur le dégradé
 * d'alerte. Pas prêt, il s'efface (opacité 0) au lieu de griser. Un toucher rebondit (1,08).
 */
@Composable
internal fun ComposerSendButton(
    isEditing: Boolean,
    enabled: Boolean,
    accentColor: Color,
    secondaryColor: Color,
    onSend: () -> Unit,
) {
    val warning = MeeshyTheme.tokens.warning
    val brush = if (isEditing) {
        Brush.linearGradient(listOf(warning, warning.copy(alpha = 0.75f)))
    } else {
        MeeshyGradients.conversationAccent(accentColor, secondaryColor)
    }
    val shadowColor = if (isEditing) warning else accentColor
    var bounce by remember { mutableIntStateOf(0) }
    var bouncing by remember { mutableStateOf(false) }
    LaunchedEffect(bounce) {
        if (bounce == 0) return@LaunchedEffect
        bouncing = true
        delay(SEND_BOUNCE_MS)
        bouncing = false
    }
    val scale by animateFloatAsState(
        targetValue = if (bouncing) 1.08f else 1f,
        animationSpec = spring(dampingRatio = 0.5f, stiffness = MeeshyMotion.stiffnessForResponse(0.25f)),
        label = "composer-send-bounce",
    )
    val label = stringResource(R.string.chat_send)
    Box(
        modifier = Modifier
            .size(44.dp)
            .alpha(if (enabled) 1f else 0f)
            .scale(scale)
            .shadow(8.dp, CircleShape, clip = false, ambientColor = shadowColor.copy(alpha = 0.4f), spotColor = shadowColor.copy(alpha = 0.4f))
            .clip(CircleShape)
            .background(brush, CircleShape)
            .clickable(enabled = enabled, role = Role.Button) {
                bounce += 1
                onSend()
            }
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = if (isEditing) Icons.Filled.Check else Icons.AutoMirrored.Filled.Send,
            contentDescription = null,
            tint = Color.White,
            modifier = Modifier.size(19.dp),
        )
    }
}

private const val SEND_BOUNCE_MS = 200L
