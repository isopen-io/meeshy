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
        reduced: Boolean = false,
        lane: Boolean = false,
    ) = ComposerEditingChrome.resolve(ComposerEditingChrome.Input(subject, drawing, armed, gestureOpen, sceneReduced = reduced, laneCleared = lane))

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
    fun `a panel raised at rest leaves the reduced scene bare - no close, no undo, no slide strip, no tools, no publication`() {
        val panel = chrome(ComposerSelectionSubject.NONE, gestureOpen = true, reduced = true)

        assertThat(panel.close).isFalse()
        assertThat(panel.sceneControls).isFalse()
        assertThat(panel.publication).isFalse()
        assertThat(panel.rail).isEqualTo(ComposerRailContent.NONE)
        assertThat(panel.editing).isFalse()
    }

    @Test
    fun `an object's properties at the bottom keep its options rail and silence undo and the slide strip`() {
        val properties = chrome(ComposerSelectionSubject.OBJECT, reduced = true)

        assertThat(properties.rail).isEqualTo(ComposerRailContent.OBJECT_OPTIONS)
        assertThat(properties.sceneControls).isFalse()
        assertThat(properties.close).isFalse()
        assertThat(properties.editing).isTrue()
    }

    @Test
    fun `a background setting at the bottom keeps its level Fond and silence undo and the slide strip`() {
        val setting = chrome(ComposerSelectionSubject.BACKGROUND, reduced = true)

        assertThat(setting.rail).isEqualTo(ComposerRailContent.BACKGROUND_OPTIONS)
        assertThat(setting.sceneControls).isFalse()
    }

    @Test
    fun `at rest undo and redo sit at the top of the scene`() {
        assertThat(chrome(ComposerSelectionSubject.NONE).history).isEqualTo(ComposerHistoryPlace.TOP)
        assertThat(chrome(ComposerSelectionSubject.OBJECT).history).isEqualTo(ComposerHistoryPlace.TOP)
    }

    @Test
    fun `an object edited beside a scene that cleared its lane puts undo and redo in that lane, never over the scene`() {
        val edited = chrome(ComposerSelectionSubject.OBJECT, lane = true)

        assertThat(edited.history).isEqualTo(ComposerHistoryPlace.LANE)
        assertThat(edited.sceneControls).isTrue()
    }

    @Test
    fun `a reduced scene or a quiet chrome shows undo and redo nowhere, lane or not`() {
        listOf(
            chrome(ComposerSelectionSubject.OBJECT, reduced = true, lane = true),
            chrome(ComposerSelectionSubject.BACKGROUND, reduced = true, lane = true),
            chrome(ComposerSelectionSubject.NONE, gestureOpen = true, reduced = true),
            chrome(ComposerSelectionSubject.OBJECT, armed = true, lane = true),
        ).forEach { assertThat(it.history).isEqualTo(ComposerHistoryPlace.NONE) }
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
