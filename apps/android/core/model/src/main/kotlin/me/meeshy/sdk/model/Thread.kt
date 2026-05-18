package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/** A message thread — parent message plus its replies — port of ThreadData (ThreadModels.swift). */
@Serializable
data class ThreadData(
    val parent: ApiMessage,
    val replies: List<ApiMessage> = emptyList(),
    val totalCount: Int = 0,
)
