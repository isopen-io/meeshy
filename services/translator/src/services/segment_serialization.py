"""Dependency-free segment serializer shared by zmq_audio_handler and transcription_stage.

Extracted into this module to break the circular import that arose when
transcription_stage imported _segment_to_dict from zmq_audio_handler, while
zmq_audio_handler itself imports audio_message_pipeline which imports
transcription_stage.
"""

from typing import Dict, Optional


def _get_voice_similarity_score(seg) -> Optional[float]:
    """
    Extract voice_similarity_score from segment (dict or object).

    Args:
        seg: Segment as dict or dataclass object

    Returns:
        Voice similarity score as float, or None
    """
    if hasattr(seg, 'voice_similarity_score'):
        score = seg.voice_similarity_score
    elif isinstance(seg, dict):
        score = seg.get('voiceSimilarityScore') or seg.get('voice_similarity_score')
    else:
        return None
    return score if isinstance(score, (int, float)) else None


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
