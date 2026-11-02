package me.meeshy.sdk.media

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import me.meeshy.sdk.model.media.MediaUploadProgress
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The bytes in flight, per media, keyed by the upload's `cmid` (#13429): what lets a publication that
 * is still leaving show « 4,8 / 14,2 Mo » on each of its media instead of one anonymous spinner.
 *
 * Process memory on purpose — progress of a transfer is only true while the transfer runs; the durable
 * truth (queued, refused, gone) is the outbox row. Every entry leaves with its upload, whatever the
 * outcome, so the map never outgrows what is actually being sent.
 */
@Singleton
public class MediaUploadProgressLedger @Inject constructor() {

    private val _progress = MutableStateFlow<Map<String, MediaUploadProgress>>(emptyMap())
    public val progress: StateFlow<Map<String, MediaUploadProgress>> = _progress.asStateFlow()

    public fun report(cmid: String, sent: Long, total: Long) {
        _progress.update { it + (cmid to MediaUploadProgress.Uploading(sent, total)) }
    }

    public fun clear(cmid: String) {
        _progress.update { it - cmid }
    }
}
