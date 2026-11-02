package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class SceneSelectionTest {

    private val lists = SceneLists(
        texts = listOf(text("t1")), medias = listOf(media("bg", bg = true), media("m1")), places = listOf(place("p1")),
    )

    @Test
    fun `un objet pose de n importe quel genre se selectionne`() {
        assertThat(SceneSelection.select(lists, "t1")).isEqualTo("t1")
        assertThat(SceneSelection.select(lists, "p1")).isEqualTo("p1")
        assertThat(SceneSelection.select(lists, "m1")).isEqualTo("m1")
    }

    @Test
    fun `un fond ne se selectionne pas`() {
        assertThat(SceneSelection.select(lists, "bg")).isNull()
    }

    @Test
    fun `une selection dont l objet a disparu se vide`() {
        assertThat(SceneSelection.reconcile(lists, "gone")).isNull()
        assertThat(SceneSelection.reconcile(lists, null)).isNull()
        assertThat(SceneSelection.reconcile(lists, "t1")).isEqualTo("t1")
    }
}
