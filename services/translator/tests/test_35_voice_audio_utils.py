"""
P1 Voice/audio × translator — coverage tests
=============================================
Covers (≥92% line+branch each):
- src/utils/pipeline_cache.py      — LRU cache
- src/utils/smart_segment_merger.py — 2-pass segment merger
- src/utils/segment_splitter.py    — word-level segment splitter
- src/utils/audio_utils.py         — librosa duration helper
- src/services/transcribe_gap_filler.py — async gap filler
- src/services/diarization_service.py  — pure dataclasses + helpers
"""
import os
import time
import pytest
from unittest.mock import AsyncMock, MagicMock, patch, mock_open


# ============================================================================
# pipeline_cache.py
# ============================================================================

class TestCacheStats:
    def test_defaults(self):
        from src.utils.pipeline_cache import CacheStats
        s = CacheStats()
        assert s.hits == 0
        assert s.misses == 0
        assert s.evictions == 0
        assert s.total_requests == 0

    def test_hit_rate_zero_total(self):
        from src.utils.pipeline_cache import CacheStats
        s = CacheStats(hits=0, misses=0, total_requests=0)
        assert s.hit_rate == 0.0

    def test_hit_rate_with_requests(self):
        from src.utils.pipeline_cache import CacheStats
        s = CacheStats(hits=3, misses=1, total_requests=4)
        assert s.hit_rate == 75.0

    def test_hit_rate_all_misses(self):
        from src.utils.pipeline_cache import CacheStats
        s = CacheStats(hits=0, misses=5, total_requests=5)
        assert s.hit_rate == 0.0

    def test_hit_rate_all_hits(self):
        from src.utils.pipeline_cache import CacheStats
        s = CacheStats(hits=10, misses=0, total_requests=10)
        assert s.hit_rate == 100.0


class TestLRUPipelineCacheMakeKey:
    def test_key_format(self):
        from src.utils.pipeline_cache import LRUPipelineCache
        cache = LRUPipelineCache()
        key = cache._make_key("basic", "fra_Latn", "eng_Latn")
        assert key == "basic:fra_Latn→eng_Latn"

    def test_key_unique_per_combination(self):
        from src.utils.pipeline_cache import LRUPipelineCache
        cache = LRUPipelineCache()
        k1 = cache._make_key("basic", "fra_Latn", "eng_Latn")
        k2 = cache._make_key("premium", "fra_Latn", "eng_Latn")
        k3 = cache._make_key("basic", "deu_Latn", "eng_Latn")
        assert k1 != k2
        assert k1 != k3
        assert k2 != k3


class TestLRUPipelineCacheGet:
    def test_get_miss(self):
        from src.utils.pipeline_cache import LRUPipelineCache
        cache = LRUPipelineCache()
        result = cache.get("basic", "fra_Latn", "eng_Latn")
        assert result is None
        stats = cache.get_stats()
        assert stats.misses == 1
        assert stats.hits == 0
        assert stats.total_requests == 1

    def test_get_hit(self):
        from src.utils.pipeline_cache import LRUPipelineCache
        cache = LRUPipelineCache()
        mock_pipeline = object()
        cache.put("basic", "fra_Latn", "eng_Latn", mock_pipeline)
        result = cache.get("basic", "fra_Latn", "eng_Latn")
        assert result is mock_pipeline
        stats = cache.get_stats()
        assert stats.hits == 1
        assert stats.misses == 0

    def test_get_hit_moves_to_end(self):
        from src.utils.pipeline_cache import LRUPipelineCache
        cache = LRUPipelineCache(max_size=3)
        p1, p2, p3 = object(), object(), object()
        cache.put("basic", "a", "b", p1)
        cache.put("basic", "c", "d", p2)
        cache.put("basic", "e", "f", p3)
        # Access p1 to make it recently used
        cache.get("basic", "a", "b")
        # Add p4 — should evict p2 (oldest), not p1 (recently accessed)
        p4 = object()
        cache.put("basic", "g", "h", p4)
        assert cache.get("basic", "a", "b") is p1
        assert cache.get("basic", "c", "d") is None  # evicted

    def test_multiple_misses_and_hits(self):
        from src.utils.pipeline_cache import LRUPipelineCache
        cache = LRUPipelineCache()
        cache.put("basic", "fr", "en", "pipeline1")
        cache.get("basic", "fr", "en")  # hit
        cache.get("basic", "fr", "de")  # miss
        cache.get("basic", "fr", "de")  # miss
        stats = cache.get_stats()
        assert stats.total_requests == 3
        assert stats.hits == 1
        assert stats.misses == 2


class TestLRUPipelineCachePut:
    def test_put_new_entry(self):
        from src.utils.pipeline_cache import LRUPipelineCache
        cache = LRUPipelineCache()
        cache.put("basic", "fra_Latn", "eng_Latn", "pipeline_obj")
        assert len(cache) == 1
        assert cache.get("basic", "fra_Latn", "eng_Latn") == "pipeline_obj"

    def test_put_update_existing(self):
        from src.utils.pipeline_cache import LRUPipelineCache
        cache = LRUPipelineCache()
        cache.put("basic", "fra_Latn", "eng_Latn", "v1")
        cache.put("basic", "fra_Latn", "eng_Latn", "v2")
        assert len(cache) == 1
        assert cache.get("basic", "fra_Latn", "eng_Latn") == "v2"

    def test_put_eviction_at_max_size(self):
        from src.utils.pipeline_cache import LRUPipelineCache
        cache = LRUPipelineCache(max_size=2)
        cache.put("basic", "a", "b", "p1")
        cache.put("basic", "c", "d", "p2")
        assert len(cache) == 2
        cache.put("basic", "e", "f", "p3")  # evicts oldest (a→b)
        assert len(cache) == 2
        assert cache.get("basic", "a", "b") is None
        assert cache.get("basic", "c", "d") == "p2"
        assert cache.get("basic", "e", "f") == "p3"
        stats = cache.get_stats()
        assert stats.evictions == 1

    def test_put_exactly_at_max_size_no_eviction(self):
        from src.utils.pipeline_cache import LRUPipelineCache
        cache = LRUPipelineCache(max_size=3)
        cache.put("basic", "a", "b", "p1")
        cache.put("basic", "c", "d", "p2")
        cache.put("basic", "e", "f", "p3")
        assert len(cache) == 3
        stats = cache.get_stats()
        assert stats.evictions == 0

    def test_put_multiple_evictions(self):
        from src.utils.pipeline_cache import LRUPipelineCache
        cache = LRUPipelineCache(max_size=1)
        cache.put("basic", "a", "b", "p1")
        cache.put("basic", "c", "d", "p2")
        cache.put("basic", "e", "f", "p3")
        assert len(cache) == 1
        stats = cache.get_stats()
        assert stats.evictions == 2


class TestLRUPipelineCacheMaybeLogStats:
    def test_maybe_log_stats_not_triggered(self):
        from src.utils.pipeline_cache import LRUPipelineCache
        cache = LRUPipelineCache()
        cache._last_stats_log = time.time()  # fresh timestamp
        with patch.object(cache, 'log_stats') as mock_log:
            cache._maybe_log_stats()
            mock_log.assert_not_called()

    def test_maybe_log_stats_triggered(self):
        from src.utils.pipeline_cache import LRUPipelineCache
        cache = LRUPipelineCache()
        cache._last_stats_log = 0.0  # old timestamp
        with patch.object(cache, 'log_stats') as mock_log:
            cache._maybe_log_stats()
            mock_log.assert_called_once()

    def test_log_stats_updates_last_log_time(self):
        from src.utils.pipeline_cache import LRUPipelineCache
        cache = LRUPipelineCache()
        cache._last_stats_log = 0.0
        before = time.time()
        cache._maybe_log_stats()
        assert cache._last_stats_log >= before


class TestLRUPipelineCacheGetStats:
    def test_get_stats_returns_copy(self):
        from src.utils.pipeline_cache import LRUPipelineCache
        cache = LRUPipelineCache()
        cache.put("basic", "a", "b", "p")
        cache.get("basic", "a", "b")
        s1 = cache.get_stats()
        cache.get("basic", "a", "b")
        s2 = cache.get_stats()
        assert s1.hits == 1
        assert s2.hits == 2

    def test_get_stats_all_fields(self):
        from src.utils.pipeline_cache import LRUPipelineCache
        cache = LRUPipelineCache(max_size=1)
        cache.put("basic", "a", "b", "p1")
        cache.put("basic", "c", "d", "p2")  # eviction
        cache.get("basic", "c", "d")   # hit
        cache.get("basic", "a", "b")   # miss
        s = cache.get_stats()
        assert s.hits == 1
        assert s.misses == 1
        assert s.evictions == 1
        assert s.total_requests == 2


class TestLRUPipelineCacheGetTopPairs:
    def test_empty_cache(self):
        from src.utils.pipeline_cache import LRUPipelineCache
        cache = LRUPipelineCache()
        assert cache.get_top_pairs() == []

    def test_fewer_than_n(self):
        from src.utils.pipeline_cache import LRUPipelineCache
        cache = LRUPipelineCache()
        cache.put("basic", "a", "b", "p1")
        cache.put("basic", "c", "d", "p2")
        pairs = cache.get_top_pairs(10)
        assert len(pairs) == 2
        assert all(isinstance(p, tuple) and len(p) == 2 for p in pairs)

    def test_exactly_n(self):
        from src.utils.pipeline_cache import LRUPipelineCache
        cache = LRUPipelineCache()
        for i in range(5):
            cache.put("basic", str(i), "b", f"p{i}")
        pairs = cache.get_top_pairs(5)
        assert len(pairs) == 5

    def test_more_than_n_returns_n(self):
        from src.utils.pipeline_cache import LRUPipelineCache
        cache = LRUPipelineCache()
        for i in range(10):
            cache.put("basic", str(i), "b", f"p{i}")
        pairs = cache.get_top_pairs(3)
        assert len(pairs) == 3

    def test_returns_keys_and_positions(self):
        from src.utils.pipeline_cache import LRUPipelineCache
        cache = LRUPipelineCache()
        cache.put("basic", "a", "b", "p1")
        pairs = cache.get_top_pairs(1)
        key, pos = pairs[0]
        assert "basic" in key
        assert pos == 1


class TestLRUPipelineCacheClearAndRemove:
    def test_clear(self):
        from src.utils.pipeline_cache import LRUPipelineCache
        cache = LRUPipelineCache()
        cache.put("basic", "a", "b", "p")
        cache.put("basic", "c", "d", "q")
        cache.clear()
        assert len(cache) == 0
        assert cache.get("basic", "a", "b") is None

    def test_remove_existing(self):
        from src.utils.pipeline_cache import LRUPipelineCache
        cache = LRUPipelineCache()
        cache.put("basic", "a", "b", "p")
        result = cache.remove("basic", "a", "b")
        assert result is True
        assert len(cache) == 0

    def test_remove_not_existing(self):
        from src.utils.pipeline_cache import LRUPipelineCache
        cache = LRUPipelineCache()
        result = cache.remove("basic", "a", "b")
        assert result is False

    def test_len_and_repr(self):
        from src.utils.pipeline_cache import LRUPipelineCache
        cache = LRUPipelineCache(max_size=50)
        assert len(cache) == 0
        cache.put("basic", "a", "b", "p")
        assert len(cache) == 1
        r = repr(cache)
        assert "LRUPipelineCache" in r
        assert "1/50" in r

    def test_log_stats_runs(self):
        from src.utils.pipeline_cache import LRUPipelineCache
        cache = LRUPipelineCache()
        cache.log_stats()  # should not raise


# ============================================================================
# smart_segment_merger.py
# ============================================================================

def _seg(text, start_ms, end_ms, confidence=0.9, speaker_id=None, vscore=None):
    from src.utils.smart_segment_merger import TranscriptionSegment
    return TranscriptionSegment(
        text=text,
        start_ms=start_ms,
        end_ms=end_ms,
        confidence=confidence,
        speaker_id=speaker_id,
        voice_similarity_score=vscore,
    )


class TestEndsSentenceBoundary:
    def test_empty_string(self):
        from src.utils.smart_segment_merger import _ends_with_sentence_boundary
        assert _ends_with_sentence_boundary("") is False

    def test_period(self):
        from src.utils.smart_segment_merger import _ends_with_sentence_boundary
        assert _ends_with_sentence_boundary("Hello.") is True

    def test_exclamation(self):
        from src.utils.smart_segment_merger import _ends_with_sentence_boundary
        assert _ends_with_sentence_boundary("Wow!") is True

    def test_question(self):
        from src.utils.smart_segment_merger import _ends_with_sentence_boundary
        assert _ends_with_sentence_boundary("Really?") is True

    def test_colon(self):
        from src.utils.smart_segment_merger import _ends_with_sentence_boundary
        assert _ends_with_sentence_boundary("Note:") is True

    def test_semicolon(self):
        from src.utils.smart_segment_merger import _ends_with_sentence_boundary
        assert _ends_with_sentence_boundary("Done;") is True

    def test_ellipsis(self):
        from src.utils.smart_segment_merger import _ends_with_sentence_boundary
        assert _ends_with_sentence_boundary("Wait…") is True

    def test_newline_in_middle(self):
        from src.utils.smart_segment_merger import _ends_with_sentence_boundary
        assert _ends_with_sentence_boundary("Hello\nworld") is True

    def test_regular_word(self):
        from src.utils.smart_segment_merger import _ends_with_sentence_boundary
        assert _ends_with_sentence_boundary("hello") is False

    def test_emoji_at_end(self):
        from src.utils.smart_segment_merger import _ends_with_sentence_boundary
        assert _ends_with_sentence_boundary("Nice 😊") is True

    def test_trailing_spaces_with_period(self):
        from src.utils.smart_segment_merger import _ends_with_sentence_boundary
        assert _ends_with_sentence_boundary("Hello.   ") is True

    def test_emoji_only(self):
        from src.utils.smart_segment_merger import _ends_with_sentence_boundary
        assert _ends_with_sentence_boundary("😊") is True

    def test_word_with_no_boundary(self):
        from src.utils.smart_segment_merger import _ends_with_sentence_boundary
        assert _ends_with_sentence_boundary("bonjour") is False

    def test_cjk_is_not_a_sentence_boundary(self):
        """Regression: EMOJI_PATTERN must NOT match CJK/Kana/Hangul. Writing the
        enclosed-characters block as the range "\\U000024C2-\\U0001F251" makes it
        span U+4E00..U+9FFF (CJK), U+3040..U+30FF (Kana) and U+AC00..U+D7AF
        (Hangul), so ordinary Chinese/Japanese/Korean text was misdetected as an
        emoji and every CJK segment was treated as ending a sentence."""
        from src.utils.smart_segment_merger import _ends_with_sentence_boundary
        assert _ends_with_sentence_boundary("你好") is False
        assert _ends_with_sentence_boundary("这是中文") is False
        assert _ends_with_sentence_boundary("これは") is False
        assert _ends_with_sentence_boundary("안녕하세요") is False
        assert _ends_with_sentence_boundary("日本語") is False

    def test_enclosed_emoji_still_detected(self):
        """The intended enclosed-emoji code points must still count as boundaries
        after removing the CJK-swallowing range."""
        from src.utils.smart_segment_merger import _ends_with_sentence_boundary
        assert _ends_with_sentence_boundary("ok Ⓜ") is True        # U+24C2
        assert _ends_with_sentence_boundary("full 🈵") is True      # U+1F235
        assert _ends_with_sentence_boundary("flag 🇫🇷") is True     # regional indicators


class TestMergeShortSegments:
    def test_empty_returns_empty(self):
        from src.utils.smart_segment_merger import merge_short_segments
        assert merge_short_segments([]) == []

    def test_single_segment_unchanged(self):
        from src.utils.smart_segment_merger import merge_short_segments
        segs = [_seg("hello", 0, 500)]
        result = merge_short_segments(segs)
        assert len(result) == 1
        assert result[0].text == "hello"

    def test_pass1_merges_close_short_words(self):
        from src.utils.smart_segment_merger import merge_short_segments
        segs = [
            _seg("le", 0, 200),
            _seg("chat", 210, 500),   # pause 10ms < 90ms; total 6 chars < 8
        ]
        result = merge_short_segments(segs)
        assert len(result) == 1
        assert result[0].text == "le chat"
        assert result[0].start_ms == 0
        assert result[0].end_ms == 500

    def test_pass1_does_not_merge_long_words(self):
        from src.utils.smart_segment_merger import merge_short_segments
        segs = [
            _seg("Bonjour", 0, 480),
            _seg("comment", 500, 920),  # 7+7 = 14+space > 8
        ]
        result = merge_short_segments(segs)
        assert len(result) == 2

    def test_pass1_merges_cjk_characters(self):
        """Regression: Whisper emits CJK as many tiny per-character segments.
        Before the EMOJI_PATTERN range fix, each CJK char was mistaken for an
        emoji (sentence boundary), so merging was disabled for Chinese/Japanese/
        Korean audio. Two close CJK chars must now merge like any short words."""
        from src.utils.smart_segment_merger import merge_short_segments
        segs = [
            _seg("你", 0, 100),
            _seg("好", 105, 200),   # pause 5ms < 90ms; total 3 chars < 8
        ]
        result = merge_short_segments(segs)
        assert len(result) == 1
        assert result[0].text == "你 好"

    def test_pass1_does_not_merge_long_pause(self):
        from src.utils.smart_segment_merger import merge_short_segments
        segs = [
            _seg("le", 0, 200),
            _seg("chat", 400, 600),   # pause 200ms > 90ms
        ]
        result = merge_short_segments(segs)
        assert len(result) == 2

    def test_pass2_merges_after_pass1(self):
        from src.utils.smart_segment_merger import merge_short_segments
        # Pass1 (max_chars=8): "le"+"chat"=7 ≤ 8 → "le chat"; "mange bien"=10>8 → separate
        # Pass2 (max_chars=15, max_pause=10ms): "le chat"+"mange"=13 ≤ 15, pause=5ms ≤ 10ms → merged
        # Pass2 then: "le chat mange"+"bien"=18>15 → flush; result: ["le chat mange", "bien"]
        segs = [
            _seg("le", 0, 200),
            _seg("chat", 210, 500),   # pause 10ms → "le chat" (7 chars ≤ 8, merged by pass1)
            _seg("mange", 505, 800),  # pause 5ms → merged with "le chat" by pass2 (13 ≤ 15)
            _seg("bien", 805, 1000),  # pause 5ms → "le chat mange bien"=18>15 → not merged
        ]
        result = merge_short_segments(segs)
        assert len(result) == 2
        assert result[0].text == "le chat mange"
        assert result[1].text == "bien"

    def test_sentence_boundary_prevents_merge(self):
        from src.utils.smart_segment_merger import merge_short_segments
        segs = [
            _seg("Bonjour.", 0, 300, speaker_id="s0"),
            _seg("ça", 305, 500, speaker_id="s0"),  # pause 5ms < 90ms but ends with .
        ]
        result = merge_short_segments(segs)
        assert len(result) == 2

    def test_different_speakers_prevents_merge(self):
        from src.utils.smart_segment_merger import merge_short_segments
        segs = [
            _seg("le", 0, 200, speaker_id="s0"),
            _seg("chat", 210, 500, speaker_id="s1"),   # different speaker
        ]
        result = merge_short_segments(segs)
        assert len(result) == 2

    def test_same_speaker_merges(self):
        from src.utils.smart_segment_merger import merge_short_segments
        segs = [
            _seg("le", 0, 200, speaker_id="s0"),
            _seg("chat", 210, 500, speaker_id="s0"),
        ]
        result = merge_short_segments(segs)
        assert len(result) == 1
        assert result[0].speaker_id == "s0"

    def test_none_speaker_merges(self):
        from src.utils.smart_segment_merger import merge_short_segments
        segs = [
            _seg("le", 0, 200, speaker_id=None),
            _seg("chat", 210, 500, speaker_id=None),
        ]
        result = merge_short_segments(segs)
        assert len(result) == 1

    def test_three_segments_all_merge(self):
        from src.utils.smart_segment_merger import merge_short_segments
        # Very short text segments (1-2 chars) with small pauses → all merge
        segs = [
            _seg("a", 0, 50),
            _seg("b", 55, 100),
            _seg("c", 102, 150),
        ]
        result = merge_short_segments(segs)
        assert len(result) == 1
        assert "a b c" in result[0].text


class TestMergeGroup:
    def test_single_element_returned_as_is(self):
        from src.utils.smart_segment_merger import _merge_group
        seg = _seg("hello", 0, 500, confidence=0.9, speaker_id="s0")
        result = _merge_group([seg])
        assert result is seg

    def test_two_elements_merged(self):
        from src.utils.smart_segment_merger import _merge_group
        s1 = _seg("hello", 0, 500, confidence=0.9, speaker_id="s0")
        s2 = _seg("world", 600, 1000, confidence=0.7, speaker_id="s0")
        result = _merge_group([s1, s2])
        assert result.text == "hello world"
        assert result.start_ms == 0
        assert result.end_ms == 1000
        assert result.speaker_id == "s0"

    def test_confidence_weighted_average(self):
        from src.utils.smart_segment_merger import _merge_group
        # s1 duration=500ms, conf=1.0; s2 duration=500ms, conf=0.0 → avg=0.5
        s1 = _seg("a", 0, 500, confidence=1.0, speaker_id=None)
        s2 = _seg("b", 600, 1100, confidence=0.0, speaker_id=None)
        result = _merge_group([s1, s2])
        assert abs(result.confidence - 0.5) < 0.01

    def test_zero_total_duration_confidence(self):
        from src.utils.smart_segment_merger import _merge_group
        # same start/end → zero duration → arithmetic fallback
        s1 = _seg("a", 100, 100, confidence=0.8, speaker_id=None)
        s2 = _seg("b", 100, 100, confidence=0.6, speaker_id=None)
        result = _merge_group([s1, s2])
        assert abs(result.confidence - 0.7) < 0.01  # (0.8+0.6)/2

    def test_divergent_speakers_takes_first(self):
        from src.utils.smart_segment_merger import _merge_group
        s1 = _seg("a", 0, 300, speaker_id="s0")
        s2 = _seg("b", 400, 700, speaker_id="s1")
        result = _merge_group([s1, s2])
        assert result.speaker_id == "s0"

    def test_all_none_speakers(self):
        from src.utils.smart_segment_merger import _merge_group
        s1 = _seg("a", 0, 300, speaker_id=None)
        s2 = _seg("b", 400, 700, speaker_id=None)
        result = _merge_group([s1, s2])
        assert result.speaker_id is None

    def test_voice_similarity_score_all_truthy(self):
        from src.utils.smart_segment_merger import _merge_group
        s1 = _seg("a", 0, 300, vscore=0.9)
        s2 = _seg("b", 400, 700, vscore=0.8)
        result = _merge_group([s1, s2])
        # is_current_user = all(s.voice_similarity_score for s in group) = True
        assert result.voice_similarity_score is True

    def test_voice_similarity_score_one_none(self):
        from src.utils.smart_segment_merger import _merge_group
        s1 = _seg("a", 0, 300, vscore=0.9)
        s2 = _seg("b", 400, 700, vscore=None)
        result = _merge_group([s1, s2])
        # all(0.9, None) = False
        assert not result.voice_similarity_score


class TestGetMergeStatistics:
    def test_empty_merged(self):
        from src.utils.smart_segment_merger import get_merge_statistics
        original = [_seg("a", 0, 100), _seg("b", 200, 300)]
        stats = get_merge_statistics(original, [])
        assert stats['original_count'] == 2
        assert stats['merged_count'] == 0
        assert stats['reduction_ratio'] == 0.0
        assert stats['avg_segment_length_chars'] == 0.0
        assert stats['avg_segment_duration_ms'] == 0.0

    def test_with_data(self):
        from src.utils.smart_segment_merger import get_merge_statistics
        original = [_seg("a", 0, 100), _seg("b", 200, 300), _seg("c", 400, 500)]
        merged = [_seg("a b c", 0, 500)]
        stats = get_merge_statistics(original, merged)
        assert stats['original_count'] == 3
        assert stats['merged_count'] == 1
        assert abs(stats['reduction_ratio'] - 2/3) < 0.01
        assert stats['avg_segment_length_chars'] == 5.0  # "a b c"
        assert stats['avg_segment_duration_ms'] == 500.0

    def test_reduction_ratio_no_reduction(self):
        from src.utils.smart_segment_merger import get_merge_statistics
        segs = [_seg("a", 0, 100), _seg("b", 200, 300)]
        stats = get_merge_statistics(segs, segs)
        assert stats['reduction_ratio'] == 0.0

    def test_empty_original(self):
        from src.utils.smart_segment_merger import get_merge_statistics
        stats = get_merge_statistics([], [])
        assert stats['original_count'] == 0
        assert stats['reduction_ratio'] == 0.0


# ============================================================================
# segment_splitter.py
# ============================================================================

def _ss(text, start_ms, end_ms, confidence=0.9):
    from src.utils.segment_splitter import TranscriptionSegment
    return TranscriptionSegment(text=text, start_ms=start_ms, end_ms=end_ms, confidence=confidence)


class TestSegmentSplitter:
    def test_empty_list_returns_empty(self):
        from src.utils.segment_splitter import split_segments_into_words
        assert split_segments_into_words([]) == []

    def test_short_segment_not_split(self):
        from src.utils.segment_splitter import split_segments_into_words
        seg = _ss("hello world", 0, 1000)
        result = split_segments_into_words([seg], max_words=5)
        assert len(result) == 1
        assert result[0].text == "hello world"

    def test_exactly_max_words_not_split(self):
        from src.utils.segment_splitter import split_segments_into_words
        seg = _ss("one two three four five", 0, 1000)
        result = split_segments_into_words([seg], max_words=5)
        assert len(result) == 1

    def test_exceeds_max_words_split(self):
        from src.utils.segment_splitter import split_segments_into_words
        seg = _ss("one two three four five six", 0, 3000)
        result = split_segments_into_words([seg], max_words=3)
        assert len(result) == 2
        assert result[0].text == "one two three"
        assert result[1].text == "four five six"

    def test_last_chunk_ends_at_segment_end(self):
        from src.utils.segment_splitter import split_segments_into_words
        seg = _ss("a b c d e f g", 0, 700)
        result = split_segments_into_words([seg], max_words=3)
        # Last chunk should end exactly at 700 (segment.end_ms)
        assert result[-1].end_ms == 700

    def test_timestamps_interpolated(self):
        from src.utils.segment_splitter import split_segments_into_words
        seg = _ss("w1 w2 w3 w4 w5 w6", 0, 6000)
        result = split_segments_into_words([seg], max_words=3)
        # 6 words, 3 per chunk, 6000ms total → 1000ms per word
        # Chunk 1: words 0-2, ms 0-3000
        # Chunk 2: words 3-5, ms 3000-6000
        assert result[0].start_ms == 0
        assert result[0].end_ms == 3000
        assert result[1].start_ms == 3000
        assert result[1].end_ms == 6000

    def test_empty_text_segment_skipped(self):
        from src.utils.segment_splitter import split_segments_into_words
        segs = [_ss("", 0, 500), _ss("hello", 600, 1000)]
        result = split_segments_into_words(segs)
        assert len(result) == 1
        assert result[0].text == "hello"

    def test_whitespace_only_segment_skipped(self):
        from src.utils.segment_splitter import split_segments_into_words
        segs = [_ss("   ", 0, 500), _ss("word", 600, 1000)]
        result = split_segments_into_words(segs)
        assert len(result) == 1

    def test_confidence_preserved_in_split(self):
        from src.utils.segment_splitter import split_segments_into_words
        seg = _ss("a b c d e f", 0, 6000, confidence=0.85)
        result = split_segments_into_words([seg], max_words=3)
        for chunk in result:
            assert chunk.confidence == 0.85

    def test_multiple_segments(self):
        from src.utils.segment_splitter import split_segments_into_words
        segs = [
            _ss("short", 0, 500),
            _ss("one two three four five six", 600, 6600),
        ]
        result = split_segments_into_words(segs, max_words=3)
        assert len(result) == 3
        assert result[0].text == "short"

    def test_split_segment_into_words_detailed(self):
        from src.utils.segment_splitter import split_segment_into_words_detailed
        seg = _ss("a b c d e f", 0, 3000)
        result = split_segment_into_words_detailed(seg, max_words=3)
        assert len(result) == 2
        assert result[0].text == "a b c"
        assert result[1].text == "d e f"

    def test_transcription_segment_dataclass(self):
        from src.utils.segment_splitter import TranscriptionSegment
        seg = TranscriptionSegment(text="test", start_ms=0, end_ms=500)
        assert seg.confidence == 0.0  # default value

    def test_large_segment_many_chunks(self):
        from src.utils.segment_splitter import split_segments_into_words
        words = " ".join([f"w{i}" for i in range(20)])
        seg = _ss(words, 0, 20000)
        result = split_segments_into_words([seg], max_words=5)
        assert len(result) == 4  # 20/5 = 4 chunks


# ============================================================================
# audio_utils.py
# ============================================================================

class TestAudioUtils:
    def test_get_audio_duration_new_api(self):
        from src.utils.audio_utils import get_audio_duration
        with patch("librosa.get_duration", return_value=5.5) as mock_fn:
            result = get_audio_duration("/tmp/test.wav")
            assert result == 5.5
            mock_fn.assert_called_once_with(path="/tmp/test.wav")

    def test_get_audio_duration_fallback_old_api(self):
        from src.utils.audio_utils import get_audio_duration

        def mock_get_duration(**kwargs):
            if "path" in kwargs:
                raise TypeError("unexpected keyword argument 'path'")
            return 3.2

        with patch("librosa.get_duration", side_effect=mock_get_duration):
            result = get_audio_duration("/tmp/test.wav")
            assert result == 3.2


# ============================================================================
# transcribe_gap_filler.py
# ============================================================================

class TestFillTranscriptionGaps:
    @pytest.mark.asyncio
    async def test_empty_gaps_returns_empty(self):
        from src.services.transcribe_gap_filler import fill_transcription_gaps
        result = await fill_transcription_gaps(
            audio_path="/tmp/fake.wav",
            gaps=[],
            diarization_speakers=[],
            transcribe_func=AsyncMock()
        )
        assert result == []

    @pytest.mark.asyncio
    async def test_gap_with_no_result_segments(self):
        from src.services.transcribe_gap_filler import fill_transcription_gaps

        mock_transcribe = AsyncMock(return_value=MagicMock(segments=[]))
        gaps = [{"start": 100, "end": 500, "duration": 400}]

        mock_audio = MagicMock()
        mock_audio.__getitem__ = MagicMock(return_value=MagicMock())
        mock_audio.__getitem__.return_value.__add__ = MagicMock(return_value=MagicMock())

        with patch("src.services.transcribe_gap_filler.AudioSegment") as mock_cls, \
             patch("os.path.exists", return_value=False):
            mock_cls.from_file.return_value = mock_audio
            mock_audio_slice = MagicMock()
            mock_audio.__getitem__ = MagicMock(return_value=mock_audio_slice)
            mock_audio_slice.__add__ = MagicMock(return_value=mock_audio_slice)
            mock_transcribe = AsyncMock(return_value=MagicMock(segments=[]))

            result = await fill_transcription_gaps(
                audio_path="/tmp/fake.wav",
                gaps=gaps,
                diarization_speakers=[],
                transcribe_func=mock_transcribe
            )
        assert result == []

    @pytest.mark.asyncio
    async def test_gap_with_result_none(self):
        from src.services.transcribe_gap_filler import fill_transcription_gaps

        gaps = [{"start": 0, "end": 500, "duration": 500}]

        with patch("src.services.transcribe_gap_filler.AudioSegment") as mock_cls, \
             patch("os.path.exists", return_value=False):
            mock_audio = MagicMock()
            mock_audio_slice = MagicMock()
            mock_cls.from_file.return_value = mock_audio
            mock_audio.__getitem__ = MagicMock(return_value=mock_audio_slice)
            mock_audio_slice.__add__ = MagicMock(return_value=mock_audio_slice)
            mock_transcribe = AsyncMock(return_value=None)

            result = await fill_transcription_gaps(
                audio_path="/tmp/fake.wav",
                gaps=gaps,
                diarization_speakers=[],
                transcribe_func=mock_transcribe
            )
        assert result == []

    @pytest.mark.asyncio
    async def test_gap_with_segments_adjusts_timestamps(self):
        from src.services.transcribe_gap_filler import fill_transcription_gaps

        gap_seg = MagicMock()
        gap_seg.start_ms = 50    # within gap extract
        gap_seg.end_ms = 300
        gap_seg.text = "hello"
        gap_seg.speaker_id = None

        mock_result = MagicMock()
        mock_result.segments = [gap_seg]
        mock_transcribe = AsyncMock(return_value=mock_result)

        gaps = [{"start": 1000, "end": 2000, "duration": 1000}]

        with patch("src.services.transcribe_gap_filler.AudioSegment") as mock_cls, \
             patch("os.path.exists", return_value=False):
            mock_audio = MagicMock()
            mock_audio_slice = MagicMock()
            mock_cls.from_file.return_value = mock_audio
            mock_audio.__getitem__ = MagicMock(return_value=mock_audio_slice)
            mock_audio_slice.__add__ = MagicMock(return_value=mock_audio_slice)

            result = await fill_transcription_gaps(
                audio_path="/tmp/fake.wav",
                gaps=gaps,
                diarization_speakers=[],
                transcribe_func=mock_transcribe
            )

        assert len(result) == 1
        # Timestamps adjusted: start = gap_start + gap_seg.start_ms = 1000+50 = 1050
        assert gap_seg.start_ms == 1050
        assert gap_seg.end_ms == 1300

    @pytest.mark.asyncio
    async def test_speaker_id_assigned_from_diarization(self):
        from src.services.transcribe_gap_filler import fill_transcription_gaps

        gap_seg = MagicMock()
        gap_seg.start_ms = 0
        gap_seg.end_ms = 100
        gap_seg.text = "test"
        gap_seg.speaker_id = None

        mock_result = MagicMock()
        mock_result.segments = [gap_seg]
        mock_transcribe = AsyncMock(return_value=mock_result)

        speaker_seg = MagicMock()
        speaker_seg.start_ms = 0
        speaker_seg.end_ms = 500

        speaker = MagicMock()
        speaker.speaker_id = "s0"
        speaker.voice_similarity_score = 0.9
        speaker.segments = [speaker_seg]

        gaps = [{"start": 0, "end": 500, "duration": 500}]

        with patch("src.services.transcribe_gap_filler.AudioSegment") as mock_cls, \
             patch("os.path.exists", return_value=False):
            mock_audio = MagicMock()
            mock_audio_slice = MagicMock()
            mock_cls.from_file.return_value = mock_audio
            mock_audio.__getitem__ = MagicMock(return_value=mock_audio_slice)
            mock_audio_slice.__add__ = MagicMock(return_value=mock_audio_slice)

            result = await fill_transcription_gaps(
                audio_path="/tmp/fake.wav",
                gaps=gaps,
                diarization_speakers=[speaker],
                transcribe_func=mock_transcribe
            )

        assert len(result) == 1
        assert gap_seg.speaker_id == "s0"

    @pytest.mark.asyncio
    async def test_exception_in_audio_load_returns_empty(self):
        from src.services.transcribe_gap_filler import fill_transcription_gaps

        gaps = [{"start": 0, "end": 500, "duration": 500}]

        with patch("src.services.transcribe_gap_filler.AudioSegment") as mock_cls:
            mock_cls.from_file.side_effect = Exception("file not found")

            result = await fill_transcription_gaps(
                audio_path="/tmp/nonexistent.wav",
                gaps=gaps,
                diarization_speakers=[],
                transcribe_func=AsyncMock()
            )
        assert result == []

    @pytest.mark.asyncio
    async def test_temp_file_cleaned_up_after_transcription(self):
        from src.services.transcribe_gap_filler import fill_transcription_gaps

        gaps = [{"start": 0, "end": 500, "duration": 500}]
        removed_files = []

        with patch("src.services.transcribe_gap_filler.AudioSegment") as mock_cls, \
             patch("os.path.exists", return_value=True) as mock_exists, \
             patch("os.remove", side_effect=lambda p: removed_files.append(p)):
            mock_audio = MagicMock()
            mock_audio_slice = MagicMock()
            mock_cls.from_file.return_value = mock_audio
            mock_audio.__getitem__ = MagicMock(return_value=mock_audio_slice)
            mock_audio_slice.__add__ = MagicMock(return_value=mock_audio_slice)
            mock_transcribe = AsyncMock(return_value=MagicMock(segments=[]))

            await fill_transcription_gaps(
                audio_path="/tmp/fake.wav",
                gaps=gaps,
                diarization_speakers=[],
                transcribe_func=mock_transcribe
            )

        assert len(removed_files) == 1
        assert removed_files[0].endswith(".wav")


# ============================================================================
# diarization_service.py — pure dataclasses + helper methods
# ============================================================================

class TestDiarizationDataclasses:
    def test_speaker_segment_defaults(self):
        from src.services.diarization_service import SpeakerSegment
        seg = SpeakerSegment(
            speaker_id="s0",
            start_ms=0,
            end_ms=1000,
            duration_ms=1000,
        )
        assert seg.speaker_id == "s0"
        assert seg.confidence == 1.0

    def test_speaker_info(self):
        from src.services.diarization_service import SpeakerSegment, SpeakerInfo
        seg = SpeakerSegment("s0", 0, 500, 500)
        info = SpeakerInfo(
            speaker_id="s0",
            is_primary=True,
            speaking_time_ms=500,
            speaking_ratio=1.0,
            segments=[seg],
        )
        assert info.voice_characteristics is None
        assert info.voice_similarity_score is None
        assert info.is_primary is True

    def test_diarization_result(self):
        from src.services.diarization_service import DiarizationResult
        result = DiarizationResult(
            speaker_count=1,
            speakers=[],
            primary_speaker_id="s0",
            total_duration_ms=5000,
            method="pyannote",
        )
        assert result.sender_identified is False
        assert result.sender_speaker_id is None


class TestDiarizationServiceInit:
    def test_init_with_explicit_token(self):
        from src.services.diarization_service import DiarizationService
        svc = DiarizationService(hf_token="mytoken")
        assert svc.hf_token == "mytoken"
        assert svc._pipeline is None

    def test_init_reads_env_token(self):
        from src.services.diarization_service import DiarizationService
        with patch.dict(os.environ, {"HF_TOKEN": "env_token"}):
            svc = DiarizationService()
            assert svc.hf_token == "env_token"

    def test_init_no_token(self):
        from src.services.diarization_service import DiarizationService
        env = {k: v for k, v in os.environ.items() if k != "HF_TOKEN"}
        with patch.dict(os.environ, env, clear=True):
            svc = DiarizationService()
            assert svc.hf_token is None


class TestDiarizationServiceIsRealWav:
    def test_valid_wav_header(self):
        from src.services.diarization_service import DiarizationService
        svc = DiarizationService()
        header = b"RIFF\x00\x00\x00\x00WAVE"
        with patch("builtins.open", mock_open(read_data=header)):
            assert svc._is_real_wav("/tmp/test.wav") is True

    def test_invalid_header(self):
        from src.services.diarization_service import DiarizationService
        svc = DiarizationService()
        header = b"\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00"
        with patch("builtins.open", mock_open(read_data=header)):
            assert svc._is_real_wav("/tmp/test.mp4") is False

    def test_oserror_returns_false(self):
        from src.services.diarization_service import DiarizationService
        svc = DiarizationService()
        with patch("builtins.open", side_effect=OSError("permission denied")):
            assert svc._is_real_wav("/tmp/nope.wav") is False

    def test_ioerror_returns_false(self):
        from src.services.diarization_service import DiarizationService
        svc = DiarizationService()
        with patch("builtins.open", side_effect=IOError("I/O error")):
            assert svc._is_real_wav("/tmp/bad.wav") is False

    def test_riff_but_wrong_wave_marker(self):
        from src.services.diarization_service import DiarizationService
        svc = DiarizationService()
        header = b"RIFF\x00\x00\x00\x00AVI "
        with patch("builtins.open", mock_open(read_data=header)):
            assert svc._is_real_wav("/tmp/test.avi") is False


class TestDiarizationServiceNeedsConversion:
    def test_mp4_extension(self):
        from src.services.diarization_service import DiarizationService
        svc = DiarizationService()
        assert svc._needs_conversion("/path/audio.mp4") is True

    def test_m4a_extension(self):
        from src.services.diarization_service import DiarizationService
        svc = DiarizationService()
        assert svc._needs_conversion("/path/audio.m4a") is True

    def test_aac_extension(self):
        from src.services.diarization_service import DiarizationService
        svc = DiarizationService()
        assert svc._needs_conversion("/path/audio.aac") is True

    def test_webm_extension(self):
        from src.services.diarization_service import DiarizationService
        svc = DiarizationService()
        assert svc._needs_conversion("/path/audio.webm") is True

    def test_mp3_extension(self):
        from src.services.diarization_service import DiarizationService
        svc = DiarizationService()
        assert svc._needs_conversion("/path/audio.mp3") is True

    def test_ogg_extension(self):
        from src.services.diarization_service import DiarizationService
        svc = DiarizationService()
        assert svc._needs_conversion("/path/audio.ogg") is True

    def test_real_wav_no_conversion(self):
        from src.services.diarization_service import DiarizationService
        svc = DiarizationService()
        wav_header = b"RIFF\x00\x00\x00\x00WAVE"
        with patch("builtins.open", mock_open(read_data=wav_header)):
            assert svc._needs_conversion("/path/audio.wav") is False

    def test_fake_wav_needs_conversion(self):
        from src.services.diarization_service import DiarizationService
        svc = DiarizationService()
        bad_header = b"\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00"
        with patch("builtins.open", mock_open(read_data=bad_header)):
            assert svc._needs_conversion("/path/audio.wav") is True

    def test_uppercase_extension(self):
        from src.services.diarization_service import DiarizationService
        svc = DiarizationService()
        assert svc._needs_conversion("/path/audio.MP4") is True


class TestDiarizationServiceIdentifySender:
    @pytest.mark.asyncio
    async def test_with_voice_profile_assigns_scores(self):
        from src.services.diarization_service import DiarizationResult, SpeakerInfo, SpeakerSegment

        s0 = SpeakerInfo("s0", True, 5000, 0.8, [SpeakerSegment("s0", 0, 5000, 5000)])
        s1 = SpeakerInfo("s1", False, 2000, 0.2, [SpeakerSegment("s1", 5000, 7000, 2000)])
        dr = DiarizationResult(
            speaker_count=2,
            speakers=[s0, s1],
            primary_speaker_id="s0",
            total_duration_ms=7000,
            method="pyannote",
        )

        from src.services.diarization_service import DiarizationService
        svc = DiarizationService()
        result = await svc.identify_sender(dr, sender_voice_profile={"embedding": [0.1, 0.2]})
        assert result.sender_identified is True
        assert result.sender_speaker_id == "s0"
        assert s0.voice_similarity_score == 0.85  # primary gets 0.85
        assert s1.voice_similarity_score is None

    @pytest.mark.asyncio
    async def test_without_voice_profile_clears_scores(self):
        from src.services.diarization_service import DiarizationResult, SpeakerInfo, SpeakerSegment

        s0 = SpeakerInfo("s0", True, 5000, 1.0, [])
        s0.voice_similarity_score = 0.9  # pre-existing score
        dr = DiarizationResult(1, [s0], "s0", 5000, "pyannote")

        from src.services.diarization_service import DiarizationService
        svc = DiarizationService()
        result = await svc.identify_sender(dr, sender_voice_profile=None)
        assert result.sender_identified is False
        assert result.sender_speaker_id is None
        assert s0.voice_similarity_score is None


class TestGetDiarizationService:
    def test_singleton(self):
        import src.services.diarization_service as mod
        mod._diarization_service = None  # reset singleton
        svc1 = mod.get_diarization_service()
        svc2 = mod.get_diarization_service()
        assert svc1 is svc2
        mod._diarization_service = None  # cleanup

    def test_returns_diarization_service_instance(self):
        from src.services.diarization_service import get_diarization_service, DiarizationService
        import src.services.diarization_service as mod
        mod._diarization_service = None
        svc = get_diarization_service()
        assert isinstance(svc, DiarizationService)
        mod._diarization_service = None  # cleanup


# ============================================================================
# diarization_service.py — _ensure_wav_format, detect_speakers,
#                          _detect_speakers_internal, _single_speaker_fallback
# ============================================================================

class TestEnsureWavFormat:
    def test_no_conversion_needed_returns_original(self):
        from src.services.diarization_service import DiarizationService
        svc = DiarizationService()
        wav_header = b"RIFF\x00\x00\x00\x00WAVE"
        with patch("builtins.open", mock_open(read_data=wav_header)):
            path, needs_cleanup = svc._ensure_wav_format("/tmp/test.wav")
        assert path == "/tmp/test.wav"
        assert needs_cleanup is False

    def test_cached_converted_wav_returned(self):
        from src.services.diarization_service import DiarizationService
        svc = DiarizationService()
        wav_header = b"RIFF\x00\x00\x00\x00WAVE"
        with patch("builtins.open", mock_open(read_data=wav_header)), \
             patch("os.path.exists", return_value=True):
            path, needs_cleanup = svc._ensure_wav_format("/tmp/audio.mp4")
        assert path == "/tmp/audio_diarization.wav"
        assert needs_cleanup is True

    def test_ffmpeg_conversion_success(self):
        from src.services.diarization_service import DiarizationService
        svc = DiarizationService()
        with patch("os.path.exists", return_value=False), \
             patch("subprocess.run", return_value=MagicMock(returncode=0)):
            path, needs_cleanup = svc._ensure_wav_format("/tmp/audio.mp4")
        assert path == "/tmp/audio_diarization.wav"
        assert needs_cleanup is True

    def test_ffmpeg_failure_returns_original(self):
        from src.services.diarization_service import DiarizationService
        svc = DiarizationService()
        mock_run = MagicMock(returncode=1, stderr=b"ffmpeg error")
        with patch("os.path.exists", return_value=False), \
             patch("subprocess.run", return_value=mock_run):
            path, needs_cleanup = svc._ensure_wav_format("/tmp/audio.mp4")
        assert path == "/tmp/audio.mp4"
        assert needs_cleanup is False

    def test_ffmpeg_not_found_returns_original(self):
        from src.services.diarization_service import DiarizationService
        svc = DiarizationService()
        with patch("os.path.exists", return_value=False), \
             patch("subprocess.run", side_effect=FileNotFoundError()):
            path, needs_cleanup = svc._ensure_wav_format("/tmp/audio.mp4")
        assert path == "/tmp/audio.mp4"
        assert needs_cleanup is False

    def test_ffmpeg_timeout_returns_original(self):
        import subprocess
        from src.services.diarization_service import DiarizationService
        svc = DiarizationService()
        with patch("os.path.exists", return_value=False), \
             patch("subprocess.run", side_effect=subprocess.TimeoutExpired("ffmpeg", 30)):
            path, needs_cleanup = svc._ensure_wav_format("/tmp/audio.mp4")
        assert path == "/tmp/audio.mp4"
        assert needs_cleanup is False


class TestDetectSpeakers:
    @pytest.mark.asyncio
    async def test_no_cleanup_when_same_path(self):
        from src.services.diarization_service import DiarizationService, DiarizationResult
        svc = DiarizationService()
        mock_result = DiarizationResult(1, [], "s0", 1000, "test")
        with patch.object(svc, "_ensure_wav_format", return_value=("/tmp/audio.wav", False)), \
             patch.object(svc, "_detect_speakers_internal", new=AsyncMock(return_value=mock_result)):
            result = await svc.detect_speakers("/tmp/audio.wav")
        assert result is mock_result

    @pytest.mark.asyncio
    async def test_cleanup_called_when_converted(self):
        from src.services.diarization_service import DiarizationService, DiarizationResult
        svc = DiarizationService()
        mock_result = DiarizationResult(1, [], "s0", 1000, "test")
        removed = []
        with patch.object(svc, "_ensure_wav_format", return_value=("/tmp/audio_diarization.wav", True)), \
             patch.object(svc, "_detect_speakers_internal", new=AsyncMock(return_value=mock_result)), \
             patch("os.path.exists", return_value=True), \
             patch("os.remove", side_effect=lambda p: removed.append(p)):
            result = await svc.detect_speakers("/tmp/audio.wav")
        assert result is mock_result
        assert removed == ["/tmp/audio_diarization.wav"]

    @pytest.mark.asyncio
    async def test_cleanup_oserror_handled_gracefully(self):
        from src.services.diarization_service import DiarizationService, DiarizationResult
        svc = DiarizationService()
        mock_result = DiarizationResult(1, [], "s0", 1000, "test")
        with patch.object(svc, "_ensure_wav_format", return_value=("/tmp/audio_diarization.wav", True)), \
             patch.object(svc, "_detect_speakers_internal", new=AsyncMock(return_value=mock_result)), \
             patch("os.path.exists", return_value=True), \
             patch("os.remove", side_effect=OSError("permission denied")):
            result = await svc.detect_speakers("/tmp/audio.wav")
        assert result is mock_result


class TestDetectSpeakersInternal:
    @pytest.mark.asyncio
    async def test_no_token_falls_to_pitch_clustering(self):
        from src.services.diarization_service import DiarizationService, DiarizationResult
        svc = DiarizationService(hf_token=None)
        mock_result = DiarizationResult(1, [], "s0", 1000, "pitch_clustering")
        with patch.object(svc, "_detect_with_pitch_clustering", new=AsyncMock(return_value=mock_result)):
            result = await svc._detect_speakers_internal("/tmp/audio.wav")
        assert result is mock_result

    @pytest.mark.asyncio
    async def test_with_token_no_pyannote_falls_to_pitch_clustering(self):
        from src.services.diarization_service import DiarizationService, DiarizationResult
        svc = DiarizationService(hf_token="tok")
        mock_result = DiarizationResult(1, [], "s0", 1000, "pitch_clustering")
        with patch.object(svc, "_detect_with_pitch_clustering", new=AsyncMock(return_value=mock_result)):
            result = await svc._detect_speakers_internal("/tmp/audio.wav")
        assert result is mock_result


class TestSingleSpeakerFallback:
    def test_returns_single_speaker_result(self):
        from src.services.diarization_service import DiarizationService
        svc = DiarizationService()
        result = svc._single_speaker_fallback("/tmp/nonexistent_12345.wav")
        assert result.speaker_count == 1
        assert result.primary_speaker_id == "s0"
        assert result.method == "single_fallback"
        assert result.speakers[0].is_primary is True

    def test_librosa_unavailable_sets_zero_duration(self):
        import src.services.diarization_service as mod
        from src.services.diarization_service import DiarizationService
        svc = DiarizationService()
        with patch.object(mod, "LIBROSA_AVAILABLE", False):
            result = svc._single_speaker_fallback("/tmp/any.wav")
        assert result.total_duration_ms == 0

    def test_with_audio_duration_from_librosa(self):
        import src.services.diarization_service as mod
        from src.services.diarization_service import DiarizationService
        svc = DiarizationService()
        with patch.object(mod, "LIBROSA_AVAILABLE", True), \
             patch("librosa.get_duration", return_value=5.0):
            result = svc._single_speaker_fallback("/tmp/audio.wav")
        assert result.total_duration_ms == 5000
