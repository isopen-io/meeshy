package me.meeshy.app.composer.inbound

import com.google.common.truth.Truth.assertThat
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.io.ByteArrayInputStream
import java.io.File
import java.security.SecureRandom

@RunWith(RobolectricTestRunner::class)
class ComposerSeedStoreTest {
    @get:Rule val folder = TemporaryFolder()
    private var clock = 1_000_000L

    private fun store(): ComposerSeedStore = ComposerSeedStore(File(folder.root, "inbound").also { it.mkdirs() }, { clock }, SecureRandom())
    private val jpegHead = byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 0xFF.toByte(), 0xE0.toByte())
    private fun jpeg(tag: Int = 0) = InboundSource({ ByteArrayInputStream(jpegHead + ByteArray(40) { tag.toByte() }) }, "image/jpeg")

    @Test
    fun `what is stashed is taken once, in order, under names the store chose`() {
        val store = store()
        val token = store.stash(listOf(jpeg(1), jpeg(2)))!!
        val items = store.take(token)
        assertThat(items.map { it.fileName }).containsExactly("shared-1.jpg", "shared-2.jpg").inOrder()
        assertThat(items.map { it.mimeType }).containsExactly("image/jpeg", "image/jpeg")
        assertThat(items[1].bytes[10]).isEqualTo(2.toByte())
        assertThat(store.take(token)).isEmpty()
        assertThat(File(folder.root, "inbound").listFiles()).isEmpty()
    }

    @Test
    fun `a token is unguessable and of the shape the route accepts`() {
        val store = store()
        val tokens = (1..20).map { store.stash(listOf(jpeg()))!! }
        assertThat(tokens.toSet()).hasSize(20)
        tokens.forEach { assertThat(me.meeshy.app.composer.host.ComposerHostRoute.seedToken(it)).isEqualTo(it) }
    }

    @Test
    fun `an expired deposit gives nothing and is removed`() {
        val store = store()
        val token = store.stash(listOf(jpeg()))!!
        clock += ComposerSeedStore.TTL_MS + 1
        assertThat(store.holds(token)).isFalse()
        assertThat(store.take(token)).isEmpty()
        assertThat(File(folder.root, "inbound").listFiles()).isEmpty()
    }

    @Test
    fun `a stale deposit nobody took is swept at the next deposit`() {
        val store = store()
        store.stash(listOf(jpeg()))
        clock += ComposerSeedStore.TTL_MS + 1
        store.stash(listOf(jpeg()))
        assertThat(File(folder.root, "inbound").listFiles()).hasLength(1)
    }

    @Test
    fun `a forged token reaches nothing outside the store`() {
        val store = store()
        File(folder.root, "secret").mkdirs()
        File(folder.root, "secret/0.jpg").writeBytes(jpegHead + ByteArray(40))
        listOf("../secret", "..%2Fsecret", "a".repeat(22) + "/..", "short", "", null, "../../../../../../etc").forEach {
            assertThat(store.take(it)).isEmpty()
            assertThat(store.holds(it)).isFalse()
        }
        assertThat(File(folder.root, "secret/0.jpg").exists()).isTrue()
    }

    @Test
    fun `a file in the deposit that is not a known media is not handed over`() {
        val store = store()
        val token = store.stash(listOf(jpeg()))!!
        File(folder.root, "inbound/$token/1.jpg").writeBytes("<svg><script/></svg>".toByteArray() + ByteArray(20))
        File(folder.root, "inbound/$token/notes.txt").writeText("x")
        assertThat(store.take(token).map { it.fileName }).containsExactly("shared-1.jpg")
    }

    @Test
    fun `a source that is not a media gives no deposit, and leaves no file behind`() {
        val store = store()
        val html = InboundSource({ ByteArrayInputStream("<html><script>1</script></html>".toByteArray() + ByteArray(40)) }, "image/png")
        val broken = InboundSource({ throw SecurityException("no grant") }, null)
        assertThat(store.stash(listOf(html, broken))).isNull()
        assertThat(File(folder.root, "inbound").listFiles()).isEmpty()
    }

    @Test
    fun `a refused source does not take the place of a good one`() {
        val store = store()
        val html = InboundSource({ ByteArrayInputStream("<svg/>".toByteArray() + ByteArray(60)) }, null)
        val token = store.stash(listOf(html, jpeg(7)))!!
        assertThat(store.take(token).map { it.fileName }).containsExactly("shared-1.jpg")
    }

    @Test
    fun `an unclaimed deposit is swept as soon as the store is asked about a token`() {
        val store = store()
        store.stash(listOf(jpeg()))
        clock += ComposerSeedStore.TTL_MS + 1
        assertThat(store.holds("AbCdEfGhIjKlMnOpQrStUv")).isFalse()
        assertThat(File(folder.root, "inbound").listFiles()).isEmpty()
    }

    @Test
    fun `nothing to deposit gives no token, and the deposit is capped`() {
        val store = store()
        assertThat(store.stash(emptyList())).isNull()
        val token = store.stash(List(ComposerSeedStore.MAX_ITEMS + 5) { jpeg(it) })!!
        assertThat(store.take(token)).hasSize(ComposerSeedStore.MAX_ITEMS)
    }

    @Test
    fun `signing out leaves no received media on the disk`() = kotlinx.coroutines.test.runTest {
        val store = store()
        val first = store.stash(listOf(jpeg()))!!
        store.stash(listOf(jpeg(2)))
        ComposerSeedTeardown(store).clear()
        assertThat(store.holds(first)).isFalse()
        assertThat(File(folder.root, "inbound").listFiles()).isEmpty()
    }
}
