package me.meeshy.app.profile

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.UserStats
import me.meeshy.sdk.model.auth.CountryCatalog
import java.util.Locale
import org.junit.Test

/**
 * Ma page de profil, projetée en sections iso iOS (`ProfileView.scrollContent`) : l'ordre, les badges
 * Vérifié / Non vérifié du contact, les libellés des trois langues, les cartes de statistiques, la
 * pastille des demandes d'amis et les entrées qui n'existent que si leur destination existe.
 */
class OwnProfileSectionsPresenterTest {

    private fun user(
        email: String? = "ada@meeshy.me",
        emailVerifiedAt: String? = null,
        phoneNumber: String? = null,
        phoneVerifiedAt: String? = null,
        createdAt: String? = "2026-01-15T10:00:00.000Z",
    ) = MeeshyUser(
        id = "u1",
        username = "ada",
        email = email,
        emailVerifiedAt = emailVerifiedAt,
        phoneNumber = phoneNumber,
        phoneVerifiedAt = phoneVerifiedAt,
        createdAt = createdAt,
    )

    private fun present(
        user: MeeshyUser = user(),
        systemLanguage: String = "fr",
        regionalLanguage: String = "",
        customLanguage: String = "",
        isEditing: Boolean = false,
        stats: UserStatsPresentation? = null,
        pendingFriendRequests: Int = 0,
        canOpenStats: Boolean = false,
        canOpenProgression: Boolean = false,
        canOpenDecor: Boolean = false,
    ) = OwnProfileSectionsPresenter.present(
        OwnProfileSectionsInput(
            user = user,
            systemLanguage = systemLanguage,
            regionalLanguage = regionalLanguage,
            customDestinationLanguage = customLanguage,
            isEditing = isEditing,
            stats = stats,
            pendingFriendRequests = pendingFriendRequests,
            canOpenStats = canOpenStats,
            canOpenProgression = canOpenProgression,
            canOpenDecor = canOpenDecor,
        ),
    )

    @Test
    fun `the sections follow the iOS order`() {
        assertThat(present().sections).containsExactly(
            OwnProfileSection.IDENTITY,
            OwnProfileSection.CONTACT,
            OwnProfileSection.LANGUAGES,
            OwnProfileSection.STATS,
            OwnProfileSection.FRIEND_REQUESTS,
            OwnProfileSection.MEMBER_SINCE,
        ).inOrder()
    }

    @Test
    fun `an email with a verification date is verified`() {
        val email = present(user(emailVerifiedAt = "2026-02-01T00:00:00Z")).email
        assertThat(email.value).isEqualTo("ada@meeshy.me")
        assertThat(email.verification).isEqualTo(ContactVerification.VERIFIED)
    }

    @Test
    fun `an email without a verification date is not verified`() {
        assertThat(present(user(emailVerifiedAt = null)).email.verification)
            .isEqualTo(ContactVerification.NOT_VERIFIED)
    }

    @Test
    fun `a missing or blank contact carries no badge and no value`() {
        val presentation = present(user(email = " ", phoneNumber = null, phoneVerifiedAt = "2026-02-01T00:00:00Z"))
        assertThat(presentation.email.value).isNull()
        assertThat(presentation.email.verification).isNull()
        assertThat(presentation.phone.value).isNull()
        assertThat(presentation.phone.verification).isNull()
    }

    @Test
    fun `a phone carries its country flag and its verification`() {
        val phone = present(user(phoneNumber = "+33612345678", phoneVerifiedAt = "2026-02-01T00:00:00Z")).phone
        assertThat(phone.value).isEqualTo("+33612345678")
        assertThat(phone.flag).isEqualTo(CountryCatalog.flag("FR"))
        assertThat(phone.verification).isEqualTo(ContactVerification.VERIFIED)
    }

    @Test
    fun `the three language rows come in iOS order with the primary subtitle`() {
        val rows = present(systemLanguage = "fr", regionalLanguage = "en").languages
        assertThat(rows.map { it.slot }).containsExactly(
            OwnProfileLanguageSlot.PRIMARY,
            OwnProfileLanguageSlot.REGIONAL,
            OwnProfileLanguageSlot.CUSTOM,
        ).inOrder()
        assertThat(rows[0].showsSubtitle).isTrue()
        assertThat(rows[1].showsSubtitle).isFalse()
        assertThat(rows[2].showsSubtitle).isFalse()
    }

    @Test
    fun `a chosen language shows its flag and native name`() {
        val primary = present(systemLanguage = "fr").languages.first()
        assertThat(primary.value).isEqualTo(OwnProfileLanguageValue.Chosen(flag = "🇫🇷", nativeName = "Français"))
    }

    @Test
    fun `an unset primary language invites to choose and hides its subtitle`() {
        val primary = present(systemLanguage = "").languages.first()
        assertThat(primary.value).isEqualTo(OwnProfileLanguageValue.Choose)
        assertThat(primary.showsSubtitle).isFalse()
    }

    @Test
    fun `an unset secondary language reads none`() {
        val rows = present(regionalLanguage = "", customLanguage = "").languages
        assertThat(rows[1].value).isEqualTo(OwnProfileLanguageValue.None)
        assertThat(rows[2].value).isEqualTo(OwnProfileLanguageValue.None)
    }

    @Test
    fun `language rows only open the picker while editing, and only secondaries can be cleared`() {
        assertThat(present(isEditing = false).languages.map { it.isPickable }).containsExactly(false, false, false)
        val editing = present(isEditing = true).languages
        assertThat(editing.map { it.isPickable }).containsExactly(true, true, true)
        assertThat(editing.map { it.allowsClear }).containsExactly(false, true, true).inOrder()
    }

    @Test
    fun `the stat cards read messages, conversations and friend requests, zero before the stats arrive`() {
        assertThat(present(stats = null).statCards)
            .isEqualTo(OwnProfileStatCards(messages = "0", conversations = "0", friendRequests = "0"))
        val stats = UserStatsBuilder.build(
            UserStats(totalMessages = 12, totalConversations = 3, friendRequestsReceived = 7),
            Locale.US,
        )
        assertThat(present(stats = stats).statCards)
            .isEqualTo(OwnProfileStatCards(messages = "12", conversations = "3", friendRequests = "7"))
    }

    @Test
    fun `the stat cards open the statistics only when that screen exists`() {
        assertThat(present(canOpenStats = false).statsOpenable).isFalse()
        assertThat(present(canOpenStats = true).statsOpenable).isTrue()
    }

    @Test
    fun `progression and decor entries only appear when their destination is provided`() {
        val bare = present()
        assertThat(bare.showsProgression).isFalse()
        assertThat(bare.showsDecor).isFalse()
        val wired = present(canOpenProgression = true, canOpenDecor = true)
        assertThat(wired.showsProgression).isTrue()
        assertThat(wired.showsDecor).isTrue()
    }

    @Test
    fun `the friend requests badge shows only a positive count`() {
        assertThat(present(pendingFriendRequests = 0).friendRequestsBadge).isNull()
        assertThat(present(pendingFriendRequests = -2).friendRequestsBadge).isNull()
        assertThat(present(pendingFriendRequests = 4).friendRequestsBadge).isEqualTo("4")
    }

    @Test
    fun `member since is the account creation instant, absent when unreadable`() {
        assertThat(present(user(createdAt = "2026-01-15T10:00:00.000Z")).memberSinceEpochMillis)
            .isEqualTo(1_768_471_200_000L)
        assertThat(present(user(createdAt = null)).memberSinceEpochMillis).isNull()
        assertThat(present(user(createdAt = "hier")).memberSinceEpochMillis).isNull()
    }
}
