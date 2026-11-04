package me.meeshy.sdk.model.fullscreen

import me.meeshy.sdk.model.appearance.AvatarRingDecor

/**
 * **Le héros du plein écran audio, mesuré sans vue** : le portrait de l'auteur, sa décoration de profil, l'anneau de
 * 72 barres qui l'entoure et le curseur qui y orbite. Une seule loi dit où chaque chose se tient, pour que la décoration
 * ne chevauche jamais la bande de l'anneau (la décoration SERT l'auteur ; l'anneau SERT la lecture — ils ne se disputent
 * pas la même place).
 *
 * Le diamètre vient de [AudioFullscreenLayout] (une seule source du bornage 72–168 dp) ; l'avatar ne déclare AUCUNE place
 * libre au film de décoration ([decorRoom] = 0) : l'avatar, son contour et ses films se réduisent ensemble pour tenir dans
 * [portraitDiameter] ([AvatarRingDecor.fit]), donc [decorOuterRadius] ne dépasse jamais le portrait et l'écart [AudioDialGeometry.GAP]
 * reste libre.
 */
public data class AudioFullscreenHeroGeometry(
    val portraitDiameter: Float,
    /** Ce que l'avatar posé (film de décoration compris) occupe : le portrait, jamais plus. */
    val avatarFootprint: Float,
    /** La place libre que l'hôte déclare au film de décoration autour du portrait : aucune. */
    val decorRoom: Float,
    /** Le rayon extérieur du film de décoration posé ; `null` sans décoration. */
    val decorOuterRadius: Float?,
    /** Où les barres commencent. */
    val ringInnerRadius: Float,
    /** Où la bande saisissable finit. */
    val ringOuterRadius: Float,
    /** Le côté du cadran entier. */
    val side: Float,
    /** Le rayon sur lequel le curseur orbite : le milieu des barres. */
    val cursorOrbit: Float,
) {
    public companion object {
        public fun of(portraitDiameter: Float, decor: AvatarRingDecor?): AudioFullscreenHeroGeometry {
            val radius = portraitDiameter / 2f
            val decorSide = decor?.fit(portraitDiameter.toDouble(), DECOR_ROOM.toDouble())?.side?.toFloat()
            val ringInner = radius + AudioDialGeometry.GAP
            return AudioFullscreenHeroGeometry(
                portraitDiameter = portraitDiameter,
                avatarFootprint = decorSide ?: portraitDiameter,
                decorRoom = DECOR_ROOM,
                decorOuterRadius = decorSide?.div(2f),
                ringInnerRadius = ringInner,
                ringOuterRadius = radius + AudioDialGeometry.BAND,
                side = portraitDiameter + 2 * AudioDialGeometry.BAND,
                cursorOrbit = ringInner + AudioDialGeometry.BAR_LENGTH / 2f,
            )
        }

        public fun resolve(width: Float, height: Float, decor: AvatarRingDecor?): AudioFullscreenHeroGeometry =
            of(AudioFullscreenLayout.resolve(width, height).heroDiameter, decor)

        private const val DECOR_ROOM: Float = 0f
    }
}
