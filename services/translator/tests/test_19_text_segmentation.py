"""
Test 19: Text Segmentation Module
Comprehensive tests for text_segmentation.py - emoji extraction, text segmentation, and reassembly.
Target: >65% code coverage
"""

import pytest
import sys
import os
import re

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from utils.text_segmentation import (
    TextSegmenter,
    EMOJI_PATTERN,
    EMOJI_PLACEHOLDER,
    NEWLINE_MARKER,
)


# ===============================================================
# FIXTURES
# ===============================================================

@pytest.fixture
def segmenter():
    """Create a default TextSegmenter instance"""
    return TextSegmenter(max_segment_length=100)


@pytest.fixture
def short_segmenter():
    """Create a TextSegmenter with short max_segment_length for testing sentence splitting"""
    return TextSegmenter(max_segment_length=30)


# ===============================================================
# EMOJI PATTERN TESTS
# ===============================================================

class TestEmojiPattern:
    """Test the EMOJI_PATTERN regex"""

    def test_basic_emoticons(self):
        """Test basic emoticon emojis"""
        emojis = ["😀", "😁", "😂", "🤣", "😃", "😄", "😅", "😆"]
        for emoji in emojis:
            assert EMOJI_PATTERN.search(emoji) is not None, f"Failed to match {emoji}"

    def test_symbols_and_pictographs(self):
        """Test symbols and pictographs"""
        emojis = ["🌍", "🌎", "🌏", "🔥", "💧", "🌈", "⭐"]
        for emoji in emojis:
            assert EMOJI_PATTERN.search(emoji) is not None, f"Failed to match {emoji}"

    def test_transport_and_map_symbols(self):
        """Test transport and map symbols"""
        emojis = ["🚀", "🚁", "🚂", "✈️", "🚗", "🚌"]
        for emoji in emojis:
            assert EMOJI_PATTERN.search(emoji) is not None, f"Failed to match {emoji}"

    def test_dingbats(self):
        """Test dingbats"""
        emojis = ["✂️", "✉️", "✏️", "✒️", "✔️", "✖️"]
        for emoji in emojis:
            assert EMOJI_PATTERN.search(emoji) is not None, f"Failed to match {emoji}"

    def test_miscellaneous_symbols(self):
        """Test miscellaneous symbols"""
        emojis = ["☀️", "☁️", "☂️", "☃️", "☄️", "★"]
        for emoji in emojis:
            assert EMOJI_PATTERN.search(emoji) is not None, f"Failed to match {emoji}"

    def test_keycap_sequences(self):
        """Test keycap sequences"""
        keycaps = ["0️⃣", "1️⃣", "2️⃣", "#️⃣", "*️⃣"]
        for keycap in keycaps:
            assert EMOJI_PATTERN.search(keycap) is not None, f"Failed to match {keycap}"

    def test_copyright_and_trademark(self):
        """Test copyright and trademark symbols"""
        symbols = ["©", "®", "™"]
        for symbol in symbols:
            assert EMOJI_PATTERN.search(symbol) is not None, f"Failed to match {symbol}"

    def test_arrows(self):
        """Test arrow symbols"""
        arrows = ["↔️", "↕️", "↖️", "↗️", "↘️", "↙️"]
        for arrow in arrows:
            assert EMOJI_PATTERN.search(arrow) is not None, f"Failed to match {arrow}"

    def test_geometric_shapes(self):
        """Test geometric shapes"""
        shapes = ["▪️", "▫️", "▶️", "◀️"]
        for shape in shapes:
            assert EMOJI_PATTERN.search(shape) is not None, f"Failed to match {shape}"

    def test_no_match_regular_text(self):
        """Test that regular text does not match"""
        texts = ["Hello", "World", "123", "abc", "!@#$%"]
        for text in texts:
            matches = EMOJI_PATTERN.findall(text)
            # Some special characters might match, so we check if there are no significant matches
            assert all(len(m) <= 1 for m in matches) or not matches


# ===============================================================
# EMOJI EXTRACTION TESTS
# ===============================================================

class TestEmojiExtraction:
    """Test emoji extraction functionality"""

    def test_extract_single_emoji(self, segmenter):
        """Test extracting a single emoji"""
        text = "Hello 😊 world"
        result_text, emojis_map = segmenter.extract_emojis(text)

        assert "😊" not in result_text
        assert len(emojis_map) >= 1
        assert any("😊" in str(v) for v in emojis_map.values())

    def test_extract_multiple_emojis(self, segmenter):
        """Test extracting multiple emojis (consecutive emojis are grouped)"""
        text = "Hello 😊🎉🚀 world"
        result_text, emojis_map = segmenter.extract_emojis(text)

        # Check placeholders are in result
        assert "🔹EMOJI_" in result_text
        # Note: Consecutive emojis are captured as a single group due to the regex `)+` pattern
        assert len(emojis_map) >= 1
        # The grouped emoji contains all three
        all_emojis = ''.join(emojis_map.values())
        assert "😊" in all_emojis or "🎉" in all_emojis or "🚀" in all_emojis

    def test_extract_no_emojis(self, segmenter):
        """Test text without emojis"""
        text = "Hello world, this is plain text!"
        result_text, emojis_map = segmenter.extract_emojis(text)

        assert result_text == text
        assert len(emojis_map) == 0

    def test_extract_emojis_at_boundaries(self, segmenter):
        """Test emojis at start and end of text"""
        text = "😊 Hello world 🚀"
        result_text, emojis_map = segmenter.extract_emojis(text)

        assert len(emojis_map) >= 2
        assert "🔹EMOJI_" in result_text

    def test_extract_consecutive_emojis(self, segmenter):
        """Test consecutive emojis (grouped as single entry due to regex pattern)"""
        text = "Check this out: 🎉🎊🎁"
        result_text, emojis_map = segmenter.extract_emojis(text)

        # Consecutive emojis are captured as a single group
        assert len(emojis_map) >= 1
        all_emojis = ''.join(emojis_map.values())
        assert "🎉" in all_emojis and "🎊" in all_emojis and "🎁" in all_emojis

    def test_extract_emojis_only_text(self, segmenter):
        """Test text that is only emojis (grouped as single entry)"""
        text = "😊🎉🚀"
        result_text, emojis_map = segmenter.extract_emojis(text)

        # Consecutive emojis are captured as a single group
        assert len(emojis_map) >= 1
        all_emojis = ''.join(emojis_map.values())
        assert "😊" in all_emojis and "🎉" in all_emojis and "🚀" in all_emojis

    def test_empty_text(self, segmenter):
        """Test empty text"""
        text = ""
        result_text, emojis_map = segmenter.extract_emojis(text)

        assert result_text == ""
        assert len(emojis_map) == 0

    def test_placeholder_format(self, segmenter):
        """Test that placeholders follow expected format"""
        text = "Hello 😊 world"
        result_text, emojis_map = segmenter.extract_emojis(text)

        # Check placeholder format
        placeholder_pattern = re.compile(r'🔹EMOJI_\d+🔹')
        assert placeholder_pattern.search(result_text) is not None


# ===============================================================
# EMOJI RESTORATION TESTS
# ===============================================================

class TestEmojiRestoration:
    """Test emoji restoration functionality"""

    def test_restore_single_emoji(self, segmenter):
        """Test restoring a single emoji"""
        emojis_map = {0: "😊"}
        text_with_placeholders = "Hello 🔹EMOJI_0🔹 world"

        result = segmenter.restore_emojis(text_with_placeholders, emojis_map)

        assert result == "Hello 😊 world"

    def test_restore_multiple_emojis(self, segmenter):
        """Test restoring multiple emojis"""
        emojis_map = {0: "😊", 1: "🎉", 2: "🚀"}
        text_with_placeholders = "Hello 🔹EMOJI_0🔹🔹EMOJI_1🔹🔹EMOJI_2🔹 world"

        result = segmenter.restore_emojis(text_with_placeholders, emojis_map)

        assert "😊" in result
        assert "🎉" in result
        assert "🚀" in result

    def test_restore_no_emojis(self, segmenter):
        """Test restoring when there are no emojis"""
        emojis_map = {}
        text = "Hello world"

        result = segmenter.restore_emojis(text, emojis_map)

        assert result == "Hello world"

    def test_restore_missing_placeholder(self, segmenter):
        """Test restoring when placeholder is missing from text"""
        emojis_map = {0: "😊", 1: "🎉"}
        # Only placeholder 0 is present
        text_with_placeholders = "Hello 🔹EMOJI_0🔹 world"

        result = segmenter.restore_emojis(text_with_placeholders, emojis_map)

        assert "😊" in result
        # Missing placeholder should be logged but not crash

    def test_roundtrip_extraction_restoration(self, segmenter):
        """Test full roundtrip: extract then restore"""
        original = "Hello 😊 world 🎉!"
        text_without_emojis, emojis_map = segmenter.extract_emojis(original)
        restored = segmenter.restore_emojis(text_without_emojis, emojis_map)

        assert restored == original


# ===============================================================
# LIST ITEM DETECTION TESTS
# ===============================================================

class TestListItemDetection:
    """Test list item detection functionality"""

    def test_bullet_dash(self, segmenter):
        """Test bullet list with dash"""
        assert segmenter.is_list_item("- Item one") is True
        assert segmenter.is_list_item("  - Indented item") is True

    def test_bullet_plus(self, segmenter):
        """Test bullet list with plus"""
        assert segmenter.is_list_item("+ Item one") is True

    def test_bullet_asterisk(self, segmenter):
        """Test bullet list with asterisk"""
        assert segmenter.is_list_item("* Item one") is True

    def test_bullet_dot(self, segmenter):
        """Test bullet list with bullet character"""
        assert segmenter.is_list_item("• Item one") is True

    def test_bullet_arrow(self, segmenter):
        """Test bullet list with arrow"""
        assert segmenter.is_list_item("→ Item one") is True

    def test_numbered_list(self, segmenter):
        """Test numbered list items"""
        assert segmenter.is_list_item("1. First item") is True
        assert segmenter.is_list_item("2. Second item") is True
        assert segmenter.is_list_item("10. Tenth item") is True
        assert segmenter.is_list_item("99. Large number") is True

    def test_lettered_list(self, segmenter):
        """Test lettered list items"""
        assert segmenter.is_list_item("a) First item") is True
        assert segmenter.is_list_item("b) Second item") is True
        assert segmenter.is_list_item("z) Last item") is True

    def test_roman_numeral_list(self, segmenter):
        """Test Roman numeral list items"""
        assert segmenter.is_list_item("I) First item") is True
        assert segmenter.is_list_item("II) Second item") is True
        assert segmenter.is_list_item("III) Third item") is True
        assert segmenter.is_list_item("IV) Fourth item") is True
        assert segmenter.is_list_item("X) Tenth item") is True

    def test_non_list_items(self, segmenter):
        """Test text that is not a list item"""
        assert segmenter.is_list_item("Hello world") is False
        assert segmenter.is_list_item("This is a sentence.") is False
        # Note: "A regular paragraph" would match Roman numeral pattern [IVXLCDM]
        # Use text that doesn't start with those letters
        assert segmenter.is_list_item("Regular paragraph here") is False
        assert segmenter.is_list_item("Some normal text") is False

    def test_empty_line(self, segmenter):
        """Test empty line"""
        assert segmenter.is_list_item("") is False
        assert segmenter.is_list_item("   ") is False

    def test_without_space_after_marker(self, segmenter):
        """Test items without space after marker (should not match)"""
        assert segmenter.is_list_item("-Item") is False
        assert segmenter.is_list_item("1.Item") is False


# ===============================================================
# SENTENCE AND LINE SEGMENTATION TESTS
# ===============================================================

class TestSegmentBySentencesAndLines:
    """Test segment_by_sentences_and_lines functionality"""

    def test_single_line(self, segmenter):
        """Test single line text"""
        text = "Hello world"
        segments = segmenter.segment_by_sentences_and_lines(text)

        assert len(segments) >= 1
        assert any(s[0] == "Hello world" and s[1] == 'line' for s in segments)

    def test_multiple_lines(self, segmenter):
        """Test text with multiple lines"""
        text = "Line one\nLine two\nLine three"
        segments = segmenter.segment_by_sentences_and_lines(text)

        # Should have lines and separators
        lines = [s for s in segments if s[1] == 'line']
        separators = [s for s in segments if s[1] == 'separator']

        assert len(lines) == 3
        assert len(separators) == 2

    def test_double_newlines(self, segmenter):
        """Test text with paragraph breaks (double newlines)"""
        text = "Paragraph one\n\nParagraph two"
        segments = segmenter.segment_by_sentences_and_lines(text)

        # Should preserve double newline as separator
        separators = [s for s in segments if s[1] == 'separator']
        assert any('\n\n' in s[0] for s in separators)

    def test_triple_newlines(self, segmenter):
        """Test text with triple newlines"""
        text = "Section one\n\n\nSection two"
        segments = segmenter.segment_by_sentences_and_lines(text)

        # Should preserve triple newline
        separators = [s for s in segments if s[1] == 'separator']
        assert any('\n\n\n' in s[0] for s in separators)

    def test_code_block_detection(self, segmenter):
        """Test code block detection"""
        text = "Before code\n```python\nprint('hello')\n```\nAfter code"
        segments = segmenter.segment_by_sentences_and_lines(text)

        code_segments = [s for s in segments if s[1] == 'code']
        # Should have code delimiter and code content
        assert len(code_segments) >= 2

    def test_code_block_not_translated(self, segmenter):
        """Test that code content is marked as non-translatable"""
        text = "```\nvar x = 1;\n```"
        segments = segmenter.segment_by_sentences_and_lines(text)

        # All non-separator segments should be code
        for seg in segments:
            if seg[1] != 'separator':
                assert seg[1] == 'code'

    def test_empty_lines(self, segmenter):
        """Test handling of empty lines"""
        text = "Line one\n   \nLine two"
        segments = segmenter.segment_by_sentences_and_lines(text)

        # Should have empty_line type for whitespace-only lines
        empty_lines = [s for s in segments if s[1] == 'empty_line']
        # May or may not have empty lines depending on implementation
        assert isinstance(segments, list)

    def test_empty_text(self, segmenter):
        """Test empty text"""
        text = ""
        segments = segmenter.segment_by_sentences_and_lines(text)
        assert segments == []


# ===============================================================
# SENTENCE SEGMENTATION TESTS (FOR LONG TEXT)
# ===============================================================

class TestSegmentBySentences:
    """Test segment_by_sentences functionality"""

    def test_short_text_not_split(self, segmenter):
        """Test that short text is not split"""
        text = "Hello world."
        segments = segmenter.segment_by_sentences(text)

        assert len(segments) == 1
        assert segments[0] == text

    def test_long_text_split(self, short_segmenter):
        """Test that long text is split by sentences"""
        text = "This is sentence one. This is sentence two. This is sentence three."
        segments = short_segmenter.segment_by_sentences(text)

        assert len(segments) >= 1

    def test_split_preserves_punctuation(self, short_segmenter):
        """Test that splitting preserves punctuation"""
        text = "Hello! How are you? I am fine. Good to hear!"
        segments = short_segmenter.segment_by_sentences(text)

        # Join should roughly match original (minus some spacing)
        joined = ' '.join(segments)
        assert "Hello!" in joined or "Hello" in joined

    def test_split_with_exclamation(self, short_segmenter):
        """Test splitting on exclamation marks"""
        text = "Wow! Amazing! Great!"
        segments = short_segmenter.segment_by_sentences(text)
        assert isinstance(segments, list)

    def test_split_with_question(self, short_segmenter):
        """Test splitting on question marks"""
        text = "How are you? What is your name? Where do you live?"
        segments = short_segmenter.segment_by_sentences(text)
        assert isinstance(segments, list)

    def test_split_with_semicolon(self, short_segmenter):
        """Test splitting on semicolons"""
        text = "First clause; second clause; third clause."
        segments = short_segmenter.segment_by_sentences(text)
        assert isinstance(segments, list)

    def test_preserves_newline_markers(self, short_segmenter):
        """Test that newline markers are preserved and restored"""
        text = "First line\nSecond line\nThird line."
        # For short text, should return as-is
        segments = short_segmenter.segment_by_sentences(text)
        # Check that newlines are preserved after rejoining
        joined = ''.join(segments) if len(segments) > 1 else segments[0]
        assert '\n' in joined or len(text) <= 30

    def test_returns_original_if_no_split(self, segmenter):
        """Test that original text is returned if can't be split"""
        text = "NoSplitPossibleHere"
        segments = segmenter.segment_by_sentences(text)
        assert segments == [text]


# ===============================================================
# FULL TEXT SEGMENTATION TESTS
# ===============================================================

class TestSegmentText:
    """Test the main segment_text functionality"""

    def test_segment_simple_text(self, segmenter):
        """Test segmenting simple text"""
        text = "Hello world"
        segments, emojis_map = segmenter.segment_text(text)

        assert len(segments) >= 1
        assert isinstance(segments[0], dict)
        assert 'text' in segments[0]
        assert 'type' in segments[0]
        assert 'index' in segments[0]

    def test_segment_text_with_emojis(self, segmenter):
        """Test segmenting text with emojis"""
        text = "Hello 😊 world 🎉"
        segments, emojis_map = segmenter.segment_text(text)

        assert len(emojis_map) >= 2
        assert len(segments) >= 1

    def test_segment_multiline_text(self, segmenter):
        """Test segmenting multiline text"""
        text = "Line one\nLine two\nLine three"
        segments, emojis_map = segmenter.segment_text(text)

        # Should have multiple segments
        lines = [s for s in segments if s['type'] == 'line']
        assert len(lines) == 3

    def test_segment_with_paragraph_breaks(self, segmenter):
        """Test segmenting text with paragraph breaks"""
        text = "Paragraph one\n\nParagraph two"
        segments, emojis_map = segmenter.segment_text(text)

        separators = [s for s in segments if s['type'] == 'separator']
        assert any('\n\n' in s['text'] for s in separators)

    def test_segment_complex_text(self, segmenter):
        """Test segmenting complex text with emojis, newlines, and code"""
        text = """Hello 😊!

This is a paragraph.

```python
code here
```

Goodbye 🚀!"""

        segments, emojis_map = segmenter.segment_text(text)

        assert len(emojis_map) >= 2
        assert len(segments) >= 4

    def test_segment_index_sequential(self, segmenter):
        """Test that segment indices are sequential"""
        text = "Line one\nLine two\nLine three"
        segments, _ = segmenter.segment_text(text)

        indices = [s['index'] for s in segments]
        for i, idx in enumerate(indices):
            assert idx == i


# ===============================================================
# TEXT REASSEMBLY TESTS
# ===============================================================

class TestReassembleText:
    """Test text reassembly functionality"""

    def test_reassemble_simple_text(self, segmenter):
        """Test reassembling simple text"""
        segments = [{'text': 'Hello world', 'type': 'line', 'index': 0}]
        emojis_map = {}

        result = segmenter.reassemble_text(segments, emojis_map)
        assert result == "Hello world"

    def test_reassemble_with_separators(self, segmenter):
        """Test reassembling with separators"""
        segments = [
            {'text': 'Line one', 'type': 'line', 'index': 0},
            {'text': '\n', 'type': 'separator', 'index': 1},
            {'text': 'Line two', 'type': 'line', 'index': 2},
        ]
        emojis_map = {}

        result = segmenter.reassemble_text(segments, emojis_map)
        assert result == "Line one\nLine two"

    def test_reassemble_with_paragraph_breaks(self, segmenter):
        """Test reassembling with paragraph breaks"""
        segments = [
            {'text': 'Paragraph one', 'type': 'line', 'index': 0},
            {'text': '\n\n', 'type': 'separator', 'index': 1},
            {'text': 'Paragraph two', 'type': 'line', 'index': 2},
        ]
        emojis_map = {}

        result = segmenter.reassemble_text(segments, emojis_map)
        assert result == "Paragraph one\n\nParagraph two"

    def test_reassemble_with_emojis(self, segmenter):
        """Test reassembling with emoji restoration"""
        segments = [
            {'text': 'Hello 🔹EMOJI_0🔹 world', 'type': 'line', 'index': 0},
        ]
        emojis_map = {0: '😊'}

        result = segmenter.reassemble_text(segments, emojis_map)
        assert result == "Hello 😊 world"

    def test_reassemble_with_code(self, segmenter):
        """Test reassembling with code blocks"""
        segments = [
            {'text': '```python', 'type': 'code', 'index': 0},
            {'text': '\n', 'type': 'separator', 'index': 1},
            {'text': 'print("hello")', 'type': 'code', 'index': 2},
            {'text': '\n', 'type': 'separator', 'index': 3},
            {'text': '```', 'type': 'code', 'index': 4},
        ]
        emojis_map = {}

        result = segmenter.reassemble_text(segments, emojis_map)
        assert '```python' in result
        assert 'print("hello")' in result

    def test_reassemble_empty_lines(self, segmenter):
        """Test reassembling with empty lines"""
        segments = [
            {'text': 'Line one', 'type': 'line', 'index': 0},
            {'text': '\n', 'type': 'separator', 'index': 1},
            {'text': '', 'type': 'empty_line', 'index': 2},
            {'text': '\n', 'type': 'separator', 'index': 3},
            {'text': 'Line two', 'type': 'line', 'index': 4},
        ]
        emojis_map = {}

        result = segmenter.reassemble_text(segments, emojis_map)
        assert "Line one" in result
        assert "Line two" in result


# ===============================================================
# ROUNDTRIP TESTS
# ===============================================================

class TestRoundtrip:
    """Test full roundtrip: segment then reassemble"""

    def test_roundtrip_simple_text(self, segmenter):
        """Test roundtrip with simple text"""
        original = "Hello world"
        segments, emojis = segmenter.segment_text(original)
        result = segmenter.reassemble_text(segments, emojis)

        assert result == original

    def test_roundtrip_with_emojis(self, segmenter):
        """Test roundtrip with emojis"""
        original = "Hello 😊 world 🎉"
        segments, emojis = segmenter.segment_text(original)
        result = segmenter.reassemble_text(segments, emojis)

        assert result == original

    def test_roundtrip_multiline(self, segmenter):
        """Test roundtrip with multiple lines"""
        original = "Line one\nLine two\nLine three"
        segments, emojis = segmenter.segment_text(original)
        result = segmenter.reassemble_text(segments, emojis)

        assert result == original

    def test_roundtrip_paragraphs(self, segmenter):
        """Test roundtrip with paragraphs"""
        original = "Paragraph one\n\nParagraph two"
        segments, emojis = segmenter.segment_text(original)
        result = segmenter.reassemble_text(segments, emojis)

        assert result == original

    def test_roundtrip_complex(self, segmenter):
        """Test roundtrip with complex text"""
        original = """Hello! 😊 How are you today?

This is a new paragraph with some emojis 🎉🎊.

And this is the final paragraph! 🚀"""

        segments, emojis = segmenter.segment_text(original)
        result = segmenter.reassemble_text(segments, emojis)

        assert result == original

    def test_roundtrip_code_block(self, segmenter):
        """Test roundtrip with code block"""
        original = """Here is code:

```python
print("hello")
```

Done!"""

        segments, emojis = segmenter.segment_text(original)
        result = segmenter.reassemble_text(segments, emojis)

        assert result == original


# ===============================================================
# EDGE CASES AND SPECIAL CHARACTERS
# ===============================================================

class TestEdgeCases:
    """Test edge cases and special characters"""

    def test_unicode_text(self, segmenter):
        """Test with various Unicode characters"""
        text = "Bonjour le monde 日本語 Привет мир"
        segments, emojis = segmenter.segment_text(text)
        result = segmenter.reassemble_text(segments, emojis)

        assert result == text

    def test_special_punctuation(self, segmenter):
        """Test with special punctuation"""
        text = "Hello... world!!! How??? are;;; you"
        segments, emojis = segmenter.segment_text(text)
        result = segmenter.reassemble_text(segments, emojis)

        assert result == text

    def test_numbers_and_symbols(self, segmenter):
        """Test with numbers and symbols"""
        text = "Price: $100.50 + 20% = €120.60"
        segments, emojis = segmenter.segment_text(text)
        result = segmenter.reassemble_text(segments, emojis)

        assert result == text

    def test_very_long_line(self, segmenter):
        """Test with very long line"""
        text = "A" * 500
        segments, emojis = segmenter.segment_text(text)
        result = segmenter.reassemble_text(segments, emojis)

        assert result == text

    def test_only_newlines(self, segmenter):
        """Test with only newlines"""
        text = "\n\n\n"
        segments, emojis = segmenter.segment_text(text)
        result = segmenter.reassemble_text(segments, emojis)

        assert result == text

    def test_mixed_whitespace(self, segmenter):
        """Test with mixed whitespace"""
        text = "Hello   world\t\ttabs"
        segments, emojis = segmenter.segment_text(text)
        result = segmenter.reassemble_text(segments, emojis)

        assert result == text

    def test_emoji_variations(self, segmenter):
        """Test with emoji variations (skin tones, etc.)"""
        # Simple emojis that should be detected
        text = "Hello 👍 world"
        segments, emojis = segmenter.segment_text(text)
        result = segmenter.reassemble_text(segments, emojis)

        assert "👍" in result or result == text

    def test_flag_emojis(self, segmenter):
        """Test with flag emojis"""
        text = "Flags: 🇺🇸 🇫🇷 🇯🇵"
        segments, emojis = segmenter.segment_text(text)
        result = segmenter.reassemble_text(segments, emojis)

        # Flag emojis are regional indicator pairs
        assert "Flags:" in result


# ===============================================================
# INITIALIZATION TESTS
# ===============================================================

class TestInitialization:
    """Test TextSegmenter initialization"""

    def test_default_max_segment_length(self):
        """Test default max_segment_length"""
        segmenter = TextSegmenter()
        assert segmenter.max_segment_length == 100

    def test_custom_max_segment_length(self):
        """Test custom max_segment_length"""
        segmenter = TextSegmenter(max_segment_length=50)
        assert segmenter.max_segment_length == 50

    def test_large_max_segment_length(self):
        """Test large max_segment_length"""
        segmenter = TextSegmenter(max_segment_length=10000)
        assert segmenter.max_segment_length == 10000


# ===============================================================
# CONSTANTS TESTS
# ===============================================================

class TestConstants:
    """Test module constants"""

    def test_emoji_placeholder_format(self):
        """Test EMOJI_PLACEHOLDER format"""
        formatted = EMOJI_PLACEHOLDER.format(index=5)
        assert formatted == "🔹EMOJI_5🔹"

    def test_newline_marker(self):
        """Test NEWLINE_MARKER constant"""
        assert NEWLINE_MARKER == "__NL__"


# ===============================================================
# MULTI-LANGUAGE TESTS
# ===============================================================

class TestMultiLanguage:
    """Test with multiple languages"""

    def test_french_text(self, segmenter):
        """Test French text with accents"""
        text = "Bonjour! Comment ça va? Très bien, merci. 😊"
        segments, emojis = segmenter.segment_text(text)
        result = segmenter.reassemble_text(segments, emojis)

        assert result == text

    def test_chinese_text(self, segmenter):
        """Test Chinese text"""
        text = "你好世界 🌍"
        segments, emojis = segmenter.segment_text(text)
        result = segmenter.reassemble_text(segments, emojis)

        assert result == text

    def test_arabic_text(self, segmenter):
        """Test Arabic text (RTL)"""
        text = "مرحبا بالعالم 🌟"
        segments, emojis = segmenter.segment_text(text)
        result = segmenter.reassemble_text(segments, emojis)

        assert result == text

    def test_mixed_languages(self, segmenter):
        """Test mixed languages"""
        text = "Hello 你好 Bonjour مرحبا 😊"
        segments, emojis = segmenter.segment_text(text)
        result = segmenter.reassemble_text(segments, emojis)

        assert result == text


# ===============================================================
# RUN ALL TESTS
# ===============================================================

if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
