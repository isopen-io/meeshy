package me.meeshy.sdk.post

import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import me.meeshy.sdk.model.scene.CanvasMediaAdoption
import me.meeshy.sdk.model.scene.ServedMedia
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.api.CreatePostRequest

/**
 * The post half of the durable upload→publish chain (#13417), sibling of
 * [me.meeshy.sdk.story.PublishMediaWriteBack]: a post queued while its media was still
 * uploading carries each upload's `cmid` as a placeholder, and the moment an upload lands the
 * placeholder becomes the real id — in `mediaIds`, in the per-media alt and caption keys, and
 * wherever a scene designates it.
 *
 * It decodes the payload as a [CreatePostRequest] and re-encodes the same type, so a field only
 * a post carries (location, discoverability, mood, audio) survives the write-back. Returns
 * `null` when nothing changes — undecodable, placeholder absent, or an identity swap.
 */
public object PostPublishMediaWriteBack {

    public fun graft(payload: String, placeholder: String, realId: String): String? {
        val request = runCatching {
            MeeshyApi.json.decodeFromString<CreatePostRequest>(payload)
        }.getOrNull() ?: return null
        val listed = request.mediaIds.orEmpty()
        val designated = CanvasMediaAdoption.publicationMediaIds(emptyList(), request.storyEffects)
        if (placeholder !in listed && placeholder !in designated) return null
        val adopted = CanvasMediaAdoption.adoptingByMedia(
            effects = request.storyEffects,
            canvas = null,
            replacing = mapOf(placeholder to ServedMedia(id = realId)),
        ).effects
        val swapped = listed.map { if (it == placeholder) realId else it }.distinct()
        val grafted = request.copy(
            storyEffects = adopted,
            mediaIds = swapped.takeIf { it.isNotEmpty() },
            mediaAlt = request.mediaAlt?.rekeyed(placeholder, realId),
            mediaCaption = request.mediaCaption?.rekeyed(placeholder, realId),
        )
        if (grafted == request) return null
        return MeeshyApi.json.encodeToString(grafted)
    }

    private fun Map<String, String>.rekeyed(placeholder: String, realId: String): Map<String, String> =
        entries.associate { (key, value) -> (if (key == placeholder) realId else key) to value }
}
