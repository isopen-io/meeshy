package me.meeshy.sdk.net

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.net.api.CLIENT_MUTATION_ID_HEADER
import okhttp3.Call
import okhttp3.OkHttpClient
import okhttp3.Request
import org.junit.Test

class MutationIdCallFactoryTest {

    private class Capturing : Call.Factory {
        var last: Request? = null

        override fun newCall(request: Request): Call {
            last = request
            return OkHttpClient().newCall(request)
        }
    }

    private val cmid = "cmid_3f2b8c1e-5d4a-4b7e-9c10-2a6f8e0d1b34"
    private fun request(header: String? = null) = Request.Builder().url("https://gate.meeshy.me/api/v1/x")
        .apply { header?.let { header(CLIENT_MUTATION_ID_HEADER, it) } }
        .build()

    @Test
    fun `the header is set from the context of the sender`() = runTest {
        val delegate = Capturing()

        withMutationId(cmid) { MutationIdCallFactory(delegate).newCall(request()) }

        assertThat(delegate.last?.header(CLIENT_MUTATION_ID_HEADER)).isEqualTo(cmid)
    }

    @Test
    fun `no header is added outside a sender`() {
        val delegate = Capturing()

        MutationIdCallFactory(delegate).newCall(request())

        assertThat(delegate.last?.header(CLIENT_MUTATION_ID_HEADER)).isNull()
    }

    @Test
    fun `a header the call already carries is kept`() = runTest {
        val delegate = Capturing()

        withMutationId(cmid) { MutationIdCallFactory(delegate).newCall(request(header = "cmid_own")) }

        assertThat(delegate.last?.header(CLIENT_MUTATION_ID_HEADER)).isEqualTo("cmid_own")
    }

    @Test
    fun `a malformed key is never sent`() = runTest {
        val delegate = Capturing()

        withMutationId("not-a-cmid") { MutationIdCallFactory(delegate).newCall(request()) }

        assertThat(delegate.last?.header(CLIENT_MUTATION_ID_HEADER)).isNull()
    }

    @Test
    fun `the context ends with the sender`() = runTest {
        val delegate = Capturing()
        withMutationId(cmid) { }

        MutationIdCallFactory(delegate).newCall(request())

        assertThat(delegate.last?.header(CLIENT_MUTATION_ID_HEADER)).isNull()
    }
}
