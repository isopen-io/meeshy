package me.meeshy.sdk.model.contacts

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PhonebookFilterTest {

    private fun c(id: String, name: String?, meeshy: Boolean, username: String? = null, phones: List<String> = emptyList(), emails: List<String> = emptyList()) =
        DirectoryContact(
            id = id, displayName = name, phoneNumbers = phones, emails = emails, isOnMeeshy = meeshy,
            matchedUser = username?.let { MatchedContactUser(id = "u$id", username = it) },
        )

    private val book = listOf(
        c("1", "Élodie Martin", true, "elo", emails = listOf("Elodie@Mail.com")),
        c("2", "Bob", false, phones = listOf("+33612345678")),
        c("3", "Zoé", false),
    )

    @Test fun `filters and count`() {
        assertThat(PhonebookFilter.visible(book, DirectoryFilter.All, "")).hasSize(3)
        assertThat(PhonebookFilter.visible(book, DirectoryFilter.Meeshy, "").map { it.id }).containsExactly("1")
        assertThat(PhonebookFilter.visible(book, DirectoryFilter.Invitable, "").map { it.id }).containsExactly("2", "3")
        assertThat(PhonebookFilter.meeshyCount(book)).isEqualTo(1)
    }

    @Test fun `search ignores case and accents across fields`() {
        assertThat(PhonebookFilter.visible(book, DirectoryFilter.All, "ELODIE").map { it.id }).containsExactly("1")
        assertThat(PhonebookFilter.visible(book, DirectoryFilter.All, "zoe").map { it.id }).containsExactly("3")
        assertThat(PhonebookFilter.visible(book, DirectoryFilter.All, "elo").map { it.id }).containsExactly("1")
        assertThat(PhonebookFilter.visible(book, DirectoryFilter.All, "mail.com").map { it.id }).containsExactly("1")
        assertThat(PhonebookFilter.visible(book, DirectoryFilter.All, "612345").map { it.id }).containsExactly("2")
    }

    @Test fun `search composes with the filter`() {
        assertThat(PhonebookFilter.visible(book, DirectoryFilter.Invitable, "elodie")).isEmpty()
    }

    @Test fun `platform relay needs two chars and an empty local answer`() {
        assertThat(PhonebookFilter.showsPlatformResults("a", emptyList())).isFalse()
        assertThat(PhonebookFilter.showsPlatformResults(" ab ", emptyList())).isTrue()
        assertThat(PhonebookFilter.showsPlatformResults("ab", book)).isFalse()
    }

    @Test fun `self is excluded from platform results`() {
        assertThat(PhonebookFilter.excludingSelf(listOf("me", "x"), "me") { it }).containsExactly("x")
    }
}
