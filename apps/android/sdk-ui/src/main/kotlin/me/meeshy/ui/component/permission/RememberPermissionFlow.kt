package me.meeshy.ui.component.permission

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.PermissionFlowEffect
import me.meeshy.sdk.model.PermissionFlowEvent
import me.meeshy.sdk.model.PermissionFlowReducer
import me.meeshy.sdk.model.PermissionFlowState
import me.meeshy.sdk.model.PermissionNature
import me.meeshy.sdk.model.media.MediaPermissionState
import me.meeshy.sdk.permission.PermissionRequestHistory
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * La porte unique d'une demande d'accès caméra, micro, photos, lieu, notifications ou contacts.
 *
 * ```
 * val permissions = rememberPermissionFlow()
 * PermissionFlowHost(permissions)
 * ...
 * scope.launch { if (permissions.ensure(PermissionNature.MICROPHONE)) startRecording() }
 * ```
 *
 * [ensure] ne rend qu'un booléen. Aucune boîte système n'apparaît sans l'explication qui la
 * précède ; un refus définitif ne redemande jamais mais affiche la carte « Ouvrir les
 * Réglages » ; un retour des Réglages avec l'accès accordé referme la carte et [ensure]
 * rend `true` : l'appelant relance son action sans geste de plus.
 *
 * La logique de décision vit dans `PermissionFlowReducer` (`:core:model`) ; cette classe n'en
 * exécute que les effets.
 */
@Stable
public class PermissionFlow internal constructor(
    private val requester: MediaPermissionRequester,
    private val scope: CoroutineScope,
) {

    /** Ce que la porte affiche maintenant ; [PermissionFlowHost] le projette en feuille ou en carte. */
    public var state: PermissionFlowState by mutableStateOf(PermissionFlowState.Idle)
        private set

    internal var launchSystemPermissions: (Array<String>) -> Unit = {}

    private var pending: CompletableDeferred<Boolean>? = null

    /**
     * Garantit l'accès [nature] avant d'agir. `true` = utilisable (accordé ou limité) ; `false` =
     * renoncé, refusé, ou une autre demande était déjà en cours.
     *
     * [announcesRefusal] = `false` pour l'appelant qui gère lui-même la dégradation (appel vidéo
     * qui retombe en audio, sauvegarde facultative) : deux messages pour un seul geste, c'est du bruit.
     */
    public suspend fun ensure(nature: PermissionNature, announcesRefusal: Boolean = true): Boolean {
        if (pending != null) return false
        val outcome = CompletableDeferred<Boolean>()
        pending = outcome
        try {
            dispatch(PermissionFlowEvent.Requested(nature, requester.snapshot(nature), announcesRefusal))
            return outcome.await()
        } finally {
            if (pending === outcome) {
                pending = null
                state = PermissionFlowState.Idle
            }
        }
    }

    /** L'état courant de [nature], sans rien demander ni afficher. */
    public suspend fun stateOf(nature: PermissionNature): MediaPermissionState = requester.state(nature)

    internal fun onExplanationAccepted() = dispatch(PermissionFlowEvent.Accepted)

    internal fun onDismissed() = dispatch(PermissionFlowEvent.Dismissed)

    internal fun onOpenSettingsTapped() = dispatch(PermissionFlowEvent.OpenSettingsTapped)

    internal fun onSystemAnswered() {
        val current = state as? PermissionFlowState.AwaitingSystem ?: return
        scope.launch { dispatch(PermissionFlowEvent.SystemAnswered(requester.snapshot(current.nature))) }
    }

    internal fun onResumed() {
        val current = state as? PermissionFlowState.NeedsSettings ?: return
        scope.launch { dispatch(PermissionFlowEvent.Resumed(requester.snapshot(current.nature))) }
    }

    private fun dispatch(event: PermissionFlowEvent) {
        val transition = PermissionFlowReducer.reduce(state, event)
        state = transition.state
        when (val effect = transition.effect) {
            null -> Unit
            PermissionFlowEffect.RunIntent -> pending?.complete(true)
            PermissionFlowEffect.AbandonIntent -> pending?.complete(false)
            is PermissionFlowEffect.LaunchSystemRequest -> launchSystem(effect.nature)
            PermissionFlowEffect.OpenSettings -> requester.openSettings()
        }
    }

    private fun launchSystem(nature: PermissionNature) {
        scope.launch {
            requester.markRequested(nature)
            launchSystemPermissions(requester.systemPermissions(nature))
        }
    }
}

/**
 * Crée la porte unique et la câble au système : lanceur de permissions, retour au premier plan
 * (retour des Réglages). Une seule par écran suffit ; elle se pose avec [PermissionFlowHost].
 */
@Composable
public fun rememberPermissionFlow(): PermissionFlow {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val flow = remember(context, scope) {
        PermissionFlow(MediaPermissionRequester(context, PermissionRequestHistory.shared(context)), scope)
    }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { _ ->
        flow.onSystemAnswered()
    }
    SideEffect {
        flow.launchSystemPermissions = { permissions -> launcher.launch(permissions) }
    }
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner, flow) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) flow.onResumed()
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }
    return flow
}

/** Affiche ce que [flow] demande : la feuille d'explication, ou la carte « Ouvrir les Réglages ». */
@Composable
public fun PermissionFlowHost(
    flow: PermissionFlow,
    modifier: Modifier = Modifier,
    accent: Color = MeeshyPalette.Indigo500,
) {
    when (val state = flow.state) {
        is PermissionFlowState.Explaining -> PermissionRationaleSheet(
            nature = state.nature,
            onContinue = flow::onExplanationAccepted,
            onDismiss = flow::onDismissed,
            modifier = modifier,
            accent = accent,
        )
        is PermissionFlowState.NeedsSettings -> Dialog(
            onDismissRequest = flow::onDismissed,
            properties = DialogProperties(usePlatformDefaultWidth = false),
        ) {
            Box(Modifier.padding(horizontal = MeeshySpacing.xl)) {
                PermissionDeniedCard(
                    nature = state.nature,
                    onOpenSettings = flow::onOpenSettingsTapped,
                    onDismiss = flow::onDismissed,
                    modifier = modifier.background(
                        MeeshyTheme.tokens.backgroundPrimary,
                        RoundedCornerShape(MeeshyRadius.xl),
                    ),
                    accent = accent,
                )
            }
        }
        PermissionFlowState.Idle, is PermissionFlowState.AwaitingSystem -> Unit
    }
}
