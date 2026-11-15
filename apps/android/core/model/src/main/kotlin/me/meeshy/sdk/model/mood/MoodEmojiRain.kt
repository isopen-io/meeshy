package me.meeshy.sdk.model.mood

import kotlin.math.PI
import kotlin.math.sin
import kotlin.random.Random

/**
 * Une instance de l'emoji d'une humeur qui PEUPLE sa page plein écran (iOS `MoodEmojiParticle`).
 * Coordonnées relatives figées à la naissance : tout ce qui se voit se DÉRIVE de l'horloge.
 */
data class MoodEmojiParticle(
    val id: Int,
    val birth: Double,
    val lifetime: Double,
    val originX: Double,
    val originY: Double,
    val phase: Double,
    val amplitude: Double,
)

data class MoodEmojiParticleFrame(val centerX: Float, val centerY: Float, val size: Float, val opacity: Float)

/** L'état de la pluie : les particules VIVANTES, rien d'autre — une particule au bout de sa vie en est retirée. */
data class MoodEmojiRainState(
    val particles: List<MoodEmojiParticle> = emptyList(),
    val nextId: Int = 0,
    val lastSpawn: Double? = null,
) {
    fun advanced(now: Double, random: Random): MoodEmojiRainState {
        val alive = particles.filter { MoodEmojiRain.progress(it, now) < 1.0 }
        val due = lastSpawn?.let { now - it >= MoodEmojiRain.SPAWN_INTERVAL } ?: true
        if (!due || alive.size >= MoodEmojiRain.MAX_PARTICLES) return copy(particles = alive)
        return MoodEmojiRainState(
            particles = alive + MoodEmojiRain.makeParticle(nextId, now, random),
            nextId = nextId + 1,
            lastSpawn = now,
        )
    }
}

/**
 * Les LOIS de la pluie (iOS `MoodEmojiRain`) : plafond, cadence, projection d'une particule.
 * Une particule naît petite, grossit en oscillant et devient transparente à mesure qu'elle
 * grossit : elle l'est TOTALEMENT quand sa taille atteint la moitié de la largeur de l'écran.
 */
object MoodEmojiRain {
    const val MAX_PARTICLES = 12
    const val SPAWN_INTERVAL = 0.4
    const val MIN_LIFETIME = 3.0
    const val MAX_LIFETIME = 4.6
    const val BIRTH_SIZE = 22f
    const val VANISHING_WIDTH_FRACTION = 0.5f

    fun vanishingSize(width: Float): Float = maxOf(BIRTH_SIZE, width * VANISHING_WIDTH_FRACTION)

    fun progress(particle: MoodEmojiParticle, now: Double): Double =
        if (particle.lifetime <= 0.0) 1.0 else ((now - particle.birth) / particle.lifetime).coerceIn(0.0, 1.0)

    fun size(progress: Double, width: Float): Float =
        BIRTH_SIZE + (vanishingSize(width) - BIRTH_SIZE) * progress.toFloat()

    /** Décroît avec la TAILLE : 1 à la naissance, 0 à la moitié de la largeur. */
    fun opacity(size: Float, width: Float): Float {
        val span = vanishingSize(width) - BIRTH_SIZE
        if (span <= 0f) return 0f
        return (1f - (size - BIRTH_SIZE) / span).coerceIn(0f, 1f)
    }

    fun frame(particle: MoodEmojiParticle, now: Double, width: Float, height: Float): MoodEmojiParticleFrame {
        val progress = progress(particle, now)
        val size = size(progress, width)
        val elapsed = now - particle.birth
        val sway = sin(particle.phase + elapsed * 2.0 * PI * 0.55) * particle.amplitude * width
        val rise = progress * 0.08 * height
        return MoodEmojiParticleFrame(
            centerX = (particle.originX * width + sway).toFloat(),
            centerY = (particle.originY * height - rise).toFloat(),
            size = size,
            opacity = opacity(size, width),
        )
    }

    fun makeParticle(id: Int, birth: Double, random: Random) = MoodEmojiParticle(
        id = id,
        birth = birth,
        lifetime = random.nextDouble(MIN_LIFETIME, MAX_LIFETIME),
        originX = random.nextDouble(0.08, 0.92),
        originY = random.nextDouble(0.08, 0.92),
        phase = random.nextDouble(0.0, 2.0 * PI),
        amplitude = random.nextDouble(0.015, 0.05),
    )
}
