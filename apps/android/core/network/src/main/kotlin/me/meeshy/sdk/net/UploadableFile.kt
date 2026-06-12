package me.meeshy.sdk.net

import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.net.api.AttachmentApi
import me.meeshy.sdk.net.api.UploadedAttachments
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody

/** An in-memory file ready for multipart upload — keeps okhttp out of callers. */
class UploadableFile(
    val fileName: String,
    val mimeType: String,
    val bytes: ByteArray,
)

suspend fun AttachmentApi.uploadFiles(files: List<UploadableFile>): ApiResponse<UploadedAttachments> =
    upload(
        files.map { file ->
            MultipartBody.Part.createFormData(
                "files",
                file.fileName,
                file.bytes.toRequestBody(file.mimeType.toMediaType()),
            )
        },
    )
