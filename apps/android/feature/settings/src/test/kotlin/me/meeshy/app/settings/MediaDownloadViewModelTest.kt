package me.meeshy.app.settings

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import androidx.work.WorkManager
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import io.mockk.verify
import me.meeshy.sdk.media.InMemoryCaptureSavePolicyStore
import me.meeshy.sdk.media.InMemoryOutgoingPhotoLocationStore
import me.meeshy.sdk.media.MediaDownloadPreferencesStore
import me.meeshy.sdk.model.AutoDownloadPolicy
import me.meeshy.sdk.model.MediaDownloadPreferences
import me.meeshy.sdk.model.MediaKind
import me.meeshy.sdk.model.PrivacyPreferences
import me.meeshy.sdk.privacy.InMemoryPrivacyPreferencesStore
import me.meeshy.sdk.privacy.NoOpAnalyticsCollectionGate
import me.meeshy.sdk.privacy.PrivacyPreferencesStore
import me.meeshy.sdk.privacy.PrivacyPreferencesSyncRepository
import me.meeshy.sdk.model.composer.capture.CaptureRenderedSaveMode
import me.meeshy.sdk.model.composer.capture.CaptureSavePolicy
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * Behavioural coverage of [MediaDownloadViewModel]: it mirrors the store's persisted policy
 * block into an immutable UI state, persists a per-kind policy change through the store SSOT
 * without clobbering the other kinds, and short-circuits a no-op re-selection.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class MediaDownloadViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    /** A store that records writes, so the no-op guard can be asserted behaviourally. */
    private class RecordingStore(
        initial: MediaDownloadPreferences = MediaDownloadPreferences(),
    ) : MediaDownloadPreferencesStore {
        private val flow = MutableStateFlow(initial)
        override val preferences: StateFlow<MediaDownloadPreferences> = flow.asStateFlow()
        var writeCount: Int = 0
            private set

        override suspend fun setPreferences(preferences: MediaDownloadPreferences) {
            writeCount += 1
            flow.value = preferences
        }
    }

    private fun gallery(
        privacy: PrivacyPreferencesStore = InMemoryPrivacyPreferencesStore(),
        sync: PrivacyPreferencesSyncRepository = mockk(relaxed = true),
        workManager: WorkManager = mockk(relaxed = true),
    ) = PrivacyToggleWriter(privacy, sync, workManager, NoOpAnalyticsCollectionGate)

    @Test
    fun state_mirrorsThePersistedPreferences() = runTest {
        val store = RecordingStore(MediaDownloadPreferences(video = AutoDownloadPolicy.ALWAYS))
        val vm = MediaDownloadViewModel(store, InMemoryCaptureSavePolicyStore(), InMemoryOutgoingPhotoLocationStore(), gallery())
        advanceUntilIdle()
        assertThat(vm.state.value.preferences.video).isEqualTo(AutoDownloadPolicy.ALWAYS)
    }

    @Test
    fun setPolicy_persistsTheChangeForThatKind_leavingOthersUntouched() = runTest {
        val store = RecordingStore()
        val vm = MediaDownloadViewModel(store, InMemoryCaptureSavePolicyStore(), InMemoryOutgoingPhotoLocationStore(), gallery())
        advanceUntilIdle()

        vm.setPolicy(MediaKind.VIDEO, AutoDownloadPolicy.ALWAYS)
        advanceUntilIdle()

        assertThat(store.preferences.value.video).isEqualTo(AutoDownloadPolicy.ALWAYS)
        assertThat(store.preferences.value.image).isEqualTo(MediaDownloadPreferences().image)
        assertThat(store.preferences.value.audio).isEqualTo(MediaDownloadPreferences().audio)
        assertThat(store.preferences.value.audioTranslation)
            .isEqualTo(MediaDownloadPreferences().audioTranslation)
        assertThat(vm.state.value.preferences.video).isEqualTo(AutoDownloadPolicy.ALWAYS)
    }

    @Test
    fun setPolicy_routesEachKindToItsOwnField() = runTest {
        val store = RecordingStore()
        val vm = MediaDownloadViewModel(store, InMemoryCaptureSavePolicyStore(), InMemoryOutgoingPhotoLocationStore(), gallery())
        advanceUntilIdle()

        vm.setPolicy(MediaKind.IMAGE, AutoDownloadPolicy.NEVER)
        vm.setPolicy(MediaKind.AUDIO, AutoDownloadPolicy.ALWAYS)
        vm.setPolicy(MediaKind.AUDIO_TRANSLATION, AutoDownloadPolicy.ALWAYS)
        advanceUntilIdle()

        val prefs = store.preferences.value
        assertThat(prefs.image).isEqualTo(AutoDownloadPolicy.NEVER)
        assertThat(prefs.audio).isEqualTo(AutoDownloadPolicy.ALWAYS)
        assertThat(prefs.audioTranslation).isEqualTo(AutoDownloadPolicy.ALWAYS)
    }

    @Test
    fun setPolicy_reselectingTheCurrentPolicy_isANoOpWrite() = runTest {
        val store = RecordingStore(MediaDownloadPreferences(image = AutoDownloadPolicy.NEVER))
        val vm = MediaDownloadViewModel(store, InMemoryCaptureSavePolicyStore(), InMemoryOutgoingPhotoLocationStore(), gallery())
        advanceUntilIdle()

        vm.setPolicy(MediaKind.IMAGE, AutoDownloadPolicy.NEVER)
        advanceUntilIdle()

        assertThat(store.writeCount).isEqualTo(0)
    }

    @Test
    fun setPolicy_aRealChange_writesExactlyOnce() = runTest {
        val store = RecordingStore()
        val vm = MediaDownloadViewModel(store, InMemoryCaptureSavePolicyStore(), InMemoryOutgoingPhotoLocationStore(), gallery())
        advanceUntilIdle()

        vm.setPolicy(MediaKind.VIDEO, AutoDownloadPolicy.ALWAYS)
        advanceUntilIdle()

        assertThat(store.writeCount).isEqualTo(1)
    }

    @Test
    fun capturePolicy_defaultsToNoOriginalAndOnDemandRender() = runTest {
        val vm = MediaDownloadViewModel(RecordingStore(), InMemoryCaptureSavePolicyStore(), InMemoryOutgoingPhotoLocationStore(), gallery())
        advanceUntilIdle()

        assertThat(vm.state.value.capturePolicy.savesOriginal).isFalse()
        assertThat(vm.state.value.capturePolicy.renderedMode).isEqualTo(CaptureRenderedSaveMode.MANUAL)
    }

    @Test
    fun setSavesOriginal_persistsWithoutTouchingTheRenderedMode() = runTest {
        val capture = InMemoryCaptureSavePolicyStore(CaptureSavePolicy(renderedMode = CaptureRenderedSaveMode.AUTOMATIC))
        val vm = MediaDownloadViewModel(RecordingStore(), capture, InMemoryOutgoingPhotoLocationStore(), gallery())
        advanceUntilIdle()

        vm.setSavesOriginal(true)
        advanceUntilIdle()

        assertThat(capture.policy.value).isEqualTo(CaptureSavePolicy(true, CaptureRenderedSaveMode.AUTOMATIC))
        assertThat(vm.state.value.capturePolicy.savesOriginal).isTrue()
    }

    @Test
    fun setRenderedAutomatic_switchesTheModeBothWays() = runTest {
        val capture = InMemoryCaptureSavePolicyStore()
        val vm = MediaDownloadViewModel(RecordingStore(), capture, InMemoryOutgoingPhotoLocationStore(), gallery())
        advanceUntilIdle()

        vm.setRenderedAutomatic(true)
        advanceUntilIdle()
        assertThat(capture.policy.value.renderedMode).isEqualTo(CaptureRenderedSaveMode.AUTOMATIC)

        vm.setRenderedAutomatic(false)
        advanceUntilIdle()
        assertThat(capture.policy.value.renderedMode).isEqualTo(CaptureRenderedSaveMode.MANUAL)
    }

    @Test
    fun `le lieu des photos n est pas conservé par défaut et le réglage se persiste`() = runTest {
        val location = InMemoryOutgoingPhotoLocationStore()
        val vm = MediaDownloadViewModel(RecordingStore(), InMemoryCaptureSavePolicyStore(), location, gallery())
        assertThat(vm.state.value.keepsPhotoLocation).isFalse()

        vm.setKeepsPhotoLocation(true)
        advanceUntilIdle()

        assertThat(location.keepsLocation.value).isTrue()
        assertThat(vm.state.value.keepsPhotoLocation).isTrue()
    }

    @Test
    fun `l enregistrement dans la galerie lit la préférence serveur de la confidentialité, coupée par défaut`() = runTest {
        val off = MediaDownloadViewModel(RecordingStore(), InMemoryCaptureSavePolicyStore(), InMemoryOutgoingPhotoLocationStore(), gallery())
        val on = MediaDownloadViewModel(
            RecordingStore(), InMemoryCaptureSavePolicyStore(), InMemoryOutgoingPhotoLocationStore(),
            gallery(privacy = InMemoryPrivacyPreferencesStore(PrivacyPreferences(saveMediaToGallery = true))),
        )
        advanceUntilIdle()

        assertThat(off.state.value.savesMediaToGallery).isFalse()
        assertThat(on.state.value.savesMediaToGallery).isTrue()
    }

    @Test
    fun `activer la galerie depuis Médias écrit la même préférence que la confidentialité et la synchronise`() = runTest {
        val privacy = InMemoryPrivacyPreferencesStore(PrivacyPreferences(showLastSeen = false))
        val sync = mockk<PrivacyPreferencesSyncRepository>()
        coEvery { sync.enqueueSync(any()) } returns "cmid_gallery"
        val workManager = mockk<WorkManager>(relaxed = true)
        val vm = MediaDownloadViewModel(
            RecordingStore(), InMemoryCaptureSavePolicyStore(), InMemoryOutgoingPhotoLocationStore(),
            gallery(privacy = privacy, sync = sync, workManager = workManager),
        )
        advanceUntilIdle()

        vm.setSaveMediaToGallery(true)
        advanceUntilIdle()

        assertThat(privacy.preferences.value).isEqualTo(PrivacyPreferences(showLastSeen = false, saveMediaToGallery = true))
        assertThat(vm.state.value.savesMediaToGallery).isTrue()
        coVerify(exactly = 1) { sync.enqueueSync(PrivacyPreferences(showLastSeen = false, saveMediaToGallery = true)) }
        verify(exactly = 1) { workManager.enqueue(any<androidx.work.WorkRequest>()) }
    }

    @Test
    fun `reposer la galerie sur sa valeur n écrit ni ne synchronise rien`() = runTest {
        val sync = mockk<PrivacyPreferencesSyncRepository>(relaxed = true)
        val vm = MediaDownloadViewModel(
            RecordingStore(), InMemoryCaptureSavePolicyStore(), InMemoryOutgoingPhotoLocationStore(),
            gallery(sync = sync),
        )
        advanceUntilIdle()

        vm.setSaveMediaToGallery(false)
        advanceUntilIdle()

        coVerify(exactly = 0) { sync.enqueueSync(any()) }
    }
}
