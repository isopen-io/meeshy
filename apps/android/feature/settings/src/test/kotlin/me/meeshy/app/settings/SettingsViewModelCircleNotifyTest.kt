package me.meeshy.app.settings

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.language.InMemoryInterfaceLanguageStore
import me.meeshy.sdk.model.UserNotificationPreferences
import me.meeshy.sdk.model.relation.RelationAudienceChoice
import me.meeshy.sdk.notification.InMemoryNotificationPreferencesStore
import me.meeshy.sdk.notification.NotificationPreferencesSyncRepository
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.theme.InMemoryThemeStore
import me.meeshy.sdk.user.UserRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

/** « Qui est prévenu » (#14064) : un cran choisi se peint aussitôt et part en file vers la passerelle, hors ligne compris. */
@OptIn(ExperimentalCoroutinesApi::class)
class SettingsViewModelCircleNotifyTest {

    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private class Fixture(seed: UserNotificationPreferences = UserNotificationPreferences()) {
        val store = InMemoryNotificationPreferencesStore(seed)
        val sync = mockk<NotificationPreferencesSyncRepository>().also { coEvery { it.enqueueSync(any()) } returns null }
        val vm = SettingsViewModel(
            sessionRepository = mockk<SessionRepository>().also { every { it.currentUser } returns MutableStateFlow(null) },
            userRepository = mockk<UserRepository>(relaxed = true),
            themeStore = InMemoryThemeStore(),
            interfaceLanguageStore = InMemoryInterfaceLanguageStore(),
            notificationPreferencesStore = store,
            notificationPreferencesSyncRepository = sync,
            workManager = mockk(relaxed = true),
        )
    }

    @Test
    fun `a chosen circle is painted at once and queued with the rest of the block`() = runTest(dispatcher) {
        val f = Fixture(UserNotificationPreferences(pushEnabled = false))
        advanceUntilIdle()

        f.vm.setCircleAudience("circlePublicationReel", RelationAudienceChoice.FRIEND)
        advanceUntilIdle()

        val expected = UserNotificationPreferences(
            pushEnabled = false,
            circleAudience = mapOf("circlePublicationReel" to RelationAudienceChoice.FRIEND),
        )
        assertThat(f.vm.state.value.notifications).isEqualTo(expected)
        coVerify(exactly = 1) { f.sync.enqueueSync(expected) }
    }

    @Test
    fun `a second choice keeps the first one`() = runTest(dispatcher) {
        val f = Fixture()
        advanceUntilIdle()

        f.vm.setCircleAudience("circlePublicationReel", RelationAudienceChoice.FRIEND)
        f.vm.setCircleAudience("circleElsewhereMention", RelationAudienceChoice.NOBODY)
        advanceUntilIdle()

        assertThat(f.store.preferences.value.circleAudience).containsExactly(
            "circlePublicationReel", RelationAudienceChoice.FRIEND,
            "circleElsewhereMention", RelationAudienceChoice.NOBODY,
        )
    }

    @Test
    fun `an unknown key is never written nor sent`() = runTest(dispatcher) {
        val f = Fixture()
        advanceUntilIdle()

        f.vm.setCircleAudience("circleEverywhereEverything", RelationAudienceChoice.PUBLIC)
        advanceUntilIdle()

        assertThat(f.store.preferences.value.circleAudience).isEmpty()
        coVerify(exactly = 0) { f.sync.enqueueSync(any()) }
    }
}
