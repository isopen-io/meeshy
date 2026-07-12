package me.meeshy.sdk.model.about

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * [AboutPresentationBuilder] is the pure Android port of the iOS `AboutView` model. These tests pin
 * the render-ready projection: the wrapped version label, the three info rows with their blank-safe
 * fallbacks, the full feature list, and the launchable-only link list.
 */
class AboutPresentationBuilderTest {

    private fun params(
        versionName: String = "1.2.3",
        versionCode: Long = 45L,
        osRelease: String = "14",
        applicationId: String = "me.meeshy.android",
        sdkVersion: String = "1.0.0",
    ) = AboutParams(versionName, versionCode, osRelease, applicationId, sdkVersion)

    private fun AboutPresentation.value(key: AboutInfoKey): String =
        infoRows.first { it.key == key }.value

    @Test
    fun build_versionLabel_usesFormatter() {
        assertThat(AboutPresentationBuilder.build(params()).versionLabel)
            .isEqualTo(AppVersionFormatter.format("1.2.3", 45L))
    }

    @Test
    fun build_platformRow_prefixesReleaseWithAndroid() {
        assertThat(AboutPresentationBuilder.build(params(osRelease = "14")).value(AboutInfoKey.PLATFORM))
            .isEqualTo("Android 14")
    }

    @Test
    fun build_blankRelease_platformRowIsBareAndroid() {
        assertThat(AboutPresentationBuilder.build(params(osRelease = "  ")).value(AboutInfoKey.PLATFORM))
            .isEqualTo("Android")
    }

    @Test
    fun build_applicationIdRow_isTrimmedInput() {
        assertThat(
            AboutPresentationBuilder.build(params(applicationId = "  me.meeshy.demo  "))
                .value(AboutInfoKey.APPLICATION_ID),
        ).isEqualTo("me.meeshy.demo")
    }

    @Test
    fun build_blankApplicationId_fallsBackToDefault() {
        assertThat(
            AboutPresentationBuilder.build(params(applicationId = "")).value(AboutInfoKey.APPLICATION_ID),
        ).isEqualTo(AboutPresentationBuilder.DEFAULT_APPLICATION_ID)
    }

    @Test
    fun build_sdkVersionRow_isTrimmedInput() {
        assertThat(
            AboutPresentationBuilder.build(params(sdkVersion = " 2.0.0 ")).value(AboutInfoKey.SDK_VERSION),
        ).isEqualTo("2.0.0")
    }

    @Test
    fun build_blankSdkVersion_fallsBackToDefault() {
        assertThat(
            AboutPresentationBuilder.build(params(sdkVersion = "")).value(AboutInfoKey.SDK_VERSION),
        ).isEqualTo(AboutPresentationBuilder.DEFAULT_SDK_VERSION)
    }

    @Test
    fun build_infoRows_areInFixedOrder() {
        assertThat(AboutPresentationBuilder.build(params()).infoRows.map { it.key })
            .containsExactly(AboutInfoKey.PLATFORM, AboutInfoKey.APPLICATION_ID, AboutInfoKey.SDK_VERSION)
            .inOrder()
    }

    @Test
    fun build_features_areAllKeys() {
        assertThat(AboutPresentationBuilder.build(params()).features)
            .containsExactlyElementsIn(AboutFeatureKey.entries)
            .inOrder()
    }

    @Test
    fun build_links_areOnlyLaunchableCanonicalLinks() {
        assertThat(AboutPresentationBuilder.build(params()).links)
            .isEqualTo(AboutLinkResolver.resolvable(AboutPresentationBuilder.LINKS))
    }

    @Test
    fun build_canonicalLinks_areAllHttps() {
        assertThat(AboutPresentationBuilder.LINKS.all { it.url.startsWith("https://") }).isTrue()
        assertThat(AboutPresentationBuilder.build(params()).links).hasSize(AboutPresentationBuilder.LINKS.size)
    }
}
