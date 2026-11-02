package me.meeshy.app.game.ceremony

import android.content.Context
import android.os.PowerManager
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableDoubleStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameMillis
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import java.time.LocalDate
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import me.meeshy.app.game.pages.count
import me.meeshy.feature.game.R
import me.meeshy.sdk.model.game.GameHapticPattern
import me.meeshy.sdk.model.game.MeeshEdition
import me.meeshy.sdk.model.game.ceremony.GameMintCeremony
import me.meeshy.sdk.model.game.ceremony.GameMintSettlement
import me.meeshy.sdk.model.game.ceremony.MintCeremonyChoreography
import me.meeshy.sdk.model.game.ceremony.MintCeremonyPaint
import me.meeshy.sdk.model.game.ceremony.MintCeremonyRequest
import me.meeshy.sdk.model.game.ceremony.MintCeremonyRun
import me.meeshy.sdk.model.game.ceremony.MintRefusalReason
import me.meeshy.sdk.model.game.ceremony.PreparedMintCeremony
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.component.game.rememberGameHaptics

internal const val MINT_CEREMONY_TAG = "game.mint.ceremony"

/**
 * LA CÉRÉMONIE PRÉSENTÉE (miroir de `MintCeremonyCover` iOS, #11177) — l'écran qui frappe pose [request] au toucher ;
 * la cérémonie s'ouvre aussitôt en plein écran et se referme d'elle-même à la fin, ou au toucher ([onFinish]). La
 * réponse de la passerelle ([settlement]) lui parvient pendant le tissage : l'attente se cache dans le geste, jamais
 * dans un indicateur de chargement — et AUCUN coup ne tombe, aucune vibration ne part, avant elle.
 */
@Composable
internal fun MintCeremonyCover(
    request: MintCeremonyRequest?,
    settlement: GameMintSettlement?,
    glory: Int,
    prepared: PreparedMintCeremony?,
    onFinish: () -> Unit,
) {
    if (request == null) return
    key(request) { MintCeremonyHost(request, settlement, glory, prepared, onFinish) }
}

/**
 * La conduite vit dans l'écran qui frappe, la fenêtre plein écran ne fait que la peindre : une fenêtre recréée par le
 * système ne rejoue ni la réponse, ni un coup, ni une vibration.
 */

@Composable
private fun MintCeremonyHost(
    request: MintCeremonyRequest,
    settlement: GameMintSettlement?,
    glory: Int,
    prepared: PreparedMintCeremony?,
    onFinish: () -> Unit,
) {
    val reduced = LocalReduceMotion.current
    val haptics = rememberGameHaptics()
    val modest = rememberModestDevice()
    val finish by rememberUpdatedState(onFinish)
    var run by remember { mutableStateOf(MintCeremonyRun.start(request, reduced, modest, prepared)) }
    var nowMs by remember { mutableDoubleStateOf(0.0) }
    var stride by remember { mutableIntStateOf(1) }

    LaunchedEffect(Unit) {
        val start = withFrameMillis { it }
        var last = start
        var slow = 0
        while (!run.isFinished) {
            withFrameMillis { frame ->
                slow = if (frame - last > SLOW_FRAME_MILLIS) slow + 1 else maxOf(0, slow - 1)
                if (slow >= SLOW_FRAMES) stride = 2
                last = frame
                nowMs = (frame - start).toDouble()
            }
        }
    }
    LaunchedEffect(Unit) {
        delay(GameMintCeremony.PENDING_LIMIT_MS.toLong())
        run = run.timedOut(maxOf(nowMs, GameMintCeremony.PENDING_LIMIT_MS))
    }
    val answer = request.answer(settlement)
    LaunchedEffect(answer) { run = run.receive(answer, nowMs) }
    val conducted = run
    LaunchedEffect(conducted.answeredAtMs, conducted.mode, conducted.isFinished) {
        if (conducted.isFinished) {
            finish()
            return@LaunchedEffect
        }
        val at = nowMs
        conducted.blows(at).forEach { blow ->
            launch {
                delay((blow.delaySeconds * 1000).toLong())
                haptics.play(GameHapticPattern.ceremonyBlow(blow.isFinal))
            }
        }
        val end = conducted.endMs(at) ?: return@LaunchedEffect
        delay((end - at).toLong().coerceAtLeast(0L))
        run = run.finished()
    }

    val plan = run.plan(nowMs)
    val t = nowMs / 1000
    val frame = MintCeremonyChoreography.frame(plan, t)
    val paint = if (run.reduced) EMPTY_PAINT else run.particles.paint(plan, t, stride)
    val words = MintCeremonyWords(
        light = stringResource(R.string.game_frappe_light),
        tchak = stringResource(R.string.game_frappe_tchak),
        tchakFinal = stringResource(R.string.game_frappe_tchak_final),
        ancestors = stringResource(R.string.game_frappe_ancestors_title),
        ancestorsLine = stringResource(if (run.edition == MeeshEdition.Prism) R.string.game_frappe_ancestors_prism else R.string.game_frappe_ancestors_gold),
        say = run.refusal?.let { stringResource(refusedText(it)) } ?: stringResource(sayText(run.edition), count(run.number)),
        glory = stringResource(R.string.game_frappe_glory, count(glory)),
    )
    val skipHint = stringResource(R.string.game_frappe_skip)
    val year = remember { LocalDate.now().year }
    val skip = { run = run.finished() }
    Dialog(
        onDismissRequest = skip,
        properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false, dismissOnClickOutside = false),
    ) {
        Box(
            Modifier
                .fillMaxSize()
                .testTag(MINT_CEREMONY_TAG)
                .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, onClick = skip)
                .semantics {
                    contentDescription = words.say
                    role = Role.Button
                    onClick(label = skipHint) {
                        skip()
                        true
                    }
                },
        ) {
            MintCeremonyScene(frame, paint, run.edition, run.look, run.number, year, run.reduced, words, Modifier.clearAndSetSemantics { })
            Text(
                skipHint,
                Modifier.align(Alignment.BottomEnd).padding(end = 14.dp, bottom = 10.dp).clearAndSetSemantics { },
                style = TextStyle(color = MintCeremonyPalette(run.edition).hint, fontSize = 11.sp),
            )
        }
    }
}

private fun sayText(edition: MeeshEdition): Int = when (edition) {
    MeeshEdition.Silver -> R.string.game_frappe_say_silver
    MeeshEdition.Gold -> R.string.game_frappe_say_gold
    MeeshEdition.Prism -> R.string.game_frappe_say_prism
}

private fun refusedText(reason: MintRefusalReason): Int = when (reason) {
    MintRefusalReason.Shadow -> R.string.game_frappe_refused_shadow
    MintRefusalReason.Locked -> R.string.game_frappe_refused_locked
    MintRefusalReason.Light -> R.string.game_frappe_refused_light
    MintRefusalReason.Offline -> R.string.game_frappe_refused_offline
    MintRefusalReason.Other -> R.string.game_frappe_refused_unknown
}

/** Un appareil modeste : quatre cœurs ou moins, ou l'économie d'énergie. Moitié moins de particules. */
@Composable
internal fun rememberModestDevice(): Boolean {
    val context = LocalContext.current
    return remember(context) {
        val saving = (context.getSystemService(Context.POWER_SERVICE) as? PowerManager)?.isPowerSaveMode == true
        Runtime.getRuntime().availableProcessors() <= MODEST_CORES || saving
    }
}

private val EMPTY_PAINT = MintCeremonyPaint(emptyList(), 0)
private const val SLOW_FRAME_MILLIS = 24L
private const val SLOW_FRAMES = 4
private const val MODEST_CORES = 4
