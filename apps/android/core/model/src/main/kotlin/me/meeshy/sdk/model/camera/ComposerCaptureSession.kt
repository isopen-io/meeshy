package me.meeshy.sdk.model.camera

import java.util.concurrent.Executor

/** Ce que la file lance et arrête — la liaison CameraX en production, une doublure dans les témoins. */
interface ComposerCaptureRunning {
    val isRunning: Boolean
    fun start()
    fun stop()
}

/**
 * Une seule file série pour la session de capture (miroir de `ComposerCaptureSessionQueue` iOS, #9464).
 *
 * Lier et délier une caméra bloque le fil qui le fait ; deux exécuteurs qui s'en chargeaient ne s'ordonnaient pas, et
 * désarmer puis réarmer vite pouvait laisser un arrêt passer APRÈS le lancement — un viseur armé, noir. Tout passe
 * ici, dans l'ordre. Le lancement suit le DERNIER vœu : chaque passage relit le vœu au moment où l'exécuteur
 * l'exécute, donc une rafale arme / désarme / arme finit toujours en marche, et l'inverse à l'arrêt.
 *
 * [executor] doit être série (un fil, ou le fil principal) : c'est lui qui garantit l'ordre.
 */
class ComposerCaptureSession(private val executor: Executor) {
    @Volatile
    private var wantsRunning = false

    fun perform(work: () -> Unit) {
        executor.execute(work)
    }

    fun setRunning(running: Boolean, target: ComposerCaptureRunning) {
        wantsRunning = running
        executor.execute { converge(target) }
    }

    /** La session s'est arrêtée sans qu'on le demande : elle repart si le viseur la veut encore, jamais après un désarmement. */
    fun resumeIfWanted(target: ComposerCaptureRunning) {
        executor.execute { if (wantsRunning && !target.isRunning) target.start() }
    }

    private fun converge(target: ComposerCaptureRunning) {
        val wanted = wantsRunning
        if (wanted && !target.isRunning) target.start()
        if (!wanted && target.isRunning) target.stop()
    }
}
