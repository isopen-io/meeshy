package me.meeshy.app.calls

import me.meeshy.sdk.model.call.CallCameraMirror
import me.meeshy.sdk.model.call.CallVideoRole

/** L'aperçu de MA caméra se retourne seulement pour l'avant (loi [CallCameraMirror]) ; le flux envoyé ne l'est jamais. */
internal val CallUiState.mirrorsLocalPreview: Boolean
    get() = CallCameraMirror.isMirrored(
        CallCameraMirror.displayedFacing(live = null, intendedFront = isFrontCamera),
        CallVideoRole.LocalPreview,
    )
