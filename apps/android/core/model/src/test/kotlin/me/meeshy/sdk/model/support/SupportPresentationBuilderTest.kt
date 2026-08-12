package me.meeshy.sdk.model.support

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * [SupportPresentationBuilder] is the pure port of the iOS `SupportView` body: it assembles the three
 * launchable-link sections and the version/build/platform info rows from opaque [SupportParams].
 * These tests pin the section ordering + link identity, every info-row fallback branch, and the
 * invariant that all curated default links are launchable (none silently dropped by the resolver).
 */
class SupportPresentationBuilderTest {

    private fun params(
        versionName: String = "2.1.0",
        versionCode: Long = 42L,
        osRelease: String = "14",
    ) = SupportParams(versionName = versionName, versionCode = versionCode, osRelease = osRelease)

    private fun infoValue(presentation: SupportPresentation, key: SupportInfoKey): String =
        presentation.infoRows.first { it.key == key }.value

    @Test
    fun build_linkSections_areHelpContactReportInOrder() {
        val sections = SupportPresentationBuilder.build(params()).linkSections
        assertThat(sections.map { it.key })
            .containsExactly(
                SupportSectionKey.HELP,
                SupportSectionKey.CONTACT,
                SupportSectionKey.REPORT,
            )
            .inOrder()
    }

    @Test
    fun build_helpSection_hasHelpCenterThenFaq() {
        val help = SupportPresentationBuilder.build(params()).linkSections
            .first { it.key == SupportSectionKey.HELP }
        assertThat(help.links.map { it.kind })
            .containsExactly(SupportLinkKind.HELP_CENTER, SupportLinkKind.FAQ)
            .inOrder()
    }

    @Test
    fun build_contactSection_hasEmailThenTwitter() {
        val contact = SupportPresentationBuilder.build(params()).linkSections
            .first { it.key == SupportSectionKey.CONTACT }
        assertThat(contact.links.map { it.kind })
            .containsExactly(SupportLinkKind.EMAIL, SupportLinkKind.TWITTER)
            .inOrder()
    }

    @Test
    fun build_reportSection_hasBugThenFeature() {
        val report = SupportPresentationBuilder.build(params()).linkSections
            .first { it.key == SupportSectionKey.REPORT }
        assertThat(report.links.map { it.kind })
            .containsExactly(SupportLinkKind.BUG_REPORT, SupportLinkKind.FEATURE_REQUEST)
            .inOrder()
    }

    @Test
    fun build_everyCuratedLink_isLaunchable() {
        val sections = SupportPresentationBuilder.build(params()).linkSections
        val curatedCount = SupportPresentationBuilder.HELP_LINKS.size +
            SupportPresentationBuilder.CONTACT_LINKS.size +
            SupportPresentationBuilder.REPORT_LINKS.size
        assertThat(sections.sumOf { it.links.size }).isEqualTo(curatedCount)
    }

    @Test
    fun build_infoRows_areVersionBuildPlatformInOrder() {
        val rows = SupportPresentationBuilder.build(params()).infoRows
        assertThat(rows.map { it.key })
            .containsExactly(SupportInfoKey.VERSION, SupportInfoKey.BUILD, SupportInfoKey.PLATFORM)
            .inOrder()
    }

    @Test
    fun build_version_usesTrimmedVersionName() {
        val value = infoValue(SupportPresentationBuilder.build(params(versionName = "  3.4.5  ")), SupportInfoKey.VERSION)
        assertThat(value).isEqualTo("3.4.5")
    }

    @Test
    fun build_blankVersionName_fallsBackToDefault() {
        val value = infoValue(SupportPresentationBuilder.build(params(versionName = "   ")), SupportInfoKey.VERSION)
        assertThat(value).isEqualTo(SupportPresentationBuilder.DEFAULT_VERSION_NAME)
    }

    @Test
    fun build_build_usesVersionCode() {
        val value = infoValue(SupportPresentationBuilder.build(params(versionCode = 128L)), SupportInfoKey.BUILD)
        assertThat(value).isEqualTo("128")
    }

    @Test
    fun build_zeroVersionCode_fallsBackToDefaultBuild() {
        val value = infoValue(SupportPresentationBuilder.build(params(versionCode = 0L)), SupportInfoKey.BUILD)
        assertThat(value).isEqualTo(SupportPresentationBuilder.DEFAULT_BUILD)
    }

    @Test
    fun build_negativeVersionCode_fallsBackToDefaultBuild() {
        val value = infoValue(SupportPresentationBuilder.build(params(versionCode = -5L)), SupportInfoKey.BUILD)
        assertThat(value).isEqualTo(SupportPresentationBuilder.DEFAULT_BUILD)
    }

    @Test
    fun build_platform_prefixesAndroidBeforeRelease() {
        val value = infoValue(SupportPresentationBuilder.build(params(osRelease = "14")), SupportInfoKey.PLATFORM)
        assertThat(value).isEqualTo("Android 14")
    }

    @Test
    fun build_blankRelease_yieldsBareAndroid() {
        val value = infoValue(SupportPresentationBuilder.build(params(osRelease = "   ")), SupportInfoKey.PLATFORM)
        assertThat(value).isEqualTo(SupportPresentationBuilder.PLATFORM_PREFIX)
    }
}
