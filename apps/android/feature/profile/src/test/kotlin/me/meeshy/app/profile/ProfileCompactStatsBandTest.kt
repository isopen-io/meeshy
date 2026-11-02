package me.meeshy.app.profile

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.requiredWidth
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertHeightIsEqualTo
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.feature.profile.R
import me.meeshy.sdk.model.UserStats
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.util.Locale
import java.util.TimeZone

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class ProfileCompactStatsBandTest {

    @get:Rule
    val compose = createComposeRule()

    private val context = RuntimeEnvironment.getApplication()
    private val memberSince = 1_700_000_000_000L
    private val stats = UserStats(totalMessages = 12, totalTranslations = 5, languagesUsed = 3, memberDays = 400, totalConversations = 99)

    private fun band(stats: ProfileCompactStats) = compose.setContent {
        MeeshyTheme(darkTheme = false) {
            Box(Modifier.requiredWidth(420.dp)) {
                ProfileCompactStatsBand(stats = stats, accent = MeeshyPalette.Indigo500)
            }
        }
    }

    @Test
    fun `the band shows four chips in the iOS order, conversations and achievements left out`() {
        val chips = (ProfileDetailsBuilder.compactStats(memberSince, stats, isLoadingStats = false)?.chips as ProfileStatChips.Shown).chips
        assertThat(chips.map { it.kind }).containsExactly(
            ProfileStatChipKind.MESSAGES,
            ProfileStatChipKind.TRANSLATIONS,
            ProfileStatChipKind.LANGUAGES,
            ProfileStatChipKind.DAYS,
        ).inOrder()
        assertThat(chips.map { it.value }).containsExactly(12, 5, 3, 400).inOrder()
    }

    @Test
    fun `negative server counts never show below zero`() {
        val chips = (ProfileDetailsBuilder.compactStats(null, UserStats(totalMessages = -3), false)?.chips as ProfileStatChips.Shown).chips
        assertThat(chips.first().value).isEqualTo(0)
    }

    @Test
    fun `loading stats on an empty cache gives the skeleton`() {
        assertThat(ProfileDetailsBuilder.compactStats(memberSince, null, isLoadingStats = true)?.chips)
            .isEqualTo(ProfileStatChips.Loading)
    }

    @Test
    fun `cached stats win over the loading flag, never a skeleton over content`() {
        assertThat(ProfileDetailsBuilder.compactStats(memberSince, stats, isLoadingStats = true)?.chips)
            .isInstanceOf(ProfileStatChips.Shown::class.java)
    }

    @Test
    fun `a profile without stats shows no chips but keeps member since`() {
        val band = ProfileDetailsBuilder.compactStats(memberSince, null, isLoadingStats = false)
        assertThat(band?.chips).isNull()
        assertThat(band?.memberSinceEpochMillis).isEqualTo(memberSince)
    }

    @Test
    fun `nothing to show means no band at all`() {
        assertThat(ProfileDetailsBuilder.compactStats(null, null, isLoadingStats = false)).isNull()
    }

    @Test
    fun `each chip is read as value then label`() {
        band(ProfileCompactStats(memberSinceEpochMillis = null, chips = ProfileStatChips.Shown(
            listOf(ProfileStatChip(ProfileStatChipKind.MESSAGES, 12), ProfileStatChip(ProfileStatChipKind.DAYS, 400)),
        )))

        val messages = context.getString(R.string.profile_stats_messagesShort)
        val days = context.getString(R.string.profile_stats_daysShort)
        compose.onNodeWithContentDescription("12 $messages").assertExists()
        compose.onNodeWithContentDescription("400 $days").assertExists()
        assertThat(statChipSpokenLabel(12, messages)).isEqualTo("12 $messages")
    }

    @Test
    fun `the skeleton is announced and its blocks are 56 dp tall`() {
        band(ProfileCompactStats(memberSinceEpochMillis = null, chips = ProfileStatChips.Loading))

        compose.onNodeWithContentDescription(context.getString(R.string.profile_details_stats_loading)).assertExists()
        compose.onNodeWithTag(PROFILE_STATS_SKELETON_TAG).assertHeightIsEqualTo(56.dp)
        compose.onNodeWithTag(PROFILE_STATS_CHIPS_TAG).assertDoesNotExist()
    }

    @Test
    fun `member since is read as a settings row label then value`() {
        band(ProfileCompactStats(memberSinceEpochMillis = memberSince, chips = null))

        val date = memberSinceLongDate(memberSince, context.resources.configuration.locales[0])
        compose.onNodeWithContentDescription("${context.getString(R.string.profile_stats_memberSince)}, $date").assertExists()
        compose.onNodeWithTag(PROFILE_STATS_SKELETON_TAG).assertDoesNotExist()
    }

    @Test
    fun `member since is a long date in the device locale`() {
        val utc = TimeZone.getTimeZone("UTC")
        assertThat(memberSinceLongDate(memberSince, Locale.US, utc)).isEqualTo("November 14, 2023")
        assertThat(memberSinceLongDate(memberSince, Locale.FRANCE, utc)).isEqualTo("14 novembre 2023")
    }
}
