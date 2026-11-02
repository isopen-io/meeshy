package me.meeshy.sdk.model.call.frames

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallFrameNameLayoutTest {

    private val glyphs = CallFrameTextMeasure { text, _, size -> text.length * size * 0.5 }

    private fun person(name: String, handle: String? = null) = CallFramePerson(name, name, handle, isSelf = false)

    private fun names(style: CallFrameNameStyle, show: CallFrameNameShow = CallFrameNameShow.NAME, fill: String? = null) =
        CallFrameNames(show, style, CallFrameFont.BOLD, "#FFFFFF", fill)

    private fun design(names: CallFrameNames, arrangement: CallFrameArrangement = CallFrameArrangement.SPLIT, bottom: Double = 0.12): CallFrameDesign {
        val base = CallLiveFrameRule.frames().first()
        return base.copy(
            look = base.look.copy(
                layout = CallFrameLayout(arrangement, margin = 0.04, gap = 0.02, top = 0.1, bottom = bottom),
                slot = base.look.slot.copy(tilt = CallFrameTilt.NONE, card = null, shape = CallFrameSlotShape.RECT),
                names = names,
                title = base.look.title.copy(source = CallFrameTitleSource.NONE),
                subtitle = null,
                brand = null,
            ),
        )
    }

    private fun scene(design: CallFrameDesign, people: List<CallFramePerson> = listOf(person("Awa", "awa"), person("Karim"))): CallFrameTextScene =
        CallFrameTextScene(
            design.look,
            people,
            CallFrameTexts(null, false, "29 oct.", null),
            CallFrameLayoutGeometry.areas(design.look.layout, 1080.0, 1920.0),
            CallFrameLayoutGeometry.slots(design, people.size, 1080.0, 1920.0),
        )

    @Test
    fun `la geometrie laisse sous chaque case la place de sa banderole`() {
        val d = design(names(CallFrameNameStyle.RIBBON))
        val s = scene(d)
        val plan = CallFrameTextPlanner.plan(s, glyphs)
        assertThat(CallFrameNameLayout.nameRoom(d.look, 1080.0)).isGreaterThan(0.0)
        assertThat(CallFrameNameLayout.namesFitBelow(s, plan)).isTrue()
        assertThat(CallFrameNameLayout.placements(s, plan).map { it.second }.toSet()).containsExactly(CallFrameNamePlacement.BELOW)
    }

    @Test
    fun `sans la place de la reserve, les noms se replient dans la case sur un voile, ou sur leur fond`() {
        val canonical = design(names(CallFrameNameStyle.CAPTION))
        val s = scene(canonical).copy(boxes = CallFrameLayoutGeometry.slots(canonical.look.layout, canonical.look.slot, 2, 1080.0, 1920.0))
        val plan = CallFrameTextPlanner.plan(s, glyphs)
        assertThat(CallFrameNameLayout.namesFitBelow(s, plan)).isFalse()
        assertThat(CallFrameNameLayout.placements(s, plan).map { it.second }.toSet()).containsExactly(CallFrameNamePlacement.SCRIM)
        val filled = s.copy(look = s.look.copy(names = names(CallFrameNameStyle.CAPTION, fill = "#000000")))
        assertThat(CallFrameNameLayout.placements(filled, plan).map { it.second }.toSet()).containsExactly(CallFrameNamePlacement.PLATE)
    }

    @Test
    fun `les noms a l interieur suivent leur style, et la liste ne se pose dans aucune case`() {
        listOf(
            CallFrameNameStyle.PLATE to CallFrameNamePlacement.PLATE,
            CallFrameNameStyle.BADGE to CallFrameNamePlacement.BADGE,
            CallFrameNameStyle.BUBBLE to CallFrameNamePlacement.BUBBLE,
        ).forEach { (style, expected) ->
            val s = scene(design(names(style)))
            assertThat(CallFrameNameLayout.placements(s, CallFrameTextPlanner.plan(s, glyphs)).map { it.second }.distinct()).containsExactly(expected)
        }
        val list = scene(design(names(CallFrameNameStyle.LIST)))
        assertThat(CallFrameNameLayout.placements(list, CallFrameTextPlanner.plan(list, glyphs))).isEmpty()
        val hidden = scene(design(names(CallFrameNameStyle.PLATE, CallFrameNameShow.NONE)))
        assertThat(CallFrameNameLayout.placements(hidden, CallFrameTextPlanner.plan(hidden, glyphs))).isEmpty()
    }

    @Test
    fun `une personne sans pseudo garde son nom, et le pseudo a sa ligne plus petite`() {
        val s = scene(design(names(CallFrameNameStyle.PLATE, CallFrameNameShow.BOTH)))
        val items = CallFrameNameLayout.nameItems(s)
        assertThat(items.map { it.lines }).containsExactly(listOf("Awa", "@awa"), listOf("Karim")).inOrder()
        assertThat(CallFrameNameLayout.lineSize(1, 10.0)).isWithin(1e-9).of(7.8)
        assertThat(CallFrameNameLayout.blockHeight(2, 10.0)).isWithin(1e-9).of(12.0 + 7.8 * 1.2)
    }

    @Test
    fun `la liste des noms passe sur deux lignes quand elle ne tient pas sur une`() {
        val people = listOf("Awa", "Karim", "Lina", "Omar", "Zoé", "Inès").map { person(it) }
        val wide = CallFrameTextMeasure { text, _, size -> text.length * size * 2.0 }
        val s = scene(design(names(CallFrameNameStyle.LIST), CallFrameArrangement.GRID, bottom = 0.16), people)
        val lines = CallFrameNameLayout.listLines(s, CallFrameTextPlanner.plan(s, wide), wide)
        assertThat(lines).hasSize(2)
        assertThat(lines.first().text).startsWith("Awa${CallFrameNameLayout.LIST_SEPARATOR}Karim")
        val short = CallFrameNameLayout.listLines(s, CallFrameTextPlanner.plan(s, glyphs), glyphs)
        assertThat(short).hasSize(1)
    }

    @Test
    fun `un fond de nom par defaut tranche avec la couleur du nom`() {
        assertThat(CallFrameNameLayout.defaultFill(names(CallFrameNameStyle.PLATE)).red).isLessThan(0.1)
        val dark = CallFrameNames(CallFrameNameShow.NAME, CallFrameNameStyle.PLATE, CallFrameFont.BOLD, "#101010", null)
        assertThat(CallFrameNameLayout.defaultFill(dark).red).isEqualTo(1.0)
    }

    @Test
    fun `une case recouverte par le bas ecrit son nom en haut, et sa bulle dans un coin libre`() {
        val s = scene(design(names(CallFrameNameStyle.BUBBLE)))
        val first = s.boxes.first()
        val over = first.copy(rect = CallFrameRect(first.rect.minX, first.rect.minY + first.rect.height * 0.8, first.rect.width, first.rect.height), index = 1)
        val covered = s.copy(boxes = listOf(first, over))
        assertThat(CallFrameNameLayout.freeBandIsTop(covered, first)).isTrue()
        assertThat(CallFrameNameLayout.freeCorner(covered, first)).isEqualTo(CallFrameBubbleCorner.TOP_RIGHT)
        assertThat(CallFrameNameLayout.freeBandIsTop(s, first)).isFalse()
    }

    @Test
    fun `une case qui ne peut pas ceder la place de ses noms ne change pas, et aucune autre non plus`() {
        val box = CallFrameSlotBox(CallFrameRect(0.0, 0.0, 100.0, 40.0), CallFrameSlotShape.RECT, 0.0, 0)
        assertThat(CallFrameLayoutGeometry.leavingRoomBelow(listOf(box), room = 30.0, floor = 40.0)).containsExactly(box)
        val shortened = CallFrameLayoutGeometry.leavingRoomBelow(listOf(box), room = 10.0, floor = 40.0).single()
        assertThat(shortened.rect.height).isWithin(1e-9).of(40.0 - 12.0)
        assertThat(shortened.rect.minY).isEqualTo(0.0)
    }
}
