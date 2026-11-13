package me.meeshy.sdk.model.call.group

/** Un rectangle de la scène, en dp, l'origine au coin haut-gauche de l'écran (même en droite-à-gauche). */
data class CallStageRect(val left: Float, val top: Float, val width: Float, val height: Float)

/** Le déplacement physique d'un élément qui sort de l'écran (px ou dp, selon l'appelant). */
data class CallStripTravel(val dx: Float, val dy: Float)

/**
 * Où se pose chaque vignette de la scène de groupe, dans la grille et à la une (P14.10) : la même géométrie que
 * l'écran dessine (espace de 8 dp, pellicule des autres), dite en pur pour que le mouvement grille ↔ à la une parte
 * d'où la vignette VENAIT et arrive là où elle va. Chaque personne garde son identité d'une disposition à l'autre.
 */
object GroupCallStageGeometry {
    const val SPACING: Float = 8f
    const val STRIP_TILE_WIDTH: Float = 84f
    const val STRIP_TILE_HEIGHT: Float = 112f
    const val STRIP_COLUMN_WIDTH: Float = 128f

    /** L'air laissé au halo de qui parle, de part et d'autre d'une vignette de la pellicule (sa portée, `CALL_TILE_HALO_REACH`). */
    const val STRIP_HALO_PAD: Float = 6f

    /** La hauteur de la rangée du bandeau : la vignette et l'air de son halo, dessus et dessous. */
    const val STRIP_ROW_HEIGHT: Float = STRIP_TILE_HEIGHT + 2 * STRIP_HALO_PAD

    fun rects(
        tileIds: List<String>,
        focus: GroupCallStageFocus,
        width: Float,
        height: Float,
        isFullScreen: Boolean,
        isRtl: Boolean,
        isCompactHeight: Boolean,
    ): Map<String, CallStageRect> {
        if (tileIds.isEmpty() || width <= 0f || height <= 0f) return emptyMap()
        val leftToRight = when (focus) {
            GroupCallStageFocus.Grid -> grid(tileIds, width, height, isCompactHeight)
            is GroupCallStageFocus.Spotlight -> spotlight(tileIds, focus.tileId, width, height, isFullScreen)
        }
        return if (isRtl) leftToRight.mapValues { (_, rect) -> rect.copy(left = width - rect.left - rect.width) } else leftToRight
    }

    /**
     * Où se trouve une vignette en plein mouvement, à [progress] (0 → 1) de [from] vers [to] : un mouvement interrompu
     * repart de là, jamais de la case qu'il visait. Sans case de départ, ou mouvement fini, la vignette est arrivée.
     */
    fun between(from: CallStageRect?, to: CallStageRect, progress: Float): CallStageRect {
        if (from == null || progress >= 1f) return to
        fun mix(start: Float, end: Float) = start + (end - start) * progress
        return CallStageRect(mix(from.left, to.left), mix(from.top, to.top), mix(from.width, to.width), mix(from.height, to.height))
    }

    /**
     * U2.10 — la translation (même unité que [stage] et la fenêtre, physique : x vers la droite) qui fait sortir le
     * bandeau des autres par SON bord de l'écran : la distance MESURÉE du bord de la scène à celui de la fenêtre (la
     * pilule, la zone sûre), plus l'épaisseur [stripExtent] du bandeau. Une scène pas encore mesurée ([stage] `null`)
     * ne retient pas le bandeau à l'écran. En droite-à-gauche la colonne est à gauche et sort par le bord gauche.
     */
    fun stripTravel(
        edge: GroupCallFilmstrip,
        stage: CallStageRect?,
        windowWidth: Float,
        windowHeight: Float,
        stripExtent: Float,
        isRtl: Boolean,
    ): CallStripTravel {
        val measured = stage ?: CallStageRect(0f, 0f, 0f, 0f)
        return when (edge) {
            GroupCallFilmstrip.None -> CallStripTravel(0f, 0f)
            GroupCallFilmstrip.Bottom ->
                CallStripTravel(0f, (windowHeight - (measured.top + measured.height)).coerceAtLeast(0f) + stripExtent)
            GroupCallFilmstrip.Trailing ->
                if (isRtl) {
                    CallStripTravel(-(measured.left.coerceAtLeast(0f) + stripExtent), 0f)
                } else {
                    CallStripTravel((windowWidth - (measured.left + measured.width)).coerceAtLeast(0f) + stripExtent, 0f)
                }
        }
    }

    private fun grid(tileIds: List<String>, width: Float, height: Float, isCompactHeight: Boolean): Map<String, CallStageRect> {
        val layout = GroupCallGridLayout.layout(tileIds.size, isLandscape = width > height, isCompactHeight = isCompactHeight)
        val rows = tileIds.chunked(layout.columns)
        val cellWidth = (width - SPACING * (layout.columns - 1)) / layout.columns
        val cellHeight = (height - SPACING * (rows.size - 1)) / rows.size
        return buildMap {
            rows.forEachIndexed { row, ids ->
                ids.forEachIndexed { column, id ->
                    put(id, CallStageRect(column * (cellWidth + SPACING), row * (cellHeight + SPACING), cellWidth, cellHeight))
                }
            }
        }
    }

    private fun spotlight(
        tileIds: List<String>,
        featuredId: String,
        width: Float,
        height: Float,
        isFullScreen: Boolean,
    ): Map<String, CallStageRect> {
        val others = tileIds.filter { it != featuredId }
        return when (GroupCallSpotlight.filmstrip(isFullScreen, isLandscape = width > height)) {
            GroupCallFilmstrip.None -> mapOf(featuredId to CallStageRect(0f, 0f, width, height))
            GroupCallFilmstrip.Bottom -> {
                val featuredHeight = height - SPACING - STRIP_ROW_HEIGHT
                mapOf(featuredId to CallStageRect(0f, 0f, width, featuredHeight)) + others.mapIndexed { index, id ->
                    id to CallStageRect(
                        left = index * (STRIP_TILE_WIDTH + SPACING),
                        top = featuredHeight + SPACING + STRIP_HALO_PAD,
                        width = STRIP_TILE_WIDTH,
                        height = STRIP_TILE_HEIGHT,
                    )
                }
            }
            GroupCallFilmstrip.Trailing -> {
                val featuredWidth = width - SPACING - STRIP_COLUMN_WIDTH
                mapOf(featuredId to CallStageRect(0f, 0f, featuredWidth, height)) + others.mapIndexed { index, id ->
                    id to CallStageRect(
                        left = featuredWidth + SPACING + (STRIP_COLUMN_WIDTH - STRIP_TILE_WIDTH) / 2,
                        top = STRIP_HALO_PAD + index * (STRIP_TILE_HEIGHT + SPACING),
                        width = STRIP_TILE_WIDTH,
                        height = STRIP_TILE_HEIGHT,
                    )
                }
            }
        }
    }
}
