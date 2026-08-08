package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/**
 * The wire body for `POST /me/preferences/categories` (feature-parity §B —
 * "Conversation category create + expand/collapse"). Mirrors iOS
 * `PreferenceService.createCategory`'s request, which sends only the trimmed
 * `name`: the gateway defaults `color`/`icon` to `null` and `order` to
 * `max(existing) + 1` when omitted, so a bare name is a complete, valid create.
 */
@Serializable
public data class CreateCategoryBody(
    val name: String,
)
