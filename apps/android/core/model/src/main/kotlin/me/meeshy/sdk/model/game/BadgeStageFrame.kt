package me.meeshy.sdk.model.game

/**
 * Ce que la chorégraphie d'allumage d'un badge montre à l'instant [seconds] (miroir de `BadgeStage`, iOS) : la matière
 * remonte du bas en 0,7 s ([fill], 0 = empreinte seule, 1 = matière pleine), le reflet parcourt la face de 0,3 s à la
 * fin, uniquement à l'allumage. `null` : au repos. Sous mouvement réduit, un fondu empreinte -> matière ([crossfade]).
 */
data class BadgeStageFrame(val fill: Double, val sheen: Double, val moving: Boolean, val crossfade: Boolean) {
    companion object {
        private const val SHEEN_FROM = 0.3

        fun at(lit: Boolean, seconds: Double?, reduceMotion: Boolean): BadgeStageFrame {
            if (seconds == null) return BadgeStageFrame(if (lit) 1.0 else 0.0, 0.0, moving = false, crossfade = false)
            if (reduceMotion) {
                val fade = minOf(1.0, seconds / GameTimeline.REDUCED_DURATION)
                return BadgeStageFrame(if (lit) fade else 1 - fade, 0.0, moving = false, crossfade = true)
            }
            val sheen = if (lit) GameTimeline.window(seconds, SHEEN_FROM, GameTimeline.BADGE_DURATION) else 0.0
            return BadgeStageFrame(GameTimeline.badgeFill(lit, seconds), sheen, moving = true, crossfade = false)
        }
    }
}
