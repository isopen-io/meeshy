package me.meeshy.sdk.model.game

/**
 * LES EMBLÈMES DES ÉTINCELLES ET DES ÉLANS — leur GÉOMÉTRIE dans le carré de 72 des badges. Miroir forme pour forme de
 * `apps/web/src/lib/game/concept-emblems.ts` (`CONCEPT_EMBLEMS`) et de `ConceptEmblemDesign` (iOS) : une table, aucune
 * couleur — la peinture nomme une matière du jeu, le ton un jeton d'accent.
 */
public enum class ConceptEmblemKind { Points, Elans }

public enum class ConceptEmblemPaint { Indigo, Flame }

/** `Ink` : l'encre de la matière ; `Gold` : la peinture or. */
public enum class ConceptEmblemTone { Ink, Gold }

public data class EmblemPoint(val x: Float, val y: Float)

public sealed interface ConceptEmblemBody {
    public data class Circle(val cx: Float, val cy: Float, val r: Float) : ConceptEmblemBody
    public data class Rect(val x: Float, val y: Float, val width: Float, val height: Float, val rx: Float) : ConceptEmblemBody
}

public sealed interface ConceptEmblemAccent {
    public val tone: ConceptEmblemTone

    /** Une forme pleine, polygone fermé donné par ses sommets. */
    public data class Spark(val points: List<EmblemPoint>, override val tone: ConceptEmblemTone) : ConceptEmblemAccent

    /** Un trait à bouts ronds, ligne brisée ouverte. */
    public data class Chevron(val points: List<EmblemPoint>, val strokeWidth: Float, override val tone: ConceptEmblemTone) : ConceptEmblemAccent
}

/** Le centre et le côté de la Signature (carré de 1 024 ramené à [size]) et l'épaisseur de son trait dans ce repère. */
public data class ConceptEmblemSignature(val cx: Float, val cy: Float, val size: Float, val strokeWidth: Float)

public data class ConceptEmblemDesign(
    val paint: ConceptEmblemPaint,
    val body: ConceptEmblemBody,
    val signature: ConceptEmblemSignature,
    val accents: List<ConceptEmblemAccent>,
) {
    public companion object {
        public const val BOX: Float = 72f

        public fun of(kind: ConceptEmblemKind): ConceptEmblemDesign = when (kind) {
            ConceptEmblemKind.Points -> POINTS
            ConceptEmblemKind.Elans -> ELANS
        }

        private fun pts(vararg xy: Float): List<EmblemPoint> = xy.toList().chunked(2).map { EmblemPoint(it[0], it[1]) }

        private val POINTS = ConceptEmblemDesign(
            paint = ConceptEmblemPaint.Indigo,
            body = ConceptEmblemBody.Circle(cx = 34f, cy = 38f, r = 28f),
            signature = ConceptEmblemSignature(cx = 34f, cy = 38f, size = 38f, strokeWidth = 100f),
            accents = listOf(
                ConceptEmblemAccent.Spark(
                    pts(56f, 4f, 59f, 13f, 68f, 16f, 59f, 19f, 56f, 28f, 53f, 19f, 44f, 16f, 53f, 13f),
                    ConceptEmblemTone.Gold,
                ),
            ),
        )

        private val ELANS = ConceptEmblemDesign(
            paint = ConceptEmblemPaint.Flame,
            body = ConceptEmblemBody.Rect(x = 8f, y = 8f, width = 56f, height = 56f, rx = 18f),
            signature = ConceptEmblemSignature(cx = 36f, cy = 47f, size = 32f, strokeWidth = 104f),
            accents = listOf(
                ConceptEmblemAccent.Chevron(pts(23f, 30f, 36f, 17f, 49f, 30f), strokeWidth = 6f, tone = ConceptEmblemTone.Ink),
            ),
        )
    }
}

/**
 * L'ENTRÉE EN SCÈNE des cartes de la première page (miroir de `GameStaggeredEntrance`, iOS) : 0,04 s par rang
 * plafonnées à 0,4 s, une montée de 14 dp et une opacité de 0,35 à 1. Jouée UNE fois : tant que l'hôte garde `entered`,
 * rien ne rejoue au retour d'une fiche ; sous « réduire les animations », la carte est simplement là.
 */
public object GameStaggeredEntranceLaw {
    public const val STEP_SECONDS: Double = 0.04
    public const val CAP_SECONDS: Double = 0.4
    public const val RISE_DP: Float = 14f
    public const val START_OPACITY: Float = 0.35f

    public fun delaySeconds(index: Int): Double = minOf(index.coerceAtLeast(0) * STEP_SECONDS, CAP_SECONDS)

    public fun delayMillis(index: Int): Int = Math.round(delaySeconds(index) * 1000).toInt()

    /** La carte est posée (sans animation) quand elle est déjà entrée, ou sous mouvement réduit. */
    public fun isResting(entered: Boolean, reduceMotion: Boolean): Boolean = entered || reduceMotion

    /** Une entrée ne se joue que si la page n'a pas encore été « entrée » et que le mouvement est permis. */
    public fun plays(entered: Boolean, reduceMotion: Boolean): Boolean = !isResting(entered, reduceMotion)
}
