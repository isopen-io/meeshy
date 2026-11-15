package me.meeshy.sdk.model.game

import kotlin.math.floor

/*
 * Le carré QR du bandeau de parrainage et la géométrie du bandeau (#9554). MIROIR de
 * `apps/web/src/lib/game-photo/referral-qr.ts`, `bannerOf` (`layout.ts`) et de `GameReferralQR.swift`.
 *
 * Le carré se mesure dans les pixels de l'image exportée : un module fait un nombre ENTIER de pixels (deux au
 * moins), et la matrice est centrée dans un carré clair qui lui laisse sa marge de silence de 4 modules. Un
 * lien que la place ne rendrait pas lisible ne rend pas de carré ; une place sans lien non plus.
 */

public data class GameReferralQrSquare(
    /** Le côté du carré clair, marge de silence comprise. */
    val side: Int,
    /** Le côté de la matrice, en modules. */
    val size: Int,
    /** Le côté d'un module, en pixels entiers. */
    val module: Int,
    /** Où commence la matrice dans le carré, sur les deux axes. */
    val origin: Int,
    val runs: List<Run>,
) {
    /** Une suite horizontale de modules sombres, en pixels du carré. */
    public data class Run(val x: Int, val y: Int, val width: Int, val height: Int)

    public companion object {
        public const val QUIET_MODULES: Int = 4
        public const val MIN_MODULE_PIXELS: Int = 2

        /** Le carré du lien, dans une place de [side] pixels ; `null` sans lien, ou sans deux pixels par module. */
        public fun make(link: String?, side: Int): GameReferralQrSquare? {
            if (link.isNullOrEmpty() || side <= 0) return null
            val room = side / MIN_MODULE_PIXELS - QUIET_MODULES * 2
            val matrix = GameQrCode.encode(link, maxVersion = (room - 17) / 4) ?: return null
            val module = side / (matrix.size + QUIET_MODULES * 2)
            val origin = (side - matrix.size * module) / 2
            val runs = matrix.modules.flatMapIndexed { y, row -> runsOf(row, y, module, origin) }
            return GameReferralQrSquare(side, matrix.size, module, origin, runs)
        }

        private fun runsOf(row: List<Boolean>, y: Int, module: Int, origin: Int): List<Run> {
            val runs = ArrayList<Run>()
            row.forEachIndexed { x, dark ->
                if (!dark) return@forEachIndexed
                val left = origin + x * module
                val last = runs.lastOrNull()
                if (last != null && last.x + last.width == left) {
                    runs[runs.size - 1] = last.copy(width = last.width + module)
                } else {
                    runs.add(Run(left, origin + y * module, module, module))
                }
            }
            return runs
        }
    }
}

/** Un rectangle du repère du bandeau, en pixels. */
public data class GameBannerRect(val x: Double, val y: Double, val width: Double, val height: Double) {
    val maxX: Double get() = x + width
    val midX: Double get() = x + width / 2
}

/** Ce que le bandeau montre à la place du carré. */
public enum class GameReferralSlot { Hidden, Placeholder, Qr }

/**
 * La géométrie du bandeau dans son repère : la Signature en début de ligne, la phrase, la Flamme, et le carré
 * QR en FIN de ligne — le bandeau se retourne en entier en arabe.
 */
public data class GameReferralBannerMetrics(
    val width: Double,
    val height: Double,
    val rightToLeft: Boolean,
    val signature: GameBannerRect,
    val title: GameBannerRect,
    val titleSize: Double,
    val flame: GameBannerRect,
    val flameLabel: GameBannerRect,
    val flameLabelSize: Double,
    val qr: GameBannerRect,
) {
    public companion object {
        private fun roundHalfAway(value: Double): Double = floor(value + 0.5)

        public fun make(width: Double, height: Double, rightToLeft: Boolean = false, hasFlame: Boolean = true): GameReferralBannerMetrics {
            val w = roundHalfAway(width)
            val pad = height * 0.14
            val signatureSide = height * 0.4
            val signature = GameBannerRect(pad, (height - signatureSide) / 2, signatureSide, signatureSide)
            val qrSide = roundHalfAway(height * 0.84)
            val qrInset = roundHalfAway((height - qrSide) / 2)
            val qr = GameBannerRect(w - qrInset - qrSide, qrInset, qrSide, qrSide)
            val flameSide = height * 0.36
            val flame = GameBannerRect(qr.x - pad * 0.7 - flameSide, height * 0.2, flameSide, flameSide)
            val textStart = signature.maxX + pad * 0.6
            val textEnd = (if (hasFlame) flame.x else qr.x - pad * 0.7) - height * 0.06
            val title = GameBannerRect(textStart, 0.0, maxOf(0.0, textEnd - textStart), height)
            val labelSize = height * 0.13
            val labelWidth = flameSide * 1.3
            val flameLabel = GameBannerRect(flame.midX - labelWidth / 2, height * 0.8 - labelSize, labelWidth, labelSize * 1.3)

            fun placed(rect: GameBannerRect) =
                if (rightToLeft) rect.copy(x = w - rect.x - rect.width) else rect
            return GameReferralBannerMetrics(
                width = width, height = height, rightToLeft = rightToLeft,
                signature = placed(signature), title = placed(title), titleSize = height * 0.18,
                flame = placed(flame), flameLabel = placed(flameLabel), flameLabelSize = labelSize,
                qr = placed(qr),
            )
        }

        /**
         * JAMAIS de bandeau sans lien (conformité H-8) : sans lien, rien — sauf dans l'APERÇU, où la place du
         * carré est un emplacement vide cerné de pointillés (le jeton ne se crée qu'au toucher de « Partager »).
         */
        public fun slot(link: String?, preview: Boolean): GameReferralSlot = when {
            !link.isNullOrEmpty() -> GameReferralSlot.Qr
            preview -> GameReferralSlot.Placeholder
            else -> GameReferralSlot.Hidden
        }
    }
}
