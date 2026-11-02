package me.meeshy.sdk.model.call.frames

import kotlin.math.max
import kotlin.math.min

/** La largeur d'un texte écrit dans [font] (`null` ⇒ la police de la marque) à [size] pixels — injectée, pour que la règle se prouve sans moteur de texte. */
public fun interface CallFrameTextMeasure {
    public fun width(text: String, font: CallFrameFont?, size: Double): Double
}

/** Ce qu'un plan de texte sait d'un cadre posé sur une toile : son apparence, ses personnes, ses textes, ses zones et ses cases. */
public data class CallFrameTextScene(
    val look: CallFrameLook,
    val people: List<CallFramePerson>,
    val texts: CallFrameTexts,
    val areas: CallFrameAreas,
    val boxes: List<CallFrameSlotBox>,
) {
    val unit: Double get() = areas.unit
}

/** Où va chaque texte d'un cadre (`TextPlan` du web, `CallFrameTextPlan` d'iOS). */
public data class CallFrameTextPlan(
    val brand: CallFrameRect?,
    val brandScale: Double,
    val title: CallFrameRect?,
    val subtitle: CallFrameRect?,
    val list: CallFrameRect?,
    val topScale: Double,
    val bottomScale: Double,
)

/** L'encombrement de la signature : le mot, le logo à la hauteur de ses traits, les deux côte à côte. */
public data class CallFrameBrandBox(val width: Double, val height: Double, val px: Double, val logoHeight: Double)

/** Un titre ajusté à sa rangée — ce que le peintre écrit et ce que les ornements évitent. */
public data class CallFrameFittedTitle(val text: String, val size: Double, val row: CallFrameRect, val title: CallFrameTitle)

/** Ce que les textes des réserves occupent : le plan, l'encombrement de chaque texte, et celui du titre (que le ruban habille). */
public data class CallFrameTextLayout(
    val plan: CallFrameTextPlan,
    val boxes: List<CallFrameRect>,
    val headline: CallFrameRect?,
)

/**
 * **OÙ VA CHAQUE TEXTE D'UN CADRE** — le port de `frame-paint-text.ts` et de `CallFrameRenderer+Text.swift`
 * (#13694), sans canevas : la signature, le titre, le sous-titre et la liste des noms vivent dans les
 * réserves haute et basse, jamais sur un visage. Une réserve trop courte réduit son bloc ; sous 45 %, un
 * titre se tait — la signature, elle, ne se tait jamais (70 % au moins).
 */
public object CallFrameTextPlanner {
    public const val LIST_SHARE: Double = 0.03
    public const val NAME_SHARE: Double = 0.034
    public const val LINE_FACTOR: Double = 1.3
    public const val MIN_ROW_SCALE: Double = 0.45

    /** L'épaisseur des traits du logo dans les cadres, dans le repère 1024 (celle du web). */
    public const val GLYPH_DASH_WIDTH: Double = 88.0

    /** Les trois traits du logo dans le repère 1024 : début, fin (même ordonnée) et opacité — `MeeshyBrandMark.referenceDashes`. */
    public data class Dash(val startX: Double, val endX: Double, val y: Double, val opacity: Double)

    public val DASHES: List<Dash> = listOf(
        Dash(262.0, 762.0, 384.0, 0.7),
        Dash(262.0, 662.0, 512.0, 1.0),
        Dash(262.0, 562.0, 640.0, 0.75),
    )

    /** Le cadre encré du logo (bouts ronds compris), dans le repère 1024. */
    public val GLYPH_BOUNDS: CallFrameRect = run {
        val half = GLYPH_DASH_WIDTH / 2
        val left = DASHES.minOf { it.startX } - half
        val right = DASHES.maxOf { it.endX } + half
        val top = DASHES.minOf { it.y } - half
        val bottom = DASHES.maxOf { it.y } + half
        CallFrameRect(left, top, right - left, bottom - top)
    }

    public val GLYPH_ASPECT: Double get() = GLYPH_BOUNDS.width / GLYPH_BOUNDS.height

    public fun titleShare(size: CallFrameTextSize): Double = when (size) {
        CallFrameTextSize.S -> 0.042
        CallFrameTextSize.M -> 0.06
        CallFrameTextSize.L -> 0.085
    }

    public fun brandShare(size: CallFrameTextSize): Double = when (size) {
        CallFrameTextSize.S -> 0.03
        CallFrameTextSize.M -> 0.042
        CallFrameTextSize.L -> 0.058
    }

    public fun titleShown(title: CallFrameTitle?): Boolean = title != null && title.source != CallFrameTitleSource.NONE

    // La signature

    public fun brandBox(brand: CallFrameBrand, unit: Double, measure: CallFrameTextMeasure): CallFrameBrandBox {
        val px = unit * brandShare(brand.size)
        val logoHeight = if (brand.mark == CallFrameBrandMark.LOGO) px * 0.95 else px * 0.62
        val logoWidth = logoHeight * GLYPH_ASPECT
        val word = if (px > 0) measure.width(CallFrameText.BRAND_WORD, brand.font, px) else 0.0
        val width = when (brand.mark) {
            CallFrameBrandMark.LOGO -> logoWidth
            CallFrameBrandMark.WORDMARK -> word
            CallFrameBrandMark.BOTH -> logoWidth + px * 0.32 + word
        }
        return CallFrameBrandBox(width, max(px, logoHeight) * 1.15, px, logoHeight)
    }

    private fun isCorner(place: CallFrameBrandPlace?): Boolean =
        place == CallFrameBrandPlace.TOP_LEFT || place == CallFrameBrandPlace.TOP_RIGHT ||
            place == CallFrameBrandPlace.BOTTOM_LEFT || place == CallFrameBrandPlace.BOTTOM_RIGHT

    /** Le rectangle d'une signature posée dans un coin de l'intérieur — `null` hors des quatre coins. */
    public fun cornerBrandRect(scene: CallFrameTextScene, box: CallFrameBrandBox): CallFrameRect? {
        val place = scene.look.brand?.place
        if (!isCorner(place)) return null
        val pad = scene.unit * 0.035
        val areas = scene.areas
        val left = place == CallFrameBrandPlace.TOP_LEFT || place == CallFrameBrandPlace.BOTTOM_LEFT
        val top = place == CallFrameBrandPlace.TOP_LEFT || place == CallFrameBrandPlace.TOP_RIGHT
        val x = if (left) areas.inner.minX + pad else areas.inner.maxX - pad - box.width
        val y = if (top) areas.top.minY + pad else areas.bottom.maxY - pad - box.height
        return CallFrameRect(x, y, box.width, box.height)
    }

    /**
     * Le cadre où la signature se peint — `null` pour le filigrane, qui couvre toute la toile, et pour un
     * cadre qui ne déclare pas de signature.
     */
    public fun brandFrame(scene: CallFrameTextScene, plan: CallFrameTextPlan, box: CallFrameBrandBox): CallFrameRect? {
        val brand = scene.look.brand ?: return null
        val areas = scene.areas
        return when (brand.place) {
            CallFrameBrandPlace.WATERMARK -> null
            CallFrameBrandPlace.TOP, CallFrameBrandPlace.BOTTOM -> {
                val row = plan.brand ?: if (brand.place == CallFrameBrandPlace.TOP) {
                    CallFrameRect(areas.top.minX, areas.top.minY, areas.top.width, box.height)
                } else {
                    CallFrameRect(areas.bottom.minX, areas.bottom.maxY - box.height, areas.bottom.width, box.height)
                }
                val width = box.width * plan.brandScale
                val height = box.height * plan.brandScale
                CallFrameRect(row.midX - width / 2, row.midY - height / 2, width, height)
            }
            else -> cornerBrandRect(scene, box)
        }
    }

    // Où va chaque texte

    private enum class RowKey { BRAND, TITLE, SUBTITLE, LIST }

    private data class Row(val key: RowKey, val height: Double)

    private data class Placed(val rects: List<Pair<RowKey, CallFrameRect>>, val scale: Double, val brandScale: Double)

    /**
     * **OÙ VA CHAQUE TEXTE** — `planText` du web. En haut : la signature (`top`), le titre, le sous-titre.
     * En bas : le titre, le sous-titre, la liste des noms, la signature (`bottom`).
     */
    public fun plan(scene: CallFrameTextScene, measure: CallFrameTextMeasure): CallFrameTextPlan {
        val look = scene.look
        val unit = scene.unit
        val box = look.brand?.let { brandBox(it, unit, measure) }
        val brandPlace = look.brand?.place
        fun titleHeight(title: CallFrameTitle) = unit * titleShare(title.size) * LINE_FACTOR
        val listLines = if (look.names.show == CallFrameNameShow.BOTH || scene.people.size >= 5) 2 else 1
        val listed = look.names.style == CallFrameNameStyle.LIST && look.names.show != CallFrameNameShow.NONE

        fun place(top: Boolean): Placed {
            val rows = buildList {
                if (top && brandPlace == CallFrameBrandPlace.TOP && box != null) add(Row(RowKey.BRAND, box.height * 1.25))
                if (!top && titleShown(look.title) && look.title.place == CallFrameTitlePlace.BOTTOM) add(Row(RowKey.TITLE, titleHeight(look.title)))
                if (top && titleShown(look.title) && look.title.place == CallFrameTitlePlace.TOP) add(Row(RowKey.TITLE, titleHeight(look.title)))
                val subtitle = look.subtitle
                val side = if (top) CallFrameTitlePlace.TOP else CallFrameTitlePlace.BOTTOM
                if (subtitle != null && titleShown(subtitle) && subtitle.place == side) add(Row(RowKey.SUBTITLE, titleHeight(subtitle)))
                if (!top && listed) add(Row(RowKey.LIST, unit * LIST_SHARE * 1.45 * listLines))
                if (!top && brandPlace == CallFrameBrandPlace.BOTTOM && box != null) add(Row(RowKey.BRAND, box.height * 1.25))
            }
            val reserve = if (top) scene.areas.top else scene.areas.bottom
            val room = reserve.height * 0.94
            val brandRow = rows.firstOrNull { it.key == RowKey.BRAND }
            val others = rows.filter { it.key != RowKey.BRAND }
            val all = rows.sumOf { it.height }
            val brandScale = if (brandRow == null || all <= 0) 1.0 else max(0.7, min(1.0, room / all))
            val brandHeight = brandRow?.let { it.height * brandScale } ?: 0.0
            val otherTotal = others.sumOf { it.height }
            val scale = if (otherTotal == 0.0) 1.0 else max(0.0, min(1.0, (room - brandHeight) / otherTotal))
            val kept = rows.filter { it.key == RowKey.BRAND || scale >= MIN_ROW_SCALE }
            val heights = kept.map { if (it.key == RowKey.BRAND) brandHeight else it.height * scale }
            val total = heights.sum()
            val start = when {
                total <= reserve.height -> reserve.minY + (reserve.height - total) / 2
                top -> reserve.minY
                else -> reserve.maxY - total
            }
            val rects = kept.indices.map { index ->
                val y = start + heights.take(index).sum()
                kept[index].key to CallFrameRect(reserve.minX, y, reserve.width, heights[index])
            }
            return Placed(rects, if (scale >= MIN_ROW_SCALE) scale else 0.0, brandScale)
        }

        val top = place(true)
        val bottom = place(false)
        fun find(key: RowKey) = (top.rects + bottom.rects).firstOrNull { it.first == key }?.second
        val brandScale = when (brandPlace) {
            CallFrameBrandPlace.TOP -> top.brandScale
            CallFrameBrandPlace.BOTTOM -> bottom.brandScale
            else -> 1.0
        }
        return CallFrameTextPlan(
            brand = find(RowKey.BRAND),
            brandScale = brandScale,
            title = find(RowKey.TITLE),
            subtitle = find(RowKey.SUBTITLE),
            list = find(RowKey.LIST),
            topScale = top.scale,
            bottomScale = bottom.scale,
        )
    }

    /** La largeur que la signature, posée dans un coin de la réserve, prend aux textes centrés de cette réserve. */
    public fun brandAllowance(scene: CallFrameTextScene, top: Boolean, measure: CallFrameTextMeasure): Double {
        val brand = scene.look.brand ?: return 0.0
        val corner = if (top) {
            brand.place == CallFrameBrandPlace.TOP_LEFT || brand.place == CallFrameBrandPlace.TOP_RIGHT
        } else {
            brand.place == CallFrameBrandPlace.BOTTOM_LEFT || brand.place == CallFrameBrandPlace.BOTTOM_RIGHT
        }
        return if (corner) brandBox(brand, scene.unit, measure).width + scene.unit * 0.06 else 0.0
    }

    /** Les ornements qui tiennent un COIN haut de la toile, et la largeur qu'ils y prennent (en `unit`). */
    public fun topCornerShare(kind: CallFrameOrnamentKind): Double = when (kind) {
        CallFrameOrnamentKind.MOON -> 0.17
        CallFrameOrnamentKind.REC -> 0.24
        else -> 0.0
    }

    /** La largeur que prennent les ornements de coin (lune, REC) — ils CÈDENT au titre quand il ne tiendrait plus qu'en se tronquant. */
    public fun ornamentAllowance(scene: CallFrameTextScene, top: Boolean): Double {
        if (!top) return 0.0
        return scene.look.ornaments.maxOfOrNull { topCornerShare(it.kind) * scene.unit } ?: 0.0
    }

    // Titres

    /** Le titre et le sous-titre, ajustés à leur rangée (rétrécis jusqu'à 60 %, puis tronqués d'une ellipse). */
    public fun fittedTitles(scene: CallFrameTextScene, plan: CallFrameTextPlan, measure: CallFrameTextMeasure): List<CallFrameFittedTitle> {
        val unit = scene.unit
        return listOf(scene.look.title to plan.title, scene.look.subtitle to plan.subtitle).mapNotNull { (title, row) ->
            if (title == null || !titleShown(title) || row == null) return@mapNotNull null
            val text = CallFrameText.titleText(title.source, scene.people, scene.texts, title.letterCase)
            if (text.isEmpty()) return@mapNotNull null
            val top = title.place == CallFrameTitlePlace.TOP
            val scale = if (top) plan.topScale else plan.bottomScale
            val brand = brandAllowance(scene, top, measure)
            val px = unit * titleShare(title.size) * scale
            fun fit(allowance: Double) =
                CallFrameText.fit(text, row.width - allowance * 2 - unit * 0.02, px) { value, size -> measure.width(value, title.font, size) }
            val crowded = fit(max(brand, ornamentAllowance(scene, top)))
            val fitted = if (crowded.text == text && crowded.size >= px * 0.75) crowded else fit(brand)
            if (fitted.text.isEmpty()) null else CallFrameFittedTitle(fitted.text, fitted.size, row, title)
        }
    }

    /** Ce que les textes des réserves occupent — ce qu'aucun ornement semé ne couvre, et ce que le masque des ornements animés évite. */
    public fun layout(scene: CallFrameTextScene, measure: CallFrameTextMeasure): CallFrameTextLayout {
        val plan = plan(scene, measure)
        val titles = fittedTitles(scene, plan, measure).map { fitted ->
            val width = measure.width(fitted.text, fitted.title.font, fitted.size) + fitted.size * 0.8
            CallFrameRect(fitted.row.minX + (fitted.row.width - width) / 2, fitted.row.minY, width, fitted.row.height)
        }
        val box = scene.look.brand?.let { brandBox(it, scene.unit, measure) }
        val row = plan.brand
        val brand = when {
            box != null && row != null ->
                listOf(CallFrameRect(row.minX + (row.width - box.width) / 2 - box.px * 0.3, row.minY, box.width + box.px * 0.6, row.height))
            box != null -> listOfNotNull(cornerBrandRect(scene, box))
            else -> emptyList()
        }
        return CallFrameTextLayout(plan, titles + brand + listOfNotNull(plan.list), titles.firstOrNull())
    }
}
