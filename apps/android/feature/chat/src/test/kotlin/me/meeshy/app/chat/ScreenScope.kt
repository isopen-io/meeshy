package me.meeshy.app.chat

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope

/**
 * The scope a controller test hands to the controller under test, standing for the
 * screen's `viewModelScope`: it runs on the test scheduler, so `advanceUntilIdle()` drives
 * it (unlike `backgroundScope`, whose tasks `advanceUntilIdle()` deliberately skips), and
 * a collector that never completes does not hold the test open.
 */
@OptIn(ExperimentalCoroutinesApi::class)
internal fun TestScope.screenScope(): CoroutineScope =
    CoroutineScope(StandardTestDispatcher(testScheduler) + SupervisorJob())
