package me.meeshy.sdk.net.api

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import me.meeshy.sdk.model.PostEditDraft
import me.meeshy.sdk.model.PostLocationUpdate
import me.meeshy.sdk.model.SharedPlace

/** Le brouillon déjà filtré par `PostEditPayload.build`, posé tel quel sur le fil. */
fun PostEditDraft.toUpdateRequest(): UpdatePostRequest =
    UpdatePostRequest(
        content = content,
        visibility = visibility,
        moodEmoji = moodEmoji,
        visibilityUserIds = visibilityUserIds,
        originalLanguage = originalLanguage,
        type = type,
        removeMediaIds = removeMediaIds,
        storyEffects = storyEffects,
        mediaIds = mediaIds,
        location = when (val update = location) {
            null -> null
            PostLocationUpdate.Remove -> JsonNull
            is PostLocationUpdate.Set -> Json.encodeToJsonElement(SharedPlace.serializer(), update.place)
        },
        mentions = mentions,
        allowSoundExtraction = allowSoundExtraction,
        mediaAlt = mediaAlt,
        mediaCaption = mediaCaption,
    )
