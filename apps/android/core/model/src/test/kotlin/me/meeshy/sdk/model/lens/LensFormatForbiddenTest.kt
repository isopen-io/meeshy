package me.meeshy.sdk.model.lens

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class LensFormatForbiddenTest {

    private fun forbidden(json: String): List<String> =
        (LensFormat.parse(json) as LensParseOutcome.Forbidden).reasons

    @Test
    fun `une cle shader ou script ou reseau est refusee en bloc`() {
        assertThat(forbidden("""{"schema":1,"shader":"x"}""")).containsExactly("key:shader")
        assertThat(forbidden("""{"schema":1,"layers":[{"script":1}]}""")).containsExactly("key:script")
        assertThat(forbidden("""{"schema":1,"network":{}}""")).containsExactly("key:network")
    }

    @Test
    fun `une couche 3D ou shader est refusee`() {
        assertThat(forbidden("""{"schema":1,"layers":[{"kind":"3d"},{"kind":"shader"}]}"""))
            .containsExactly("layer:3d", "layer:shader").inOrder()
    }

    @Test
    fun `une URL dans une valeur est refusee mais metadata n'en est pas une`() {
        assertThat(forbidden("""{"schema":1,"a":"https://x.y"}""")).containsExactly("url")
        assertThat(forbidden("""{"schema":1,"a":"//cdn"}""")).containsExactly("url")
        assertThat(forbidden("""{"schema":1,"a":"DATA:text"}""")).containsExactly("url")
        assertThat(LensFormat.parse("""{"schema":1,"a":"metadata:x"}""")).isEqualTo(LensParseOutcome.Invalid)
    }

    @Test
    fun `une URL apres un emoji reste detectee`() {
        assertThat(forbidden("""{"schema":1,"a":"😀😀 data:x"}""")).containsExactly("url")
    }

    @Test
    fun `les raisons se cumulent sans doublon et triees`() {
        val reasons = forbidden("""{"schema":1,"script":1,"a":"http://x","b":"//y","layers":[{"kind":"shader"}]}""")
        assertThat(reasons).containsExactly("key:script", "layer:shader", "url").inOrder()
    }

    @Test
    fun `un schema futur passe avant les interdits`() {
        assertThat(LensFormat.parse("""{"schema":2,"shader":1}""")).isEqualTo(LensParseOutcome.UpdateRequired(2))
    }
}
