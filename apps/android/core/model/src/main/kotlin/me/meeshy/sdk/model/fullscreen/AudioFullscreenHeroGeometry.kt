package me.meeshy.sdk.model.fullscreen

import me.meeshy.sdk.model.appearance.AvatarRingDecor

public data class AudioFullscreenHeroGeometry(
    val portraitDiameter: Float,
    val avatarFootprint: Float,
    val decorRoom: Float,
    val decorOuterRadius: Float?,
    val ringInnerRadius: Float,
    val ringOuterRadius: Float,
    val side: Float,
    val cursorOrbit: Float,
) {
    public companion object {
        public fun of(portraitDiameter: Float, decor: AvatarRingDecor?): AudioFullscreenHeroGeometry =
            AudioFullscreenHeroGeometry(0f, 0f, 0f, null, 0f, 0f, 0f, 0f)

        public fun resolve(width: Float, height: Float, decor: AvatarRingDecor?): AudioFullscreenHeroGeometry =
            of(0f, decor)
    }
}
