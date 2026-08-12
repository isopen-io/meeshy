package me.meeshy.sdk.model.licenses

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * The curated Android runtime dependency catalog. These invariants keep it honest: it is non-empty,
 * every entry is a launchable repository link with a non-blank name/author, no name or URL is
 * duplicated, and the rendered [OpenSourceLicenseCatalog.groups] is exactly what the pure builder
 * produces over the raw list (so the screen and the tested transform can never drift apart).
 */
class OpenSourceLicenseCatalogTest {

    @Test
    fun catalog_isNonEmpty() {
        assertThat(OpenSourceLicenseCatalog.LICENSES).isNotEmpty()
    }

    @Test
    fun catalog_everyEntryHasNonBlankNameAndAuthor() {
        OpenSourceLicenseCatalog.LICENSES.forEach {
            assertThat(it.name.isBlank()).isFalse()
            assertThat(it.author.isBlank()).isFalse()
        }
    }

    @Test
    fun catalog_everyEntryIsLaunchable() {
        val resolved = OpenSourceLicenseResolver.resolvable(OpenSourceLicenseCatalog.LICENSES)
        assertThat(resolved).containsExactlyElementsIn(OpenSourceLicenseCatalog.LICENSES)
    }

    @Test
    fun catalog_hasNoDuplicateNames() {
        val names = OpenSourceLicenseCatalog.LICENSES.map { it.name }
        assertThat(names).containsNoDuplicates()
    }

    @Test
    fun catalog_hasNoDuplicateUrls() {
        val urls = OpenSourceLicenseCatalog.LICENSES.map { it.url }
        assertThat(urls).containsNoDuplicates()
    }

    @Test
    fun catalog_groups_matchesBuilderOverRawList() {
        assertThat(OpenSourceLicenseCatalog.groups())
            .isEqualTo(OpenSourceLicensePresentationBuilder.build(OpenSourceLicenseCatalog.LICENSES))
    }

    @Test
    fun catalog_groups_coverEveryLicenseExactlyOnce() {
        val grouped = OpenSourceLicenseCatalog.groups().flatMap { it.licenses }
        assertThat(grouped).containsExactlyElementsIn(OpenSourceLicenseCatalog.LICENSES)
    }
}
