package me.meeshy.ui.component.talkie

import android.Manifest
import android.content.pm.PackageManager
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.PermissionNature
import me.meeshy.sdk.model.relation.TalkieHoldLook
import me.meeshy.sdk.model.relation.TalkieSendPhase
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.component.permission.PermissionFlow
import me.meeshy.ui.haptics.rememberMeeshyHaptics

/** Ce que le geste du talkie fait faire à l'émetteur de l'écran. */
public class TalkieHoldActions(
    public val press: () -> Unit,
    public val release: () -> Unit,
    /** Un simple toucher : on rappelle qu'il faut maintenir. */
    public val quickTap: () -> Unit,
)

/**
 * Maintenir pour parler (#17150, iso `TalkieHoldModifier`), partagé par la fiche et l'en-tête : le doigt posé enfonce et
 * vibre aussitôt, la voix qui part vibre une seconde fois, relâcher ou quitter l'écran termine ; un simple toucher rappelle
 * le geste. Sans la permission micro, l'appui la demande et rien ne part ; un refus se dit par [permissions].
 */
@Composable
public fun Modifier.talkieHold(
    pressed: MutableState<Boolean>,
    phase: TalkieSendPhase,
    permissions: PermissionFlow,
    actions: TalkieHoldActions,
): Modifier {
    val context = LocalContext.current
    val haptics = rememberMeeshyHaptics()
    val scope = rememberCoroutineScope()
    val reduceMotion = LocalReduceMotion.current
    val current by rememberUpdatedState(actions)
    LaunchedEffect(phase is TalkieSendPhase.Talking) {
        if (phase is TalkieSendPhase.Talking) haptics.rigid()
    }
    DisposableEffect(Unit) {
        onDispose { if (pressed.value) current.release() }
    }
    val granted = {
        ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
    }
    return this
        .scale(if (pressed.value && !reduceMotion) PRESSED_SCALE else 1f)
        .pointerInput(Unit) {
            detectTapGestures(
                onPress = {
                    if (!granted()) {
                        scope.launch { permissions.ensure(PermissionNature.MICROPHONE) }
                        return@detectTapGestures
                    }
                    pressed.value = true
                    val pressedAt = System.currentTimeMillis()
                    haptics.medium()
                    current.press()
                    tryAwaitRelease()
                    pressed.value = false
                    current.release()
                    if (TalkieHoldLook.isQuickTap(System.currentTimeMillis() - pressedAt)) current.quickTap()
                },
            )
        }
}

private const val PRESSED_SCALE = 0.88f
