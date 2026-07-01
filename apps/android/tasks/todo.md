# Android — current loop

> Live state and the next slice now live in
> **`apps/android/tasks/android-routine/PROGRESS.md`**. The loop procedure is in
> `apps/android/tasks/android-routine/ROUTINE.md`. This file is a short pointer.

## This loop (Phase: Calls) — slice `call-history-model` ✅
Ports the iOS call journal into `:core:model` `me.meeshy.sdk.model.call`: `CallDirection`
(incoming/outgoing/missed, `fromRaw` degrades unknown → incoming), `CallMediaType`
(audioOnly/audioVideo), `@Serializable` `CallHistoryPeer` + `CallRecord` mirroring the gateway
`CallHistoryItem` REST contract field-for-field (ISO-8601 timestamps as strings → date-dependency-free),
with pure display accessors (`directionKind`/`isMissed`, `mediaType`, four-tier `displayName`,
`avatarUrl`, `durationLabel`, `dataLabel`) as the SSOT a missed/recent-calls list renders. +22 tests,
`meeshy.sh check` green, diff = `apps/android` only.

### Next
1. Call-history **repository** (REST `/calls/history` fetch + Room cache, cache-first SWR), then the
   missed/recent-calls **list UI**.
2. Fold `CallSignalManager.events` into `CallViewModel` once the `initiate`-ACK call-id lifecycle lands.
3. Then the WebRTC / Telecom / FCM full-screen-intent plumbing.

## Prior loop (Phase: Calls) — slice `call-signalling-events` ✅
Gives the pure call FSM its inbound wire vocabulary: `@Serializable` payload types for every inbound
`call:*` Socket.IO frame (parity with the iOS `MessageSocketManager` listen table) + a total, pure
`CallSignalMapper.map(eventName, rawJson) → CallEvent?` routing each frame into the FSM's event set,
with malformed/unknown/plumbing frames mapping to `null` (inert, never crashes). All in `core:model`.

- [x] `CallSocketEvents.kt` — `@Serializable` inbound payload models (`CallSignalPayload`,
      `CallInitiatedPayload`/`CallInitiatorInfo`, `CallSignalEnvelope`, `CallParticipantPayload`,
      `CallEndedPayload`, `CallMissedPayload`, `CallMediaTogglePayload`, `CallErrorPayload`,
      `CallAlreadyAnsweredPayload`); required ids non-null so a bad frame decodes to inert.
- [x] `CallSignalMapper` (pure object) — `initiated`→`ReceiveIncoming`, `participant-joined`→
      `ParticipantJoined`, `signal.answer`→`RemoteAnswer` (offer/ice inert), `ended.missed`→`RingTimeout`
      else `RemoteHangUp`, `missed`→`RingTimeout`, `error`→`ConnectionFailed`, `already-answered`→
      `RemoteHangUp`, `media-toggled`/malformed/unknown→`null`.
- [x] TDD +22 (`CallSignalMapperTest`) through the public `map()` — every event, the signal-type &
      reason switches, error fallback chain, missing ids, unknown event, malformed JSON.
- [x] `:core:model:testDebugUnitTest` (22/22) + full `assembleDebug testDebugUnitTest` green.
      Diff = `apps/android` only.

## Next loop (see PROGRESS.md "Next")
1. Wire the mapper into a `CallSignalManager` (`:sdk-core`) socket subscription → `SharedFlow<CallEvent>`
   the `CallViewModel` folds; mirror the **outbound** emit table (`call:initiate`/`:join`/`:signal`/…).
2. `CallDirection` / `CallMediaType` enums + call-history row model (missed/recent calls list).
3. Then the WebRTC / Telecom / FCM full-screen-intent plumbing.
