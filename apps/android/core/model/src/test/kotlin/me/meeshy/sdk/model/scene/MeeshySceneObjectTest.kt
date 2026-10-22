package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class MeeshySceneObjectTest {

    @Test
    fun `chaque genre porte son kind et son identifiant`() {
        val all = listOf(
            MeeshySceneObject.Text(text("t1")), MeeshySceneObject.Media(media("m1")),
            MeeshySceneObject.Sticker(sticker("s1")), MeeshySceneObject.Place(place("p1")),
            MeeshySceneObject.Audio(audio("a1")),
        )
        assertThat(all.map { it.kind }).containsExactly(
            MeeshySceneObject.Kind.TEXT, MeeshySceneObject.Kind.MEDIA, MeeshySceneObject.Kind.STICKER,
            MeeshySceneObject.Kind.PLACE, MeeshySceneObject.Kind.AUDIO,
        ).inOrder()
        assertThat(all.map { it.id }).containsExactly("t1", "m1", "s1", "p1", "a1").inOrder()
    }

    @Test
    fun `l audio sans geometrie posee prend les defauts du convertisseur`() {
        val a = MeeshySceneObject.Audio(audio(x = 0.25f, y = 0.75f))
        assertThat(a.x).isEqualTo(0.25)
        assertThat(a.y).isEqualTo(0.75)
        assertThat(a.scale).isEqualTo(1.0)
        assertThat(a.rotation).isEqualTo(0.0)
        assertThat(a.zIndex).isEqualTo(0)
        assertThat(a.duration).isNull()
        assertThat(a.startTime).isNull()
    }

    @Test
    fun `seuls un media et un audio peuvent etre au fond`() {
        assertThat(MeeshySceneObject.Media(media(bg = true)).isBackground).isTrue()
        assertThat(MeeshySceneObject.Audio(audio(bg = true)).isBackground).isTrue()
        assertThat(MeeshySceneObject.Audio(audio(bg = null)).isBackground).isFalse()
        assertThat(MeeshySceneObject.Text(text()).isBackground).isFalse()
        assertThat(MeeshySceneObject.Sticker(sticker()).isBackground).isFalse()
        assertThat(MeeshySceneObject.Place(place()).isBackground).isFalse()
    }

    @Test
    fun `la fenetre de temps se lit sur les cinq familles dans un seul type`() {
        val t = MeeshySceneObject.Text(text().copy(startTime = 1.5, duration = 2.0))
        val a = MeeshySceneObject.Audio(audio().copy(startTime = 1.5f, duration = 2.0f))
        val p = MeeshySceneObject.Place(place().copy(startTime = 0.0, duration = 3.0))
        assertThat(t.startTime).isEqualTo(1.5)
        assertThat(a.duration).isEqualTo(2.0)
        assertThat(p.startTime).isEqualTo(0.0)
    }
}
