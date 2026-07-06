package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * The pure rich-text segmenter — Android port of the iOS `MessageTextRenderer`
 * parse/highlight/extract SSOT. Contract: markdown emphasis (nested), `@mention`
 * (+ display-name resolution), `m+token` and `http(s)` links, all decided in a
 * single earliest-match-wins pass; case-insensitive highlight ranges; URL
 * extraction; and tracked-link redirect resolution. Every decision branch is
 * exercised through the public API.
 */
class MessageTextParserTest {

    private val T = MessageTextParser

    // ----- parse: trivial / fast path -----

    @Test
    fun empty_text_yields_no_segments() {
        assertThat(T.parse("")).isEmpty()
    }

    @Test
    fun plain_text_without_syntax_is_a_single_unstyled_text_segment() {
        val segments = T.parse("hello world")

        assertThat(segments).containsExactly(
            MessageSegment.Text("hello world", TextStyles.None),
        )
    }

    // ----- parse: markdown emphasis -----

    @Test
    fun bold_wraps_inner_text_and_drops_the_markers() {
        assertThat(T.parse("**loud**")).containsExactly(
            MessageSegment.Text("loud", TextStyles(bold = true)),
        )
    }

    @Test
    fun italic_single_asterisk_is_recognised() {
        assertThat(T.parse("*soft*")).containsExactly(
            MessageSegment.Text("soft", TextStyles(italic = true)),
        )
    }

    @Test
    fun strikethrough_double_tilde_is_recognised() {
        assertThat(T.parse("~~gone~~")).containsExactly(
            MessageSegment.Text("gone", TextStyles(strikethrough = true)),
        )
    }

    @Test
    fun underline_double_underscore_is_recognised() {
        assertThat(T.parse("__note__")).containsExactly(
            MessageSegment.Text("note", TextStyles(underline = true)),
        )
    }

    @Test
    fun nested_italic_inside_bold_unions_the_styles() {
        val segments = T.parse("**a *b* c**")

        assertThat(segments).containsExactly(
            MessageSegment.Text("a ", TextStyles(bold = true)),
            MessageSegment.Text("b", TextStyles(bold = true, italic = true)),
            MessageSegment.Text(" c", TextStyles(bold = true)),
        ).inOrder()
    }

    @Test
    fun leading_and_trailing_plain_text_around_a_rule_is_preserved() {
        val segments = T.parse("say **hi** now")

        assertThat(segments).containsExactly(
            MessageSegment.Text("say ", TextStyles.None),
            MessageSegment.Text("hi", TextStyles(bold = true)),
            MessageSegment.Text(" now", TextStyles.None),
        ).inOrder()
    }

    // ----- parse: mentions -----

    @Test
    fun bare_mention_becomes_a_mention_link_to_the_user_page() {
        assertThat(T.parse("hi @atabeth")).containsExactly(
            MessageSegment.Text("hi ", TextStyles.None),
            MessageSegment.MentionLink(
                display = "@atabeth",
                username = "atabeth",
                url = "https://meeshy.me/u/atabeth",
            ),
        ).inOrder()
    }

    @Test
    fun at_sign_glued_to_a_preceding_word_is_not_a_mention() {
        // `foo@bar` — the lookbehind rejects the mention; nothing else matches,
        // so the whole run degrades to plain text.
        assertThat(T.parse("foo@bar")).containsExactly(
            MessageSegment.Text("foo@bar", TextStyles.None),
        )
    }

    @Test
    fun mention_username_is_capped_and_trailing_chars_stay_plain() {
        // usernames are `[a-zA-Z0-9_]{1,30}`; a `.` ends the run.
        val segments = T.parse("@ada.")

        assertThat(segments).containsExactly(
            MessageSegment.MentionLink("@ada", "ada", "https://meeshy.me/u/ada"),
            MessageSegment.Text(".", TextStyles.None),
        ).inOrder()
    }

    // ----- parse: display-name mentions -----

    @Test
    fun display_name_mention_wins_over_the_bare_username_at_the_same_position() {
        val segments = T.parse("hey @John Doe!", mentionDisplayNames = mapOf("john" to "John Doe"))

        assertThat(segments).containsExactly(
            MessageSegment.Text("hey ", TextStyles.None),
            MessageSegment.MentionLink("@John Doe", "john", "https://meeshy.me/u/john"),
            MessageSegment.Text("!", TextStyles.None),
        ).inOrder()
    }

    @Test
    fun display_name_equal_to_username_is_ignored_and_falls_back_to_bare_mention() {
        // displayName == username → no display-name rule; `@bob` still linkifies.
        assertThat(T.parse("@bob", mentionDisplayNames = mapOf("bob" to "bob"))).containsExactly(
            MessageSegment.MentionLink("@bob", "bob", "https://meeshy.me/u/bob"),
        )
    }

    @Test
    fun single_word_display_name_is_ignored_and_falls_back_to_bare_mention() {
        // no whitespace in the display name → no display-name rule.
        assertThat(T.parse("@Al", mentionDisplayNames = mapOf("al" to "Al"))).containsExactly(
            MessageSegment.MentionLink("@Al", "Al", "https://meeshy.me/u/Al"),
        )
    }

    @Test
    fun mention_inside_bold_still_linkifies_via_the_generic_rule() {
        // markdown recursion drops display-name resolution but keeps `@username`.
        val segments = T.parse("**hi @bob**", mentionDisplayNames = mapOf("bob" to "Bob Ross"))

        assertThat(segments).containsExactly(
            MessageSegment.Text("hi ", TextStyles(bold = true)),
            MessageSegment.MentionLink("@bob", "bob", "https://meeshy.me/u/bob"),
        ).inOrder()
    }

    // ----- parse: meeshy token links -----

    @Test
    fun meeshy_token_becomes_a_share_link() {
        assertThat(T.parse("join m+abc123")).containsExactly(
            MessageSegment.Text("join ", TextStyles.None),
            MessageSegment.MeeshyTokenLink(
                display = "m+abc123",
                token = "abc123",
                url = "https://meeshy.me/l/abc123",
            ),
        ).inOrder()
    }

    @Test
    fun meeshy_token_glued_to_a_word_is_not_a_link() {
        assertThat(T.parse("xm+abc")).containsExactly(
            MessageSegment.Text("xm+abc", TextStyles.None),
        )
    }

    // ----- parse: urls -----

    @Test
    fun https_url_becomes_a_url_link() {
        assertThat(T.parse("see https://meeshy.me/x")).containsExactly(
            MessageSegment.Text("see ", TextStyles.None),
            MessageSegment.UrlLink(
                display = "https://meeshy.me/x",
                url = "https://meeshy.me/x",
            ),
        ).inOrder()
    }

    @Test
    fun url_glued_to_a_word_char_is_rejected_by_the_lookbehind() {
        assertThat(T.parse("xhttps://x.com")).containsExactly(
            MessageSegment.Text("xhttps://x.com", TextStyles.None),
        )
    }

    // ----- parse: priority / earliest-match-wins -----

    @Test
    fun the_earliest_rule_is_emitted_first_regardless_of_kind() {
        val segments = T.parse("**b** then @u")

        assertThat(segments).containsExactly(
            MessageSegment.Text("b", TextStyles(bold = true)),
            MessageSegment.Text(" then ", TextStyles.None),
            MessageSegment.MentionLink("@u", "u", "https://meeshy.me/u/u"),
        ).inOrder()
    }

    // ----- highlightRanges -----

    @Test
    fun highlight_empty_term_yields_no_ranges() {
        assertThat(T.highlightRanges("anything", "")).isEmpty()
    }

    @Test
    fun highlight_absent_term_yields_no_ranges() {
        assertThat(T.highlightRanges("hello", "zzz")).isEmpty()
    }

    @Test
    fun highlight_single_occurrence_is_located() {
        assertThat(T.highlightRanges("hello", "ell")).containsExactly(1..3)
    }

    @Test
    fun highlight_is_case_insensitive() {
        assertThat(T.highlightRanges("Hello", "LL")).containsExactly(2..3)
    }

    @Test
    fun highlight_finds_multiple_non_overlapping_occurrences() {
        assertThat(T.highlightRanges("aAaA", "aa")).containsExactly(0..1, 2..3).inOrder()
    }

    // ----- extractUrls -----

    @Test
    fun extract_urls_on_empty_text_is_empty() {
        assertThat(T.extractUrls("")).isEmpty()
    }

    @Test
    fun extract_urls_on_plain_text_is_empty() {
        assertThat(T.extractUrls("nothing here")).isEmpty()
    }

    @Test
    fun extract_urls_returns_meeshy_then_mentions_then_http_in_order() {
        val urls = T.extractUrls("visit https://a.com ping @ada join m+tok9")

        assertThat(urls).containsExactly(
            "https://meeshy.me/l/tok9",
            "https://meeshy.me/u/ada",
            "https://a.com",
        ).inOrder()
    }

    // ----- resolvedLinkUrl -----

    @Test
    fun resolved_link_with_null_map_returns_the_raw_url() {
        assertThat(T.resolvedLinkUrl("https://x.com", trackedLinks = null)).isEqualTo("https://x.com")
    }

    @Test
    fun resolved_link_with_empty_map_returns_the_raw_url() {
        assertThat(T.resolvedLinkUrl("https://x.com", trackedLinks = emptyMap())).isEqualTo("https://x.com")
    }

    @Test
    fun resolved_link_exact_key_redirects_through_the_tracker() {
        assertThat(
            T.resolvedLinkUrl("https://x.com", trackedLinks = mapOf("https://x.com" to "tok1")),
        ).isEqualTo("https://meeshy.me/l/tok1")
    }

    @Test
    fun resolved_link_trims_trailing_punctuation_to_match_the_token() {
        assertThat(
            T.resolvedLinkUrl("https://x.com.", trackedLinks = mapOf("https://x.com" to "tok2")),
        ).isEqualTo("https://meeshy.me/l/tok2")
    }

    @Test
    fun resolved_link_with_no_matching_token_returns_the_raw_url() {
        assertThat(
            T.resolvedLinkUrl("https://x.com", trackedLinks = mapOf("https://other.com" to "tok3")),
        ).isEqualTo("https://x.com")
    }

    @Test
    fun resolved_link_without_trailing_punctuation_and_no_key_returns_raw() {
        // no trailing punctuation → no trimmed retry; unknown key → raw.
        assertThat(
            T.resolvedLinkUrl("https://x.com/path", trackedLinks = mapOf("https://x.com" to "tok4")),
        ).isEqualTo("https://x.com/path")
    }
}
