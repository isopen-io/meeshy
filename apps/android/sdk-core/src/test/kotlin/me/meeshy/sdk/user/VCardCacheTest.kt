package me.meeshy.sdk.user

import com.google.common.truth.Truth.assertThat
import java.io.ByteArrayInputStream
import java.io.IOException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.outbox.OutboxOwnerSource
import me.meeshy.sdk.session.AccountFence
import me.meeshy.sdk.session.PerAccountCache
import org.junit.Test

class VCardCacheTest {

    private val ada = "BEGIN:VCARD\nVERSION:3.0\nFN:Ada Lovelace\nTEL:+33600000001\nEND:VCARD\n"

    private class Files(val contents: MutableMap<String, ByteArray>) {
        val opened = mutableListOf<String>()
        val opener = LocalFileOpener { uri ->
            opened += uri
            contents[uri]?.let { ByteArrayInputStream(it) }
        }
    }

    private fun cache(files: Files, capacity: Int = 10, fence: AccountFence? = null) =
        VCardCache(files.opener, Dispatchers.Unconfined, capacity, fence)

    @Test
    fun `une carte locale est lue puis servie depuis la memoire`() = runTest {
        val files = Files(mutableMapOf("content://dl/1" to ada.toByteArray()))
        val subject = cache(files)

        assertThat(subject.load("a1", "content://dl/1")?.phones).containsExactly("+33600000001")
        assertThat(subject.cached("a1")?.phones).containsExactly("+33600000001")
        subject.load("a1", "content://dl/1")

        assertThat(files.opened).hasSize(1)
    }

    @Test
    fun `une adresse reseau n'est jamais ouverte`() = runTest {
        val files = Files(mutableMapOf("https://gate/x.vcf" to ada.toByteArray()))

        assertThat(cache(files).load("a1", "https://gate/x.vcf")).isNull()
        assertThat(cache(files).load("a2", "HTTP://gate/x.vcf")).isNull()
        assertThat(files.opened).isEmpty()
    }

    @Test
    fun `un fichier trop gros n'est pas une carte et n'est pas garde`() = runTest {
        val huge = (ada + "NOTE:" + "x".repeat(VCardCache.MAX_CARD_BYTES)).toByteArray()
        val files = Files(mutableMapOf("file:///big" to huge))
        val subject = cache(files)

        assertThat(subject.load("big", "file:///big")).isNull()
        assertThat(subject.cached("big")).isNull()
    }

    @Test
    fun `un fichier binaire, absent ou illisible rend rien sans jeter`() = runTest {
        val files = Files(mutableMapOf("file:///bin" to byteArrayOf(0, 1, 2, 0, 3)))
        val subject = VCardCache({ uri -> if (uri == "file:///boom") throw IOException("x") else files.opener.open(uri) }, Dispatchers.Unconfined, 10, null)

        assertThat(subject.load("bin", "file:///bin")).isNull()
        assertThat(subject.load("none", "file:///none")).isNull()
        assertThat(subject.load("boom", "file:///boom")).isNull()
    }

    @Test
    fun `le cache est borne, la plus ancienne sort`() = runTest {
        val files = Files(mutableMapOf("file:///1" to ada.toByteArray(), "file:///2" to ada.toByteArray(), "file:///3" to ada.toByteArray()))
        val subject = cache(files, capacity = 2)

        subject.load("1", "file:///1"); subject.load("2", "file:///2"); subject.load("3", "file:///3")

        assertThat(subject.cached("1")).isNull()
        assertThat(subject.cached("2")).isNotNull()
        assertThat(subject.cached("3")).isNotNull()
    }

    @Test
    fun `la fin de session vide les cartes`() = runTest {
        val files = Files(mutableMapOf("file:///1" to ada.toByteArray()))
        val subject = cache(files)
        subject.load("1", "file:///1")

        (subject as PerAccountCache).clear()

        assertThat(subject.cached("1")).isNull()
    }

    @Test
    fun `une carte lue sous A et finie apres sa fermeture n'est pas gardee pour B`() = runTest {
        val owner = object : OutboxOwnerSource { var id: String? = "A"; override fun currentOwnerId() = id }
        val fence = AccountFence(owner)
        val gate = CompletableDeferred<Unit>()
        val files = Files(mutableMapOf("file:///1" to ada.toByteArray()))
        val subject = VCardCache({ uri -> kotlinx.coroutines.runBlocking { gate.await() }; files.opener.open(uri) }, Dispatchers.Unconfined, 10, fence)

        val pending = async(Dispatchers.Default) { subject.load("1", "file:///1") }
        Thread.sleep(50)
        fence.close { subject.clear(); owner.id = null }
        owner.id = "B"
        gate.complete(Unit)

        assertThat(pending.await()).isNull()
        assertThat(subject.cached("1")).isNull()
    }

    @Test
    fun `un fournisseur de contenu qui refuse l'adresse ne fait pas tomber le fil`() = runTest {
        val subject = VCardCache({ throw IllegalArgumentException("Invalid lookup id") }, Dispatchers.Unconfined, 10, null)
        val refusing = VCardCache({ throw UnsupportedOperationException("no") }, Dispatchers.Unconfined, 10, null)

        assertThat(subject.load("a1", "content://com.android.contacts/contacts/as_vcard/x")).isNull()
        assertThat(refusing.load("a2", "content://x/2")).isNull()
    }

    @Test
    fun `seule la requete bornee reste en memoire, jamais la vCard entiere`() = runTest {
        val phones = (1..15).joinToString("") { "TEL:+3360000%04d\n".format(it) }
        val emails = (1..15).joinToString("") { "EMAIL:u$it@example.com\n" }
        val body = "BEGIN:VCARD\nVERSION:3.0\nFN:Ada\nNOTE:" + "x".repeat(100_000) + "\n" + phones + emails + "END:VCARD\n"
        val files = Files(mutableMapOf("file:///1" to body.toByteArray()))
        val subject = cache(files)

        val kept = subject.load("1", "file:///1")

        assertThat(kept).isInstanceOf(CardIdentifiers::class.java)
        assertThat(kept!!.phones).hasSize(10)
        assertThat(kept.emails).hasSize(10)
        val full = me.meeshy.sdk.model.contacts.vcard.VCardParser.parse(body)!!
        assertThat(subject.cached("1")!!.request("FR")).isEqualTo(
            me.meeshy.sdk.net.api.ContactResolveRequest.bounded(full.phones.map { it.value }, full.emails.map { it.value }, "FR"),
        )
    }

    @Test
    fun `la requete gardee est celle que la fiche envoie, espaces casse et doublons compris`() = runTest {
        val body = "BEGIN:VCARD\nVERSION:3.0\nFN:Ada\nTEL: +33600000001 \nTEL:+33600000001\nTEL:\nEMAIL: Ada@Example.COM \nEMAIL:ada@example.com\nEND:VCARD\n"
        val subject = cache(Files(mutableMapOf("file:///2" to body.toByteArray())))

        val kept = subject.load("2", "file:///2")!!
        val full = me.meeshy.sdk.model.contacts.vcard.VCardParser.parse(body)!!

        assertThat(kept.request("FR")).isEqualTo(
            me.meeshy.sdk.net.api.ContactResolveRequest.bounded(full.phones.map { it.value }, full.emails.map { it.value }, "FR"),
        )
        assertThat(kept.request(null).defaultCountry).isNull()
    }
}
