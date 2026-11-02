package me.meeshy.sdk.model.game.photo

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/*
 * LE DÉROULÉ DE LA PHOTO (#9382, #13891) — un réducteur PUR, miroir de `GamePhotoFlow` (iOS) et de
 * `apps/web/src/lib/game-photo/flow.ts` : proposition → caméra → frappe en place → résultat. L'écran envoie des
 * événements et lit l'étape ; il ne peut pas produire une étape impossible (déclencher une caméra qui n'est pas vivante,
 * garder avant d'avoir composé) : un événement hors de son étape est ignoré.
 *
 * Le refus de la caméra n'est pas une impasse : sa raison est NOMMÉE dans l'état, et la galerie comme la carte seule
 * restent possibles depuis tous ses états.
 */

/** Comment la photo du moment a été faite. */
@Serializable
public enum class PhotoMode {
    @SerialName("selfie") Selfie,
    @SerialName("card") Card,
    @SerialName("gallery") Gallery,
}

/** Pourquoi la caméra ne s'ouvre pas : refusée, absente de l'appareil, ou occupée ailleurs. */
public enum class CameraFailure { Denied, Unsupported, Unavailable }

public sealed interface PhotoCameraPhase {
    public data object Opening : PhotoCameraPhase
    public data object Live : PhotoCameraPhase
    public data class Failed(val reason: CameraFailure) : PhotoCameraPhase
}

public sealed interface PhotoFlowState {
    public data object Offer : PhotoFlowState
    public data class Camera(val phase: PhotoCameraPhase) : PhotoFlowState
    public data class Striking(val mode: PhotoMode) : PhotoFlowState
    /** `kept` : `null` tant que « Garder » n'a pas été touché, puis le verdict du carnet. */
    public data class Result(val mode: PhotoMode, val kept: Boolean?) : PhotoFlowState
    public data object Failed : PhotoFlowState
    public data class Done(val deferred: Boolean) : PhotoFlowState
}

public sealed interface PhotoFlowEvent {
    public data object Selfie : PhotoFlowEvent
    public data object Card : PhotoFlowEvent
    public data object Later : PhotoFlowEvent
    public data object Close : PhotoFlowEvent
    public data object CameraReady : PhotoFlowEvent
    public data class CameraFailed(val reason: CameraFailure) : PhotoFlowEvent
    public data object Shutter : PhotoFlowEvent
    public data object Gallery : PhotoFlowEvent
    public data object Composed : PhotoFlowEvent
    public data object ComposeFailed : PhotoFlowEvent
    public data class Kept(val ok: Boolean) : PhotoFlowEvent
}

public object GamePhotoFlow {

    public fun reduce(state: PhotoFlowState, event: PhotoFlowEvent): PhotoFlowState {
        if (state is PhotoFlowState.Done) return state
        if (event == PhotoFlowEvent.Close) return PhotoFlowState.Done(deferred = false)
        return when (state) {
            PhotoFlowState.Offer -> fromOffer(state, event)
            is PhotoFlowState.Camera -> fromCamera(state, event)
            is PhotoFlowState.Striking -> when (event) {
                PhotoFlowEvent.Composed -> PhotoFlowState.Result(state.mode, kept = null)
                PhotoFlowEvent.ComposeFailed -> PhotoFlowState.Failed
                else -> state
            }
            is PhotoFlowState.Result -> if (event is PhotoFlowEvent.Kept) state.copy(kept = event.ok) else state
            PhotoFlowState.Failed, is PhotoFlowState.Done -> state
        }
    }

    private fun fromOffer(state: PhotoFlowState, event: PhotoFlowEvent): PhotoFlowState = when (event) {
        PhotoFlowEvent.Selfie -> PhotoFlowState.Camera(PhotoCameraPhase.Opening)
        PhotoFlowEvent.Card -> PhotoFlowState.Striking(PhotoMode.Card)
        PhotoFlowEvent.Later -> PhotoFlowState.Done(deferred = true)
        else -> state
    }

    private fun fromCamera(state: PhotoFlowState.Camera, event: PhotoFlowEvent): PhotoFlowState = when {
        event == PhotoFlowEvent.CameraReady && state.phase == PhotoCameraPhase.Opening ->
            PhotoFlowState.Camera(PhotoCameraPhase.Live)
        event is PhotoFlowEvent.CameraFailed -> PhotoFlowState.Camera(PhotoCameraPhase.Failed(event.reason))
        event == PhotoFlowEvent.Shutter && state.phase == PhotoCameraPhase.Live -> PhotoFlowState.Striking(PhotoMode.Selfie)
        event == PhotoFlowEvent.Gallery -> PhotoFlowState.Striking(PhotoMode.Gallery)
        event == PhotoFlowEvent.Card -> PhotoFlowState.Striking(PhotoMode.Card)
        else -> state
    }
}
