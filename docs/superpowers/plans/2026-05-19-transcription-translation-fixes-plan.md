# Transcription & Translation Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix four root-caused transcription/translation bugs (segment-stub serialization, empty-segment fallback, broken "Translate" on audio and text messages) and add an on-demand re-transcription button.

**Architecture:** Five independent-ish work chantiers, A→B→E→D→C. Chantier A hardens the translator's ZMQ segment serializer (cache-hit dicts vs dataclasses). Chantier B fixes the iOS audio-player segment fallback. Chantier E adds a backend `force` flag and an iOS "Re-transcribe" button. Chantier D fixes text-message translation by passing `messageId` to `/translate-blocking`. Chantier C makes "Translate" on an audio message call `POST /attachments/:id/translate` and read the synchronous HTTP response. Every code change is preceded by a failing test (RED → GREEN → REFACTOR).

**Tech Stack:** Python 3.11 + pytest (translator), Fastify 5 + TypeScript + Jest (gateway), Swift 6 + Swift Testing/XCTest (MeeshySDK / MeeshyUI), SwiftUI + XCTest (iOS app).

---

## Conventions reference (read before starting)

- **TDD is non-negotiable.** Every production-code step is preceded by a failing-test step.
- **Translator tests:** `cd services/translator && pytest tests/<file>::<test> -v`. `asyncio_mode = "auto"`. Markers `@pytest.mark.unit`.
- **Gateway tests:** `cd services/gateway && npx jest --config=jest.config.json <file>`. Type-check with `cd services/gateway && npx tsc --noEmit`.
- **iOS SDK tests:** built via the auto-generated `MeeshySDK-Package` scheme (the `MeeshyUI` scheme has no test action). Use `./apps/ios/meeshy.sh test` for the app target; for SDK-only suites use `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshySDKTests/<Suite>` (or `MeeshyUITests/<Suite>`) `-derivedDataPath apps/ios/Build -quiet`.
- **iOS app build/test:** `./apps/ios/meeshy.sh build` and `./apps/ios/meeshy.sh test`. Never call `xcodebuild`/`xcrun` directly for the app target.
- **SDK rule:** all reusable models/types/UI live in `packages/MeeshySDK/`, never in `apps/ios/`.
- **iOS classic xcodeproj** (`apps/ios/Meeshy.xcodeproj`, objectVersion 63, no synchronized groups): if a NEW `.swift` file is added to `apps/ios/Meeshy/`, you MUST add the manual `project.pbxproj` entries — one `PBXBuildFile` + one `PBXFileReference` + one `PBXGroup` child entry + one `PBXSourcesBuildPhase` entry, with 2 fresh 24-hex UUIDs. **This plan adds no new file under `apps/ios/Meeshy/`** — every iOS change is an edit to an existing file or a new file inside `packages/MeeshySDK/` (SPM, no pbxproj). If you deviate, apply the pbxproj rule.
- **Mock convention:** `Mock{ServiceName}` conforming to `{ServiceName}Providing`, `Result<T, Error>` stubs + call counts.
- **No commit attribution trailer.** End commit messages at the last meaningful line.
- **Parallel work:** if multiple chantiers are worked concurrently, each agent uses its own git worktree (`git worktree add ../v2_meeshy-feat-<chantier> -b feat/<chantier> main`). Chantiers A, B, E touch disjoint files and may run in parallel; D and C both touch `MessageDetailSheet.swift` and must be serialized after each other.

---

## File Structure

| File | Chantier | Responsibility |
|------|----------|----------------|
| `services/translator/src/services/zmq_audio_handler.py` | A | Add module helper `_segment_to_dict`; use it in `_publish_transcription_result`. |
| `services/translator/src/services/audio_pipeline/transcription_stage.py` | A | Harden `_cache_transcription` to use a dict-safe segment serializer. |
| `services/translator/tests/test_segment_serialization.py` (new) | A | pytest for `_segment_to_dict` + `_publish_transcription_result`. |
| `packages/MeeshySDK/Sources/MeeshyUI/Media/MediaTypes.swift` | B | `buildFrom` filters empty-text segments. |
| `packages/MeeshySDK/Sources/MeeshyUI/Media/AudioPlayerView.swift` | B, E | `displaySegments` symmetric fallback for translated audio; `onRetranscribe` callback + UI buttons. |
| `packages/MeeshySDK/Tests/MeeshyUITests/TranscriptionDisplaySegmentTests.swift` (new) | B | Swift Testing for `buildFrom`. |
| `packages/MeeshySDK/Tests/MeeshyUITests/AudioPlayerDisplaySegmentsTests.swift` (new) | B | Tests for `displaySegments` fallback (original + translated branches). |
| `services/gateway/src/routes/attachments/types.ts` | E | Add `force?: boolean` to a transcribe body type. |
| `services/gateway/src/routes/attachments/translation.ts` | E | Honor `force` in `POST /attachments/:id/transcribe` (skip court-circuit). |
| `services/gateway/src/__tests__/unit/attachment-transcribe-force.test.ts` (new) | E | Jest for the `force` court-circuit logic. |
| `packages/MeeshySDK/Sources/MeeshySDK/Services/AttachmentService.swift` | E, C | `requestTranscription(attachmentId:force:)`; new `translate(...)`. |
| `packages/MeeshySDK/Sources/MeeshySDK/Services/ServiceModels.swift` | E, C, D | `TranscribeRequest`, `AttachmentTranslateRequest`, `AttachmentTranslateResponse`, `requiredConsents` error model; `TranslateRequest.messageId`. |
| `packages/MeeshySDK/Tests/MeeshySDKTests/Services/AttachmentServiceTests.swift` (new) | E, C | Tests for `requestTranscription(force:)` body + `translate` endpoint/body/decoding/403. |
| `packages/MeeshySDK/Sources/MeeshySDK/Services/TranslationService.swift` | D | `translate(...)` accepts `messageId`. |
| `packages/MeeshySDK/Tests/MeeshySDKTests/Services/TranslationServiceTests.swift` (new or extend) | D | `TranslateRequest` encodes/omits `message_id`. |
| `apps/ios/Meeshy/Features/Main/Components/MessageDetailSheet.swift` | D, C | `translateTo` passes `messageId`, drops socket call, surfaces `translationError`; audio branch calls `AttachmentService.translate`. |
| `packages/MeeshySDK/Sources/MeeshyUI/Media/MediaTypes.swift` | — | (B only — listed once above.) |
| `apps/ios/Meeshy/Features/Main/Views/ConversationMediaViews.swift` | E | Thread `onRetranscribe` through `AudioMediaView` → `AudioPlayerView`. |
| `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout.swift` | E | Pass `onRetranscribe` into `AudioMediaView`. |
| `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleAttachmentView.swift` | E | Pass `onRetranscribe` into its `AudioPlayerView`. |

---

# Phase A — Translator: dict-safe segment serialization

**Why first:** root cause of the 4 segment-stub audios. Fixes the server emitter so future cache-hit transcriptions are persisted correctly.

**Checkpoint A (end of phase):** all Phase A tests green via `pytest tests/test_segment_serialization.py -v`; no regression in `test_zmq_multipart.py`. **Stop here for review before Phase B.**

### Task A1: Add the `_segment_to_dict` helper

**Files:**
- Modify: `services/translator/src/services/zmq_audio_handler.py` (add module-level function next to `_get_voice_similarity_score`, lines ~38-54)
- Create: `services/translator/tests/test_segment_serialization.py`

- [ ] **Step 1: Write the failing test**

Create `services/translator/tests/test_segment_serialization.py`:

```python
"""Tests for dict-or-object safe segment serialization (Chantier A)."""

import sys
import os
from dataclasses import dataclass
from typing import Optional

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from services.zmq_audio_handler import _segment_to_dict


@dataclass
class _FakeSegment:
    text: str
    start_ms: int
    end_ms: int
    confidence: Optional[float] = None
    speaker_id: Optional[str] = None
    voice_similarity_score: Optional[float] = None
    language: Optional[str] = None


@pytest.mark.unit
def test_segment_to_dict_dataclass_preserves_values():
    seg = _FakeSegment(text="bonjour", start_ms=100, end_ms=900,
                       confidence=0.92, speaker_id="spk_0", language="fr")
    result = _segment_to_dict(seg)
    assert result["text"] == "bonjour"
    assert result["startMs"] == 100
    assert result["endMs"] == 900
    assert result["confidence"] == 0.92
    assert result["speakerId"] == "spk_0"
    assert result["language"] == "fr"


@pytest.mark.unit
def test_segment_to_dict_camelcase_dict_preserves_values():
    seg = {"text": "hello", "startMs": 200, "endMs": 1100,
           "confidence": 0.81, "speakerId": "spk_1", "language": "en"}
    result = _segment_to_dict(seg)
    assert result["text"] == "hello"
    assert result["startMs"] == 200
    assert result["endMs"] == 1100
    assert result["confidence"] == 0.81
    assert result["speakerId"] == "spk_1"
    assert result["language"] == "en"


@pytest.mark.unit
def test_segment_to_dict_snakecase_dict_preserves_values():
    seg = {"text": "hola", "start_ms": 300, "end_ms": 1300, "speaker_id": "spk_2"}
    result = _segment_to_dict(seg)
    assert result["text"] == "hola"
    assert result["startMs"] == 300
    assert result["endMs"] == 1300
    assert result["speakerId"] == "spk_2"


@pytest.mark.unit
def test_segment_to_dict_dict_and_dataclass_equal_for_same_data():
    obj = _FakeSegment(text="x", start_ms=10, end_ms=20, confidence=0.5)
    dct = {"text": "x", "startMs": 10, "endMs": 20, "confidence": 0.5}
    assert _segment_to_dict(obj) == _segment_to_dict(dct)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/translator && pytest tests/test_segment_serialization.py -v`
Expected: FAIL — `ImportError: cannot import name '_segment_to_dict'`.

- [ ] **Step 3: Write minimal implementation**

In `services/translator/src/services/zmq_audio_handler.py`, add this function immediately AFTER `_get_voice_similarity_score` (after line ~54, before `class AudioHandler`):

```python
def _segment_to_dict(seg) -> Dict:
    """
    Serialize a transcription segment to a camelCase dict, accepting either a
    dataclass object OR a (camelCase or snake_case) dict.

    Cache-hit transcriptions carry segments as dicts (Redis JSON), fresh ones
    carry dataclasses. `getattr` silently returns the default on dicts, which
    produced empty-text "segment stubs" — this helper reads both shapes.
    """
    def _read(obj_attr: str, *dict_keys: str, default=None):
        if hasattr(seg, obj_attr):
            return getattr(seg, obj_attr)
        if isinstance(seg, dict):
            for key in dict_keys:
                if key in seg and seg[key] is not None:
                    return seg[key]
        return default

    return {
        'text': _read('text', 'text', default='') or '',
        'startMs': _read('start_ms', 'startMs', 'start_ms', default=0) or 0,
        'endMs': _read('end_ms', 'endMs', 'end_ms', default=0) or 0,
        'confidence': _read('confidence', 'confidence', default=None),
        'speakerId': _read('speaker_id', 'speakerId', 'speaker_id', default=None) or None,
        'voiceSimilarityScore': _get_voice_similarity_score(seg),
        'language': _read('language', 'language', default=None),
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd services/translator && pytest tests/test_segment_serialization.py -v`
Expected: PASS — all 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add services/translator/src/services/zmq_audio_handler.py services/translator/tests/test_segment_serialization.py
git commit -m "feat(translator): add dict-or-object safe _segment_to_dict helper"
```

### Task A2: Use `_segment_to_dict` in the buggy `_publish_transcription_result` serializer

**Files:**
- Modify: `services/translator/src/services/zmq_audio_handler.py:622-633` (segment list comprehension inside `transcription_dict`)
- Test: `services/translator/tests/test_segment_serialization.py` (extend)

- [ ] **Step 1: Write the failing test**

Append to `services/translator/tests/test_segment_serialization.py`:

```python
import asyncio
from unittest.mock import AsyncMock


@dataclass
class _FakeTranscription:
    text: str
    language: str
    confidence: float
    source: str
    segments: list
    duration_ms: int
    speaker_count: Optional[int] = None
    primary_speaker_id: Optional[str] = None
    sender_voice_identified: Optional[bool] = None
    sender_speaker_id: Optional[str] = None
    speaker_analysis: Optional[dict] = None


@pytest.mark.unit
async def test_publish_transcription_result_serializes_dict_segments():
    """Cache-hit path: segments arrive as dicts; the published payload must
    keep non-empty text/startMs/endMs (regression for the 4 stub audios)."""
    from services.zmq_audio_handler import AudioHandler

    captured = {}

    class _FakePubSocket:
        async def send_json(self, payload):
            captured['payload'] = payload

    handler = AudioHandler(pub_socket=_FakePubSocket())

    dict_segments = [
        {"text": "bonjour", "startMs": 0, "endMs": 800, "confidence": 0.9},
        {"text": "le monde", "startMs": 800, "endMs": 1600, "confidence": 0.88},
    ]
    transcription = _FakeTranscription(
        text="bonjour le monde", language="fr", confidence=0.89,
        source="cache", segments=dict_segments, duration_ms=1600,
    )
    transcription_data = {
        'transcription': transcription,
        'message_id': 'msg_1',
        'attachment_id': 'att_1',
        'processing_time_ms': 12,
    }

    await handler._publish_transcription_result('task_1', transcription_data)

    published = captured['payload']['transcription']['segments']
    assert len(published) == 2
    assert published[0]['text'] == "bonjour"
    assert published[0]['startMs'] == 0
    assert published[0]['endMs'] == 800
    assert published[1]['text'] == "le monde"
    assert published[1]['startMs'] == 800
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/translator && pytest tests/test_segment_serialization.py::test_publish_transcription_result_serializes_dict_segments -v`
Expected: FAIL — `published[0]['text']` is `''` (current `getattr(seg, 'text', '')` returns `''` for dicts), so `assert published[0]['text'] == "bonjour"` fails.

> If construction of `AudioHandler(pub_socket=...)` requires extra args, inspect `AudioHandler.__init__` (line ~60) and pass the minimum (it accepts `pub_socket` and optional `database_service`). Do NOT change the constructor.

- [ ] **Step 3: Write minimal implementation**

In `services/translator/src/services/zmq_audio_handler.py`, replace the `'segments'` list comprehension inside `transcription_dict` in `_publish_transcription_result` (lines ~622-633):

Replace:
```python
                'segments': [
                    {
                        'text': getattr(seg, 'text', ''),
                        'startMs': getattr(seg, 'start_ms', getattr(seg, 'startMs', 0)),
                        'endMs': getattr(seg, 'end_ms', getattr(seg, 'endMs', 0)),
                        'confidence': getattr(seg, 'confidence', None),
                        'speakerId': getattr(seg, 'speaker_id', getattr(seg, 'speakerId', None)),
                        'voiceSimilarityScore': _get_voice_similarity_score(seg),
                        'language': getattr(seg, 'language', None)
                    }
                    for seg in (transcription.segments or [])
                ] if transcription.segments else None,
```

With:
```python
                'segments': [
                    _segment_to_dict(seg)
                    for seg in (transcription.segments or [])
                ] if transcription.segments else None,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd services/translator && pytest tests/test_segment_serialization.py -v`
Expected: PASS — all 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add services/translator/src/services/zmq_audio_handler.py services/translator/tests/test_segment_serialization.py
git commit -m "fix(translator): use _segment_to_dict in transcription_ready serializer"
```

### Task A3: Harden `_cache_transcription` with the dict-safe serializer

**Files:**
- Modify: `services/translator/src/services/audio_pipeline/transcription_stage.py:388-399` (`segments_as_dicts` comprehension)
- Test: `services/translator/tests/test_segment_serialization.py` (extend)

- [ ] **Step 1: Write the failing test**

Append to `services/translator/tests/test_segment_serialization.py`:

```python
@pytest.mark.unit
def test_segment_to_dict_used_for_cache_hardening_dict_input():
    """A segment already in dict form (defensive case) must round-trip
    through _segment_to_dict without losing text."""
    seg = {"text": "cached text", "startMs": 5, "endMs": 50}
    out = _segment_to_dict(seg)
    assert out["text"] == "cached text"
    assert out["startMs"] == 5
    assert out["endMs"] == 50
```

> `_cache_transcription` is `async` and depends on a Redis-backed cache; a behavior test through the public stage is heavy. The hardening below is a defensive consistency change — covered by reusing the already-tested `_segment_to_dict`. This step's test asserts the helper handles the dict input that the hardening relies on.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/translator && pytest tests/test_segment_serialization.py::test_segment_to_dict_used_for_cache_hardening_dict_input -v`
Expected: PASS already (helper exists from A1). This test is a guard for the hardening; if it fails, the helper is broken — fix the helper before proceeding.

- [ ] **Step 3: Write minimal implementation**

In `services/translator/src/services/audio_pipeline/transcription_stage.py`, add the import at the top of the file (alongside existing imports):

```python
from services.zmq_audio_handler import _segment_to_dict
```

> If `transcription_stage.py` imports are relative (check the existing import block ~lines 1-30), use the matching style, e.g. `from ..zmq_audio_handler import _segment_to_dict`. Match the file's existing convention; do not introduce a new import style.

Then replace the `segments_as_dicts` comprehension inside `_cache_transcription` (lines ~388-399):

Replace:
```python
            segments_as_dicts = [
                {
                    "text": seg.text,
                    "startMs": seg.start_ms,
                    "endMs": seg.end_ms,
                    "confidence": seg.confidence,
                    "speakerId": seg.speaker_id if hasattr(seg, 'speaker_id') and seg.speaker_id else None,
                    "voiceSimilarityScore": seg.voice_similarity_score if isinstance(seg.voice_similarity_score, (int, float)) else None,
                    "language": seg.language if hasattr(seg, 'language') and seg.language else None
                }
                for seg in (result.segments or [])
            ]
```

With:
```python
            segments_as_dicts = [
                _segment_to_dict(seg)
                for seg in (result.segments or [])
            ]
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
cd services/translator && pytest tests/test_segment_serialization.py -v && pytest tests/test_zmq_multipart.py -v
```
Expected: `test_segment_serialization.py` all green; `test_zmq_multipart.py` no new failures (pre-existing skips/failures unchanged — note them but do not fix out of scope).

- [ ] **Step 5: Commit**

```bash
git add services/translator/src/services/audio_pipeline/transcription_stage.py services/translator/tests/test_segment_serialization.py
git commit -m "refactor(translator): harden _cache_transcription with _segment_to_dict"
```

**=== REVIEW CHECKPOINT A ===** Confirm: `_publish_transcription_result` and `_cache_transcription` both route segments through `_segment_to_dict`; `audio_process_completed` serializer (lines 444-456, 516-527) and `zmq_transcription_handler.py` were **not** touched (already dict-safe / cache-free). Stop for review before Phase B.

---

# Phase B — iOS: empty-segment fallback (transcription + translated audio)

**Why second:** instantly re-displays the 4 already-broken stub audios (their `text` is intact). Independent of Phase A.

**Checkpoint B:** `buildFrom` filters empty segments; both `displaySegments` branches synthesize a single segment from full text when segments are empty. **Stop for review before Phase E.**

### Task B1: `buildFrom(segments:)` filters empty-text segments

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Media/MediaTypes.swift:184-195` (`buildFrom(segments:)`)
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/TranscriptionDisplaySegmentTests.swift`

- [ ] **Step 1: Write the failing test**

Create `packages/MeeshySDK/Tests/MeeshyUITests/TranscriptionDisplaySegmentTests.swift`:

```swift
import Testing
@testable import MeeshyUI
@testable import MeeshySDK

@Suite("TranscriptionDisplaySegment.buildFrom")
struct TranscriptionDisplaySegmentTests {

    @Test("all-empty segments produce an empty result")
    func test_buildFrom_allEmptySegments_returnsEmpty() {
        let segments = [
            MessageTranscriptionSegment(text: "", startTime: 0, endTime: 0),
            MessageTranscriptionSegment(text: "   ", startTime: 0, endTime: 0),
            MessageTranscriptionSegment(text: "\n", startTime: 0, endTime: 0),
        ]
        let result = TranscriptionDisplaySegment.buildFrom(segments: segments)
        #expect(result.isEmpty)
    }

    @Test("mixed empty and non-empty keeps only non-empty segments")
    func test_buildFrom_mixedSegments_keepsOnlyNonEmpty() {
        let segments = [
            MessageTranscriptionSegment(text: "", startTime: 0, endTime: 100),
            MessageTranscriptionSegment(text: "bonjour", startTime: 100, endTime: 900),
            MessageTranscriptionSegment(text: "  ", startTime: 900, endTime: 1000),
            MessageTranscriptionSegment(text: "monde", startTime: 1000, endTime: 1800),
        ]
        let result = TranscriptionDisplaySegment.buildFrom(segments: segments)
        #expect(result.count == 2)
        #expect(result.map(\.text) == ["bonjour", "monde"])
    }

    @Test("all-non-empty segments are all kept")
    func test_buildFrom_allNonEmpty_keepsAll() {
        let segments = [
            MessageTranscriptionSegment(text: "a", startTime: 0, endTime: 1),
            MessageTranscriptionSegment(text: "b", startTime: 1, endTime: 2),
        ]
        let result = TranscriptionDisplaySegment.buildFrom(segments: segments)
        #expect(result.count == 2)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -only-testing:MeeshyUITests/TranscriptionDisplaySegmentTests \
  -derivedDataPath apps/ios/Build -quiet
```
Expected: FAIL — `test_buildFrom_allEmptySegments_returnsEmpty` (current `buildFrom` maps 1:1, returns 3) and `test_buildFrom_mixedSegments_keepsOnlyNonEmpty` (returns 4).

- [ ] **Step 3: Write minimal implementation**

In `packages/MeeshySDK/Sources/MeeshyUI/Media/MediaTypes.swift`, change `buildFrom(segments:)` (lines 184-195) to filter empty-text segments BEFORE mapping:

```swift
    public static func buildFrom(segments: [MessageTranscriptionSegment]) -> [TranscriptionDisplaySegment] {
        var speakerMap: [String: Int] = [:]
        var nextIndex = 0
        return segments
            .filter { !$0.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
            .map { seg in
                let sid = seg.speakerId ?? "default"
                if speakerMap[sid] == nil {
                    speakerMap[sid] = nextIndex
                    nextIndex += 1
                }
                return TranscriptionDisplaySegment.from(seg, speakerIndex: speakerMap[sid] ?? 0)
            }
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run the Step 2 command again.
Expected: PASS — all 3 tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Media/MediaTypes.swift packages/MeeshySDK/Tests/MeeshyUITests/TranscriptionDisplaySegmentTests.swift
git commit -m "fix(ios): filter empty-text segments in TranscriptionDisplaySegment.buildFrom"
```

### Task B2: `displaySegments` symmetric fallback for translated audio

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Media/AudioPlayerView.swift:279-297` (`displaySegments`)
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/AudioPlayerDisplaySegmentsTests.swift`

**Context:** `displaySegments` is `private`. To test it without exposing internals, extract the pure resolution into a `static` helper on `AudioPlayerView` (or a free function in the same file) that takes the inputs and returns `[TranscriptionDisplaySegment]`. The computed property delegates to it. This keeps the behavior testable through a public API surface without an SwiftUI render.

- [ ] **Step 1: Write the failing test**

Create `packages/MeeshySDK/Tests/MeeshyUITests/AudioPlayerDisplaySegmentsTests.swift`:

```swift
import Testing
@testable import MeeshyUI
@testable import MeeshySDK

@Suite("AudioPlayerView.resolveDisplaySegments")
struct AudioPlayerDisplaySegmentsTests {

    private func makeTranscription(text: String, segments: [MessageTranscriptionSegment], durationMs: Int) -> MessageTranscription {
        MessageTranscription(attachmentId: "att_1", text: text, language: "fr",
                             confidence: 0.9, durationMs: durationMs, segments: segments)
    }

    private func makeTranslatedAudio(lang: String, transcription: String, segments: [MessageTranscriptionSegment]) -> MessageTranslatedAudio {
        MessageTranslatedAudio(id: "ta_1", attachmentId: "att_1", targetLanguage: lang,
                               url: "https://x/a.mp3", transcription: transcription,
                               durationMs: 1800, format: "mp3", cloned: false,
                               quality: 0.8, ttsModel: "chatterbox", segments: segments)
    }

    @Test("original branch: empty segments + non-empty text -> one synthesized segment")
    func test_resolveDisplaySegments_originalEmptySegments_synthesizesOne() {
        let stubSegments = [
            MessageTranscriptionSegment(text: "", startTime: 0, endTime: 0),
            MessageTranscriptionSegment(text: "", startTime: 0, endTime: 0),
        ]
        let transcription = makeTranscription(text: "bonjour le monde", segments: stubSegments, durationMs: 1600)
        let result = AudioPlayerView.resolveDisplaySegments(
            selectedLanguage: "orig", transcription: transcription, translatedAudios: [])
        #expect(result.count == 1)
        #expect(result.first?.text == "bonjour le monde")
        #expect(result.first?.endTime == 1.6)
    }

    @Test("translated branch: empty segments + non-empty translated.transcription -> one synthesized segment")
    func test_resolveDisplaySegments_translatedEmptySegments_synthesizesOne() {
        let stubSegments = [MessageTranscriptionSegment(text: "", startTime: 0, endTime: 0)]
        let translated = makeTranslatedAudio(lang: "en", transcription: "hello world", segments: stubSegments)
        let transcription = makeTranscription(text: "bonjour le monde",
            segments: [MessageTranscriptionSegment(text: "bonjour le monde", startTime: 0, endTime: 1.6)],
            durationMs: 1600)
        let result = AudioPlayerView.resolveDisplaySegments(
            selectedLanguage: "en", transcription: transcription, translatedAudios: [translated])
        #expect(result.count == 1)
        #expect(result.first?.text == "hello world")
    }

    @Test("translated branch: non-empty segments are used directly")
    func test_resolveDisplaySegments_translatedRealSegments_usesThem() {
        let realSegments = [
            MessageTranscriptionSegment(text: "hello", startTime: 0, endTime: 0.8),
            MessageTranscriptionSegment(text: "world", startTime: 0.8, endTime: 1.8),
        ]
        let translated = makeTranslatedAudio(lang: "en", transcription: "hello world", segments: realSegments)
        let transcription = makeTranscription(text: "bonjour",
            segments: [MessageTranscriptionSegment(text: "bonjour", startTime: 0, endTime: 1)],
            durationMs: 1000)
        let result = AudioPlayerView.resolveDisplaySegments(
            selectedLanguage: "en", transcription: transcription, translatedAudios: [translated])
        #expect(result.map(\.text) == ["hello", "world"])
    }

    @Test("original branch: non-empty segments are used directly")
    func test_resolveDisplaySegments_originalRealSegments_usesThem() {
        let realSegments = [MessageTranscriptionSegment(text: "bonjour", startTime: 0, endTime: 1)]
        let transcription = makeTranscription(text: "bonjour", segments: realSegments, durationMs: 1000)
        let result = AudioPlayerView.resolveDisplaySegments(
            selectedLanguage: "orig", transcription: transcription, translatedAudios: [])
        #expect(result.map(\.text) == ["bonjour"])
    }

    @Test("no transcription, orig selected -> empty")
    func test_resolveDisplaySegments_noTranscription_returnsEmpty() {
        let result = AudioPlayerView.resolveDisplaySegments(
            selectedLanguage: "orig", transcription: nil, translatedAudios: [])
        #expect(result.isEmpty)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -only-testing:MeeshyUITests/AudioPlayerDisplaySegmentsTests \
  -derivedDataPath apps/ios/Build -quiet
```
Expected: FAIL — compile error: `AudioPlayerView` has no `resolveDisplaySegments`.

- [ ] **Step 3: Write minimal implementation**

In `packages/MeeshySDK/Sources/MeeshyUI/Media/AudioPlayerView.swift`, add a `static` pure helper and rewrite `displaySegments` to delegate. Replace the `displaySegments` computed property (lines 279-297) with:

```swift
    private var displaySegments: [TranscriptionDisplaySegment] {
        AudioPlayerView.resolveDisplaySegments(
            selectedLanguage: selectedAudioLanguage,
            transcription: transcription,
            translatedAudios: translatedAudios
        )
    }

    /// Pure resolution of the transcription strip segments. Falls back to a
    /// single synthesized segment from the full text when the per-segment
    /// list is empty — symmetrically for the original transcription AND for a
    /// selected translated audio (otherwise stub-segment translated audios
    /// would render a blank strip).
    static func resolveDisplaySegments(
        selectedLanguage: String,
        transcription: MessageTranscription?,
        translatedAudios: [MessageTranslatedAudio]
    ) -> [TranscriptionDisplaySegment] {
        if selectedLanguage != "orig",
           let translated = translatedAudios.first(where: {
               $0.targetLanguage.lowercased() == selectedLanguage.lowercased()
           }) {
            let builtTranslated = TranscriptionDisplaySegment.buildFrom(segments: translated.segments)
            if builtTranslated.isEmpty,
               !translated.transcription.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                return [TranscriptionDisplaySegment(
                    text: translated.transcription,
                    startTime: 0,
                    endTime: Double(translated.durationMs) / 1000.0,
                    speakerId: nil,
                    speakerColor: TranscriptionDisplaySegment.speakerPalette[0]
                )]
            }
            return builtTranslated
        }
        guard let t = transcription else { return [] }
        let built = TranscriptionDisplaySegment.buildFrom(t)
        if built.isEmpty, !t.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return [TranscriptionDisplaySegment(
                text: t.text,
                startTime: 0,
                endTime: Double(t.durationMs ?? 0) / 1000.0,
                speakerId: nil,
                speakerColor: TranscriptionDisplaySegment.speakerPalette[0]
            )]
        }
        return built
    }
```

> Note: the previous code only entered the translated branch when `!translated.segments.isEmpty`. The new helper always enters the translated branch for a matching language and applies the fallback when `buildFrom` yields `[]` — this is the symmetric fallback required by the spec.

- [ ] **Step 4: Run test to verify it passes**

Run the Step 2 command again.
Expected: PASS — all 6 tests green.

- [ ] **Step 5: Verify the SDK still builds and run the app build**

Run: `./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED.

- [ ] **Step 6: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Media/AudioPlayerView.swift packages/MeeshySDK/Tests/MeeshyUITests/AudioPlayerDisplaySegmentsTests.swift
git commit -m "fix(ios): symmetric empty-segment fallback for translated audio transcription strip"
```

**=== REVIEW CHECKPOINT B ===** Confirm: stub-segment audios (original AND translated) now show a single full-text segment instead of blank lines; legitimate multi-segment audios are unchanged. Stop for review before Phase E.

---

# Phase E — On-demand re-transcription button

**Why third:** independent of A and B; uses the cache-free `transcription_only` path. Backend → SDK → UI.

**Checkpoint E:** `POST /attachments/:id/transcribe` honors `{ force: true }`; `AttachmentService.requestTranscription(attachmentId:force:)` sends it; a "Re-transcribe" button is wired through to the bubble. **Stop for review before Phase D.**

### Task E1: Gateway — `force` flag skips the transcribe court-circuit

**Files:**
- Modify: `services/gateway/src/routes/attachments/types.ts` (add `TranscribeBody`)
- Modify: `services/gateway/src/routes/attachments/translation.ts` (add `body` schema to the transcribe route + `force` gate at lines ~418-429)
- Create: `services/gateway/src/__tests__/unit/attachment-transcribe-force.test.ts`

**Context:** the court-circuit "return existing transcription" is purely in the route (lines 418-429): `if (existingData.transcription) { return ... }`. `force` must skip that branch and fall through to `translationService.transcribeAttachment(attachmentId)` (which always sends a fresh ZMQ `transcription_only` request). `MessageTranslationService.transcribeAttachment` needs **no change** — it never court-circuits.

- [ ] **Step 1: Write the failing test**

Create `services/gateway/src/__tests__/unit/attachment-transcribe-force.test.ts`. Since the route handler is large and DB-bound, test the **decision predicate** as an extracted pure function.

```typescript
import { describe, it, expect } from '@jest/globals';
import { shouldReturnExistingTranscription } from '../../routes/attachments/translation';

describe('shouldReturnExistingTranscription', () => {
  it('returns true when a transcription exists and force is not set', () => {
    expect(shouldReturnExistingTranscription({ hasTranscription: true, force: false })).toBe(true);
  });

  it('returns false when force is true even if a transcription exists', () => {
    expect(shouldReturnExistingTranscription({ hasTranscription: true, force: true })).toBe(false);
  });

  it('returns false when no transcription exists', () => {
    expect(shouldReturnExistingTranscription({ hasTranscription: false, force: false })).toBe(false);
  });

  it('returns false when no transcription exists and force is true', () => {
    expect(shouldReturnExistingTranscription({ hasTranscription: false, force: true })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/gateway && npx jest --config=jest.config.json attachment-transcribe-force`
Expected: FAIL — `shouldReturnExistingTranscription` is not exported.

- [ ] **Step 3: Write minimal implementation**

In `services/gateway/src/routes/attachments/types.ts`, add after `TranslateBody` (line 40):

```typescript
export interface TranscribeBody {
  force?: boolean;
}
```

In `services/gateway/src/routes/attachments/translation.ts`, add the exported pure predicate at the top of the file, after the imports (before `registerTranslationRoutes`):

```typescript
/**
 * Whether the transcribe endpoint should short-circuit and return the
 * already-persisted transcription. `force: true` always re-runs a fresh
 * `transcription_only` ZMQ request (cache-free path).
 */
export function shouldReturnExistingTranscription(
  input: { hasTranscription: boolean; force: boolean }
): boolean {
  return input.hasTranscription && !input.force;
}
```

Add a `body` schema to the `POST /attachments/:attachmentId/transcribe` route definition (inside its `schema` object, after `params`):

```typescript
        body: {
          type: 'object',
          properties: {
            force: {
              type: 'boolean',
              description: 'Re-run a fresh transcription even if one already exists',
              default: false
            }
          }
        },
```

In the transcribe handler, after `const { attachmentId } = request.params as AttachmentParams;`, read the body:

```typescript
        const transcribeBody = (request.body ?? {}) as TranscribeBody;
        const force = transcribeBody.force === true;
```

Add `TranscribeBody` to the existing type import:
```typescript
import type { AttachmentParams, TranslateBody, TranscribeBody } from './types';
```

Replace the court-circuit block (lines ~418-429):

Replace:
```typescript
        if (existingData.transcription) {
          return reply.send({
```

With:
```typescript
        if (shouldReturnExistingTranscription({
          hasTranscription: !!existingData.transcription,
          force
        })) {
          return reply.send({
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
cd services/gateway && npx jest --config=jest.config.json attachment-transcribe-force && npx tsc --noEmit
```
Expected: 4 tests PASS; `tsc` reports no NEW errors (pre-existing socket-handler errors are out of scope — note them, do not fix).

- [ ] **Step 5: Commit**

```bash
git add services/gateway/src/routes/attachments/types.ts services/gateway/src/routes/attachments/translation.ts services/gateway/src/__tests__/unit/attachment-transcribe-force.test.ts
git commit -m "feat(gateway): support force flag on POST /attachments/:id/transcribe"
```

### Task E2: SDK — `requestTranscription(attachmentId:force:)`

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Services/AttachmentService.swift`
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Services/ServiceModels.swift` (add `TranscribeRequest`)
- Create: `packages/MeeshySDK/Tests/MeeshySDKTests/Services/AttachmentServiceTests.swift`

- [ ] **Step 1: Write the failing test**

Create `packages/MeeshySDK/Tests/MeeshySDKTests/Services/AttachmentServiceTests.swift`:

```swift
import XCTest
@testable import MeeshySDK

final class AttachmentServiceTests: XCTestCase {

    func test_requestTranscription_withForce_sendsForceTrueInBody() async throws {
        let mock = MockAPIClient()
        mock.stubResponse(endpoint: "/attachments/att_1/transcribe",
                          json: #"{"success":true,"message":"ok"}"#)
        let service = AttachmentService(api: mock)

        try await service.requestTranscription(attachmentId: "att_1", force: true)

        let body = try XCTUnwrap(mock.lastRequestBody)
        let decoded = try JSONSerialization.jsonObject(with: body) as? [String: Any]
        XCTAssertEqual(decoded?["force"] as? Bool, true)
    }

    func test_requestTranscription_defaultForce_sendsForceFalse() async throws {
        let mock = MockAPIClient()
        mock.stubResponse(endpoint: "/attachments/att_1/transcribe",
                          json: #"{"success":true,"message":"ok"}"#)
        let service = AttachmentService(api: mock)

        try await service.requestTranscription(attachmentId: "att_1")

        let body = try XCTUnwrap(mock.lastRequestBody)
        let decoded = try JSONSerialization.jsonObject(with: body) as? [String: Any]
        XCTAssertEqual(decoded?["force"] as? Bool, false)
    }
}
```

> Before writing this test, inspect `packages/MeeshySDK/Tests/MeeshySDKTests/Mocks/MockAPIClient.swift`. Confirm it captures the request body (look for a `lastRequestBody`/`lastBody` property and a `request<T>(endpoint:method:body:queryItems:)` capture). If it does NOT capture the raw body, add a `var lastRequestBody: Data?` and assign it in the `request(...)` and `post(...)` overrides — this is shared test infrastructure, an allowed change. Match the existing stubbing API (`stubResponse`) shape; adjust the test calls to whatever the real Mock exposes.

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -only-testing:MeeshySDKTests/AttachmentServiceTests \
  -derivedDataPath apps/ios/Build -quiet
```
Expected: FAIL — `requestTranscription(attachmentId:force:)` does not exist (current signature is `requestTranscription(attachmentId:)` with no body).

- [ ] **Step 3: Write minimal implementation**

In `packages/MeeshySDK/Sources/MeeshySDK/Services/ServiceModels.swift`, add (in the Translation/Attachment area, e.g. after `TranslateResponse`):

```swift
// MARK: - Attachment Transcription

public struct TranscribeRequest: Encodable {
    public let force: Bool

    public init(force: Bool) {
        self.force = force
    }

    enum CodingKeys: String, CodingKey {
        case force
    }
}
```

In `packages/MeeshySDK/Sources/MeeshySDK/Services/AttachmentService.swift`, replace `requestTranscription`:

```swift
    public func requestTranscription(attachmentId: String, force: Bool = false) async throws {
        let bodyData = try JSONEncoder().encode(TranscribeRequest(force: force))
        let _: SimpleAPIResponse = try await api.request(
            endpoint: "/attachments/\(attachmentId)/transcribe",
            method: "POST",
            body: bodyData
        )
    }
```

> The `APIClientProviding` protocol exposes `request<T>(endpoint:method:body:)` (an `APIClient.swift:161` convenience). Confirm the exact overload signature; if only `request(endpoint:method:body:queryItems:)` is on the protocol, call that form with `queryItems: nil`.

- [ ] **Step 4: Run test to verify it passes**

Run the Step 2 command again.
Expected: PASS — both tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Services/AttachmentService.swift packages/MeeshySDK/Sources/MeeshySDK/Services/ServiceModels.swift packages/MeeshySDK/Tests/MeeshySDKTests/Services/AttachmentServiceTests.swift
git commit -m "feat(ios-sdk): add force param to AttachmentService.requestTranscription"
```

### Task E3: MeeshyUI — `onRetranscribe` callback + "Re-transcribe" buttons

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Media/AudioPlayerView.swift`
- Create: `packages/MeeshySDK/Tests/MeeshyUITests/AudioPlayerRetranscribeTests.swift`

**Context:** `AudioPlayerView` already has `onRequestTranscription` (empty-state "Transcrire" button, lines 427-450) and `transcriptionFooterRow` (lines 462-483, rendered under an existing transcription). Add `onRetranscribe: (() -> Void)?` and render a small "Re-transcribe" button (`arrow.clockwise`) in BOTH places.

- [ ] **Step 1: Write the failing test**

Create `packages/MeeshySDK/Tests/MeeshyUITests/AudioPlayerRetranscribeTests.swift`:

```swift
import Testing
@testable import MeeshyUI
@testable import MeeshySDK

@Suite("AudioPlayerView re-transcribe wiring")
struct AudioPlayerRetranscribeTests {

    @Test("onRetranscribe callback is stored when provided")
    func test_init_withOnRetranscribe_storesCallback() {
        let attachment = MeeshyMessageAttachment(
            id: "att_1", fileName: "a.m4a", fileUrl: "https://x/a.m4a",
            mimeType: "audio/m4a", fileSize: 1000, duration: 1600
        )
        var called = false
        let view = AudioPlayerView(
            attachment: attachment,
            context: .messageBubble,
            onRetranscribe: { called = true }
        )
        view.onRetranscribe?()
        #expect(called)
        #expect(view.onRetranscribe != nil)
    }

    @Test("onRetranscribe is nil by default")
    func test_init_withoutOnRetranscribe_isNil() {
        let attachment = MeeshyMessageAttachment(
            id: "att_1", fileName: "a.m4a", fileUrl: "https://x/a.m4a",
            mimeType: "audio/m4a", fileSize: 1000, duration: 1600
        )
        let view = AudioPlayerView(attachment: attachment, context: .messageBubble)
        #expect(view.onRetranscribe == nil)
    }
}
```

> Confirm the exact initializer of `MeeshyMessageAttachment` (the SDK media attachment type referenced by `AudioPlayerView.attachment`) and adjust the factory args to match its real signature. The test asserts the callback property exists and is stored — pure behavior, no SwiftUI render.

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -only-testing:MeeshyUITests/AudioPlayerRetranscribeTests \
  -derivedDataPath apps/ios/Build -quiet
```
Expected: FAIL — compile error: `AudioPlayerView` init has no `onRetranscribe` parameter.

- [ ] **Step 3: Write minimal implementation**

In `packages/MeeshySDK/Sources/MeeshyUI/Media/AudioPlayerView.swift`:

(a) Add the stored property after `onRequestTranscription` (line ~261):
```swift
    public var onRetranscribe: (() -> Void)? = nil
```

(b) Add `@State` for the in-flight guard, after `@State private var selectedAudioLanguage` (line ~274):
```swift
    @State private var isRetranscribing = false
```

(c) Add the parameter to the `init` (after `onRequestTranscription:` in the signature, line ~309) and assign it (line ~318):
```swift
                onRequestTranscription: (() -> Void)? = nil,
                onRetranscribe: (() -> Void)? = nil,
```
```swift
        self.onRequestTranscription = onRequestTranscription
        self.onRetranscribe = onRetranscribe
```

(d) Add a reusable button view (new `@ViewBuilder` private property in the same file):
```swift
    @ViewBuilder
    private var retranscribeButton: some View {
        if let onRetranscribe {
            Button {
                guard !isRetranscribing else { return }
                isRetranscribing = true
                onRetranscribe()
                HapticFeedback.light()
            } label: {
                HStack(spacing: 4) {
                    if isRetranscribing {
                        ProgressView()
                            .scaleEffect(0.6)
                    } else {
                        Image(systemName: "arrow.clockwise")
                            .font(.system(size: 10, weight: .medium))
                    }
                    Text(String(localized: "media.audio.retranscribe",
                                 defaultValue: "Re-transcrire", bundle: .module))
                        .font(.system(size: 10, weight: .medium))
                }
                .foregroundColor(isDark ? .white.opacity(0.45) : .black.opacity(0.35))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 6)
            }
            .disabled(isRetranscribing)
        }
    }
```

(e) Render it in `transcriptionFooterRow` (under an existing transcription) — add it inside the `VStack(spacing: 2)` after the `if let slot = bottomSlot` block (line ~480):
```swift
            retranscribeButton
```

(f) Render it in the empty-state branch — inside the `VStack(spacing: 0)` of the `else if let onRequest = onRequestTranscription` block, after the existing "Transcrire" `Button` and before `if let slot = bottomSlot` (line ~446):
```swift
                retranscribeButton
```

> The empty-state branch only renders when `onRequestTranscription != nil`. For the empty state to also show "Re-transcribe", the caller passes both `onRequestTranscription` and `onRetranscribe`. That is acceptable — they are distinct actions (first transcription vs. forced re-run). If the spec intent is "re-transcribe only", the caller may pass `onRetranscribe` and leave `onRequestTranscription` nil; in that case also render `retranscribeButton` in the `else if let slot = bottomSlot` / final fallback branch. Keep it simple: render `retranscribeButton` wherever a transcription footer area exists.

- [ ] **Step 4: Run test to verify it passes**

Run the Step 2 command again, then `./apps/ios/meeshy.sh build`.
Expected: tests PASS; BUILD SUCCEEDED.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Media/AudioPlayerView.swift packages/MeeshySDK/Tests/MeeshyUITests/AudioPlayerRetranscribeTests.swift
git commit -m "feat(ios-ui): add onRetranscribe callback and Re-transcribe button to AudioPlayerView"
```

### Task E4: App — thread `onRetranscribe` through the bubble views

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationMediaViews.swift` (`AudioMediaView`)
- Modify: `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout.swift` (`AudioMediaView(...)` call site, line ~846)
- Modify: `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleAttachmentView.swift` (`AudioPlayerView(...)` call site, line ~43)

**Context:** `AudioMediaView` builds two `AudioPlayerView` instances (`audioPlayer`, lines 489-522). Add an `onRetranscribe` closure parameter to `AudioMediaView` and pass it into both `AudioPlayerView` calls. The closure body calls `AttachmentService.shared.requestTranscription(attachmentId:force:true)`. The result returns via the existing `audio:transcription-ready` socket → `messageTranscriptions` cache → bubble re-render (no extra wiring needed). `BubbleAttachmentView` calls `AudioPlayerView` directly; wire it there too.

- [ ] **Step 1: Write the failing test**

This is pure view-graph wiring (no ViewModel, no protocol seam — `AttachmentService.shared` is a singleton called directly). A meaningful unit test requires a `Providing` protocol + DI, which the spec does NOT mandate for the app layer (it scopes app tests to `languageRow` branching for C, and SDK-level tests for E). **No new app-level test for E4.** Verification is the build + the SDK test from E3 already proving the callback plumbing. Skip Steps 1-2; proceed to Step 3.

- [ ] **Step 2: (skipped — see Step 1)**

- [ ] **Step 3: Write minimal implementation**

In `apps/ios/Meeshy/Features/Main/Views/ConversationMediaViews.swift`, add to `AudioMediaView`'s stored properties (after `var footerActions`, line ~355):
```swift
    var onRetranscribe: ((String) -> Void)? = nil
```

> `AudioMediaView` is `Equatable` with an explicit `==`. Closures are not Equatable — `onRetranscribe` must NOT be added to the `==` comparison (line 357-368). Leave `==` unchanged: the callback's behavior depends only on `attachment.id`, already compared.

In the `audioPlayer` computed property, add `onRetranscribe:` to BOTH `AudioPlayerView(...)` initializers (lines ~491 and ~508):
```swift
                onRetranscribe: {
                    Task {
                        try? await AttachmentService.shared.requestTranscription(
                            attachmentId: attachment.id, force: true
                        )
                    }
                },
```

In `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout.swift`, at the `AudioMediaView(...)` call site (line ~846), pass the parameter through if `BubbleStandardLayout` already forwards a transcription callback; otherwise add:
```swift
                onRetranscribe: nil,
```
> `AudioMediaView.onRetranscribe` has a `nil` default, so an explicit pass-through at this site is only needed if `BubbleStandardLayout` has its own retranscribe entry point. If it does not, the default-`nil` covers it — `AudioMediaView` builds its own closure internally in `audioPlayer`. **Decision:** `AudioMediaView` owns the `AttachmentService` call internally (Step 3 above), so `BubbleStandardLayout` and `BubbleAttachmentView` need NO change for the closure. They only need to ensure the audio player is reachable. Re-scope: only `ConversationMediaViews.swift` and `BubbleAttachmentView.swift` change.

In `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleAttachmentView.swift`, at the `AudioPlayerView(...)` call site (line ~43), add:
```swift
                onRetranscribe: {
                    Task {
                        try? await AttachmentService.shared.requestTranscription(
                            attachmentId: attachment.id, force: true
                        )
                    }
                },
```
> Confirm the attachment variable name in `BubbleAttachmentView`'s scope (it may be `attachment` or `att`). Use the actual identifier.

- [ ] **Step 4: Verify the build**

Run: `./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED.

- [ ] **Step 5: Run the iOS test suite (no regressions)**

Run: `./apps/ios/meeshy.sh test`
Expected: PASS — no new failures.

- [ ] **Step 6: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/ConversationMediaViews.swift apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleAttachmentView.swift
git commit -m "feat(ios): wire Re-transcribe button to AttachmentService force transcription"
```

**=== REVIEW CHECKPOINT E ===** Confirm: `force` flows backend → SDK → UI; the button is disabled while a request is in flight; opening a stub audio and tapping "Re-transcribe" sends a fresh `transcription_only` request. Stop for review before Phase D.

---

# Phase D — "Translate" on a text message → pass `messageId`

**Why fourth:** depends on nothing new; fixes the HTTP 400 on `/translate-blocking`.

**Checkpoint D:** `TranslateRequest` carries optional `message_id`; `translateTo` passes `message.id`; the redundant socket call is removed; failures surface in `translationError`. **Stop for review before Phase C.**

### Task D1: SDK — `TranslateRequest.messageId` (optional, JSON `message_id`)

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Services/ServiceModels.swift:185-199` (`TranslateRequest`)
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Services/TranslationService.swift`
- Create: `packages/MeeshySDK/Tests/MeeshySDKTests/Services/TranslationServiceTests.swift`

- [ ] **Step 1: Write the failing test**

Create `packages/MeeshySDK/Tests/MeeshySDKTests/Services/TranslationServiceTests.swift`:

```swift
import XCTest
@testable import MeeshySDK

final class TranslationServiceTests: XCTestCase {

    func test_translateRequest_encodesMessageId_whenProvided() throws {
        let request = TranslateRequest(
            text: "hello", sourceLanguage: "en", targetLanguage: "fr", messageId: "msg_42"
        )
        let data = try JSONEncoder().encode(request)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertEqual(json["message_id"] as? String, "msg_42")
        XCTAssertEqual(json["target_language"] as? String, "fr")
    }

    func test_translateRequest_omitsMessageId_whenNil() throws {
        let request = TranslateRequest(
            text: "hello", sourceLanguage: "en", targetLanguage: "fr"
        )
        let data = try JSONEncoder().encode(request)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertNil(json["message_id"])
    }

    func test_translationService_translate_withMessageId_postsToBlockingEndpoint() async throws {
        let mock = MockAPIClient()
        mock.stubResponse(endpoint: "/translate-blocking",
                          json: #"{"success":true,"data":{"translated_text":"bonjour","source_language":"en"}}"#)
        let service = TranslationService(api: mock)

        let result = try await service.translate(
            text: "hello", sourceLanguage: "en", targetLanguage: "fr", messageId: "msg_42"
        )

        XCTAssertEqual(result.translatedText, "bonjour")
        let body = try XCTUnwrap(mock.lastRequestBody)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
        XCTAssertEqual(json["message_id"] as? String, "msg_42")
    }
}
```

> The `Encodable` default encoder omits a `nil` optional only when `encodeIfPresent` is used. With a synthesized `Encodable` and an `Optional` property, Swift's default `encode(to:)` already uses `encodeIfPresent` for optionals — so a `nil messageId` is omitted automatically. Verify; if the JSON unexpectedly contains `message_id: null`, add an explicit `encode(to:)` using `encodeIfPresent`.

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -only-testing:MeeshySDKTests/TranslationServiceTests \
  -derivedDataPath apps/ios/Build -quiet
```
Expected: FAIL — compile error: `TranslateRequest` has no `messageId`; `TranslationService.translate` has no `messageId` parameter.

- [ ] **Step 3: Write minimal implementation**

In `packages/MeeshySDK/Sources/MeeshySDK/Services/ServiceModels.swift`, replace `TranslateRequest` (lines 185-199):

```swift
public struct TranslateRequest: Encodable {
    public let text: String
    public let sourceLanguage: String
    public let targetLanguage: String
    public let messageId: String?

    public init(text: String, sourceLanguage: String, targetLanguage: String, messageId: String? = nil) {
        self.text = text
        self.sourceLanguage = sourceLanguage
        self.targetLanguage = targetLanguage
        self.messageId = messageId
    }

    enum CodingKeys: String, CodingKey {
        case text
        case sourceLanguage = "source_language"
        case targetLanguage = "target_language"
        case messageId = "message_id"
    }
}
```

In `packages/MeeshySDK/Sources/MeeshySDK/Services/TranslationService.swift`, replace `translate`:

```swift
    public func translate(
        text: String,
        sourceLanguage: String,
        targetLanguage: String,
        messageId: String? = nil
    ) async throws -> TranslateResponse {
        let body = TranslateRequest(
            text: text, sourceLanguage: sourceLanguage,
            targetLanguage: targetLanguage, messageId: messageId
        )
        let response: APIResponse<TranslateResponse> = try await api.post(
            endpoint: "/translate-blocking", body: body
        )
        return response.data
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run the Step 2 command again.
Expected: PASS — all 3 tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Services/ServiceModels.swift packages/MeeshySDK/Sources/MeeshySDK/Services/TranslationService.swift packages/MeeshySDK/Tests/MeeshySDKTests/Services/TranslationServiceTests.swift
git commit -m "feat(ios-sdk): add optional messageId to TranslateRequest / TranslationService.translate"
```

### Task D2: App — `translateTo` passes `messageId`, drops the socket call, surfaces errors

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Components/MessageDetailSheet.swift` (`translateTo` lines ~667-699; add `@State translationError`)

- [ ] **Step 1: Write the failing test**

`MessageDetailSheet.translateTo` is a `private` method on a SwiftUI `View` struct and calls `TranslationService.shared` directly — no DI seam. The spec's stated app-side D test is "`translateTo` in success peoples `translations`; in failure sets `translationError`; no `onRequestTranslation` residual." Without a `Providing` seam this cannot be unit-tested in isolation. **Two acceptable paths:**

- **Path 1 (preferred, minimal):** Treat D2 as covered by the SDK test (D1) plus the build + a manual smoke check. Remove the socket call and add the error state; verify by build + checkpoint. **No new app test.**
- **Path 2:** If a unit test is required by review, extract a pure free function `translateRequestMessageId(for message: Message) -> String` (returns `message.id`) and a `translateOutcome` enum mapping success/failure, and test those. This is over-engineering for a 3-line change; prefer Path 1.

Proceed with Path 1: no failing test for D2. Verification is the build, the absence of `onRequestTranslation` in the file, and Checkpoint D.

- [ ] **Step 2: (skipped — see Step 1)**

- [ ] **Step 3: Write minimal implementation**

In `apps/ios/Meeshy/Features/Main/Components/MessageDetailSheet.swift`:

(a) Add a `@State` after `selectedLanguageCode` (line ~189):
```swift
    @State private var translationError: String? = nil
```

(b) Replace `translateTo` (lines 667-699):

```swift
    private func translateTo(_ targetLang: String, from sourceLang: String) async {
        // Audio messages have empty `content`; text translation only applies
        // when there is text. (Audio messages are handled by the audio branch.)
        guard !message.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        translatingLanguages.insert(targetLang)
        translationError = nil
        defer { translatingLanguages.remove(targetLang) }

        do {
            let response = try await TranslationService.shared.translate(
                text: message.content,
                sourceLanguage: sourceLang,
                targetLanguage: targetLang,
                messageId: message.id
            )
            translations[targetLang] = response.translatedText
            withAnimation(.easeInOut(duration: 0.2)) {
                selectedLanguageCode = targetLang
            }
            let mt = MessageTranslation(
                id: "\(message.id)-\(targetLang)",
                messageId: message.id,
                sourceLanguage: sourceLang,
                targetLanguage: targetLang,
                translatedContent: response.translatedText,
                translationModel: "on-demand",
                confidenceScore: nil
            )
            onSelectTranslation?(mt)
            // No socket call: passing `messageId` routes /translate-blocking
            // into the Case 1 "retranslation" branch, which persists AND
            // broadcasts via `message:translation`. A second socket request
            // would double-persist.
            HapticFeedback.success()
        } catch {
            translationError = String(
                localized: "translation.error",
                defaultValue: "La traduction a échoué. Réessayez."
            )
            HapticFeedback.error()
        }
    }
```

> This removes the `onRequestTranslation?(message.id, targetLang)` line. The `onRequestTranslation` property (line 150) and its `init` parameter (line 207, 219) become unused. **Leave them in place** — removing the public init parameter is a wider API change touching every call site; the spec only says "remove the socket call". Removing the redundant *call* satisfies decision #3. Optionally add `// Deprecated: kept for API compatibility, no longer invoked` above the property.

(c) Surface `translationError` discreetly in the Language tab. Find the language list section (around `languageRow` rendering, near line ~538) and add, just below the list, a conditional error row:
```swift
            if let translationError {
                Text(translationError)
                    .font(.system(size: 11))
                    .foregroundColor(MeeshyColors.error)
                    .padding(.horizontal, 8)
                    .padding(.top, 4)
                    .transition(.opacity)
            }
```
> Place it inside the same container that renders the language rows so it appears within the Language tab. Match the surrounding indentation/`VStack`.

- [ ] **Step 4: Verify the build**

Run: `./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED.

- [ ] **Step 5: Verify the socket call is gone**

Run: `grep -n "onRequestTranslation" apps/ios/Meeshy/Features/Main/Components/MessageDetailSheet.swift`
Expected: only the property declaration and init plumbing remain — NO `onRequestTranslation?(` invocation.

- [ ] **Step 6: Run the iOS test suite**

Run: `./apps/ios/meeshy.sh test`
Expected: PASS — no new failures.

- [ ] **Step 7: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Components/MessageDetailSheet.swift
git commit -m "fix(ios): translate text messages via messageId, drop redundant socket call, surface errors"
```

**=== REVIEW CHECKPOINT D ===** Confirm: tapping "Traduire" on a text message now succeeds (HTTP 200 from `/translate-blocking` Case 1) and the bubble updates; a forced failure shows the discreet error text; no double-persistence. Stop for review before Phase C.

---

# Phase C — "Translate" on an audio message → full audio translation

**Why last:** depends on the SDK `AttachmentService` from Phase E and touches `MessageDetailSheet` after Phase D.

**Checkpoint C:** `AttachmentService.translate` POSTs `/attachments/:id/translate`, decodes `data.translations`, and decodes the 403 `requiredConsents`; the audio branch of `languageRow` calls it, merges the result into `translatedAudios`, and shows the consent error. **Final phase.**

### Task C1: SDK — `AttachmentService.translate` + response/error models

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Services/ServiceModels.swift` (add request/response/error models)
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Services/AttachmentService.swift` (add `translate`)
- Modify: `packages/MeeshySDK/Tests/MeeshySDKTests/Services/AttachmentServiceTests.swift` (extend)

**Context:** the endpoint is synchronous by default (`async:false`) and returns `{ success, data: { status, jobId?, translations: [...] } }`. `translations` items follow `messageAttachmentSchema`. On missing consent it returns **403** with `{ success:false, error:"AUDIO_*_NOT_ENABLED", message, requiredConsents:[...] }`.

- [ ] **Step 1: Write the failing test**

Append to `packages/MeeshySDK/Tests/MeeshySDKTests/Services/AttachmentServiceTests.swift`:

```swift
    // MARK: - translate

    func test_translate_postsToTranslateEndpoint_withTargetLanguages() async throws {
        let mock = MockAPIClient()
        mock.stubResponse(
            endpoint: "/attachments/att_1/translate",
            json: #"""
            {"success":true,"data":{"status":"completed","translations":[
              {"id":"ta_1","targetLanguage":"en","translatedText":"hello",
               "audioUrl":"https://x/en.mp3","durationMs":1800,"voiceCloned":false}
            ]}}
            """#
        )
        let service = AttachmentService(api: mock)

        let result = try await service.translate(
            attachmentId: "att_1", targetLanguages: ["en"],
            sourceLanguage: "fr", generateVoiceClone: false
        )

        XCTAssertEqual(result.translations.count, 1)
        XCTAssertEqual(result.translations.first?.targetLanguage, "en")
        let body = try XCTUnwrap(mock.lastRequestBody)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
        XCTAssertEqual(json["targetLanguages"] as? [String], ["en"])
        XCTAssertEqual(json["sourceLanguage"] as? String, "fr")
        XCTAssertEqual(json["generateVoiceClone"] as? Bool, false)
    }

    func test_translate_decodes403ConsentError_withRequiredConsents() async throws {
        let mock = MockAPIClient()
        mock.stubError(
            endpoint: "/attachments/att_1/translate",
            statusCode: 403,
            json: #"""
            {"success":false,"error":"AUDIO_TRANSLATION_NOT_ENABLED",
             "message":"You must enable audio translation consent to translate audio",
             "requiredConsents":["audioTranslationEnabledAt","audioTranscriptionEnabledAt"]}
            """#
        )
        let service = AttachmentService(api: mock)

        do {
            _ = try await service.translate(
                attachmentId: "att_1", targetLanguages: ["en"]
            )
            XCTFail("Expected a consent error to be thrown")
        } catch let error as AttachmentConsentError {
            XCTAssertEqual(error.code, "AUDIO_TRANSLATION_NOT_ENABLED")
            XCTAssertEqual(error.requiredConsents,
                           ["audioTranslationEnabledAt", "audioTranscriptionEnabledAt"])
        }
    }
```

> Inspect `MockAPIClient` for an error-stubbing API. If it only has `stubResponse`, add `stubError(endpoint:statusCode:json:)` that makes the next matching call throw an `APIError` carrying the status code and raw body — shared test infra, an allowed change. The exact `APIError` shape is in `APIClient.swift`; the SDK `translate` must inspect a thrown `APIError` for a 403 with a body containing `requiredConsents` and re-throw as `AttachmentConsentError`.

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
xcodebuild test -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -only-testing:MeeshySDKTests/AttachmentServiceTests \
  -derivedDataPath apps/ios/Build -quiet
```
Expected: FAIL — `AttachmentService.translate`, `AttachmentTranslateResponse`, `AttachmentConsentError` do not exist.

- [ ] **Step 3: Write minimal implementation**

In `packages/MeeshySDK/Sources/MeeshySDK/Services/ServiceModels.swift`, add:

```swift
// MARK: - Attachment Translation

public struct AttachmentTranslateRequest: Encodable {
    public let targetLanguages: [String]
    public let sourceLanguage: String?
    public let generateVoiceClone: Bool?

    public init(targetLanguages: [String], sourceLanguage: String? = nil,
                generateVoiceClone: Bool? = nil) {
        self.targetLanguages = targetLanguages
        self.sourceLanguage = sourceLanguage
        self.generateVoiceClone = generateVoiceClone
    }
}

/// One translated-audio result returned synchronously by
/// `POST /attachments/:id/translate` (a `messageAttachmentSchema` element).
public struct AttachmentTranslationResult: Decodable, Sendable {
    public let id: String
    public let targetLanguage: String
    public let translatedText: String?
    public let audioUrl: String?
    public let durationMs: Int?
    public let voiceCloned: Bool?

    enum CodingKeys: String, CodingKey {
        case id
        case targetLanguage
        case translatedText
        case audioUrl
        case durationMs
        case voiceCloned
    }
}

public struct AttachmentTranslateResponse: Decodable, Sendable {
    public let status: String?
    public let jobId: String?
    public let translations: [AttachmentTranslationResult]

    enum CodingKeys: String, CodingKey {
        case status, jobId, translations
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        status = try c.decodeIfPresent(String.self, forKey: .status)
        jobId = try c.decodeIfPresent(String.self, forKey: .jobId)
        translations = try c.decodeIfPresent([AttachmentTranslationResult].self,
                                             forKey: .translations) ?? []
    }
}

/// Thrown when the translate/transcribe endpoint returns 403 because the user
/// has not granted the required consents.
public struct AttachmentConsentError: Error, Sendable {
    public let code: String
    public let message: String
    public let requiredConsents: [String]

    public init(code: String, message: String, requiredConsents: [String]) {
        self.code = code
        self.message = message
        self.requiredConsents = requiredConsents
    }
}

/// Decodable shape of the 403 body, used to build `AttachmentConsentError`.
public struct AttachmentConsentErrorBody: Decodable {
    public let error: String
    public let message: String?
    public let requiredConsents: [String]?
}
```

In `packages/MeeshySDK/Sources/MeeshySDK/Services/AttachmentService.swift`, add:

```swift
    /// Translate an audio attachment (transcription + translation + TTS).
    /// Synchronous: the result is in the HTTP response body. Throws
    /// `AttachmentConsentError` on a 403 missing-consent response.
    public func translate(
        attachmentId: String,
        targetLanguages: [String],
        sourceLanguage: String? = nil,
        generateVoiceClone: Bool? = nil
    ) async throws -> AttachmentTranslateResponse {
        let request = AttachmentTranslateRequest(
            targetLanguages: targetLanguages,
            sourceLanguage: sourceLanguage,
            generateVoiceClone: generateVoiceClone
        )
        do {
            let response: APIResponse<AttachmentTranslateResponse> = try await api.post(
                endpoint: "/attachments/\(attachmentId)/translate",
                body: request
            )
            return response.data
        } catch let apiError as APIError {
            if let consent = AttachmentService.consentError(from: apiError) {
                throw consent
            }
            throw apiError
        }
    }

    /// Maps a 403 `APIError` carrying a `requiredConsents` body to a typed
    /// `AttachmentConsentError`; returns nil for any other error.
    static func consentError(from apiError: APIError) -> AttachmentConsentError? {
        guard let body = apiError.responseBody,
              let decoded = try? JSONDecoder().decode(AttachmentConsentErrorBody.self, from: body),
              let consents = decoded.requiredConsents else {
            return nil
        }
        return AttachmentConsentError(
            code: decoded.error,
            message: decoded.message ?? "Consent required",
            requiredConsents: consents
        )
    }
```

> Inspect `APIError` in `APIClient.swift`. If it does NOT expose the raw response body (`responseBody: Data?`) and status code, add them — `APIClient` must populate `APIError` with the body on a non-2xx response so the consent body can be decoded. This is a small, contained networking-layer change required for typed consent handling. Adjust `consentError(from:)` to the real `APIError` API (it may already carry a `statusCode` and a decoded `message`).

- [ ] **Step 4: Run test to verify it passes**

Run the Step 2 command again.
Expected: PASS — all `AttachmentServiceTests` (E2 + C1) green.

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Services/AttachmentService.swift packages/MeeshySDK/Sources/MeeshySDK/Services/ServiceModels.swift packages/MeeshySDK/Tests/MeeshySDKTests/Services/AttachmentServiceTests.swift packages/MeeshySDK/Sources/MeeshySDK/Networking/APIClient.swift
git commit -m "feat(ios-sdk): add AttachmentService.translate with synchronous result and 403 consent decoding"
```

### Task C2: App — audio branch of `languageRow` calls `AttachmentService.translate`

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Components/MessageDetailSheet.swift` (`languageRow` audio branch ~line 589; add `translateAudioTo`; add `@State` for the in-flight set and merged audios)

**Context:** in `languageRow`, the `else` branch (line 589) currently always calls `translateTo` (text path). For an audio message (`transcription != nil`) it must instead call a new `translateAudioTo`. The result merges into a local `translatedAudios` state and selects the language.

**Important:** `translatedAudios` is currently a `let`-ish init property (line 147, `var translatedAudios: [MessageTranslatedAudio] = []` — a stored View property set from `init`). To merge results at runtime it must become mutable runtime state. Introduce a `@State private var mergedTranslatedAudios: [MessageTranslatedAudio] = []` initialized from the prop, and use the union for display. Do NOT mutate the init property.

- [ ] **Step 1: Write the failing test**

Same DI limitation as D2: `languageRow` is a `private` view builder calling `AttachmentService.shared` directly. The spec asks for an app test "the audio branch of `languageRow` invokes the service (mock), merges the result, gives the 403". Without a `Providing` seam on `AttachmentService`, a true unit test needs an injection point.

**Decision:** introduce a minimal protocol seam so the spec's app test is satisfiable AND the audio branch is testable. Add `AttachmentTranslating` protocol in the SDK (capability protocol, `-ing` suffix per conventions) and a default `.shared` injection on `MessageDetailSheet`.

This step's RED test (extract a pure mapper) — create `apps/ios/MeeshyTests/Unit/Helpers/AudioTranslationMergeTests.swift`:

```swift
import XCTest
@testable import Meeshy
import MeeshySDK

final class AudioTranslationMergeTests: XCTestCase {

    func test_mergeAudioTranslations_addsNewLanguage() {
        let existing: [MessageTranslatedAudio] = []
        let incoming = [
            AttachmentTranslationResult(id: "ta_1", targetLanguage: "en",
                translatedText: "hello", audioUrl: "https://x/en.mp3",
                durationMs: 1800, voiceCloned: false)
        ]
        let merged = MessageDetailSheet.mergeAudioTranslations(
            existing: existing, incoming: incoming, attachmentId: "att_1"
        )
        XCTAssertEqual(merged.count, 1)
        XCTAssertEqual(merged.first?.targetLanguage, "en")
        XCTAssertEqual(merged.first?.url, "https://x/en.mp3")
    }

    func test_mergeAudioTranslations_replacesSameLanguage() {
        let existing = [
            MessageTranslatedAudio(id: "old", attachmentId: "att_1", targetLanguage: "en",
                url: "https://x/old.mp3", transcription: "old", durationMs: 1000,
                format: "mp3", cloned: false, quality: 0.5, ttsModel: "chatterbox")
        ]
        let incoming = [
            AttachmentTranslationResult(id: "ta_new", targetLanguage: "en",
                translatedText: "hello", audioUrl: "https://x/new.mp3",
                durationMs: 1800, voiceCloned: false)
        ]
        let merged = MessageDetailSheet.mergeAudioTranslations(
            existing: existing, incoming: incoming, attachmentId: "att_1"
        )
        XCTAssertEqual(merged.count, 1)
        XCTAssertEqual(merged.first?.url, "https://x/new.mp3")
    }
}
```

> `AttachmentTranslationResult` needs a public memberwise `init` for the test. It is `Decodable` with a synthesized init only — add an explicit `public init(id:targetLanguage:translatedText:audioUrl:durationMs:voiceCloned:)` to the struct in `ServiceModels.swift` (do this as part of C1 Step 3 if not already present, or amend here).

- [ ] **Step 2: Run test to verify it fails**

Run: `./apps/ios/meeshy.sh test --filter AudioTranslationMergeTests`
Expected: FAIL — `MessageDetailSheet.mergeAudioTranslations` does not exist.

> If `meeshy.sh test` does not support `--filter`, run the full `./apps/ios/meeshy.sh test` and locate `AudioTranslationMergeTests` in the output.

- [ ] **Step 3: Write minimal implementation**

In `apps/ios/Meeshy/Features/Main/Components/MessageDetailSheet.swift`:

(a) Add a `@State` for runtime-merged audios after `translationError` (line ~190):
```swift
    @State private var mergedTranslatedAudios: [MessageTranslatedAudio] = []
    @State private var translatingAudioLanguages: Set<String> = []
```

(b) In `.onAppear`/`.task` of the sheet (find where state is seeded), initialize `mergedTranslatedAudios` from the init prop once:
```swift
        if mergedTranslatedAudios.isEmpty { mergedTranslatedAudios = translatedAudios }
```
> Place this in the existing `loadExistingTranslations()` or the sheet's `.task` so it runs once on appear.

(c) Add the static pure merge helper:
```swift
    /// Merge synchronous audio-translation results into the existing list,
    /// replacing any entry for the same target language.
    static func mergeAudioTranslations(
        existing: [MessageTranslatedAudio],
        incoming: [AttachmentTranslationResult],
        attachmentId: String
    ) -> [MessageTranslatedAudio] {
        var byLang: [String: MessageTranslatedAudio] = [:]
        for audio in existing {
            byLang[audio.targetLanguage.lowercased()] = audio
        }
        for result in incoming {
            let mapped = MessageTranslatedAudio(
                id: result.id,
                attachmentId: attachmentId,
                targetLanguage: result.targetLanguage,
                url: result.audioUrl ?? "",
                transcription: result.translatedText ?? "",
                durationMs: result.durationMs ?? 0,
                format: "mp3",
                cloned: result.voiceCloned ?? false,
                quality: 0,
                ttsModel: "chatterbox",
                segments: []
            )
            byLang[result.targetLanguage.lowercased()] = mapped
        }
        return Array(byLang.values)
    }
```

(d) Add the audio translation action:
```swift
    private func translateAudioTo(_ targetLang: String) async {
        guard let attachmentId = transcription?.attachmentId else { return }
        translatingAudioLanguages.insert(targetLang)
        translationError = nil
        defer { translatingAudioLanguages.remove(targetLang) }

        do {
            let response = try await AttachmentService.shared.translate(
                attachmentId: attachmentId,
                targetLanguages: [targetLang],
                sourceLanguage: message.originalLanguage,
                generateVoiceClone: false
            )
            mergedTranslatedAudios = MessageDetailSheet.mergeAudioTranslations(
                existing: mergedTranslatedAudios,
                incoming: response.translations,
                attachmentId: attachmentId
            )
            withAnimation(.easeInOut(duration: 0.2)) {
                selectedLanguageCode = targetLang
            }
            onSelectAudioLanguage?(targetLang)
            HapticFeedback.success()
        } catch let consent as AttachmentConsentError {
            translationError = consent.message
            HapticFeedback.error()
        } catch {
            translationError = String(
                localized: "translation.audio.error",
                defaultValue: "La traduction audio a échoué. Réessayez."
            )
            HapticFeedback.error()
        }
    }
```

(e) In `languageRow`, change the final `else` branch (line ~589) to route audio messages to the new action:
```swift
            } else {
                if transcription != nil {
                    Task { await translateAudioTo(lang.code) }
                } else {
                    Task { await translateTo(lang.code, from: originalLang) }
                }
            }
```

(f) Every read of `translatedAudios` inside the body (e.g. lines 570, 575, 579, 631, the `languageSelector` in `transcriptionTabContent`) must use `mergedTranslatedAudios` so newly translated languages render. Find each `translatedAudios` reference in `languageRow` / `transcriptionTabContent` and replace with `mergedTranslatedAudios`. The audio in-flight state for the row spinner uses `translatingAudioLanguages.contains(lang.code)` — fold it into `isTranslating` at line 549:
```swift
        let isTranslating = translatingLanguages.contains(lang.code)
            || translatingAudioLanguages.contains(lang.code)
```

> Do NOT rename or remove the `translatedAudios` init property — it remains the seed. Only the runtime reads switch to `mergedTranslatedAudios`.

- [ ] **Step 4: Run test to verify it passes**

Run: `./apps/ios/meeshy.sh test` (locate `AudioTranslationMergeTests`).
Expected: PASS — both merge tests green.

- [ ] **Step 5: Verify the build**

Run: `./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED.

- [ ] **Step 6: Run the full iOS test suite**

Run: `./apps/ios/meeshy.sh test`
Expected: PASS — no new failures.

- [ ] **Step 7: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Components/MessageDetailSheet.swift packages/MeeshySDK/Sources/MeeshySDK/Services/ServiceModels.swift apps/ios/MeeshyTests/Unit/Helpers/AudioTranslationMergeTests.swift
git commit -m "feat(ios): translate audio messages via AttachmentService.translate with 403 consent handling"
```

> `AudioTranslationMergeTests.swift` is a new file under `apps/ios/MeeshyTests/`. The test target `MeeshyTests` uses the classic xcodeproj — add the 4 pbxproj entries (PBXBuildFile, PBXFileReference, PBXGroup child, PBXSourcesBuildPhase under the **test** target) with 2 fresh 24-hex UUIDs. Confirm by `./apps/ios/meeshy.sh test` discovering the new test.

**=== FINAL REVIEW CHECKPOINT C ===** Confirm: tapping "Traduire" on an audio message shows a spinner, calls `POST /attachments/:id/translate`, merges `data.translations` into the audio list, and selects the language; a consent-less user sees the 403 message; the UI tolerates the multi-tens-of-seconds latency (spinner held). Note for follow-up: if HTTP latency proves unacceptable in real testing, switch to `async:true` + status polling (spec §7 risk C).

---

## Self-Review (completed during planning)

**Spec coverage:**
- Chantier A (§4.A) → Phase A, Tasks A1-A3. `_segment_to_dict` helper ✓; `_publish_transcription_result` fix ✓; `_cache_transcription` hardening ✓; `audio_process_completed` / `zmq_transcription_handler` explicitly untouched ✓.
- Chantier B (§4.B) → Phase B, Tasks B1-B2. `buildFrom` empty filter ✓; original-branch fallback (already existed, preserved) ✓; **symmetric translated-audio fallback** via `translated.transcription` ✓.
- Chantier C (§4.C) → Phase C, Tasks C1-C2. `AttachmentService.translate` reading the synchronous HTTP `data.translations` ✓; 403 `requiredConsents` decoding ✓; audio branch of `languageRow` ✓; spinner ✓.
- Chantier D (§4.D) → Phase D, Tasks D1-D2. `TranslateRequest.messageId` ✓; `translateTo` passes `message.id` ✓; **redundant `onRequestTranslation` socket call removed** ✓; `translationError` state ✓.
- Chantier E (§4.E) → Phase E, Tasks E1-E4. `force` flag ✓; `requestTranscription(force:)` ✓; `onRetranscribe` + button ✓; app wiring ✓; independence from A noted ✓.
- Order §8 (A, B, E, D, C) → phase order matches ✓.
- Hors-scope (§2): no mass re-transcription script, no 194-audio recovery, no deadlock work, no socket-live subscription — none added ✓.

**Type consistency:** `_segment_to_dict` (A), `TranscribeRequest`/`force` (E), `AttachmentTranslateRequest`/`AttachmentTranslateResponse`/`AttachmentTranslationResult`/`AttachmentConsentError`/`AttachmentConsentErrorBody` (C), `TranslateRequest.messageId` (D), `MessageDetailSheet.mergeAudioTranslations` + `translateAudioTo` + `mergedTranslatedAudios` (C), `AudioPlayerView.resolveDisplaySegments` + `onRetranscribe` (B/E) — names used consistently across tasks.

**Open items flagged to the executing engineer (verify against real code before coding):**
1. `MockAPIClient` body/error capture — may need a `lastRequestBody` property and a `stubError` helper (allowed shared-infra change). Confirmed `stubResponse` exists; exact API to be matched.
2. `APIError` may need a `responseBody: Data?` (and status code) so the 403 consent body is decodable — small contained networking change required by Chantier C.
3. `AudioPlayerView.displaySegments` is `private`; the plan extracts a testable `static resolveDisplaySegments(...)` — confirm no other private member is needed.
4. `MeeshyMessageAttachment` and `MessageDetailSheet` init signatures must be checked before writing factory helpers in tests.
5. Chantier C app-test seam: the plan tests the pure `mergeAudioTranslations` mapper rather than introducing a full `AttachmentTranslating` protocol — pragmatic, but if review wants the service mocked, add the protocol + DI on `MessageDetailSheet`.
6. `transcription_stage.py` import style for `_segment_to_dict` (relative vs absolute) must match the file's existing imports.
