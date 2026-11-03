package me.meeshy.sdk.pack

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import me.meeshy.sdk.model.pack.PackDomain
import me.meeshy.sdk.model.packs.PackPurchaseResponse
import me.meeshy.sdk.model.packs.ShopPack
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult

/** Un transport en mémoire : le serveur est une liste de packs JSON, chaque appel est compté. */
internal class FakePackTransport(
    var catalogue: List<JsonElement> = emptyList(),
    var installed: List<JsonElement> = emptyList(),
    var failWith: ApiError? = null,
) : PackTransport {
    val calls = mutableListOf<String>()

    private fun <T> gate(call: String, ok: () -> T): NetworkResult<T> {
        calls += call
        return failWith?.let { NetworkResult.Failure(it) } ?: NetworkResult.Success(ok())
    }

    override suspend fun catalogue(domain: PackDomain) = gate("catalogue ${domain.wire}") { JsonArray(catalogue) as JsonElement }

    override suspend fun installed(domain: PackDomain) = gate("installed ${domain.wire}") { JsonArray(installed) as JsonElement }

    override suspend fun detail(domain: PackDomain, slug: String) =
        gate("detail ${domain.wire} $slug") { catalogue.firstOrNull { (it as? JsonObject)?.get("slug") == JsonPrimitive(slug) } ?: JsonNull }

    override suspend fun setInstalled(domain: PackDomain, slug: String, installed: Boolean) =
        gate("${if (installed) "PUT" else "DELETE"} ${domain.wire} $slug") { pack(slug, installed = installed, count = 7) }

    override suspend fun purchase(domain: PackDomain, slug: String, requestId: String) =
        gate("purchase ${domain.wire} $slug $requestId") { PackPurchaseResponse(ShopPack(slug = slug, owned = true, price = 90), balance = 250) }

    companion object {
        fun pack(slug: String, installed: Boolean = false, count: Int = 0): JsonObject = buildJsonObject {
            put("slug", slug)
            put("installed", installed)
            put("installCount", count)
        }

        val offline = ApiError(message = "offline")
        fun rejected(status: Int, code: String) = ApiError(message = code, code = code, httpStatus = status)
    }
}
