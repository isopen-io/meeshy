package me.meeshy.sdk.pack

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import me.meeshy.sdk.model.pack.PackDomain
import me.meeshy.sdk.model.packs.ShopPack
import me.meeshy.sdk.model.sticker.StickerPackSummary
import org.junit.Assert.assertThrows
import org.junit.Test

class PackServiceTest {
    private fun service(transport: FakePackTransport, domain: PackDomain = PackDomain.WALLPAPER) =
        PackService(domain, ShopPack.serializer(), transport)

    @Test
    fun `un pack illisible ou d'une forme future tombe seul, les autres s'affichent`() = runTest {
        val transport = FakePackTransport(
            catalogue = listOf(
                FakePackTransport.pack("animes"),
                JsonPrimitive("n'est pas un objet"),
                buildJsonObject { put("name", "sans slug") },
                FakePackTransport.pack("saisons", installed = true),
            ),
        )

        assertThat(service(transport).catalogue().map { it.slug }).containsExactly("animes", "saisons").inOrder()
    }

    @Test
    fun `un domaine inconnu ne route rien`() = runTest {
        val transport = FakePackTransport()
        val failure = assertThrows(PackServiceException::class.java) {
            kotlinx.coroutines.runBlocking { service(transport, PackDomain.UNKNOWN).catalogue() }
        }

        assertThat(failure.kind).isEqualTo(PackServiceException.Kind.UNROUTABLE_DOMAIN)
        assertThat(transport.calls).isEmpty()
    }

    @Test
    fun `installer passe par PUT et retirer par DELETE de la meme adresse`() = runTest {
        val transport = FakePackTransport()
        val service = service(transport)

        assertThat(service.setInstalled(true, "animes").installed).isTrue()
        assertThat(service.setInstalled(false, "animes").installed).isFalse()
        assertThat(transport.calls).containsExactly("PUT wallpaper animes", "DELETE wallpaper animes").inOrder()
    }

    @Test
    fun `l'achat n'est offert qu'aux domaines payants`() = runTest {
        val transport = FakePackTransport()

        val failure = assertThrows(PackServiceException::class.java) {
            kotlinx.coroutines.runBlocking { service(transport, PackDomain.GLORY_FRAME).purchase("or", "req-1") }
        }
        assertThat(failure.kind).isEqualTo(PackServiceException.Kind.NOT_PURCHASABLE)

        val bought = service(transport).purchase("animes", "req-1")
        assertThat(bought.pack.isOwned).isTrue()
        assertThat(transport.calls).containsExactly("purchase wallpaper animes req-1")
    }

    @Test
    fun `un refus de la passerelle garde son statut et son code`() = runTest {
        val transport = FakePackTransport(failWith = FakePackTransport.rejected(409, "INSUFFICIENT_MEESHES"))

        val failure = assertThrows(PackServiceException::class.java) {
            kotlinx.coroutines.runBlocking { service(transport).purchase("animes", "req-1") }
        }

        assertThat(failure.kind).isEqualTo(PackServiceException.Kind.REJECTED)
        assertThat(failure.httpStatus).isEqualTo(409)
        assertThat(failure.code).isEqualTo("INSUFFICIENT_MEESHES")
    }

    @Test
    fun `une panne sans statut se lit hors ligne`() = runTest {
        val transport = FakePackTransport(failWith = FakePackTransport.offline)

        val failure = assertThrows(PackServiceException::class.java) {
            kotlinx.coroutines.runBlocking { service(transport).installed() }
        }

        assertThat(failure.kind).isEqualTo(PackServiceException.Kind.OFFLINE)
    }

    @Test
    fun `le meme service lit les stickers`() = runTest {
        val transport = FakePackTransport(installed = listOf(FakePackTransport.pack("fruits", installed = true)))
        val stickers = PackService(PackDomain.STICKER, StickerPackSummary.serializer(), transport)

        assertThat(stickers.installed().map { it.slug }).containsExactly("fruits")
        assertThat(transport.calls).containsExactly("installed sticker")
    }
}
