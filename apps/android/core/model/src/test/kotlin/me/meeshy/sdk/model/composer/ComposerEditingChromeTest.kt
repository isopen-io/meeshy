package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Un objet sélectionné met le compositeur en édition (#13956, décision porteur du 2026-10-31, spec R6) : ni audience, ni
 * Publier, ni Annuler, et la colonne des outils cède sa place aux options de l'objet. Le fond média y entre aussi (grammaire
 * d'édition, #13973) : sélectionné, il pose son niveau « Fond » à la même place, sans barre au-dessus de Publier.
 */
class ComposerEditingChromeTest {

    private fun chrome(
        subject: ComposerSelectionSubject,
        drawing: Boolean = false,
        armed: Boolean = false,
        gestureOpen: Boolean = false,
    ) = ComposerEditingChrome.resolve(ComposerEditingChrome.Input(subject, drawing, armed, gestureOpen))

    @Test
    fun `at rest the composer shows close, publication and the six tools`() {
        val rest = chrome(ComposerSelectionSubject.NONE)

        assertThat(rest.close).isTrue()
        assertThat(rest.publication).isTrue()
        assertThat(rest.sceneControls).isTrue()
        assertThat(rest.rail).isEqualTo(ComposerRailContent.TOOLS)
        assertThat(rest.editing).isFalse()
    }

    @Test
    fun `a selected object hides close and publication and puts its options in place of the tools`() {
        val editing = chrome(ComposerSelectionSubject.OBJECT)

        assertThat(editing.close).isFalse()
        assertThat(editing.publication).isFalse()
        assertThat(editing.rail).isEqualTo(ComposerRailContent.OBJECT_OPTIONS)
        assertThat(editing.editing).isTrue()
    }

    @Test
    fun `undo, the slide strip and the editor's notices stay while an object is edited`() {
        assertThat(chrome(ComposerSelectionSubject.OBJECT).sceneControls).isTrue()
    }

    @Test
    fun `an object being written or with a panel open keeps publication hidden and leaves the rail empty`() {
        val writing = chrome(ComposerSelectionSubject.OBJECT, gestureOpen = true)

        assertThat(writing.publication).isFalse()
        assertThat(writing.close).isFalse()
        assertThat(writing.rail).isEqualTo(ComposerRailContent.NONE)
        assertThat(writing.editing).isTrue()
    }

    @Test
    fun `a selected background enters the editing like an object, its level Fond in place of the tools`() {
        val background = chrome(ComposerSelectionSubject.BACKGROUND)

        assertThat(background.close).isFalse()
        assertThat(background.publication).isFalse()
        assertThat(background.editing).isTrue()
        assertThat(background.sceneControls).isTrue()
        assertThat(background.rail).isEqualTo(ComposerRailContent.BACKGROUND_OPTIONS)
    }

    @Test
    fun `a background with a panel open keeps publication hidden and leaves the rail empty`() {
        val background = chrome(ComposerSelectionSubject.BACKGROUND, gestureOpen = true)

        assertThat(background.publication).isFalse()
        assertThat(background.rail).isEqualTo(ComposerRailContent.NONE)
    }

    @Test
    fun `the brush in hand or the viewfinder armed silence every chrome`() {
        listOf(chrome(ComposerSelectionSubject.NONE, drawing = true), chrome(ComposerSelectionSubject.OBJECT, armed = true)).forEach { quiet ->
            assertThat(quiet.close).isFalse()
            assertThat(quiet.publication).isFalse()
            assertThat(quiet.sceneControls).isFalse()
            assertThat(quiet.rail).isEqualTo(ComposerRailContent.NONE)
            assertThat(quiet.editing).isFalse()
        }
    }

    @Test
    fun `talkback says nothing at opening, editing on selection, and the return to the tools on deselection`() {
        val opening = ComposerEditingChrome.announcement(previous = null, editing = false)
        val selected = ComposerEditingChrome.announcement(previous = opening, editing = true)
        val deselected = ComposerEditingChrome.announcement(previous = selected, editing = false)

        assertThat(opening).isNull()
        assertThat(selected).isEqualTo(ComposerEditingAnnouncement.EDITING)
        assertThat(deselected).isEqualTo(ComposerEditingAnnouncement.TOOLS_BACK)
        assertThat(ComposerEditingChrome.announcement(previous = deselected, editing = false)).isEqualTo(ComposerEditingAnnouncement.TOOLS_BACK)
    }
}
