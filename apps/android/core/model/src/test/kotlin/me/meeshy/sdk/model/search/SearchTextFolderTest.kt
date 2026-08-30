package me.meeshy.sdk.model.search

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * The pure accent- and case-insensitive folder — Android parity for the iOS
 * `.folding(options: [.diacriticInsensitive, .caseInsensitive])` used by search
 * highlighting and library filtering. Contract: NFD-decompose, drop combining
 * marks, lowercase — and [SearchTextFolder.foldWithMap] additionally records, for
 * each folded char, the source char index in the ORIGINAL string so a match in
 * folded space can be projected back to original indices even when folding
 * changes the length. Every branch is exercised through the public API.
 *
 * Accented literals are built from explicit `\u` code points so precomposed vs
 * decomposed forms are unambiguous in source.
 */
class SearchTextFolderTest {

    private companion object {
        const val ACUTE = "́"              // combining acute accent (a mark, no base)
        const val E_PRECOMPOSED = "é"      // é as one code point
        const val E_DECOMPOSED = "é"      // e + combining acute (two code points)
        const val CAP_E_PRECOMPOSED = "É"  // É as one code point
    }

    // ----- fold -----

    @Test
    fun fold_lowercases_ascii() {
        assertThat(SearchTextFolder.fold("Hello WORLD")).isEqualTo("hello world")
    }

    @Test
    fun fold_strips_precomposed_diacritics() {
        assertThat(SearchTextFolder.fold("caf$E_PRECOMPOSED")).isEqualTo("cafe")
    }

    @Test
    fun fold_strips_decomposed_combining_marks() {
        assertThat(SearchTextFolder.fold("caf$E_DECOMPOSED")).isEqualTo("cafe")
    }

    @Test
    fun fold_lowercases_and_strips_uppercase_accent_together() {
        assertThat(SearchTextFolder.fold("${CAP_E_PRECOMPOSED}lan")).isEqualTo("elan")
    }

    @Test
    fun fold_of_empty_is_empty() {
        assertThat(SearchTextFolder.fold("")).isEmpty()
    }

    @Test
    fun fold_of_only_combining_marks_is_empty() {
        // A lone combining mark has no base — it folds away to nothing.
        assertThat(SearchTextFolder.fold(ACUTE)).isEmpty()
    }

    @Test
    fun fold_preserves_non_latin_letters_unchanged() {
        // No diacritics to strip; lowercase is a no-op for these scripts.
        assertThat(SearchTextFolder.fold("你好")).isEqualTo("你好")
    }

    // ----- foldWithMap: folded text -----

    @Test
    fun foldWithMap_folded_equals_fold() {
        // The simple fold is the folded projection of the mapped fold — one code path.
        val src = "Caf$E_PRECOMPOSED R${E_DECOMPOSED}sum$E_PRECOMPOSED"
        assertThat(SearchTextFolder.foldWithMap(src).folded).isEqualTo(SearchTextFolder.fold(src))
    }

    // ----- foldWithMap: source-index map -----

    @Test
    fun map_is_identity_for_pure_ascii() {
        val ft = SearchTextFolder.foldWithMap("abc")
        assertThat(ft.folded).isEqualTo("abc")
        assertThat(ft.sourceIndexOf.toList()).containsExactly(0, 1, 2).inOrder()
    }

    @Test
    fun map_points_precomposed_accent_to_its_single_source_char() {
        // 4 source chars, 4 folded chars, index-aligned 1:1.
        val ft = SearchTextFolder.foldWithMap("caf$E_PRECOMPOSED")
        assertThat(ft.folded).isEqualTo("cafe")
        assertThat(ft.sourceIndexOf.toList()).containsExactly(0, 1, 2, 3).inOrder()
    }

    @Test
    fun map_skips_a_decomposed_combining_mark_so_the_next_char_maps_past_it() {
        // "caf" + "e" + combining acute + "x": the mark (source index 4) yields no
        // folded char, so the folded 'x' at folded-index 4 maps back to source 5.
        val ft = SearchTextFolder.foldWithMap("caf${E_DECOMPOSED}x")
        assertThat(ft.folded).isEqualTo("cafex")
        assertThat(ft.sourceIndexOf.toList()).containsExactly(0, 1, 2, 3, 5).inOrder()
    }

    @Test
    fun map_length_matches_folded_length() {
        val ft = SearchTextFolder.foldWithMap("${CAP_E_PRECOMPOSED}cole")
        assertThat(ft.sourceIndexOf.size).isEqualTo(ft.folded.length)
    }
}
