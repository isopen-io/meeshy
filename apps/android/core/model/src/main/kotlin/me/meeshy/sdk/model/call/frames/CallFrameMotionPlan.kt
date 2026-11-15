package me.meeshy.sdk.model.call.frames

/**
 * Comment un ornement bouge (#12683, miroir de iOS `CallFrameMotionStyle`). Les durées sont en secondes ; les
 * amplitudes en `unit` de la scène (le plus petit côté de la toile), pour qu'un mouvement garde la même allure à
 * toute taille.
 */
public sealed interface CallFrameMotionStyle {
    /** Tombe en continu (confettis, neige, pétales, feuilles) : la planche se répète à la verticale. */
    public data class Fall(val period: Double) : CallFrameMotionStyle

    /** Monte en continu (bulles, cœurs). */
    public data class Rise(val period: Double) : CallFrameMotionStyle

    /** Scintille par groupes décalés (étincelles, étoiles, lucioles, runes). */
    public data class Twinkle(val period: Double) : CallFrameMotionStyle

    /** Respire en opacité (bokeh, lune, halo de lumière). */
    public data class Breathe(val period: Double) : CallFrameMotionStyle

    /** Vacille comme une flamme (bougies). */
    public data object Flicker : CallFrameMotionStyle

    /** Clignote net (le « REC » d'un caméscope). */
    public data object Blink : CallFrameMotionStyle

    /** Éclate puis s'éteint (éclairs). */
    public data object Flash : CallFrameMotionStyle

    /** Sursaute en saccades (glitch). */
    public data object Jitter : CallFrameMotionStyle

    /** Défile d'un pas de trame (lignes de balayage). */
    public data object Scroll : CallFrameMotionStyle

    /** Tourne lentement sur lui-même (orbites). */
    public data class Spin(val period: Double) : CallFrameMotionStyle

    /** Oscille d'un angle autour du centre (rayons). */
    public data class Sway(val radians: Double, val period: Double) : CallFrameMotionStyle

    /** Dérive d'un côté à l'autre (nuages, chauves-souris). */
    public data class Drift(val units: Double, val period: Double) : CallFrameMotionStyle

    /** Flotte de haut en bas (ballons, notes). */
    public data class Bob(val units: Double, val period: Double) : CallFrameMotionStyle
}

/** Un ornement animé : son rang dans le cadre (la graine de son placement), sa forme et son mouvement. */
public data class CallFrameMotionTrack(
    val rank: Int,
    val ornament: CallFrameOrnament,
    val style: CallFrameMotionStyle,
    /** `loop` : en boucle ; `onAppear` : une entrée, puis l'ornement reste à sa place. */
    val repeats: Boolean,
) {
    /** Les groupes peints séparément pour décaler leur mouvement (un scintillement d'un seul bloc ressemble à un écran qui clignote). */
    val partitions: Int get() = CallFrameMotionPlan.partitions(style)

    /** Un ornement qui tombe ou monte se peint sur TOUTE la toile, pour qu'en défilant il n'y ait jamais de trou. */
    val travels: Boolean get() = CallFrameMotionPlan.travels(style)
}

/** Un groupe d'un ornement semé : les tirages `draw % count == index` seulement (miroir de iOS `CallFrameOrnamentPartition`). */
public data class CallFrameOrnamentPartition(val index: Int, val count: Int) {
    public fun includes(draw: Int): Boolean = count <= 1 || draw % count == index
}

/**
 * **LE PLAN DE MOUVEMENT D'UN CADRE** (#12683, miroir de iOS `CallFrameMotionPlan`), en fonctions pures : quels
 * ornements bougent, et comment. Un ornement qui déclare `loop` ou `onAppear` mais dont la forme ne sait pas
 * bouger (grain, vignette, couronne, ruban, adhésif, toiles, coulures, crânes, roses) reste peint fixe.
 */
public object CallFrameMotionPlan {
    /** Au-delà, les ornements suivants restent fixes : le direct garde sa marge de calcul. */
    public const val MAX_TRACKS: Int = 4

    /** Les particules d'une scène se rangent après les ornements, pour que leur tirage ne recopie jamais celui d'un ornement. */
    public const val SCENE_RANK_OFFSET: Int = 100

    public fun style(kind: CallFrameOrnamentKind): CallFrameMotionStyle? = when (kind) {
        CallFrameOrnamentKind.CONFETTI -> CallFrameMotionStyle.Fall(9.0)
        CallFrameOrnamentKind.SNOW -> CallFrameMotionStyle.Fall(12.0)
        CallFrameOrnamentKind.PETALS -> CallFrameMotionStyle.Fall(14.0)
        CallFrameOrnamentKind.LEAVES -> CallFrameMotionStyle.Fall(16.0)
        CallFrameOrnamentKind.BUBBLES -> CallFrameMotionStyle.Rise(10.0)
        CallFrameOrnamentKind.HEARTS -> CallFrameMotionStyle.Rise(11.0)
        CallFrameOrnamentKind.SPARKLES -> CallFrameMotionStyle.Twinkle(2.4)
        CallFrameOrnamentKind.STARS -> CallFrameMotionStyle.Twinkle(3.2)
        CallFrameOrnamentKind.FIREFLIES -> CallFrameMotionStyle.Twinkle(2.0)
        CallFrameOrnamentKind.RUNES -> CallFrameMotionStyle.Twinkle(3.6)
        CallFrameOrnamentKind.CROSSHAIR -> CallFrameMotionStyle.Breathe(2.0)
        CallFrameOrnamentKind.BOKEH -> CallFrameMotionStyle.Breathe(6.0)
        CallFrameOrnamentKind.MOON -> CallFrameMotionStyle.Breathe(6.0)
        CallFrameOrnamentKind.LIGHTLEAK -> CallFrameMotionStyle.Breathe(5.0)
        CallFrameOrnamentKind.CANDLES -> CallFrameMotionStyle.Flicker
        CallFrameOrnamentKind.REC -> CallFrameMotionStyle.Blink
        CallFrameOrnamentKind.LIGHTNING -> CallFrameMotionStyle.Flash
        CallFrameOrnamentKind.GLITCH -> CallFrameMotionStyle.Jitter
        CallFrameOrnamentKind.SCANLINES -> CallFrameMotionStyle.Scroll
        CallFrameOrnamentKind.ORBITS -> CallFrameMotionStyle.Spin(40.0)
        CallFrameOrnamentKind.RAYS -> CallFrameMotionStyle.Sway(0.06, 8.0)
        CallFrameOrnamentKind.CLOUDS -> CallFrameMotionStyle.Drift(0.04, 9.0)
        CallFrameOrnamentKind.BATS -> CallFrameMotionStyle.Drift(0.03, 3.4)
        CallFrameOrnamentKind.BALLOONS -> CallFrameMotionStyle.Bob(0.012, 3.0)
        CallFrameOrnamentKind.NOTES -> CallFrameMotionStyle.Bob(0.01, 2.2)
        CallFrameOrnamentKind.GRAIN, CallFrameOrnamentKind.VIGNETTE, CallFrameOrnamentKind.CROWN,
        CallFrameOrnamentKind.RIBBON, CallFrameOrnamentKind.TAPE, CallFrameOrnamentKind.COBWEBS,
        CallFrameOrnamentKind.DRIPS, CallFrameOrnamentKind.SKULLS, CallFrameOrnamentKind.ROSES -> null
    }

    public fun partitions(style: CallFrameMotionStyle): Int = when (style) {
        is CallFrameMotionStyle.Twinkle -> 3
        is CallFrameMotionStyle.Drift, is CallFrameMotionStyle.Bob -> 2
        else -> 1
    }

    public fun travels(style: CallFrameMotionStyle): Boolean =
        style is CallFrameMotionStyle.Fall || style is CallFrameMotionStyle.Rise

    /** L'ornement bouge-t-il ? Il le déclare, et sa forme sait bouger. */
    public fun moves(ornament: CallFrameOrnament): Boolean =
        ornament.motion != CallFrameOrnamentMotion.STILL && style(ornament.kind) != null

    /** Les ornements animés d'un cadre, dans l'ordre du cadre, au plus [MAX_TRACKS]. */
    public fun tracks(look: CallFrameLook): List<CallFrameMotionTrack> =
        look.ornaments.mapIndexedNotNull { rank, ornament ->
            if (ornament.motion == CallFrameOrnamentMotion.STILL) return@mapIndexedNotNull null
            val style = style(ornament.kind) ?: return@mapIndexedNotNull null
            CallFrameMotionTrack(rank, ornament, style, repeats = ornament.motion == CallFrameOrnamentMotion.LOOP)
        }.take(MAX_TRACKS)

    /** Les particules d'une scène : un ornement semé de la forme `preset`, à la couleur et à la quantité déclarées, animé comme lui. */
    public fun sceneTracks(look: CallFrameLook): List<CallFrameMotionTrack> =
        look.scene.mapIndexedNotNull { index, layer ->
            if (layer.kind != CallFrameSceneLayerKind.PARTICLES) return@mapIndexedNotNull null
            val preset = layer.preset ?: return@mapIndexedNotNull null
            val style = style(preset) ?: return@mapIndexedNotNull null
            val ornament = CallFrameOrnament(
                kind = preset,
                color = layer.color ?: "#FFFFFF",
                density = density(layer.maxParticles),
                layer = if (layer.depth == CallFrameSceneDepth.BACK) CallFrameLayer.BACK else CallFrameLayer.FRONT,
                motion = CallFrameOrnamentMotion.LOOP,
            )
            CallFrameMotionTrack(SCENE_RANK_OFFSET + index, ornament, style, repeats = true)
        }

    public fun density(maxParticles: Int?): CallFrameDensity {
        val max = maxParticles ?: 60
        return when {
            max <= 40 -> CallFrameDensity.LOW
            max <= 90 -> CallFrameDensity.MID
            else -> CallFrameDensity.HIGH
        }
    }

    /** Les couches de scène que l'hôte joue telles quelles : lumières et boucles vidéo (#13695). */
    public fun ambientLayers(look: CallFrameLook): List<CallFrameSceneLayer> =
        look.scene.filter { it.kind == CallFrameSceneLayerKind.LIGHT || it.kind == CallFrameSceneLayerKind.VIDEO_LOOP }

    /** Les rangs retirés des couches fixes parce qu'ils se peignent animés. */
    public fun animatedRanks(look: CallFrameLook): Set<Int> = tracks(look).map { it.rank }.toSet()
}
