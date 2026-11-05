package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ParticipantCardPresenterTest {

    private fun profile(
        language: String? = null,
        hasEmail: Boolean = false,
        email: String? = null,
        hasBirthday: Boolean = false,
        birthday: String? = null,
    ) = ApiParticipantProfile(
        participantId = "p1", conversationId = "c1", language = language, country = "FR",
        joinedAt = "2026-05-01T10:30:00.000Z", shareLinkName = "Soirée",
        hasEmail = hasEmail, email = email, hasBirthday = hasBirthday, birthday = birthday,
    )

    @Test fun `les lignes suivent l ordre, la langue en majuscules`() {
        val kinds = ParticipantCardPresenter.infoRows(profile(language = "fr")).map { it.kind }
        assertThat(kinds).containsExactly(
            ParticipantInfoKind.LANGUAGE, ParticipantInfoKind.COUNTRY,
            ParticipantInfoKind.JOINED, ParticipantInfoKind.VIA_LINK,
        ).inOrder()
        assertThat(ParticipantCardPresenter.infoRows(profile(language = "fr")).first().value).isEqualTo("FR")
    }

    @Test fun `un email fourni mais non servi est masque, servi il est affiche, absent il n y a pas de ligne`() {
        val withheld = ParticipantCardPresenter.infoRows(profile(hasEmail = true)).single { it.kind == ParticipantInfoKind.EMAIL }
        assertThat(withheld.withheld).isTrue()
        assertThat(withheld.value).isNull()
        val served = ParticipantCardPresenter.infoRows(profile(hasEmail = true, email = "a@b.c"))
            .single { it.kind == ParticipantInfoKind.EMAIL }
        assertThat(served.withheld).isFalse()
        assertThat(served.value).isEqualTo("a@b.c")
        assertThat(ParticipantCardPresenter.infoRows(profile()).map { it.kind }).doesNotContain(ParticipantInfoKind.EMAIL)
    }

    @Test fun `la naissance suit la meme regle de masque`() {
        val row = ParticipantCardPresenter.infoRows(profile(hasBirthday = true)).single { it.kind == ParticipantInfoKind.BIRTHDAY }
        assertThat(row.withheld).isTrue()
    }

    @Test fun `les reglages du lien joignent les exigences et mettent les langues en majuscules`() {
        val settings = ParticipantCardPresenter.linkSettings(
            ParticipantEntryLink(
                isActive = false, maxUses = 10, currentUses = 3, requireNickname = true, requireBirthday = true,
                allowedLanguages = listOf("fr", "en"),
            ),
        )
        assertThat(settings.inactive).isTrue()
        assertThat(settings.uses).isEqualTo("3 / 10")
        assertThat(settings.languages).isEqualTo("FR, EN")
        assertThat(ParticipantCardPresenter.joinRequirements(listOf("pseudo", "naissance"))).isEqualTo("pseudo · naissance")
        assertThat(settings.requirements).containsExactly(EntryLinkRequirement.NICKNAME, EntryLinkRequirement.BIRTHDAY).inOrder()
    }

    @Test fun `sans plafond les entrees sont le seul nombre`() {
        assertThat(ParticipantCardPresenter.linkSettings(ParticipantEntryLink(currentUses = 4)).uses).isEqualTo("4")
    }

    @Test fun `l edition des droits est la reponse du serveur par entryLink`() {
        assertThat(ParticipantCardPresenter.canEditRights(profile())).isFalse()
        assertThat(ParticipantCardPresenter.canEditRights(profile().copy(entryLink = ParticipantEntryLink()))).isTrue()
    }

    @Test fun `le nom complet prefere prenom nom, puis nom affiche, puis pseudo`() {
        val base = profile().copy(displayName = "ano", username = "u")
        assertThat(ParticipantCardPresenter.fullName(base.copy(firstName = "Ada", lastName = "L"))).isEqualTo("Ada L")
        assertThat(ParticipantCardPresenter.fullName(base)).isEqualTo("ano")
        assertThat(ParticipantCardPresenter.fullName(base.copy(displayName = null))).isEqualTo("u")
    }

    @Test fun `les interrupteurs ne montrent que les droits dits`() {
        val caps = ParticipantEntryCapabilities(canViewHistory = null)
        assertThat(ParticipantCardPresenter.editableCapabilities(profile().copy(entryCapabilities = caps)))
            .doesNotContain(ParticipantCapability.CAN_VIEW_HISTORY)
    }
}
