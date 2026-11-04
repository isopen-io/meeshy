package me.meeshy.sdk.model.fullscreen

import me.meeshy.sdk.model.playback.AudioPlaybackState

/**
 * **Ce qu'une page du plein écran audio voit du moteur** (miroir de `AudioFullscreenPlaybackScope`,
 * `AudioFullscreenPlayback.swift`) : la page dont la piste est chargée suit le moteur tic par tic ; toute autre ne voit que
 * le REPOS — aucune piste, seule la vitesse, réglage global, la traverse. Deux relevés du moteur sur une autre piste donnent
 * donc la même vue : une page voisine ne se refait pas à chaque tic de progression.
 */
public object AudioFullscreenPlaybackScope {

    public fun of(engine: AudioPlaybackState, pageAttachmentId: String): AudioPlaybackState =
        if (engine.attachmentId == pageAttachmentId) engine else AudioPlaybackState(speed = engine.speed)
}
