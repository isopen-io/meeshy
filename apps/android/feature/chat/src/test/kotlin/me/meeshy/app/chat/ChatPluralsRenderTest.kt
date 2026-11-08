package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import me.meeshy.feature.chat.R
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

/** #15079 — les compteurs du fil sont de vrais pluriels CLDR, sans « (s) », dans la langue du lecteur. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ChatPluralsRenderTest {

    private fun render(qualifiers: String, id: Int, count: Int): String {
        RuntimeEnvironment.setQualifiers(qualifiers)
        return RuntimeEnvironment.getApplication().resources.getQuantityString(id, count, count)
    }

    private fun arabicNumber(count: Int): String = String.format(java.util.Locale.forLanguageTag("ar"), "%d", count)

    @Test
    fun `english pinned count agrees with its number`() {
        assertThat(render("en", R.plurals.chat_pinned_count, 1)).isEqualTo("1 pinned message")
        assertThat(render("en", R.plurals.chat_pinned_count, 0)).isEqualTo("0 pinned messages")
        assertThat(render("en", R.plurals.chat_pinned_count, 2)).isEqualTo("2 pinned messages")
        assertThat(render("en", R.plurals.chat_pinned_count, 11)).isEqualTo("11 pinned messages")
    }

    @Test
    fun `english header members agrees with its number`() {
        assertThat(render("en", R.plurals.chat_header_members, 1)).isEqualTo("1 member")
        assertThat(render("en", R.plurals.chat_header_members, 5)).isEqualTo("5 members")
    }

    @Test
    fun `french zero and one member are singular`() {
        assertThat(render("fr", R.plurals.chat_header_members, 0)).isEqualTo("0 membre")
        assertThat(render("fr", R.plurals.chat_header_members, 1)).isEqualTo("1 membre")
        assertThat(render("fr", R.plurals.chat_header_members, 2)).isEqualTo("2 membres")
        assertThat(render("fr", R.plurals.chat_header_members, 11)).isEqualTo("11 membres")
    }

    @Test
    fun `french active effects drop the parenthesised plural`() {
        assertThat(render("fr", R.plurals.chat_effects_active_count, 1)).isEqualTo("1 effet actif")
        assertThat(render("fr", R.plurals.chat_effects_active_count, 2)).isEqualTo("2 effets actifs")
    }

    @Test
    fun `french pinned and typing counts use their own plural`() {
        assertThat(render("fr", R.plurals.chat_pinned_count, 1)).isEqualTo("1 message épinglé")
        assertThat(render("fr", R.plurals.chat_pinned_count, 5)).isEqualTo("5 messages épinglés")
        assertThat(render("fr", R.plurals.chat_typing_many, 3)).isEqualTo("3 personnes écrivent…")
    }

    @Test
    fun `arabic header members has six forms`() {
        val forms = listOf(0, 1, 2, 5, 11, 100).map { render("ar", R.plurals.chat_header_members, it) }
        assertThat(forms).containsExactly(
            "لا أعضاء",
            "عضو واحد",
            "عضوان",
            "${arabicNumber(5)} أعضاء",
            "${arabicNumber(11)} عضوًا",
            "${arabicNumber(100)} عضو",
        ).inOrder()
    }

    @Test
    fun `arabic pinned count has six forms`() {
        val forms = listOf(0, 1, 2, 5, 11, 100).map { render("ar", R.plurals.chat_pinned_count, it) }
        assertThat(forms.toSet()).hasSize(6)
        assertThat(forms[3]).isEqualTo("${arabicNumber(5)} رسائل مثبتة")
        assertThat(forms[4]).isEqualTo("${arabicNumber(11)} رسالة مثبتة")
        assertThat(forms[5]).isEqualTo("${arabicNumber(100)} رسالة مثبتة")
        assertThat(forms[0]).isEqualTo("لا رسائل مثبتة")
        assertThat(forms[2]).isEqualTo("رسالتان مثبتتان")
    }
}
