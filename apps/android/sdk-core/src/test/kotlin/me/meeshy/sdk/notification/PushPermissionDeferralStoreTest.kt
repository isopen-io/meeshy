package me.meeshy.sdk.notification

import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import com.google.common.truth.Truth.assertThat
import java.io.File
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.cancel
import kotlinx.coroutines.runBlocking
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class PushPermissionDeferralStoreTest {
    @get:Rule val folder = TemporaryFolder()

    private fun store(file: File, scope: CoroutineScope) =
        DataStorePushPermissionDeferralStore(PreferenceDataStoreFactory.create(scope = scope) { file })

    @Test
    fun `postpone then resolve toggles the marker`() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val store = store(File(folder.root, "a.preferences_pb"), scope)
        assertThat(store.isPending()).isFalse()
        store.postpone()
        assertThat(store.isPending()).isTrue()
        store.resolve()
        assertThat(store.isPending()).isFalse()
        scope.cancel()
    }

    @Test
    fun `the marker survives a cold start`() = runBlocking {
        val file = File(folder.root, "b.preferences_pb")
        val first = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        store(file, first).postpone()
        first.coroutineContext[Job]!!.cancelAndJoin()
        val second = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        assertThat(store(file, second).isPending()).isTrue()
        second.cancel()
    }

    @Test
    fun `the in-memory store behaves the same`() = runBlocking {
        val store = InMemoryPushPermissionDeferralStore()
        store.postpone()
        assertThat(store.isPending()).isTrue()
        store.resolve()
        assertThat(store.isPending()).isFalse()
    }
}
