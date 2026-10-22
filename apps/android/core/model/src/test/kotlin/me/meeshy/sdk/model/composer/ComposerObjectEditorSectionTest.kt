package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ComposerObjectEditorSectionTest {

    private val allSections: List<ComposerObjectEditorSection> =
        ComposerObjectKind.values().flatMap { ComposerObjectEditorRail.entries(it) }.distinct() +
            ComposerInlineEditing.sections(ComposerInlineFamily.Image, true)

    private fun edit(open: ComposerObjectEditorSection? = null) =
        ComposerInlineEdit("o1", ComposerInlineFamily.Text, open)

    @Test
    fun `pour toute paire de sections ouvrir la seconde ferme la premiere`() {
        val sections = allSections.distinct()
        assertThat(sections.size).isAtLeast(10)
        for (a in sections) for (b in sections) {
            val opened = ComposerInlineEditing.tapped(b, ComposerInlineEditing.tapped(a, edit()))
            val expected = if (a == b) null else b
            assertThat(opened.openSection).isEqualTo(expected)
        }
    }

    @Test
    fun `toucher la section ouverte la referme`() {
        val s = ComposerObjectEditorSection.Timing
        assertThat(ComposerInlineEditing.tapped(s, edit(s)).openSection).isNull()
    }

    @Test
    fun `le texte sert ses huit outils puis apparition et timeline`() {
        val e = ComposerObjectEditorRail.entries(ComposerObjectKind.TEXT)
        assertThat(e).hasSize(10)
        assertThat(e.first()).isEqualTo(ComposerObjectEditorRail.initiallySelected)
        assertThat(e.takeLast(2)).containsExactly(ComposerObjectEditorSection.Timing, ComposerObjectEditorSection.Plan).inOrder()
    }

    @Test
    fun `sticker et lieu ne servent que apparition et timeline`() {
        val expected = listOf(ComposerObjectEditorSection.Timing, ComposerObjectEditorSection.Plan)
        assertThat(ComposerObjectEditorRail.entries(ComposerObjectKind.STICKER)).isEqualTo(expected)
        assertThat(ComposerObjectEditorRail.entries(ComposerObjectKind.PLACE)).isEqualTo(expected)
    }

    @Test
    fun `l audio ne sert que le rognage`() {
        assertThat(ComposerObjectEditorRail.entries(ComposerObjectKind.AUDIO).first())
            .isEqualTo(ComposerObjectEditorSection.Media(MediaEditTool.TRIM))
    }

    @Test
    fun `sans source rognable le rognage disparait et les effets suivent sans filtre`() {
        val e = ComposerObjectEditorRail.entries(ComposerObjectKind.MEDIA, hasTrimmableSource = false, offersFilter = false)
        assertThat(e).doesNotContain(ComposerObjectEditorSection.Media(MediaEditTool.TRIM))
        assertThat(e).doesNotContain(ComposerObjectEditorSection.Media(MediaEditTool.FILTER))
        assertThat(e).doesNotContain(ComposerObjectEditorSection.Media(MediaEditTool.EFFECTS))
    }

    @Test
    fun `la famille decide des sous-outils servis`() {
        val image = ComposerInlineEditing.sections(ComposerInlineFamily.Image, true)
        val video = ComposerInlineEditing.sections(ComposerInlineFamily.Video, true)
        assertThat(image.first()).isEqualTo(ComposerObjectEditorSection.Media(MediaEditTool.CROP))
        assertThat(video).doesNotContain(ComposerObjectEditorSection.Media(MediaEditTool.FILTER))
        assertThat(ComposerInlineEditing.sections(ComposerInlineFamily.Text, true))
            .doesNotContain(ComposerObjectEditorSection.Media(MediaEditTool.TRIM))
    }

    @Test
    fun `un objet qui devient fond change de famille et perd apparition et timeline`() {
        val before = ComposerInlineFamily.of(ComposerObjectKind.MEDIA, isVideo = false, isBackground = false)
        val after = ComposerInlineFamily.of(ComposerObjectKind.MEDIA, isVideo = false, isBackground = true)
        assertThat(before).isEqualTo(ComposerInlineFamily.Image)
        assertThat(after).isEqualTo(ComposerInlineFamily.Background(false))
        val sections = ComposerInlineEditing.sections(after, true)
        assertThat(sections).containsNoneOf(ComposerObjectEditorSection.Timing, ComposerObjectEditorSection.Plan)
    }

    @Test
    fun `la famille se deduit du kind`() {
        assertThat(ComposerInlineFamily.of(ComposerObjectKind.MEDIA, true, false)).isEqualTo(ComposerInlineFamily.Video)
        assertThat(ComposerInlineFamily.of(ComposerObjectKind.TEXT, false, false)).isEqualTo(ComposerInlineFamily.Text)
        assertThat(ComposerInlineFamily.Background(true).isVideo).isTrue()
    }

    @Test
    fun `begin hors surface scene ou section non servie n ouvre rien`() {
        assertThat(ComposerInlineEditing.begin("o", ComposerInlineFamily.Text, false, null, true)).isNull()
        val e = ComposerInlineEditing.begin("o", ComposerInlineFamily.Text, true, ComposerObjectEditorSection.Media(MediaEditTool.TRIM), true)
        assertThat(e!!.openSection).isNull()
    }

    @Test
    fun `resolved referme une section qui n est plus servie et abandonne une autre selection`() {
        val open = ComposerObjectEditorSection.Timing
        val e = edit(open)
        assertThat(ComposerInlineEditing.resolved(e, "o1", ComposerInlineFamily.Text, listOf(open), true)).isEqualTo(e)
        assertThat(ComposerInlineEditing.resolved(e, "o1", ComposerInlineFamily.Text, emptyList(), true)!!.openSection).isNull()
        assertThat(ComposerInlineEditing.resolved(e, "autre", ComposerInlineFamily.Text, listOf(open), true)).isNull()
    }

    @Test
    fun `selection garde la courante si servie sinon prend la premiere`() {
        val keep = ComposerObjectEditorSection.Timing
        assertThat(ComposerObjectEditorRail.selection(ComposerObjectKind.STICKER, keep)).isEqualTo(keep)
        assertThat(ComposerObjectEditorRail.selection(ComposerObjectKind.AUDIO, ComposerObjectEditorRail.initiallySelected))
            .isEqualTo(ComposerObjectEditorSection.Media(MediaEditTool.TRIM))
    }

    @Test
    fun `identifiants stables`() {
        assertThat(ComposerObjectEditorSection.Tool(TextEditTool.STYLE).identifier).isEqualTo("tool.style")
        assertThat(ComposerObjectEditorSection.Media(MediaEditTool.ALT_TEXT).identifier).isEqualTo("media.altText")
    }
}
