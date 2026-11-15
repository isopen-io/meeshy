package me.meeshy.ui.component.media

import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.LoadControl

/**
 * **Ce qu'un lecteur vivant du compositeur charge d'avance** (#13897, recette S8 du 2026-11-01 à 0 h 51) : quelques
 * secondes, et jamais plus de [MAX_BYTES]. Le réglage par défaut de Media3 charge jusqu'à 50 s de source et permet 131 Mo
 * par piste vidéo : un fond de 8,2 s et une vidéo posée de 15,6 s, lus depuis l'appareil, tenaient 220,7 Mo du tas de
 * 256 Mo d'Android 9 — l'export, lancé par-dessus, mourait en OutOfMemoryError. Une source locale se relit à la demande :
 * la scène n'a besoin que de l'avance qui garde la lecture continue, et démarre dès la première demi-seconde.
 */
@OptIn(UnstableApi::class)
internal object ComposerLiveBuffer {
    const val MAX_BYTES: Int = 8 * 1024 * 1024
    const val MAX_AHEAD_MILLIS: Int = 4_000
    private const val MIN_AHEAD_MILLIS = 2_000
    private const val START_AHEAD_MILLIS = 500
    private const val RESTART_AHEAD_MILLIS = 1_000

    fun loadControl(): LoadControl = DefaultLoadControl.Builder()
        .setBufferDurationsMs(MIN_AHEAD_MILLIS, MAX_AHEAD_MILLIS, START_AHEAD_MILLIS, RESTART_AHEAD_MILLIS)
        .setTargetBufferBytes(MAX_BYTES)
        .setPrioritizeTimeOverSizeThresholds(false)
        .build()
}
