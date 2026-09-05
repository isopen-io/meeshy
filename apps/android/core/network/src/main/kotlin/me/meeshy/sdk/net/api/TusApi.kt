package me.meeshy.sdk.net.api

import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.media.TusUploadFinishData
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.chunkCall
import me.meeshy.sdk.net.headerCall
import okhttp3.RequestBody
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.Header
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Url

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
