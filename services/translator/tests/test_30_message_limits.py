"""
Tests for config/message_limits.py
Validates message length limits and validation functions
"""

import sys
import os
import pytest
from unittest.mock import patch

# Add src to path (same as conftest.py)
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))


class TestMessageLimits:
    """Tests for MessageLimits class"""

    def test_default_values(self):
        """Test default configuration values (aligned with gateway)"""
        # Clear env vars that might override defaults
        env_vars_to_clear = [
            'MAX_MESSAGE_LENGTH',
            'MAX_TEXT_ATTACHMENT_THRESHOLD',
            'MAX_TRANSLATION_LENGTH',
            'MAX_TEXT_LENGTH'
        ]

        # Remove env vars temporarily
        saved_env = {}
        for var in env_vars_to_clear:
            if var in os.environ:
                saved_env[var] = os.environ.pop(var)

        try:
            # Reimport to get defaults without env vars
            import importlib
            import config.message_limits as ml
            importlib.reload(ml)

            # Aligned with gateway/src/config/message-limits.ts
            assert ml.MessageLimits.MAX_MESSAGE_LENGTH == 2000
            assert ml.MessageLimits.MAX_TEXT_ATTACHMENT_THRESHOLD == 2000
            assert ml.MessageLimits.MAX_TRANSLATION_LENGTH == 10000
            assert ml.MessageLimits.MAX_TEXT_LENGTH == 10000
        finally:
            # Restore env vars
            os.environ.update(saved_env)

    def test_env_override(self):
        """Test that environment variables override defaults"""
        with patch.dict(os.environ, {
            'MAX_MESSAGE_LENGTH': '2048',
            'MAX_TEXT_ATTACHMENT_THRESHOLD': '3000',
            'MAX_TRANSLATION_LENGTH': '50000',
            'MAX_TEXT_LENGTH': '50000'
        }):
            # Need to reimport to pick up new env vars
            import importlib
            import config.message_limits as ml
            importlib.reload(ml)

            assert ml.MessageLimits.MAX_MESSAGE_LENGTH == 2048
            assert ml.MessageLimits.MAX_TEXT_ATTACHMENT_THRESHOLD == 3000
            assert ml.MessageLimits.MAX_TRANSLATION_LENGTH == 50000
            assert ml.MessageLimits.MAX_TEXT_LENGTH == 50000


class TestValidateMessageLength:
    """Tests for validate_message_length function"""

    def test_valid_message(self):
        """Test validation of valid message"""
        from config.message_limits import validate_message_length

        is_valid, error = validate_message_length("Hello world")
        assert is_valid is True
        assert error is None

    def test_empty_message(self):
        """Test validation rejects empty message"""
        from config.message_limits import validate_message_length

        is_valid, error = validate_message_length("")
        assert is_valid is False
        assert "vide" in error.lower()

    def test_whitespace_only_message(self):
        """Test validation rejects whitespace-only message"""
        from config.message_limits import validate_message_length

        is_valid, error = validate_message_length("   \n\t  ")
        assert is_valid is False
        assert "vide" in error.lower()

    def test_none_message(self):
        """Test validation handles None"""
        from config.message_limits import validate_message_length

        is_valid, error = validate_message_length(None)
        assert is_valid is False

    def test_message_too_long(self):
        """Test validation rejects message exceeding limit"""
        from config.message_limits import validate_message_length, MessageLimits

        long_message = "x" * (MessageLimits.MAX_MESSAGE_LENGTH + 1)
        is_valid, error = validate_message_length(long_message)

        assert is_valid is False
        assert "dépasser" in error.lower()
        assert str(MessageLimits.MAX_MESSAGE_LENGTH) in error

    def test_message_at_limit(self):
        """Test message exactly at limit is valid"""
        from config.message_limits import validate_message_length, MessageLimits

        exact_message = "x" * MessageLimits.MAX_MESSAGE_LENGTH
        is_valid, error = validate_message_length(exact_message)

        assert is_valid is True
        assert error is None


class TestCanTranslateMessage:
    """Tests for can_translate_message function"""

    def test_short_message_can_translate(self):
        """Test short messages can be translated"""
        from config.message_limits import can_translate_message

        assert can_translate_message("Bonjour") is True

    def test_long_message_can_translate(self):
        """Test messages within limit can be translated"""
        from config.message_limits import can_translate_message, MessageLimits

        message = "x" * MessageLimits.MAX_TRANSLATION_LENGTH
        assert can_translate_message(message) is True

    def test_too_long_message_cannot_translate(self):
        """Test messages exceeding limit cannot be translated"""
        from config.message_limits import can_translate_message, MessageLimits

        message = "x" * (MessageLimits.MAX_TRANSLATION_LENGTH + 1)
        assert can_translate_message(message) is False


class TestValidateAudioDuration:
    """Tests for validate_audio_duration function (#3668)"""

    def test_short_audio_is_valid(self):
        from config.message_limits import validate_audio_duration

        is_valid, error = validate_audio_duration(5000)
        assert is_valid is True
        assert error is None

    def test_missing_duration_is_valid(self):
        """A caller that hasn't measured duration yet must not be rejected
        for it — absence is not the same as a violation."""
        from config.message_limits import validate_audio_duration

        is_valid, error = validate_audio_duration(None)
        assert is_valid is True
        assert error is None

    def test_zero_duration_is_valid(self):
        from config.message_limits import validate_audio_duration

        is_valid, error = validate_audio_duration(0)
        assert is_valid is True
        assert error is None

    def test_audio_at_limit_is_valid(self):
        from config.message_limits import validate_audio_duration, MessageLimits

        is_valid, error = validate_audio_duration(MessageLimits.MAX_AUDIO_DURATION_MS)
        assert is_valid is True
        assert error is None

    def test_audio_too_long_is_rejected(self):
        from config.message_limits import validate_audio_duration, MessageLimits

        too_long = MessageLimits.MAX_AUDIO_DURATION_MS + 1000
        is_valid, error = validate_audio_duration(too_long)

        assert is_valid is False
        assert error is not None
        assert str(MessageLimits.MAX_AUDIO_DURATION_MS // 1000) in error

    def test_env_override(self):
        with patch.dict(os.environ, {'MAX_AUDIO_DURATION_MS': '30000'}):
            import importlib
            import config.message_limits as ml
            importlib.reload(ml)

            assert ml.MessageLimits.MAX_AUDIO_DURATION_MS == 30000
            is_valid, error = ml.validate_audio_duration(30001)
            assert is_valid is False
            assert "30" in error

        importlib.reload(ml)


class TestShouldConvertToTextAttachment:
    """Tests for should_convert_to_text_attachment function"""

    def test_short_message_no_attachment(self):
        """Test short messages don't become attachments"""
        from config.message_limits import should_convert_to_text_attachment

        assert should_convert_to_text_attachment("Short message") is False

    def test_long_message_becomes_attachment(self):
        """Test long messages become attachments"""
        from config.message_limits import should_convert_to_text_attachment, MessageLimits

        long_message = "x" * (MessageLimits.MAX_TEXT_ATTACHMENT_THRESHOLD + 1)
        assert should_convert_to_text_attachment(long_message) is True

    def test_message_at_threshold_no_attachment(self):
        """Test message at threshold doesn't become attachment"""
        from config.message_limits import should_convert_to_text_attachment, MessageLimits

        exact_message = "x" * MessageLimits.MAX_TEXT_ATTACHMENT_THRESHOLD
        assert should_convert_to_text_attachment(exact_message) is False
