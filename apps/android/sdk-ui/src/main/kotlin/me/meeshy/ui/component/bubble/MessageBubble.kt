package me.meeshy.ui.component.bubble

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import me.meeshy.sdk.model.MessageEffects
import me.meeshy.ui.theme.MeeshyPalette

/**
 * One chat message. This is only the entry point and the decision by render kind:
 * - an ephemeral message whose timer elapsed collapses (fade + burn-away scale, iOS `EmptyView`);
 * - a conversation notice renders centered ([BubbleSystemNoticeView]);
 * - a consumed view-once message shows its "Seen and deleted" tombstone ([BubbleBurnedView]);
 * - everything else (including the "Message deleted" tombstone) is the signed
 *   [BubbleStandardLayout].
 *
 * Every gesture arrives through [callbacks] (a null callback leaves its element inert), so a new
 * gesture never lengthens this signature.
 */
@Composable
public fun MessageBubble(
    content: BubbleContent,
    modifier: Modifier = Modifier,
    outgoingColor: Color = MeeshyPalette.Indigo500,
    /** L'accent de la conversation (réactions) — distinct du fond de la bulle envoyée. */
    accentColor: Color = MeeshyPalette.Indigo500,
    callbacks: BubbleCallbacks = BubbleCallbacks.None,
    audioPlayback: BubbleAudioPlayback? = null,
    mentionDisplayNames: Map<String, String>? = null,
    highlightTerm: String? = null,
    trackedLinks: Map<String, String>? = null,
    effects: MessageEffects? = null,
    hasPlayedAppearance: Boolean = false,
    /**
     * A pre-composed single spoken label for the whole bubble (see
     * [MessageBubbleAccessibilityLabel]). When non-null the bubble collapses its content into
     * one accessibility node reading exactly this string — only safe at NON-interactive render
     * sites (e.g. the long-press overlay hero), since it clears descendant semantics including
     * any touch targets. The default null leaves the interactive list bubble's per-element
     * semantics untouched.
     */
    accessibilityLabel: String? = null,
    /**
     * Contenu posé DANS la bulle sous le texte, comme l'aperçu de lien d'iOS (`BubbleLinkEmbed`) ;
     * il reçoit la couleur d'encre de la bulle. Null : rien.
     */
    bodyAccessory: (@Composable (onColor: Color) -> Unit)? = null,
) {
    // Combine the server deletion flag, the view-once consume count and the ephemeral
    // self-destruct countdown. A deleted message keeps its "Message deleted" tombstone
    // (visible → the standard layout renders it); a consumed view-once message
    // shows the "Seen and deleted" burned tombstone; an ephemeral message whose timer
    // elapses collapses the whole bubble (iOS `EmptyView`) with a fade + burn-away scale.
    val renderKind = rememberBubbleRenderKind(
        isDeleted = content.isDeleted,
        expiresAtIso = content.expiresAtIso,
        isViewOnce = content.isViewOnce,
        isViewOnceOpenedByMe = content.isViewOnceOpenedByMe,
        isSystem = content.isSystem,
    )
    AnimatedVisibility(
        visible = !renderKind.isEphemeralExpired,
        modifier = modifier,
        enter = EnterTransition.None,
        exit = fadeOut() + scaleOut(targetScale = 0.8f) + shrinkVertically(),
    ) {
        when {
            // A conversation notice (join/leave/legacy summary) renders as a centered,
            // avatar-less notice — never a signed bubble (iOS `BubbleSystemNoticeView`).
            renderKind.isSystem -> BubbleSystemNoticeView(text = content.text)
            // A consumed view-once message shows the persistent "Seen and deleted"
            // tombstone (iOS `BubbleBurnedView`) in place of its content, aligned to
            // the sender side like the deleted tombstone.
            renderKind.isBurned -> BubbleBurnedView(isOutgoing = content.isOutgoing)
            else -> BubbleStandardLayout(
                content = content,
                outgoingColor = outgoingColor,
                callbacks = callbacks,
                audioPlayback = audioPlayback,
                options = BubbleRenderOptions(
                    effects = effects,
                    hasPlayedAppearance = hasPlayedAppearance,
                    accessibilityLabel = accessibilityLabel,
                    accentColor = accentColor,
                    bodyAccessory = bodyAccessory,
                    decor = BubbleTextDecor(
                        mentionDisplayNames = mentionDisplayNames,
                        highlightTerm = highlightTerm,
                        trackedLinks = trackedLinks,
                    ),
                ),
            )
        }
    }
}
