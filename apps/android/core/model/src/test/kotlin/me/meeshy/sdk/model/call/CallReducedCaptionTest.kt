package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * P18.10 (`docs/product/appels-vue-finale.md`) — pendant mon partage, l'appel réduit dit « nom · durée ». Mirrors iOS
 * `CallReducedRule.caption`.
 */
class CallReducedCaptionTest {

    @Test
    fun `the caption is the name then the duration`() {
        assertThat(CallReducedCaption.caption(title = "Awa", duration = "01:05")).isEqualTo("Awa · 01:05")
    }

    @Test
    fun `without a known name the duration speaks alone`() {
        assertThat(CallReducedCaption.caption(title = null, duration = "01:05")).isEqualTo("01:05")
        assertThat(CallReducedCaption.caption(title = "  ", duration = "01:05")).isEqualTo("01:05")
    }

    @Test
    fun `the name is trimmed`() {
        assertThat(CallReducedCaption.caption(title = " Awa ", duration = "00:09")).isEqualTo("Awa · 00:09")
    }

    @Test
    fun `the title is the name I gave the person, otherwise their display name`() {
        assertThat(CallReducedCaption.title(givenName = "Mamie", groupName = null, displayName = "Awa Diop")).isEqualTo("Mamie")
        assertThat(CallReducedCaption.title(givenName = " ", groupName = null, displayName = "Awa Diop")).isEqualTo("Awa Diop")
    }

    @Test
    fun `in a group the title is the group name, like the header capsule`() {
        assertThat(CallReducedCaption.title(givenName = "Mamie", groupName = "Famille", displayName = "Awa")).isEqualTo("Famille")
    }

    @Test
    fun `without any name there is no title`() {
        assertThat(CallReducedCaption.title(givenName = null, groupName = "", displayName = "  ")).isNull()
    }
}
