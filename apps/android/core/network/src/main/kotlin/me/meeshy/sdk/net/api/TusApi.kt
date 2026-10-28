package me.meeshy.sdk.net.api

import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.media.TusServerProbe
import me.meeshy.sdk.model.media.TusUploadFinishData
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.chunkCall
import me.meeshy.sdk.net.headerCall
import me.meeshy.sdk.net.ioApiError
import okhttp3.RequestBody
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.HEAD
import retrofit2.http.Header
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Url
import java.io.IOException

/**
 * The [tus.io resumable upload protocol](https://tus.io/protocols/resumable-upload)
 * surface — port of iOS `TusUploadManager`'s HTTP calls against the gateway's
 * `@tus/server` mount (`POST /api/v1/uploads`,
 * `services/gateway/src/routes/uploads/tus-handler.ts`). [TusUploadRepository]
 * chunks the body into bounded PATCH calls (mirrors iOS's fixed-size chunking loop),
 * but does not yet persist a checkpoint or survive an app kill mid-upload — that
 * remains a tracked follow-up (`feature-parity.md` §Q).
 */
public interface TusApi {
    /**
     * Creates a new upload session. Carries no body — only the headers the protocol
     * requires. On success (`201 Created`) the session URL to `PATCH` against rides
     * in the `Location` response header (read via [Response.headers], not the body).
     */
    @POST("uploads")
    public suspend fun createUpload(
        @Header("Upload-Length") uploadLength: Long,
        @Header("Upload-Metadata") uploadMetadata: String,
        @Header("Tus-Resumable") tusResumable: String,
    ): Response<Unit>

    /**
     * Asks the gateway what it really holds for the session at [location]: the answer rides in the
     * `Upload-Offset` response header (`404`/`410` when the session expired or was swept). The only
     * safe way to resume after a lost acknowledgement or a long pause (#13429).
     */
    @HEAD
    public suspend fun headUpload(
        @Url location: String,
        @Header("Tus-Resumable") tusResumable: String,
    ): Response<Unit>

    /**
     * Uploads a non-final chunk of the file bytes to the session [location]. Per the
     * tus.io protocol, the gateway's `@tus/server` responds `204 No Content` (only an
     * updated `Upload-Offset` header, no body) for any PATCH that doesn't reach the
     * upload's declared length — so this is typed [Response] of [Unit] (an
     * empty-body-friendly shape, mirroring [createUpload]) rather than [uploadData]'s
     * [ApiResponse] envelope, which only the FINAL chunk's PATCH actually returns.
     */
    @PATCH
    public suspend fun uploadChunk(
        // l'adresse de session est fabriquée par le SERVEUR et rendue
        // dans l'en-tête `Location` du POST de création (protocole TUS). Aucun
        // chemin déclaré ne peut la décrire : elle n'existe pas avant l'appel.
        @Url location: String,
        @Header("Upload-Offset") uploadOffset: Long,
        @Header("Tus-Resumable") tusResumable: String,
        @Body body: RequestBody,
    ): Response<Unit>

    /**
     * Uploads the FINAL chunk of the file bytes to the session [location] returned by
     * [createUpload]. [body]'s media type must be `application/offset+octet-stream`
     * (the gateway registers a dedicated content-type parser for exactly this value).
     * Once [uploadOffset] + `body.contentLength()` reaches the upload's declared
     * length, the gateway's `onUploadFinish` responds with the standard envelope
     * carrying the created attachment/media row — every chunk before this one goes
     * through [uploadChunk] instead, which cannot decode that body.
     */
    @PATCH
    public suspend fun uploadData(
        // Même raison que `uploadChunk` : l'adresse vient du serveur, pas du
        // catalogue. La justification vit ICI, au site, et non seulement dans
        // le commentaire de la garde — c'est là que la prochaine main la lira.
        @Url location: String,
        @Header("Upload-Offset") uploadOffset: Long,
        @Header("Tus-Resumable") tusResumable: String,
        @Body body: RequestBody,
    ): ApiResponse<TusUploadFinishData>
}

/**
 * Creates a TUS session and returns its `Location` (the URL [TusApi.uploadData]
 * PATCHes against) as a [NetworkResult]. A thin wrapper around [TusApi.createUpload]
 * + [headerCall] — its only purpose is keeping every `retrofit2.Response` type
 * confined to `:core:network` (retrofit is an `implementation`, not `api`, dependency
 * of this module — `:sdk-core`'s callers cannot reference [Response] itself, only
 * this module's own [NetworkResult]/`ApiError` types).
 */
public suspend fun TusApi.createSession(
    uploadLength: Long,
    uploadMetadata: String,
    tusResumable: String,
): NetworkResult<String> =
    headerCall("Location") { createUpload(uploadLength, uploadMetadata, tusResumable) }

/**
 * PATCHes one non-final chunk to [location] and folds the raw
 * `retrofit2.Response<Unit>` into a [NetworkResult] — same module-boundary purpose
 * as [createSession]: `:sdk-core`'s [TusUploadRepository] chunk loop never touches
 * [Response] itself, only this module's [NetworkResult]/`ApiError` types.
 */
public suspend fun TusApi.patchChunk(
    location: String,
    uploadOffset: Long,
    tusResumable: String,
    body: RequestBody,
): NetworkResult<Unit> =
    chunkCall { uploadChunk(location, uploadOffset, tusResumable, body) }

/**
 * `HEAD` on a stored session folded into a [TusServerProbe]: the server's own offset, [TusServerProbe.Gone]
 * for a session it forgot (`404`/`410`) or that is not the caller's to resume (`403`: the checkpoint was
 * written under another account on this device — retrying it would fail forever), and a failure for anything else (offline, `5xx`) — the caller
 * cannot decide to resume or restart without knowing, so it surfaces the failure and retries later.
 */
public suspend fun TusApi.probeSession(location: String, tusResumable: String): NetworkResult<TusServerProbe> =
    try {
        val response = headUpload(location, tusResumable)
        val offset = response.headers()["Upload-Offset"]?.toLongOrNull()
        when {
            response.code() in UNRESUMABLE_SESSION_CODES -> NetworkResult.Success(TusServerProbe.Gone)
            response.isSuccessful && offset != null -> NetworkResult.Success(TusServerProbe.Offset(offset))
            else -> NetworkResult.Failure(
                ApiError(
                    message = "Request failed",
                    code = "HTTP_${response.code()}",
                    httpStatus = response.code().takeUnless { response.isSuccessful },
                ),
            )
        }
    } catch (e: IOException) {
        NetworkResult.Failure(ioApiError(e))
    }

private val UNRESUMABLE_SESSION_CODES = setOf(403, 404, 410)
