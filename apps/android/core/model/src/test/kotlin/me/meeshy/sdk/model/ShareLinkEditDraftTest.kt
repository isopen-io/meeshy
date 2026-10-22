package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Test

class ShareLinkEditDraftTest {

    private fun link(
        maxUses: Int? = 10,
        languages: List<String>? = null,
        expiresAt: String? = "2027-01-01T00:00:00Z",
    ) = MyShareLink(
        id = "i", linkId = "l", name = "Launch", maxUses = maxUses, expiresAt = expiresAt,
        allowedLanguages = languages,
    )

    private fun baseline(link: MyShareLink = link()) = ShareLinkEditDraft.from(link)

    @Test
    fun `un champ absent du fil prend le defaut du schema`() {
        val draft = ShareLinkEditDraft.from(MyShareLink(id = "i", linkId = "l"))
        assertThat(draft.requireNickname).isTrue()
        assertThat(draft.requireAccount).isFalse()
        assertThat(draft.allowMessages).isTrue()
        assertThat(draft.allowImages).isTrue()
        assertThat(draft.allowFiles).isFalse()
        assertThat(draft.allowHistory).isTrue()
        assertThat(draft.allowedLanguages).isEmpty()
    }

    @Test
    fun `sans modification il n y a rien a envoyer`() {
        assertThat(baseline().patchAgainst(baseline())).isNull()
    }

    @Test
    fun `seuls les champs modifies partent`() {
        val base = baseline()
        val patch = base.copy(name = "Renamed", allowFiles = true).patchAgainst(base)!!
        assertThat(patch.keys).containsExactly("name", "allowAnonymousFiles")
        assertThat(patch["name"]).isEqualTo(JsonPrimitive("Renamed"))
    }

    @Test
    fun `une limite videe part en null explicite`() {
        val base = baseline()
        val patch = base.withMaxUsesInput("").patchAgainst(base)!!
        assertThat(patch["maxUses"]).isEqualTo(JsonNull)
    }

    @Test
    fun `une echeance retiree part en null explicite`() {
        val base = baseline()
        val patch = base.copy(expiresAt = null).patchAgainst(base)!!
        assertThat(patch["expiresAt"]).isEqualTo(JsonNull)
    }

    @Test
    fun `la saisie numerique ne garde que les chiffres`() {
        assertThat(baseline().withMaxUsesInput("1a2").maxUses).isEqualTo(12)
        assertThat(baseline().withMaxConcurrentInput("abc").maxConcurrentUsers).isNull()
    }

    @Test
    fun `une limite inferieure a un est invalide`() {
        assertThat(baseline().copy(maxUses = 0).isValid).isFalse()
        assertThat(baseline().copy(maxConcurrentUsers = 0).isValid).isFalse()
        assertThat(baseline().copy(maxUses = null).isValid).isTrue()
    }

    @Test
    fun `la derniere langue ne se retire pas`() {
        val one = baseline().copy(allowedLanguages = listOf("fr"))
        assertThat(one.toggleLanguage("fr").allowedLanguages).containsExactly("fr")
    }

    @Test
    fun `ajouter puis retirer une langue`() {
        val draft = baseline().copy(allowedLanguages = listOf("fr")).toggleLanguage("en")
        assertThat(draft.allowedLanguages).containsExactly("fr", "en").inOrder()
        assertThat(draft.toggleLanguage("fr").allowedLanguages).containsExactly("en")
    }

    @Test
    fun `toutes les langues vide la liste et decocher preselectionne la langue de l interface`() {
        val restricted = baseline().withAllLanguages(all = false, defaultLanguage = "de")
        assertThat(restricted.allowedLanguages).containsExactly("de")
        assertThat(restricted.allowsAllLanguages).isFalse()
        assertThat(restricted.withAllLanguages(all = true, defaultLanguage = "de").allowsAllLanguages).isTrue()
    }

    @Test
    fun `une liste de langues modifiee part en tableau`() {
        val base = baseline()
        val patch = base.copy(allowedLanguages = listOf("fr", "en")).patchAgainst(base)!!
        assertThat(patch["allowedLanguages"].toString()).isEqualTo("[\"fr\",\"en\"]")
    }

    @Test
    fun `la valeur optimiste reflete le brouillon`() {
        val updated = baseline().copy(name = "", maxUses = null, allowedLanguages = listOf("fr")).applyTo(link())
        assertThat(updated.name).isNull()
        assertThat(updated.maxUses).isNull()
        assertThat(updated.allowedLanguages).containsExactly("fr")
    }

    @Test
    fun `le nom est toujours demande puis ce que le lien ajoute`() {
        val draft = baseline().copy(requireNickname = false, requireEmail = true, requireBirthday = true)
        assertThat(draft.askedFields).containsExactly(
            ShareLinkAskedField.FirstName,
            ShareLinkAskedField.LastName,
            ShareLinkAskedField.Email,
            ShareLinkAskedField.Birthday,
        ).inOrder()
    }

    @Test
    fun `les langues du lien hors choix rapides restent selectionnables`() {
        val draft = baseline().copy(allowedLanguages = listOf("fr", "sw"))
        assertThat(draft.languageChoices.last()).isEqualTo("sw")
        assertThat(draft.languageChoices.take(2)).containsExactly("fr", "en").inOrder()
    }

    @Test
    fun `activer l echeance propose une semaine et la desactiver la retire`() {
        val none = baseline(link(expiresAt = null))
        val on = none.withExpiryEnabled(true, nowMillis = 0L)
        assertThat(on.expiresAt).isEqualTo("1970-01-08T00:00:00Z")
        assertThat(on.withExpiryEnabled(true, nowMillis = 99L).expiresAt).isEqualTo(on.expiresAt)
        assertThat(on.withExpiryEnabled(false, nowMillis = 0L).expiresAt).isNull()
    }

    @Test
    fun `changer le jour garde l heure choisie`() {
        val draft = baseline(link(expiresAt = "2027-01-01T15:30:00Z"))
        val utcMidnight = java.time.LocalDate.of(2027, 3, 5).atStartOfDay(java.time.ZoneOffset.UTC).toInstant().toEpochMilli()
        val moved = draft.withExpiryDay(utcMidnight, java.time.ZoneOffset.UTC)
        assertThat(moved.expiresAt).isEqualTo("2027-03-05T15:30:00Z")
        assertThat(baseline(link(expiresAt = null)).withExpiryDay(utcMidnight, java.time.ZoneOffset.UTC).expiresAt).isNull()
    }
}
