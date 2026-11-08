package me.meeshy.ui.component.feedback

import android.content.Context
import android.os.Build
import android.view.accessibility.AccessibilityManager
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import me.meeshy.sdk.feedback.FeedbackToastCenter
import me.meeshy.sdk.model.feedback.FeedbackToast
import me.meeshy.sdk.model.feedback.FeedbackToastKind
import me.meeshy.sdk.model.feedback.FeedbackToastTiming
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.accessibility.MeeshyA11yId
import me.meeshy.ui.component.FeedbackKind
import me.meeshy.ui.component.MeeshyFeedbackToast
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshyMotion
import me.meeshy.ui.theme.MeeshySpacing

/**
 * L'hôte du toast de retour, monté UNE fois à la racine de l'app : miroir de `FeedbackToastOverlay` (iOS).
 * La pastille de verre émerge du haut, sous la découpe caméra, avec un ressort bondissant (fondu sous « Réduire
 * les animations ») ; un tap exécute l'action puis ferme, un glissé vers le haut ferme, et la fermeture
 * automatique suit [FeedbackToastTiming] (allongée sous TalkBack et par le délai d'accessibilité système).
 */
@Composable
public fun FeedbackToastCenterHost(center: FeedbackToastCenter, modifier: Modifier = Modifier) {
    val toast by center.current.collectAsState()
    val lastShown = remember { arrayOfNulls<FeedbackToast>(1) }
    toast?.let { lastShown[0] = it }
    val context = LocalContext.current
    val haptics = rememberMeeshyHaptics()
    val reduceMotion = LocalReduceMotion.current
    val notchPx = with(LocalDensity.current) { NOTCH_OFFSET.roundToPx() }

    LaunchedEffect(toast?.id) {
        val shown = toast ?: return@LaunchedEffect
        when (shown.kind) {
            FeedbackToastKind.ERROR -> haptics.error()
            FeedbackToastKind.SUCCESS -> haptics.success()
            FeedbackToastKind.INFO -> haptics.light()
        }
        delay(feedbackToastDismissDelay(context, shown))
        center.dismiss(shown.id)
    }

    Box(
        modifier = modifier
            .fillMaxWidth()
            .windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Top))
            .padding(top = MeeshySpacing.sm),
        contentAlignment = Alignment.TopCenter,
    ) {
        AnimatedVisibility(
            visible = toast != null,
            enter = if (reduceMotion) fadeIn(tween(150)) else
                scaleIn(MeeshyMotion.springBouncy(), initialScale = 0.2f, transformOrigin = TransformOrigin(0.5f, 0f)) +
                    fadeIn() + slideInVertically(MeeshyMotion.springBouncy()) { -notchPx },
            exit = if (reduceMotion) fadeOut(tween(150)) else
                scaleOut(targetScale = 0.2f, transformOrigin = TransformOrigin(0.5f, 0f)) +
                    fadeOut() + slideOutVertically { -notchPx },
        ) {
            lastShown[0]?.let { shown -> ToastPill(shown, center) }
        }
    }
}

@Composable
private fun ToastPill(toast: FeedbackToast, center: FeedbackToastCenter) {
    val swipeThresholdPx = with(LocalDensity.current) { SWIPE_UP_THRESHOLD.toPx() }
    val kind = when (toast.kind) {
        FeedbackToastKind.SUCCESS -> FeedbackKind.Success
        FeedbackToastKind.ERROR -> FeedbackKind.Error
        FeedbackToastKind.INFO -> FeedbackKind.Info
    }
    val tap = if (toast.isTappable) Modifier.clickable { center.tap(toast.id) } else Modifier
    MeeshyFeedbackToast(
        message = toast.message,
        kind = kind,
        showsChevron = toast.isTappable,
        modifier = Modifier
            .padding(horizontal = MeeshySpacing.lg)
            .testTag(MeeshyA11yId.TOAST_CONTAINER)
            .semantics(mergeDescendants = true) {
                liveRegion = if (toast.kind == FeedbackToastKind.ERROR) LiveRegionMode.Assertive else LiveRegionMode.Polite
                if (toast.isTappable) role = Role.Button
            }
            .pointerInput(toast.id) {
                var drag = 0f
                detectVerticalDragGestures(
                    onDragStart = { drag = 0f },
                    onVerticalDrag = { _, delta ->
                        drag += delta
                        if (drag <= -swipeThresholdPx) {
                            drag = 0f
                            center.dismiss(toast.id)
                        }
                    },
                )
            }
            .then(tap),
    )
}

private fun feedbackToastDismissDelay(context: Context, toast: FeedbackToast): Long {
    val manager = context.getSystemService(Context.ACCESSIBILITY_SERVICE) as? AccessibilityManager
    val reader = manager?.isEnabled == true && manager.isTouchExplorationEnabled
    val recommended = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && manager != null) {
        manager.getRecommendedTimeoutMillis(0, AccessibilityManager.FLAG_CONTENT_TEXT or AccessibilityManager.FLAG_CONTENT_CONTROLS)
            .toLong().takeIf { it > 0 }
    } else null
    return FeedbackToastTiming.dismissDelayMillis(toast.kind, toast.isTappable, reader, recommended)
}

private val NOTCH_OFFSET = 24.dp
private val SWIPE_UP_THRESHOLD = 24.dp
