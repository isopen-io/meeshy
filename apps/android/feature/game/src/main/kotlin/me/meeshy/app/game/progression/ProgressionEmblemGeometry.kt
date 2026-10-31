package me.meeshy.app.game.progression

import androidx.compose.ui.geometry.Offset
import me.meeshy.sdk.model.game.FlameFormKey

/**
 * La géométrie d'une marque de concept dans le carré de 72 — miroir de `ConceptEmblemDesign` (iOS) et de
 * `apps/web/src/lib/game/concept-emblems.ts`, forme pour forme : Points, un jeton indigo à étincelle d'or ; Élans, un
 * panneau couleur de flamme à chevron qui monte.
 */
internal data class ConceptMarkDesign(
    val paint: Paint,
    val body: Body,
    val signature: Signature,
    val accent: Accent,
) {
    enum class Paint { Indigo, Flame }

    sealed interface Body {
        data class Circle(val center: Offset, val radius: Float) : Body
        data class Panel(val left: Float, val top: Float, val side: Float, val radius: Float) : Body
    }

    sealed interface Accent {
        /** Une forme pleine peinte à l'or, liserée de blanc. */
        data class Spark(val points: List<Offset>) : Accent

        /** Un trait à bouts ronds, à l'encre de la matière. */
        data class Chevron(val points: List<Offset>, val lineWidth: Float) : Accent
    }

    data class Signature(val center: Offset, val size: Float, val strokeWidth: Float)

    companion object {
        const val BOX = 72f

        fun of(kind: ConceptMarkKind): ConceptMarkDesign = when (kind) {
            ConceptMarkKind.Points -> ConceptMarkDesign(
                paint = Paint.Indigo,
                body = Body.Circle(Offset(34f, 38f), 28f),
                signature = Signature(Offset(34f, 38f), size = 38f, strokeWidth = 100f),
                accent = Accent.Spark(
                    listOf(
                        Offset(56f, 4f), Offset(59f, 13f), Offset(68f, 16f), Offset(59f, 19f),
                        Offset(56f, 28f), Offset(53f, 19f), Offset(44f, 16f), Offset(53f, 13f),
                    ),
                ),
            )
            ConceptMarkKind.Elans -> ConceptMarkDesign(
                paint = Paint.Flame,
                body = Body.Panel(left = 8f, top = 8f, side = 56f, radius = 18f),
                signature = Signature(Offset(36f, 47f), size = 32f, strokeWidth = 104f),
                accent = Accent.Chevron(listOf(Offset(23f, 30f), Offset(36f, 17f), Offset(49f, 30f)), lineWidth = 6f),
            )
        }
    }
}

/** La Flamme dans le carré de 72 — miroir de `FlameView` (iOS) : cinq formes, de la braise au soleil. */
internal object FlameEmblemGeometry {
    const val BODY = "M36 10 c 12 16 22 26 18 42 a18 18 0 0 1 -36 0 c -2 -12 8 -18 10 -28 c 4 6 6 10 8 12 c 2 -8 2 -16 0 -26 z"
    val FOOT = Offset(36f, 70f)
    val HALO_CENTER = Offset(36f, 40f)
    val SIGNATURE_CENTER = Offset(36f, 54f)
    const val SIGNATURE_SIDE = 18f

    /** La hauteur de la flamme, de 0 à 1 : réduite autour de son pied, elle reste entière et grandit avec la série. */
    fun scale(form: FlameFormKey): Float = when (form) {
        FlameFormKey.Braise -> 0.45f
        FlameFormKey.Flamme -> 0.7f
        FlameFormKey.Brasier -> 0.95f
        FlameFormKey.Astre, FlameFormKey.Soleil -> 1f
    }

    fun carriesSignature(form: FlameFormKey): Boolean = form != FlameFormKey.Braise

    /** Le halo d'or en pointillé de l'Astre, plus large au Soleil ; aucun avant. */
    fun haloRadius(form: FlameFormKey): Float? = when (form) {
        FlameFormKey.Astre -> 25f
        FlameFormKey.Soleil -> 31f
        else -> null
    }
}

/** Le coffre du jour dans sa boîte de 90 × 72 — miroir de `ChestView` (iOS). */
internal object ChestEmblemGeometry {
    const val WIDTH = 90f
    const val HEIGHT = 72f
    const val ASPECT = WIDTH / HEIGHT
    const val CLOSED_LID = "M10 34 a35 22 0 0 1 70 0 z"
    const val OPEN_LID = "M20 30 l-6 -20 62 0 -6 20"
    const val SPARKLES = "M30 18 l-4 -8 M45 14 V4 M60 18 l4 -8"
}

/** La coupe dans sa boîte de 120 × 124 — miroir de `TrophyView` (iOS), sans tenants ni inscription. */
internal object CupEmblemGeometry {
    const val WIDTH = 120f
    const val HEIGHT = 124f
    const val ASPECT = WIDTH / HEIGHT
    const val HANDLES = "M30 22 c-17 0 -19 24 3 28 M90 22 c17 0 19 24 -3 28"
    const val BOWL = "M30 12 h60 v22 c0 22 -14 36 -30 38 c-16 -2 -30 -16 -30 -38 z"
}

/** Le tampon d'Atlas dans le carré de 72 — miroir de `AtlasStampView` (iOS). */
internal object AtlasStampGeometry {
    const val TILT = -6f

    /** Le code de la langue, en capitales ; « ·· » pour une langue à découvrir. */
    fun label(code: String): String = code.ifEmpty { "··" }.uppercase()
}
