# Android — current loop

> Live state and the next slice now live in
> **`apps/android/tasks/android-routine/PROGRESS.md`**. The loop procedure is in
> `apps/android/tasks/android-routine/ROUTINE.md`. This file is a short pointer.

## This loop (Phase: Calls) — slice `calls-viewmodel-screen` ✅
Gives the pure call FSM (`core:model` `me.meeshy.sdk.model.call`) its first real consumer: a new
`:feature:calls` module with a UDF `CallViewModel`, a pure `CallPresenter`, and a minimal call screen
reachable from audio/video buttons in the chat header (iOS parity). All UI decisions live in the pure
presenter + FSM; the screen is glue.

- [x] Pure `CallPresenter.present(state, config, media)` → `CallUiState` (status mapping +
      answer/hang-up/media-toggle affordances + end-reason + reconnect attempt + camera-only-if-video).
- [x] `CallViewModel` (`@HiltViewModel`, UDF `StateFlow<CallUiState>`) folding accept/decline/hang-up/
      mute/camera intents + signalling events through `CallStateMachine.reduce`; `start` inert unless idle.
- [x] `CallScreen` glue (accent-coherent) + audio/video call buttons wired into the chat header + a
      `Routes.CALL` composable; dismissal returns to chat.
- [x] TDD +34 (`CallPresenterTest` 20 + `CallViewModelTest` 14). RED caught an `Offering`→CONNECTING
      assumption; test expectation corrected (code not weakened). +18 strings × 4 locales (calls) +2 × 4 (chat).
- [x] `:app:assembleDebug` + `:feature:calls:testDebugUnitTest` green (34/34). Diff = `apps/android` only.

## Next loop (see PROGRESS.md "Next")
1. Call **signalling event models + socket mapping** (`call:offer`/`:answer`/`:ice-candidate`/`:ended`/…)
   → pure frame→`CallEvent` mapper.
2. `CallDirection` / `CallMediaType` enums + call-history row model (missed/recent calls list).
3. Then the WebRTC / Telecom / FCM full-screen-intent plumbing.
