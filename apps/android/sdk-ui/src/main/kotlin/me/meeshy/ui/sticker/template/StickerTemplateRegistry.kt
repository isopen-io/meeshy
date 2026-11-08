package me.meeshy.ui.sticker.template

import android.graphics.Bitmap
import android.util.SizeF
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min
import me.meeshy.sdk.model.sticker.StickerTemplateFamily

/**
 * Le dessin des gabarits — un seul chemin pour la feuille, la bulle, la scène et le PNG (miroir de
 * `StickerTemplateRenderer`, iOS), servi par un REGISTRE de dessinateurs indexé par identifiant de gabarit, agrégé depuis
 * [StickerTemplateFamilyTable]. Mesurer et dessiner sont deux fonctions qui partagent la mesure : la zone tapable ne
 * dérive jamais du pixel affiché. Un identifiant inconnu rend `null` : l'APPELANT choisit son repli (l'emoji du gabarit).
 *
 * Le rendu est déterministe — même image pour l'aperçu, la pose et l'export — et mémoïsé par gabarit, emplacements,
 * mesures et densité.
 */
public object StickerTemplateRegistry {

    private val drawers: Map<String, StickerTemplateDrawer> by lazy {
        StickerTemplateFamily.entries
            .flatMap { StickerTemplateFamilyTable.drawers(it) }
            .groupBy { it.id }
            .mapValues { it.value.first() }
    }

    private val cache = StickerTemplateImageCache()

    /** Un gabarit minuscule se dessine à ce côté (dp) puis se réduit : le liseré d'un point et demi ne mange pas le motif. */
    internal const val MINIMUM_DRAWN_SIDE: Float = 24f

    public fun drawer(templateId: String): StickerTemplateDrawer? = drawers[templateId]

    /** Les identifiants que ce binaire sait dessiner — pour les gardes d'inventaire. */
    public val drawableTemplateIds: Set<String> get() = drawers.keys

    public fun knows(templateId: String): Boolean = templateId in drawers

    /** La taille (dp) qu'occupera le gabarit, sans le rastériser. */
    public fun measuredSize(templateId: String, slots: Map<String, String>, metrics: StickerTemplateMetrics): SizeF? =
        drawers[templateId]?.measure?.invoke(slots, metrics)

    /** Le gabarit rastérisé, non opaque, à la [density] de l'écran ; `null` si inconnu ou dégénéré. À appeler hors du fil principal. */
    public fun image(templateId: String, slots: Map<String, String>, metrics: StickerTemplateMetrics, density: Float): StickerTemplateRender? {
        val drawer = drawers[templateId] ?: return null
        val measured = drawer.measure(slots, metrics)
        val smallest = min(measured.width, measured.height)
        if (!smallest.isFinite() || smallest <= 0f || smallest >= MINIMUM_DRAWN_SIDE) return drawnOnce(drawer, slots, metrics, density)
        val big = drawnOnce(drawer, slots, metrics.scaled(MINIMUM_DRAWN_SIDE / smallest), density) ?: return null
        val scaled = Bitmap.createScaledBitmap(
            big.bitmap,
            max(1, ceil(measured.width * density).toInt()),
            max(1, ceil(measured.height * density).toInt()),
            true,
        )
        return StickerTemplateRender(scaled, measured)
    }

    /**
     * Le gabarit avec son contour blanc découpé, et sa taille contour compris — pour la feuille, la bulle et le PNG envoyé.
     * La scène d'une story garde [image], dont la taille est celle du document.
     */
    public fun dieCutImage(templateId: String, slots: Map<String, String>, metrics: StickerTemplateMetrics, density: Float): StickerTemplateRender? {
        val drawer = drawers[templateId] ?: return null
        val key = StickerTemplateImageCache.key(drawer.id, slots, metrics, density) + "|decoupe"
        cache.get(key)?.let { return it }
        val plain = image(templateId, slots, metrics, density) ?: return null
        val margin = StickerDieCut.margin(plain.size.width, plain.size.height)
        val cut = StickerDieCut.apply(plain.bitmap, density)
        val render = StickerTemplateRender(cut, SizeF(plain.size.width + 2 * margin, plain.size.height + 2 * margin))
        cache.put(key, render)
        return render
    }

    private fun drawnOnce(drawer: StickerTemplateDrawer, slots: Map<String, String>, metrics: StickerTemplateMetrics, density: Float): StickerTemplateRender? {
        val key = StickerTemplateImageCache.key(drawer.id, slots, metrics, density)
        cache.get(key)?.let { return it }
        val bitmap = drawer.draw(slots, metrics, density) ?: return null
        return StickerTemplateRender(bitmap, drawer.measure(slots, metrics)).also { cache.put(key, it) }
    }
}
