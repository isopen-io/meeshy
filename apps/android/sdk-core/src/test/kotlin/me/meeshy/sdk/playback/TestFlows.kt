package me.meeshy.sdk.playback

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.launch

internal fun <T> CoroutineScope.launchCollect(flow: Flow<T>, into: MutableList<T>): Job =
    launch { flow.collect { into += it } }
