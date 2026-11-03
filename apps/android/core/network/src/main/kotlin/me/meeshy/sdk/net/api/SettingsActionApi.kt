package me.meeshy.sdk.net.api

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import me.meeshy.sdk.model.ApiResponse
import retrofit2.http.Body
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Url

/**
 * L'appel générique d'un réglage de compte rejoué par l'outbox (`SETTINGS_ACTION`, #15179) : l'endpoint et la méthode
 * viennent de la ligne en file, jamais d'un littéral ici — c'est la raison d'être de `@Url`. L'URL est RELATIVE : elle
 * se résout contre la base de l'API, donc sous les mêmes intercepteurs (jeton, identifiant de mutation) que les autres.
 */
public interface SettingsActionApi {
    @POST
    public suspend fun post(@Url endpoint: String, @Body body: JsonObject): ApiResponse<JsonElement>

    @PUT
    public suspend fun put(@Url endpoint: String, @Body body: JsonObject): ApiResponse<JsonElement>

    @PATCH
    public suspend fun patch(@Url endpoint: String, @Body body: JsonObject): ApiResponse<JsonElement>
}
