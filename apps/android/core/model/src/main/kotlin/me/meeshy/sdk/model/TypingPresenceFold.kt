package me.meeshy.sdk.model

import java.time.Instant

/**
 * Forces the sender of a `typing:start` frame online in a presence map — règle produit
 * racine « typing:start reçu = preuve d'activité » (miroirs iOS `PresenceManager.noteActivity`,
 * web `TypingService.handleTypingStart` → `useUserStore.updateUserStatus`). A typer is
 * demonstrably active RIGHT NOW even when the gateway's last `user:status` broadcast is
 * stale, so the dot must read green immediately rather than waiting on the next snapshot.
 *
 * Pure and clock-injected on purpose: [nowMillis] is the caller's reference clock (mirrors
 * [UserPresence.state]'s `nowEpochMillis` parameter), so this stays deterministic and JVM-
 * testable with no wall-clock or coroutine dependency. [forcedEntry] writes `isOnline = true`
 * (parity with iOS `PresenceManager.noteActivity` and web `TypingService.handleTypingStart`,
 * both of which pose the same `isOnline: true`), which means the forced entry borrows
 * [UserPresence.state]'s anti-stale guard rather than the away/idle staircase: the dot stays
 * GREEN without interruption until [UserPresence.IDLE_WINDOW_MS] (5 min) elapses, then drops
 * straight to OFFLINE (no dot) — the AWAY (orange, >60s) and IDLE (gris, >180s) steps a normal
 * `user:status`/`presence:snapshot` entry can pass through are never reached for a presence
 * forced by typing. Nothing special-cases that decay here — it comes for free the next time
 * [UserPresence.state] reads the SAME [UserStatusEvent.isOnline] / [UserStatusEvent.lastActiveAt]
 * fields this fold writes, exactly like it already does for `user:status` / `presence:snapshot`
 * entries; see `TypingPresenceFoldTest`'s decay block for the pinned behaviour. Forcing a
 * special "still typing" branch here would duplicate [UserPresence.state]'s logic and risk
 * diverging from it.
 */
object TypingPresenceFold {

    /** The forced-online [UserStatusEvent] for [typing], stamped at [nowMillis]. */
    fun forcedEntry(typing: TypingEvent, nowMillis: Long): UserStatusEvent {
        val username = typing.displayName?.takeIf { it.isNotBlank() }
            ?: typing.username?.takeIf { it.isNotBlank() }
            ?: ""
        return UserStatusEvent(
            userId = typing.userId,
            username = username,
            isOnline = true,
            lastActiveAt = Instant.ofEpochMilli(nowMillis).toString(),
        )
    }
}
