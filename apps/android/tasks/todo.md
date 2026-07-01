# Android — current loop

> Live state and the next slice now live in
> **`apps/android/tasks/android-routine/PROGRESS.md`**. The loop procedure is in
> `apps/android/tasks/android-routine/ROUTINE.md`. This file is a short pointer.

## This loop (Phase: Calls) — slice `call-signalling-events` ✅
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
