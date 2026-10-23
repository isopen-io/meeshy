package me.meeshy.sdk.model.rootnav

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** Les durees du rideau, alignees sur iOS `LaunchSplashTiming`. */
object RootSplashTiming {
    /** Assez pour que le logo se pose ; pas assez pour qu'on l'attende. */
    const val FLOOR_MS: Long = 400
    const val CEILING_MS: Long = 2_000
    const val REVEAL_MS: Long = 300

    fun remainingFloor(elapsedMs: Long): Long = (FLOOR_MS - elapsedMs).coerceAtLeast(0)
    fun remainingCeiling(elapsedMs: Long): Long = (CEILING_MS - elapsedMs).coerceAtLeast(0)
}

/** Pourquoi le rideau s'est leve : le demarrage est pret, ou le plafond a tranche. */
sealed interface SplashReveal {
    data object Ready : SplashReveal
    data object Ceiling : SplashReveal
}

/**
 * Le rideau de demarrage : COVERING -> REVEALING -> GONE, une seule fois. Deux sorties, la
 * premiere gagne : [markReady] (session resolue, rideau leve des que le plancher est passe) et
 * [holdUntilCeiling] (au plafond le rideau tombe quoi que fasse le demarrage). Le plafond vit dans
 * SA coroutine, montee par le rideau lui-meme : un plafond pose dans la chaine qu'il doit borner
 * ne borne que ce qui le suit. Miroir de iOS `LaunchSplashController`.
 */
class RootSplashGate(
    private val elapsedMs: () -> Long,
    private val pause: suspend (Long) -> Unit = { delay(it) },
) {
    private val mutablePhase = MutableStateFlow(SplashPhase.COVERING)
    val phase: StateFlow<SplashPhase> = mutablePhase.asStateFlow()

    var reveal: SplashReveal? = null
        private set

    suspend fun markReady() {
        if (mutablePhase.value != SplashPhase.COVERING) return
        val wait = RootSplashTiming.remainingFloor(elapsedMs())
        if (wait > 0) pause(wait)
        lift(SplashReveal.Ready)
    }

    suspend fun holdUntilCeiling() {
        if (mutablePhase.value != SplashPhase.COVERING) return
        val wait = RootSplashTiming.remainingCeiling(elapsedMs())
        if (wait > 0) pause(wait)
        lift(SplashReveal.Ceiling)
    }

    private suspend fun lift(reason: SplashReveal) {
        if (mutablePhase.value != SplashPhase.COVERING) return
        reveal = reason
        mutablePhase.value = SplashPhase.REVEALING
        try {
            pause(RootSplashTiming.REVEAL_MS)
        } catch (cancelled: CancellationException) {
            mutablePhase.value = SplashPhase.GONE
            throw cancelled
        }
        mutablePhase.value = SplashPhase.GONE
    }
}
