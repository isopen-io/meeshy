package me.meeshy.ui.sticker.template

import android.content.Context
import android.graphics.Bitmap
import android.util.SizeF
import me.meeshy.sdk.model.sticker.StickerTemplateFamily

/**
 * Ce qu'un gabarit SAIT FAIRE côté `:sdk-ui` — se nommer, se mesurer, se dessiner — enregistré UNE fois par gabarit,
 * dans le fichier de sa famille. Miroir de `StickerTemplateDrawer` (iOS).
 *
 * Le CATALOGUE (`:core:model`, pur) reste la source de ce qui EXISTE ; le registre dit comment ça se DESSINE. Un témoin
 * exige que les deux ensembles d'identifiants coïncident pour les familles dessinées.
 *
 * - [name] : le nom LOCALISÉ (TalkBack, libellés), lu au moment de parler.
 * - [measure] : la taille du gabarit en dp, sans le rastériser — partagée avec les cibles de tap.
 * - [draw] : le gabarit rastérisé à la [densité] de l'écran, ou `null` pour une taille dégénérée.
 */
public class StickerTemplateDrawer(
    public val id: String,
    public val name: (Context) -> String,
    public val measure: (slots: Map<String, String>, metrics: StickerTemplateMetrics) -> SizeF,
    public val draw: (slots: Map<String, String>, metrics: StickerTemplateMetrics, density: Float) -> Bitmap?,
)

/** Ce qu'un type de famille déclare : la famille du catalogue qu'il dessine, et ses dessinateurs. */
internal interface StickerTemplateFamilyDrawing {
    val family: StickerTemplateFamily
    val drawers: List<StickerTemplateDrawer>
}
