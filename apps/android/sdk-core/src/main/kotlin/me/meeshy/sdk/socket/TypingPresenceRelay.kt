package me.meeshy.sdk.socket

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.model.TypingPresenceFold
import me.meeshy.sdk.model.UserStatusEvent
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Adapts [MessageSocketManager.typingStarted] into presence signals — the socket-layer half of
 * the root product rule « typing:start reçu = preuve d'activité » (miroirs iOS
 * `PresenceManager.noteActivity`, web `TypingService.handleTypingStart`); the forcing itself is
 * [TypingPresenceFold], pure and unit-tested on its own.
 *
 * [forcedOnline] is shaped exactly like [MessageSocketManager.userStatus] — one
 * [UserStatusEvent] per event — so a collector merges it into a presence map with the SAME
 * `map + (userId to event)` fold already applied to `userStatus`/`presenceSnapshot`; no new
 * merge rule to learn at the call site. Deliberately stateless: it holds no accumulating map of
 * its own (an unbounded per-typer cache living for the app's lifetime), leaving retention to
 * whichever bounded presence map already owns the conversation's participants.
 */
@Singleton
class TypingPresenceRelay @Inject constructor(
    messageSocketManager: MessageSocketManager,
    private val clock: CacheClock,
) {
    val forcedOnline: Flow<UserStatusEvent> =
        messageSocketManager.typingStarted.map { typing ->
            TypingPresenceFold.forcedEntry(typing = typing, nowMillis = clock.nowMillis())
        }
}
