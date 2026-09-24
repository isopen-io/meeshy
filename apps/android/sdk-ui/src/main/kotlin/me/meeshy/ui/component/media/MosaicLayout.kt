package me.meeshy.ui.component.media

import me.meeshy.sdk.model.MosaicLayoutMode

/**
 * Une tuile de la mosaïque, en FRACTIONS (0…1) de sa boîte. [index] désigne le
 * visuel ; [overflow] > 0 sur la DERNIÈRE tuile seulement, et compte ce qui
 * reste à voir, jamais le total.
 */
public data class MosaicTile(
    val index: Int,
    val x: Float,
    val y: Float,
    val width: Float,
    val height: Float,
    val overflow: Int = 0,
)

/** Ce que le rendu doit poser pour un nombre de visuels et un agencement donnés. */
public sealed interface MosaicArrangement {
    /** Aucun visuel. */
    public data object Empty : MosaicArrangement

    /** Un seul visuel : une mosaïque d'un élément n'en est pas une, quel que soit le mode. */
    public data object Single : MosaicArrangement

    /** Le carrousel : une page par visuel, aucun plafond ni report. */
    public data class Paged(val pageCount: Int) : MosaicArrangement

    /**
     * Une des quatre mosaïques. [aspectRatio] est le rapport HAUTEUR / LARGEUR de
     * la boîte, DÉCLARÉ par mode ; [span] est la largeur du contenu rapportée à
     * celle de la boîte, plus grande que 1 pour le défilement, qui déborde.
     */
    public data class Tiled(
        val mode: MosaicLayoutMode,
        val tiles: List<MosaicTile>,
        val aspectRatio: Float,
    ) : MosaicArrangement {
        val span: Float
            get() = tiles.lastOrNull()
                ?.takeIf { mode == MosaicLayoutMode.REEL }
                ?.let { maxOf(1f, it.x + it.width) }
                ?: 1f
    }
}

/**
 * **La géométrie des agencements d'une publication** (#6514), portée de
 * `MosaicLayout.swift` (`packages/MeeshySDK/Sources/MeeshyUI/Story/`) cote pour
 * cote. `apps/web/src/lib/feed/mosaic-layout.ts` en dérive la même.
 *
 * Une règle PURE plutôt que cinq vues : cinq `@Composable` divergeraient sur ce
 * qu'ils ont en commun (le plafond de quatre, le report, la légende). Le rendu
 * Compose ne fait que peindre les cadres rendus ici.
 */
public object MosaicLayout {

    /** Quatre tuiles au plus : au-delà, la mosaïque cesse de se lire d'un coup d'œil. */
    public const val MAX_VISIBLE: Int = 4

    /** L'espace entre deux tuiles, en fraction de la largeur de la boîte. */
    public const val GUTTER: Float = 0.014f

    public const val HERO_LARGE_WIDTH: Float = 0.62f
    public const val WAVE_HOLLOW_HEIGHT: Float = 0.74f
    public const val REEL_TILE_WIDTH: Float = 0.60f
    public const val SINE_TILE_HEIGHT: Float = 0.62f

    /** Les vingt mots de la règle commune du fil ; une mosaïque les réduit. */
    public const val FULL_CAPTION_WORDS: Int = 20
    public const val MOSAIC_CAPTION_WORDS: Int = 8
    public const val CAPTION_WORD_FLOOR: Int = 2

    /**
     * Le rapport d'une PAGE de scène (`1 / SceneFraming.sceneAspect`, 9:16). Un
     * repli iOS : le carrousel des médias prend le rapport de ses images.
     */
    private const val SCENE_PAGE_ASPECT: Float = 16f / 9f

    /** Ce mode PAGINE-t-il ? Une seule ligne décide de quel côté tombe un sixième mode. */
    public fun isPaged(mode: MosaicLayoutMode): Boolean = mode == MosaicLayoutMode.CAROUSEL

    public fun arrange(count: Int, mode: MosaicLayoutMode): MosaicArrangement = when {
        count <= 0 -> MosaicArrangement.Empty
        count == 1 -> MosaicArrangement.Single
        isPaged(mode) -> MosaicArrangement.Paged(pageCount = count)
        else -> MosaicArrangement.Tiled(mode = mode, tiles = tiles(count, mode), aspectRatio = aspectRatio(mode))
    }

    /**
     * La légende paraît là où la PLACE le permet : une page, les tuiles d'un
     * défilement, la grande tuile d'un hero, un visuel seul. Les tuiles d'une
     * vague ou d'une sinusoïde font ~0,23 de la rangée : une légende y
     * recouvrirait le visuel qu'elle légende.
     */
    public fun tileCarriesCaption(mode: MosaicLayoutMode, index: Int, count: Int): Boolean = when {
        count <= 1 -> true
        else -> when (mode) {
            MosaicLayoutMode.CAROUSEL, MosaicLayoutMode.REEL -> true
            MosaicLayoutMode.HERO -> index == 0
            MosaicLayoutMode.WAVE, MosaicLayoutMode.SINE -> false
        }
    }

    /**
     * Le budget de MOTS d'une légende, jamais de lignes : une troncature en
     * lignes dépend de la largeur, de la police et de la taille du texte. La
     * limite du mode est un budget pleine largeur que la part de la tuile
     * réduit, sans descendre sous deux mots.
     */
    public fun captionWordLimit(mode: MosaicLayoutMode, count: Int, tileWidth: Float): Int {
        val full = when {
            count <= 1 -> FULL_CAPTION_WORDS
            mode == MosaicLayoutMode.CAROUSEL || mode == MosaicLayoutMode.REEL -> FULL_CAPTION_WORDS
            else -> MOSAIC_CAPTION_WORDS
        }
        if (tileWidth >= 1f) return full
        return maxOf(CAPTION_WORD_FLOOR, Math.round(full * tileWidth.coerceAtLeast(0f)))
    }

    /** Garde les [limit] premiers mots ; un texte qui tient est rendu tel quel. */
    public fun truncateWords(text: String, limit: Int): String {
        val words = text.trim().split(WHITESPACE).filter { it.isNotEmpty() }
        if (words.size <= limit) return text
        return words.take(limit).joinToString(" ") + "…"
    }

    private val WHITESPACE = Regex("\\s+")

    private fun aspectRatio(mode: MosaicLayoutMode): Float = when (mode) {
        MosaicLayoutMode.WAVE -> 0.78f
        MosaicLayoutMode.HERO -> 0.82f
        MosaicLayoutMode.REEL -> 1.05f
        MosaicLayoutMode.SINE -> 0.92f
        MosaicLayoutMode.CAROUSEL -> SCENE_PAGE_ASPECT
    }

    private fun tiles(count: Int, mode: MosaicLayoutMode): List<MosaicTile> {
        val paged = isPaged(mode)
        val n = if (paged) count else minOf(count, MAX_VISIBLE)
        val rest = if (paged) 0 else (count - MAX_VISIBLE).coerceAtLeast(0)
        val raw = when (mode) {
            MosaicLayoutMode.WAVE -> wave(n)
            MosaicLayoutMode.HERO -> hero(n)
            MosaicLayoutMode.REEL -> reel(n)
            MosaicLayoutMode.SINE -> sine(n)
            MosaicLayoutMode.CAROUSEL -> pages(n)
        }
        return raw.mapIndexed { i, tile -> if (i == raw.lastIndex) tile.copy(overflow = rest) else tile }
    }

    private fun evenWidth(n: Int): Float = (1f - GUTTER * (n - 1)) / n

    private fun wave(n: Int): List<MosaicTile> {
        val width = evenWidth(n)
        return (0 until n).map { i ->
            val height = if (i % 2 == 1) WAVE_HOLLOW_HEIGHT else 1f
            MosaicTile(index = i, x = i * (width + GUTTER), y = (1f - height) / 2f, width = width, height = height)
        }
    }

    private fun hero(n: Int): List<MosaicTile> {
        val column = 1f - HERO_LARGE_WIDTH - GUTTER
        val satellites = n - 1
        val height = (1f - GUTTER * (satellites - 1)) / satellites
        return listOf(MosaicTile(index = 0, x = 0f, y = 0f, width = HERO_LARGE_WIDTH, height = 1f)) +
            (0 until satellites).map { i ->
                MosaicTile(
                    index = i + 1,
                    x = HERO_LARGE_WIDTH + GUTTER,
                    y = i * (height + GUTTER),
                    width = column,
                    height = height,
                )
            }
    }

    private fun reel(n: Int): List<MosaicTile> {
        val step = REEL_TILE_WIDTH + GUTTER * 2
        return (0 until n).map { i -> MosaicTile(index = i, x = i * step, y = 0f, width = REEL_TILE_WIDTH, height = 1f) }
    }

    private fun sine(n: Int): List<MosaicTile> {
        val width = evenWidth(n)
        return (0 until n).map { i ->
            MosaicTile(
                index = i,
                x = i * (width + GUTTER),
                y = if (i % 2 == 0) 0f else 1f - SINE_TILE_HEIGHT,
                width = width,
                height = SINE_TILE_HEIGHT,
            )
        }
    }

    private fun pages(n: Int): List<MosaicTile> =
        (0 until n).map { i -> MosaicTile(index = i, x = 0f, y = 0f, width = 1f, height = 1f) }
}
