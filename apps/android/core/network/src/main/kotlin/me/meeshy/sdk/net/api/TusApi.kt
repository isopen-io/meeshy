package me.meeshy.sdk.net.api

import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.media.TusUploadFinishData
import me.meeshy.sdk.net.NetworkResult
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
 * surface — port of iOS `TusUploadManager`'s two HTTP calls against the gateway's
 * `@tus/server` mount (`POST /api/v1/uploads`,
 * `services/gateway/src/routes/uploads/tus-handler.ts`). Single-shot only (no
 * chunking/resume, unlike iOS's full checkpointed client) — [TusUploadRepository]
 * always PATCHes the whole file in one request at `Upload-Offset: 0`, which is what
 * every caller today needs (compressed images; large-video chunked upload is a
 * tracked follow-up, `feature-parity.md` §F).
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
     * Uploads the file bytes to the session [location] returned by [createUpload].
     * [body]'s media type must be `application/offset+octet-stream` (the gateway
     * registers a dedicated content-type parser for exactly this value). On the
     * final byte (always true here — single-shot, [uploadOffset] is always `0` and
     * [body] always carries the whole file) the gateway's `onUploadFinish` responds
     * with the standard envelope carrying the created attachment/media row.
     */
    @PATCH
    public suspend fun uploadData(
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
