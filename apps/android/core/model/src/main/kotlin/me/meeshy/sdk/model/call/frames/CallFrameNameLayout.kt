package me.meeshy.sdk.model.call.frames

import kotlin.math.min

/** Une case et ce que sa personne écrit. */
public data class CallFrameNameItem(val box: CallFrameSlotBox, val person: CallFramePerson, val lines: List<String>)

/** Où une case écrit ses noms (§ 4.5) : dans le pied de sa carte, sous elle, ou DANS elle sur un fond propre. */
public enum class CallFrameNamePlacement { FOOT, BELOW, PLATE, SCRIM, BADGE, BUBBLE }

/** Le coin d'une bulle de nom. */
public enum class CallFrameBubbleCorner { TOP_RIGHT, TOP_LEFT, BOTTOM_LEFT }

/** Une ligne de la liste des noms : son texte ajusté, sa taille et son centre. */
public data class CallFrameListLine(val text: String, val size: Double, val x: Double, val y: Double)

/**
 * **LES NOMS D'UN CADRE** — le port de `paintNames` du web et de `CallFrameRenderer+Names.swift` (#13694),
 * sans canevas : ce que chaque case écrit, où, et à quelle taille. Un nom ne couvre jamais le visage d'un
 * autre : sous sa case quand la place le permet, sinon dans sa case, sur un fond qui le rend lisible.
 */
public object CallFrameNameLayout {

    public fun blockHeight(lines: Int, px: Double): Double = if (lines <= 0) 0.0 else px * 1.2 + (lines - 1) * px * 0.78 * 1.2

    /** La taille d'une ligne : la première à [px], les suivantes (le @pseudo) à 78 %. */
    public fun lineSize(index: Int, px: Double): Double = if (index == 0) px else px * 0.78

    /** Le fond d'un nom posé sur une plaque ou une pastille : le sien, sinon sombre sous un nom clair et clair sous un nom sombre. */
    public fun defaultFill(names: CallFrameNames): CallFrameColor = names.fill?.let { CallFrameRenderKit.color(it) }
        ?: if (CallFrameRenderKit.perceived(names.color) > 0.5) {
            CallFrameColor(12 / 255.0, 12 / 255.0, 16 / 255.0, 0.62)
        } else {
            CallFrameColor(1.0, 1.0, 1.0, 0.88)
        }

    /** La taille de base d'un nom, bornée par la case : une grande tablée n'a pas de noms plus gros que ses visages. */
    public fun namePx(scene: CallFrameTextScene, box: CallFrameSlotBox): Double =
        min(scene.unit * CallFrameTextPlanner.NAME_SHARE, min(box.rect.width, box.rect.height) * 0.1)

    public fun widestLine(lines: List<String>, px: Double, names: CallFrameNames, measure: CallFrameTextMeasure): Double =
        lines.mapIndexed { index, line -> measure.width(line, names.font, lineSize(index, px)) }.maxOrNull() ?: 0.0

    public fun nameItems(scene: CallFrameTextScene): List<CallFrameNameItem> = scene.boxes.mapNotNull { box ->
        val person = scene.people.getOrNull(box.index) ?: return@mapNotNull null
        val lines = CallFrameText.personLines(person, scene.look.names.show)
        if (lines.isEmpty()) null else CallFrameNameItem(box, person, lines)
    }

    public fun namesInFoot(names: CallFrameNames, slot: CallFrameSlotStyle): Boolean =
        names.style == CallFrameNameStyle.CAPTION && (slot.card?.foot ?: 0.0) > 0.08

    /** Les noms qui se posent SOUS leur case (légende, banderole, étiquette) — quand la place le permet. */
    public fun namesSitBelow(names: CallFrameNames, slot: CallFrameSlotStyle): Boolean =
        names.show != CallFrameNameShow.NONE && !namesInFoot(names, slot) &&
            names.style in setOf(CallFrameNameStyle.CAPTION, CallFrameNameStyle.RIBBON, CallFrameNameStyle.TAG)

    /** La hauteur qu'un bloc de [lines] lignes demande sous sa case. */
    public fun roomNeededBelow(style: CallFrameNameStyle, lines: Int, px: Double): Double =
        blockHeight(lines, px) * if (style == CallFrameNameStyle.CAPTION) 1.35 else 1.9

    /**
     * La place que la géométrie doit laisser sous chaque case pour que ses noms n'y couvrent jamais un visage :
     * la plus grande qu'un nom puisse demander à cette toile, zéro s'ils se posent ailleurs (#9780).
     */
    public fun nameRoom(look: CallFrameLook, unit: Double): Double {
        if (!namesSitBelow(look.names, look.slot)) return 0.0
        val lines = if (look.names.show == CallFrameNameShow.BOTH) 2 else 1
        return roomNeededBelow(look.names.style, lines, unit * CallFrameTextPlanner.NAME_SHARE)
    }

    /**
     * La place libre sous une case : jusqu'à la première case qui la chevauche en largeur et descend plus bas
     * qu'elle (zéro si elle mord déjà sur son bas), ou jusqu'aux textes de la réserve basse.
     */
    public fun roomBelow(scene: CallFrameTextScene, plan: CallFrameTextPlan, box: CallFrameSlotBox): Double {
        val own = CallFrameRenderKit.footprint(box)
        val bottom = own.maxY
        val floors = scene.boxes
            .filter { it.index != box.index }
            .map { CallFrameRenderKit.footprint(it) }
            .filter { it.minX < own.maxX && own.minX < it.maxX && it.maxY > bottom }
            .map { kotlin.math.max(bottom, it.minY) }
        val texts = listOfNotNull(plan.title, plan.subtitle, plan.list, plan.brand)
            .filter { it.minY >= scene.areas.bottom.minY - 1 }
            .map { it.minY }
        val ground = scene.areas.content.maxY + scene.areas.bottom.height * 0.4
        return ((floors + texts + ground).minOrNull() ?: ground) - bottom
    }

    /** Chaque nom tient-il SOUS sa case ? Sinon tous se replient dans la case, sur un fond. */
    public fun namesFitBelow(scene: CallFrameTextScene, plan: CallFrameTextPlan): Boolean {
        val names = scene.look.names
        if (!namesSitBelow(names, scene.look.slot)) return false
        return nameItems(scene).all { item ->
            roomBelow(scene, plan, item.box) >= roomNeededBelow(names.style, item.lines.size, namePx(scene, item.box))
        }
    }

    /** Où chaque case écrit ses noms ; vide pour la liste (elle vit dans la réserve basse) et quand aucun nom ne s'affiche. */
    public fun placements(scene: CallFrameTextScene, plan: CallFrameTextPlan): List<Pair<CallFrameNameItem, CallFrameNamePlacement>> {
        val names = scene.look.names
        val slot = scene.look.slot
        if (names.show == CallFrameNameShow.NONE || names.style == CallFrameNameStyle.LIST) return emptyList()
        val inFoot = namesInFoot(names, slot) && slot.card != null
        val outside = namesSitBelow(names, slot)
        val roomy = namesFitBelow(scene, plan)
        val placement = when {
            inFoot -> CallFrameNamePlacement.FOOT
            outside && roomy -> CallFrameNamePlacement.BELOW
            outside -> if (names.fill == null) CallFrameNamePlacement.SCRIM else CallFrameNamePlacement.PLATE
            names.style == CallFrameNameStyle.PLATE -> CallFrameNamePlacement.PLATE
            names.style == CallFrameNameStyle.BADGE -> CallFrameNamePlacement.BADGE
            else -> CallFrameNamePlacement.BUBBLE
        }
        return nameItems(scene).map { it to placement }
    }

    private fun intersects(a: CallFrameRect, b: CallFrameRect): Boolean =
        a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY

    private fun coveringFootprints(scene: CallFrameTextScene, box: CallFrameSlotBox): List<CallFrameRect> =
        scene.boxes.filter { it.index > box.index }.map { CallFrameRenderKit.footprint(it) }

    /**
     * Le bord d'une case où poser un texte INTÉRIEUR : en bas, sauf si une case dessinée PAR-DESSUS (diagonal,
     * cascade) en couvre le bas et pas le haut. Un nom ne se peint jamais sur le visage d'un autre.
     */
    public fun freeBandIsTop(scene: CallFrameTextScene, box: CallFrameSlotBox): Boolean {
        val own = CallFrameRenderKit.footprint(box)
        fun band(top: Boolean) =
            CallFrameRect(own.minX, if (top) own.minY else own.minY + own.height * 0.7, own.width, own.height * 0.3)
        val above = coveringFootprints(scene, box)
        fun covered(top: Boolean) = above.any { intersects(it, band(top)) }
        return covered(false) && !covered(true)
    }

    /** Le coin d'une bulle : en haut à droite, sinon le premier coin qu'aucune case posée par-dessus ne couvre. */
    public fun freeCorner(scene: CallFrameTextScene, box: CallFrameSlotBox): CallFrameBubbleCorner {
        val own = CallFrameRenderKit.footprint(box)
        fun area(corner: CallFrameBubbleCorner) = CallFrameRect(
            if (corner == CallFrameBubbleCorner.TOP_RIGHT) own.minX + own.width * 0.5 else own.minX,
            if (corner == CallFrameBubbleCorner.BOTTOM_LEFT) own.minY + own.height * 0.7 else own.minY,
            own.width * 0.5,
            own.height * 0.3,
        )
        val above = coveringFootprints(scene, box)
        return CallFrameBubbleCorner.entries.firstOrNull { corner -> above.none { intersects(it, area(corner)) } }
            ?: CallFrameBubbleCorner.TOP_RIGHT
    }

    /** La liste des noms (style `list`) : sur une ligne, ou sur deux quand elle ne tient pas, chacune ajustée à la rangée. */
    public fun listLines(scene: CallFrameTextScene, plan: CallFrameTextPlan, measure: CallFrameTextMeasure): List<CallFrameListLine> {
        val row = plan.list ?: return emptyList()
        val names = scene.look.names
        val entries = scene.people.map { CallFrameText.listEntry(it, names.show) }.filter { it.isNotEmpty() }
        if (entries.isEmpty()) return emptyList()
        val px = scene.unit * CallFrameTextPlanner.LIST_SHARE * kotlin.math.max(plan.bottomScale, CallFrameTextPlanner.MIN_ROW_SCALE)
        val single = entries.joinToString(LIST_SEPARATOR)
        val width = row.width * 0.94
        val half = (entries.size + 1) / 2
        val lines = if (measure.width(single, names.font, px) <= width || entries.size < 2) {
            listOf(single)
        } else {
            listOf(entries.take(half).joinToString(LIST_SEPARATOR), entries.drop(half).joinToString(LIST_SEPARATOR))
        }
        val lineHeight = row.height / lines.size
        return lines.mapIndexed { index, line ->
            val fitted = CallFrameText.fit(line, width, px) { value, size -> measure.width(value, names.font, size) }
            CallFrameListLine(fitted.text, fitted.size, row.midX, row.minY + lineHeight * (index + 0.5))
        }
    }

    public const val LIST_SEPARATOR: String = "  ·  "
}
