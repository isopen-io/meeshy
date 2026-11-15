package me.meeshy.sdk.model.call.frames

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallFrameTextPlannerTest {

    private val glyphs = CallFrameTextMeasure { text, _, size -> text.length * size * 0.5 }

    private fun person(name: String, handle: String? = null) = CallFramePerson(name, name, handle, isSelf = false)

    private fun title(
        source: CallFrameTitleSource,
        place: CallFrameTitlePlace = CallFrameTitlePlace.TOP,
        size: CallFrameTextSize = CallFrameTextSize.M,
    ) = CallFrameTitle(source, CallFrameFont.CLASSIC, "#FFFFFF", place, size, null, null)

    private fun look(
        title: CallFrameTitle = title(CallFrameTitleSource.NONE),
        subtitle: CallFrameTitle? = null,
        brand: CallFrameBrand? = null,
        names: CallFrameNames = CallFrameNames(CallFrameNameShow.NONE, CallFrameNameStyle.CAPTION, CallFrameFont.BOLD, "#FFFFFF", null),
        top: Double = 0.12,
        bottom: Double = 0.12,
        ornaments: List<CallFrameOrnament> = emptyList(),
    ): CallFrameLook = CallLiveFrameRule.frames().first().look.copy(
        layout = CallFrameLayout(CallFrameArrangement.SPLIT, margin = 0.04, gap = 0.02, top = top, bottom = bottom),
        title = title,
        subtitle = subtitle,
        brand = brand,
        names = names,
        ornaments = ornaments,
    )

    private fun scene(
        look: CallFrameLook,
        people: List<CallFramePerson> = listOf(person("Awa"), person("Karim")),
        texts: CallFrameTexts = CallFrameTexts(groupName = "Les cousins", isGroup = true, date = "29 oct. 2026", accentHex = null),
        width: Double = 1080.0,
        height: Double = 1920.0,
    ): CallFrameTextScene {
        val design = CallLiveFrameRule.frames().first().copy(look = look)
        return CallFrameTextScene(
            look,
            people,
            texts,
            CallFrameLayoutGeometry.areas(look.layout, width, height),
            CallFrameLayoutGeometry.slots(design, people.size, width, height),
        )
    }

    private fun brand(place: CallFrameBrandPlace, mark: CallFrameBrandMark = CallFrameBrandMark.BOTH) =
        CallFrameBrand(mark, place, "#FFFFFF", CallFrameTextSize.M, null)

    @Test
    fun `le titre du haut vit dans la reserve haute et le sous titre du bas dans la reserve basse`() {
        val s = scene(look(title(CallFrameTitleSource.GROUP), title(CallFrameTitleSource.DATE, CallFrameTitlePlace.BOTTOM)))
        val plan = CallFrameTextPlanner.plan(s, glyphs)
        val title = requireNotNull(plan.title)
        val subtitle = requireNotNull(plan.subtitle)
        assertThat(title.minY).isAtLeast(s.areas.top.minY)
        assertThat(title.maxY).isAtMost(s.areas.top.maxY + 1e-6)
        assertThat(subtitle.minY).isAtLeast(s.areas.bottom.minY - 1e-6)
        assertThat(subtitle.maxY).isAtMost(s.areas.bottom.maxY + 1e-6)
    }

    @Test
    fun `une reserve trop courte fait taire le titre mais jamais la signature`() {
        val s = scene(look(title(CallFrameTitleSource.GROUP, size = CallFrameTextSize.L), brand = brand(CallFrameBrandPlace.TOP), top = 0.03))
        val plan = CallFrameTextPlanner.plan(s, glyphs)
        assertThat(plan.title).isNull()
        assertThat(plan.brand).isNotNull()
        assertThat(plan.brandScale).isAtLeast(0.7)
        assertThat(plan.topScale).isEqualTo(0.0)
    }

    @Test
    fun `le titre ecrit le nom du groupe en capitales sans jamais y passer la marque`() {
        val upper = title(CallFrameTitleSource.GROUP).copy(letterCase = CallFrameLetterCase.UPPER)
        val s = scene(look(upper, title(CallFrameTitleSource.BRAND, CallFrameTitlePlace.BOTTOM).copy(letterCase = CallFrameLetterCase.UPPER)))
        val fitted = CallFrameTextPlanner.fittedTitles(s, CallFrameTextPlanner.plan(s, glyphs), glyphs)
        assertThat(fitted.map { it.text }).containsExactly("LES COUSINS", "meeshy").inOrder()
    }

    @Test
    fun `un titre trop long retrecit jusqu a soixante pour cent puis se tronque d une ellipse`() {
        val long = CallFrameTexts(groupName = "Le grand conseil de famille élargie du dimanche soir", isGroup = true, date = "", accentHex = null)
        val s = scene(look(title(CallFrameTitleSource.GROUP, size = CallFrameTextSize.L)), texts = long, width = 540.0, height = 960.0)
        val plan = CallFrameTextPlanner.plan(s, glyphs)
        val fitted = CallFrameTextPlanner.fittedTitles(s, plan, glyphs).single()
        val full = s.unit * CallFrameTextPlanner.titleShare(CallFrameTextSize.L) * plan.topScale
        assertThat(fitted.size).isWithin(1e-6).of(full * CallFrameText.MIN_SHARE)
        assertThat(fitted.text).endsWith(CallFrameText.ELLIPSIS)
        assertThat(glyphs.width(fitted.text, null, fitted.size)).isAtMost(fitted.row.width)
    }

    @Test
    fun `la lune et le REC cedent la place au titre plutot que de le tronquer`() {
        val moon = CallFrameOrnament(CallFrameOrnamentKind.MOON, "#FFFFFF", CallFrameDensity.MID, CallFrameLayer.FRONT)
        val s = scene(look(title(CallFrameTitleSource.GROUP), ornaments = listOf(moon)))
        val fitted = CallFrameTextPlanner.fittedTitles(s, CallFrameTextPlanner.plan(s, glyphs), glyphs).single()
        assertThat(fitted.text).isEqualTo("Les cousins")
        assertThat(CallFrameTextPlanner.ornamentAllowance(s, top = true)).isWithin(1e-6).of(s.unit * 0.17)
        assertThat(CallFrameTextPlanner.ornamentAllowance(s, top = false)).isEqualTo(0.0)
    }

    @Test
    fun `la signature d un coin se pose dans ce coin de l interieur`() {
        val s = scene(look(brand = brand(CallFrameBrandPlace.BOTTOM_RIGHT)))
        val box = CallFrameTextPlanner.brandBox(requireNotNull(s.look.brand), s.unit, glyphs)
        val rect = requireNotNull(CallFrameTextPlanner.brandFrame(s, CallFrameTextPlanner.plan(s, glyphs), box))
        assertThat(rect.maxX).isWithin(1e-6).of(s.areas.inner.maxX - s.unit * 0.035)
        assertThat(rect.maxY).isWithin(1e-6).of(s.areas.bottom.maxY - s.unit * 0.035)
        assertThat(CallFrameTextPlanner.brandAllowance(s, top = false, glyphs)).isGreaterThan(box.width)
    }

    @Test
    fun `le filigrane n a pas de cadre, il couvre la toile`() {
        val s = scene(look(brand = brand(CallFrameBrandPlace.WATERMARK)))
        val box = CallFrameTextPlanner.brandBox(requireNotNull(s.look.brand), s.unit, glyphs)
        assertThat(CallFrameTextPlanner.brandFrame(s, CallFrameTextPlanner.plan(s, glyphs), box)).isNull()
    }

    @Test
    fun `le logo seul est plus haut que le logo pres du mot, et le mot elargit la signature`() {
        val unit = 1080.0
        val logo = CallFrameTextPlanner.brandBox(brand(CallFrameBrandPlace.TOP, CallFrameBrandMark.LOGO), unit, glyphs)
        val both = CallFrameTextPlanner.brandBox(brand(CallFrameBrandPlace.TOP, CallFrameBrandMark.BOTH), unit, glyphs)
        assertThat(logo.logoHeight).isGreaterThan(both.logoHeight)
        assertThat(both.width).isGreaterThan(both.logoHeight * CallFrameTextPlanner.GLYPH_ASPECT)
        assertThat(CallFrameTextPlanner.GLYPH_ASPECT).isWithin(1e-6).of(588.0 / 344.0)
    }

    @Test
    fun `l encombrement des textes couvre le titre, la signature et la liste, le titre en tete`() {
        val names = CallFrameNames(CallFrameNameShow.NAME, CallFrameNameStyle.LIST, CallFrameFont.BOLD, "#FFFFFF", null)
        val s = scene(look(title(CallFrameTitleSource.GROUP), brand = brand(CallFrameBrandPlace.BOTTOM), names = names, bottom = 0.16))
        val layout = CallFrameTextPlanner.layout(s, glyphs)
        assertThat(layout.boxes).hasSize(3)
        assertThat(layout.headline).isEqualTo(layout.boxes.first())
        assertThat(layout.boxes).contains(requireNotNull(layout.plan.list))
    }
}
