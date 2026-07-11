package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * The privacy preference block and its catalog (feature-parity §L — port of iOS
 * `PrivacySettingsView` / `PrivacyPreferences`): the iOS-mirrored defaults, the
 * [PrivacyCatalog] read/write lens ([isEnabled] / [set]) that edits exactly one boolean, the
 * grouped [PrivacyCatalog.sections] projection, and the durable JSON codec
 * ([storageValue] / [privacyPreferencesFromStorage]) with its corruption-safe decode.
 */
class PrivacyPreferencesTest {

    // ---- Defaults mirror iOS ----

    @Test
    fun defaults_mirrorIos() {
        val prefs = PrivacyPreferences()
        assertThat(prefs.showOnlineStatus).isTrue()
        assertThat(prefs.showLastSeen).isTrue()
        assertThat(prefs.showReadReceipts).isTrue()
        assertThat(prefs.showTypingIndicator).isTrue()
        assertThat(prefs.hideProfileFromSearch).isFalse()
        assertThat(prefs.allowContactRequests).isTrue()
        assertThat(prefs.allowGroupInvites).isTrue()
        assertThat(prefs.allowCallsFromNonContacts).isFalse()
        assertThat(prefs.saveMediaToGallery).isFalse()
        assertThat(prefs.allowAnalytics).isTrue()
        assertThat(prefs.shareUsageData).isFalse()
        assertThat(prefs.blockScreenshots).isFalse()
    }

    // ---- Catalog: descriptors ----

    @Test
    fun catalog_hasExactlyOneDescriptorPerToggle() {
        assertThat(PrivacyCatalog.descriptors.map { it.toggle })
            .containsExactlyElementsIn(PrivacyToggle.entries)
        assertThat(PrivacyCatalog.descriptors).hasSize(PrivacyToggle.entries.size)
    }

    // ---- Catalog: isEnabled reads the matching field for every toggle ----

    @Test
    fun isEnabled_readsTheMatchingField_whenAllOn() {
        // A block with every toggle flipped ON so each getter must return true.
        val allOn = PrivacyToggle.entries.fold(PrivacyPreferences()) { acc, t ->
            PrivacyCatalog.set(acc, t, true)
        }
        PrivacyToggle.entries.forEach { toggle ->
            assertThat(PrivacyCatalog.isEnabled(allOn, toggle)).isTrue()
        }
    }

    @Test
    fun isEnabled_readsTheMatchingField_whenAllOff() {
        val allOff = PrivacyToggle.entries.fold(PrivacyPreferences()) { acc, t ->
            PrivacyCatalog.set(acc, t, false)
        }
        PrivacyToggle.entries.forEach { toggle ->
            assertThat(PrivacyCatalog.isEnabled(allOff, toggle)).isFalse()
        }
    }

    // ---- Catalog: set edits exactly one boolean, never clobbering the rest ----

    @Test
    fun set_flipsExactlyTheTargetToggle_leavingEveryOtherFieldUntouched() {
        val base = PrivacyPreferences()
        PrivacyToggle.entries.forEach { target ->
            val flipped = !PrivacyCatalog.isEnabled(base, target)
            val next = PrivacyCatalog.set(base, target, flipped)

            assertThat(PrivacyCatalog.isEnabled(next, target)).isEqualTo(flipped)
            PrivacyToggle.entries
                .filter { it != target }
                .forEach { other ->
                    assertThat(PrivacyCatalog.isEnabled(next, other))
                        .isEqualTo(PrivacyCatalog.isEnabled(base, other))
                }
        }
    }

    @Test
    fun set_toTheSameValue_isValueEqualToTheInput() {
        val base = PrivacyPreferences()
        // showOnlineStatus already true → setting true yields an equal block.
        assertThat(PrivacyCatalog.set(base, PrivacyToggle.SHOW_ONLINE_STATUS, true)).isEqualTo(base)
    }

    // ---- Catalog: sections grouping & ordering ----

    @Test
    fun sections_groupsEveryToggleUnderItsCategory_inDisplayOrder() {
        val sections = PrivacyCatalog.sections(PrivacyPreferences())
        assertThat(sections.map { it.category })
            .containsExactly(
                PrivacyCategory.VISIBILITY,
                PrivacyCategory.CONTACTS_GROUPS,
                PrivacyCategory.MEDIA_DATA,
            )
            .inOrder()
    }

    @Test
    fun sections_visibilityCategory_carriesItsFiveToggles_inDeclaredOrder() {
        val visibility = PrivacyCatalog.sections(PrivacyPreferences())
            .first { it.category == PrivacyCategory.VISIBILITY }
        assertThat(visibility.items.map { it.toggle }).containsExactly(
            PrivacyToggle.SHOW_ONLINE_STATUS,
            PrivacyToggle.SHOW_LAST_SEEN,
            PrivacyToggle.SHOW_READ_RECEIPTS,
            PrivacyToggle.SHOW_TYPING_INDICATOR,
            PrivacyToggle.HIDE_PROFILE_FROM_SEARCH,
        ).inOrder()
    }

    @Test
    fun sections_coverEveryToggleExactlyOnce() {
        val flattened = PrivacyCatalog.sections(PrivacyPreferences()).flatMap { it.items.map { s -> s.toggle } }
        assertThat(flattened).containsExactlyElementsIn(PrivacyToggle.entries)
    }

    @Test
    fun sections_carryTheLiveEnabledStateOfEachToggle() {
        val prefs = PrivacyCatalog.set(PrivacyPreferences(), PrivacyToggle.BLOCK_SCREENSHOTS, true)
        val state = PrivacyCatalog.sections(prefs)
            .flatMap { it.items }
            .first { it.toggle == PrivacyToggle.BLOCK_SCREENSHOTS }
        assertThat(state.enabled).isTrue()
    }

    // ---- Codec ----

    @Test
    fun codec_roundTripsANonDefaultBlock() {
        val prefs = PrivacyPreferences(
            showOnlineStatus = false,
            allowCallsFromNonContacts = true,
            blockScreenshots = true,
            allowAnalytics = false,
        )
        assertThat(privacyPreferencesFromStorage(prefs.storageValue)).isEqualTo(prefs)
    }

    @Test
    fun codec_persistsEveryField_evenAtDefault() {
        val json = PrivacyPreferences().storageValue
        assertThat(json).contains("showOnlineStatus")
        assertThat(json).contains("blockScreenshots")
        assertThat(json).contains("allowAnalytics")
    }

    @Test
    fun codec_blankOrNull_degradesToDefaults() {
        assertThat(privacyPreferencesFromStorage(null)).isEqualTo(PrivacyPreferences())
        assertThat(privacyPreferencesFromStorage("")).isEqualTo(PrivacyPreferences())
        assertThat(privacyPreferencesFromStorage("   ")).isEqualTo(PrivacyPreferences())
    }

    @Test
    fun codec_malformedToken_degradesToDefaults() {
        assertThat(privacyPreferencesFromStorage("{not json")).isEqualTo(PrivacyPreferences())
        assertThat(privacyPreferencesFromStorage("[]")).isEqualTo(PrivacyPreferences())
    }

    @Test
    fun codec_partialToken_fillsMissingFieldsWithDefaults() {
        val decoded = privacyPreferencesFromStorage("""{"showOnlineStatus":false}""")
        assertThat(decoded.showOnlineStatus).isFalse()
        // Every other field keeps its default.
        assertThat(decoded.showLastSeen).isTrue()
        assertThat(decoded.allowAnalytics).isTrue()
        assertThat(decoded.blockScreenshots).isFalse()
    }

    @Test
    fun codec_unknownKeys_areIgnored() {
        val decoded = privacyPreferencesFromStorage("""{"blockScreenshots":true,"legacyField":123}""")
        assertThat(decoded.blockScreenshots).isTrue()
    }
}
