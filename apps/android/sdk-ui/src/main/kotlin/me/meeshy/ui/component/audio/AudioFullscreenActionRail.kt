package me.meeshy.ui.component.audio

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.fullscreen.AudioFullscreenAction
import me.meeshy.sdk.model.fullscreen.AudioFullscreenOffer
import me.meeshy.sdk.model.fullscreen.FullscreenChromeState
import me.meeshy.sdk.model.fullscreen.FullscreenOverlay
import me.meeshy.ui.R
import me.meeshy.ui.component.EmojiFullPicker
import me.meeshy.ui.component.ReactionStripChrome
import me.meeshy.ui.component.chrome.MeeshyGlassSurface
import me.meeshy.ui.component.fullscreen.FullscreenActionRail
import me.meeshy.ui.component.fullscreen.FullscreenActionStyle
import me.meeshy.ui.component.fullscreen.FullscreenChromeTone
import me.meeshy.ui.component.fullscreen.FullscreenComposeAction
import me.meeshy.ui.component.fullscreen.FullscreenForwardAction
import me.meeshy.ui.component.fullscreen.FullscreenReactAction
import me.meeshy.ui.component.fullscreen.FullscreenReactionStrip
import me.meeshy.ui.component.fullscreen.FullscreenReplyAction
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.DarkMeeshyTokens
import me.meeshy.ui.theme.LocalMeeshyTokens
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import androidx.compose.runtime.CompositionLocalProvider

/**
 * **Le rail d'actions du plein écran audio** (iOS `AudioFullscreenPage.actionRail`) : des disques de verre adaptatifs,
 * dans l'ordre de la charte § 6 — Réagir, Répondre, Transférer, Créer — et SEULEMENT ceux que l'[offer] permet. Une offre
 * vide ne pose rien. Chaque bouton a une cible de 48 dp, un libellé et un verbe TalkBack, une haptique au toucher.
 */
@Composable
public fun AudioFullscreenActionRail(
    offer: AudioFullscreenOffer,
    isReactionOpen: Boolean,
    isReplyOpen: Boolean,
    onReact: () -> Unit,
    onReply: () -> Unit,
    onForward: () -> Unit,
    onCompose: () -> Unit,
    modifier: Modifier = Modifier,
) {
    if (offer.isEmpty) return
    val style = FullscreenActionStyle.Disc(FullscreenChromeTone.Adaptive)
    FullscreenActionRail(modifier = modifier) {
        offer.actions.forEach { action ->
            when (action) {
                AudioFullscreenAction.REACT -> FullscreenReactAction(
                    isOpen = isReactionOpen,
                    onClick = onReact,
                    label = stringResource(R.string.media_react_title),
                    hint = stringResource(R.string.media_react_hint),
                    style = style,
                )

                AudioFullscreenAction.REPLY -> FullscreenReplyAction(
                    onClick = onReply,
                    isOpen = isReplyOpen,
                    label = stringResource(R.string.media_reply_title),
                    hint = stringResource(R.string.media_reply_hint_inPlace),
                    style = style,
                )

                AudioFullscreenAction.FORWARD -> FullscreenForwardAction(
                    onClick = onForward,
                    label = stringResource(R.string.a11y_message_actions_forward),
                    hint = stringResource(R.string.media_forward_rail_hint),
                    style = style,
                )

                AudioFullscreenAction.COMPOSE -> FullscreenComposeAction(
                    onClick = onCompose,
                    label = stringResource(R.string.media_compose_title),
                    hint = stringResource(R.string.media_compose_hint),
                    style = style,
                )
            }
        }
    }
}

/** Le rail posé en bas de la page, côté fin ; il se lève d'une bande de réactions quand celle-ci est ouverte. */
@Composable
internal fun AudioFullscreenActionRailSlot(
    actions: AudioFullscreenActionPort,
    source: AudioFullscreenSource,
    chrome: FullscreenChromeState,
    onChrome: (FullscreenChromeState) -> Unit,
    onClose: () -> Unit,
) {
    val reactionsOpen = chrome.isOpen(FullscreenOverlay.Reactions)
    val replyOpen = chrome.isOpen(FullscreenOverlay.Reply)
    val lift by animateDpAsState(targetValue = if (reactionsOpen) REACTION_STRIP_LIFT else 0.dp, label = "audioFullscreenRailLift")
    if (replyOpen) return
    AudioFullscreenActionRail(
        offer = actions.offer(source),
        isReactionOpen = reactionsOpen,
        isReplyOpen = replyOpen,
        onReact = { onChrome(chrome.toggling(FullscreenOverlay.Reactions)) },
        onReply = { onChrome(chrome.opening(FullscreenOverlay.Reply)) },
        onForward = { actions.forward(source) },
        onCompose = {
            actions.compose(source)
            onClose()
        },
        modifier = Modifier.padding(bottom = lift),
    )
}

/**
 * Ce que les actions montent AU-DESSUS de la page : la bande de réactions sur un verre (un vocal n'a pas d'image pour lui
 * servir de fond), la barre de réponse ancrée au bas, au-dessus du clavier, et la feuille du sélecteur complet.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun BoxScope.AudioFullscreenActionOverlays(
    actions: AudioFullscreenActionPort,
    source: AudioFullscreenSource,
    chrome: FullscreenChromeState,
    accent: Color,
    onChrome: (FullscreenChromeState) -> Unit,
) {
    val haptics = rememberMeeshyHaptics()
    var pickerOpen by remember { mutableStateOf(false) }
    val offer = actions.offer(source)
    AnimatedVisibility(
        visible = chrome.isOpen(FullscreenOverlay.Reactions) && offer.react,
        enter = fadeIn() + scaleIn(initialScale = REACTION_STRIP_ENTER_SCALE),
        exit = fadeOut(),
        modifier = Modifier
            .align(Alignment.BottomCenter)
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.lg),
    ) {
        CompositionLocalProvider(LocalMeeshyTokens provides DarkMeeshyTokens) {
            MeeshyGlassSurface(shape = RoundedCornerShape(MeeshyRadius.pill)) {
                FullscreenReactionStrip(
                    onReact = { emoji ->
                        actions.react(source, emoji)
                        haptics.success()
                        onChrome(chrome.closingOverlay())
                    },
                    modifier = Modifier.background(MeeshyPalette.Ink.copy(alpha = GLASS_TINT_ALPHA)),
                    quickEmojis = actions.quickReactions(),
                    ownReactions = actions.ownReactions(source),
                    accentColor = accent,
                    onExpandFullPicker = {
                        onChrome(chrome.closingOverlay())
                        pickerOpen = true
                    },
                    chrome = ReactionStripChrome.None,
                )
            }
        }
    }
    if (chrome.isOpen(FullscreenOverlay.Reply) && offer.reply) {
        androidx.compose.foundation.layout.Box(
            Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .navigationBarsPadding()
                .imePadding(),
        ) {
            actions.ReplyBar(source = source, accent = accent, onClose = { onChrome(chrome.closingOverlay()) })
        }
    }
    if (pickerOpen) {
        ModalBottomSheet(onDismissRequest = { pickerOpen = false }, containerColor = MeeshyTheme.tokens.backgroundPrimary) {
            EmojiFullPicker(
                onSelect = { emoji ->
                    actions.react(source, emoji)
                    haptics.success()
                    pickerOpen = false
                },
                accentColor = accent,
                quickReactions = actions.quickReactions(),
                modifier = Modifier.navigationBarsPadding(),
            )
        }
    }
}

/** La hauteur dont le rail se lève quand la bande de réactions occupe le bas : la bande, plus sa gouttière. */
private val REACTION_STRIP_LIFT = 72.dp

private const val REACTION_STRIP_ENTER_SCALE = 0.85f

private const val GLASS_TINT_ALPHA = 0.35f
