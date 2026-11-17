package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/** A message thread — parent message plus its replies. */
@Serializable
data class ThreadData(
    val parent: ApiMessage,
    val replies: List<ApiMessage> = emptyList(),
    val totalCount: Int = 0,
)
