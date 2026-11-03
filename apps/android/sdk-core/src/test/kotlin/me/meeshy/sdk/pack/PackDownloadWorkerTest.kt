package me.meeshy.sdk.pack

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.work.ListenableWorker
import androidx.work.NetworkType
import androidx.work.WorkerFactory
import androidx.work.WorkerParameters
import androidx.work.testing.TestListenableWorkerBuilder
import com.google.common.truth.Truth.assertThat
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import me.meeshy.sdk.model.pack.PackAssetRef
import me.meeshy.sdk.model.pack.PackFailureCause
import me.meeshy.sdk.model.pack.PackQueueReason
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class PackDownloadWorkerTest {

    @get:Rule val folder = TemporaryFolder()

    private val context: Context get() = ApplicationProvider.getApplicationContext()

    private fun run(fetcher: PackAssetFetching, refs: List<PackAssetRef>): ListenableWorker.Result {
        val runner = PackDownloadRunner(ContentAddressedStore(File(folder.root, "p"), fetcher, Dispatchers.IO))
        val factory = object : WorkerFactory() {
            override fun createWorker(appContext: Context, workerClassName: String, workerParameters: WorkerParameters): ListenableWorker =
                PackDownloadWorker(appContext, workerParameters, runner)
        }
        val worker = TestListenableWorkerBuilder<PackDownloadWorker>(context)
            .setWorkerFactory(factory)
            .setInputData(PackDownloadWorker.request(refs, PackQueueReason.NETWORK).workSpec.input)
            .build()
        return runBlocking { worker.doWork() }
    }

    @Test
    fun `Wi-Fi only waits for an unmetered network, network for any, both need storage`() {
        val wifi = PackDownloadConstraints.forReason(PackQueueReason.WIFI)
        val network = PackDownloadConstraints.forReason(PackQueueReason.NETWORK)

        assertThat(wifi.requiredNetworkType).isEqualTo(NetworkType.UNMETERED)
        assertThat(network.requiredNetworkType).isEqualTo(NetworkType.CONNECTED)
        assertThat(wifi.requiresStorageNotLow()).isTrue()
        assertThat(PackDownloadConstraints.forFailure(PackFailureCause.SPACE).requiresStorageNotLow()).isTrue()
    }

    @Test
    fun `the files round trip through the work input and a forged entry is refused`() {
        val ref = packRef("a")

        val decoded = PackDownloadWorker.decodeRefs(PackDownloadWorker.encodeRefs(listOf(ref)).toList())

        assertThat(decoded).containsExactly(ref)
        assertThat(PackDownloadWorker.decodeRefs(listOf("../x|1|${"a".repeat(64)}"))).isNull()
    }

    @Test
    fun `every file downloaded makes the work succeed`() {
        val a = packRef("a")
        val b = packRef("b", "png")

        val result = run(FakePackFetcher(mapOf(a.src to "a".toByteArray(), b.src to "b".toByteArray())), listOf(a, b))

        assertThat(result).isEqualTo(ListenableWorker.Result.success())
    }

    @Test
    fun `a cut network retries with backoff`() {
        val a = packRef("a")

        val result = run(object : PackAssetFetching {
            override suspend fun fetch(ref: PackAssetRef): ByteArray = throw PackAssetFetchException.Network(ref.src, java.io.IOException("cut"))
        }, listOf(a))

        assertThat(result).isEqualTo(ListenableWorker.Result.retry())
    }

    @Test
    fun `a tampered file fails for good and names integrity`() {
        val a = packRef("a")

        val result = run(FakePackFetcher(mapOf(a.src to "evil".toByteArray())), listOf(a))

        assertThat(result).isInstanceOf(ListenableWorker.Result.Failure::class.java)
        assertThat((result as ListenableWorker.Result.Failure).outputData.getString(PackDownloadWorker.KEY_CAUSE)).isEqualTo("integrity")
    }

    @Test
    fun `a full disk retries once the space is freed`() {
        val a = packRef("a")

        val result = run(object : PackAssetFetching {
            override suspend fun fetch(ref: PackAssetRef): ByteArray = throw java.io.IOException("write failed: ENOSPC (No space left on device)")
        }, listOf(a))

        assertThat(result).isEqualTo(ListenableWorker.Result.retry())
    }
}
