package me.meeshy.sdk.attachment

import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.UploadableFile
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.net.uploadFiles
import javax.inject.Inject
import javax.inject.Singleton

/** Attachment uploads — port of AttachmentService (AttachmentService.swift). */
@Singleton
class AttachmentRepository @Inject constructor(
    private val api: MeeshyApi,
) {
    suspend fun upload(files: List<UploadableFile>): NetworkResult<List<ApiMessageAttachment>> =
        when (val result = apiCall { api.attachments.uploadFiles(files) }) {
            is NetworkResult.Success -> NetworkResult.Success(result.data.attachments)
            is NetworkResult.Failure -> NetworkResult.Failure(result.error)
        }
}
