package me.meeshy.sdk.model.licenses

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * [OpenSourceLicensePresentationBuilder] surpasses the iOS `LicensesView`'s flat list: it groups the
 * launchable licenses by [OpenSourceLicenseType] (deterministic enum order, not insertion order),
 * sorts each group's entries by name case-insensitively, drops empty groups, and excludes
 * non-launchable entries up front. These tests pin every branch of that transform.
 */
class OpenSourceLicensePresentationBuilderTest {

    private fun license(
        name: String,
        type: OpenSourceLicenseType,
        url: String = "https://example.com/$name",
    ) = OpenSourceLicense(name = name, author = "Author", type = type, url = url)

    @Test
    fun build_emptyInput_isEmpty() {
        assertThat(OpenSourceLicensePresentationBuilder.build(emptyList())).isEmpty()
    }

    @Test
    fun build_singleLicense_isSingleGroupSingleEntry() {
        val coil = license("Coil", OpenSourceLicenseType.APACHE_2_0)

        val groups = OpenSourceLicensePresentationBuilder.build(listOf(coil))

        assertThat(groups).hasSize(1)
        assertThat(groups.single().type).isEqualTo(OpenSourceLicenseType.APACHE_2_0)
        assertThat(groups.single().licenses).containsExactly(coil)
    }

    @Test
    fun build_ordersGroupsByEnumOrder_notInsertionOrder() {
        // Insertion order is BSD, APACHE_2_0, MIT — enum order is MIT, APACHE_2_0, BSD.
        val webrtc = license("WebRTC", OpenSourceLicenseType.BSD)
        val coil = license("Coil", OpenSourceLicenseType.APACHE_2_0)
        val socketIo = license("Socket.IO", OpenSourceLicenseType.MIT)

        val groups = OpenSourceLicensePresentationBuilder.build(listOf(webrtc, coil, socketIo))

        assertThat(groups.map { it.type })
            .containsExactly(
                OpenSourceLicenseType.MIT,
                OpenSourceLicenseType.APACHE_2_0,
                OpenSourceLicenseType.BSD,
            )
            .inOrder()
    }

    @Test
    fun build_sortsWithinGroupByNameCaseInsensitively() {
        val timber = license("Timber", OpenSourceLicenseType.APACHE_2_0)
        val coil = license("coil", OpenSourceLicenseType.APACHE_2_0)
        val okhttp = license("OkHttp", OpenSourceLicenseType.APACHE_2_0)

        val group = OpenSourceLicensePresentationBuilder.build(listOf(timber, coil, okhttp)).single()

        assertThat(group.licenses.map { it.name })
            .containsExactly("coil", "OkHttp", "Timber")
            .inOrder()
    }

    @Test
    fun build_dropsEmptyGroups() {
        val socketIo = license("Socket.IO", OpenSourceLicenseType.MIT)

        val groups = OpenSourceLicensePresentationBuilder.build(listOf(socketIo))

        assertThat(groups.map { it.type }).containsExactly(OpenSourceLicenseType.MIT)
    }

    @Test
    fun build_excludesNonLaunchableBeforeGrouping() {
        val goodMit = license("Socket.IO", OpenSourceLicenseType.MIT)
        val deadBsd = license("Dead", OpenSourceLicenseType.BSD, url = "not-a-url")

        val groups = OpenSourceLicensePresentationBuilder.build(listOf(goodMit, deadBsd))

        assertThat(groups.map { it.type }).containsExactly(OpenSourceLicenseType.MIT)
        assertThat(groups.single().licenses).containsExactly(goodMit)
    }

    @Test
    fun build_multipleGroupsEachSortedAndPopulated() {
        val socketIo = license("Socket.IO", OpenSourceLicenseType.MIT)
        val kingfisherLike = license("Amit", OpenSourceLicenseType.MIT)
        val okhttp = license("OkHttp", OpenSourceLicenseType.APACHE_2_0)
        val coil = license("Coil", OpenSourceLicenseType.APACHE_2_0)

        val groups =
            OpenSourceLicensePresentationBuilder.build(listOf(socketIo, kingfisherLike, okhttp, coil))

        assertThat(groups).hasSize(2)
        assertThat(groups[0].type).isEqualTo(OpenSourceLicenseType.MIT)
        assertThat(groups[0].licenses.map { it.name }).containsExactly("Amit", "Socket.IO").inOrder()
        assertThat(groups[1].type).isEqualTo(OpenSourceLicenseType.APACHE_2_0)
        assertThat(groups[1].licenses.map { it.name }).containsExactly("Coil", "OkHttp").inOrder()
    }

    @Test
    fun build_keepsDistinctEntriesWithTheSameName() {
        val a = license("Same", OpenSourceLicenseType.MIT, url = "https://example.com/a")
        val b = license("Same", OpenSourceLicenseType.MIT, url = "https://example.com/b")

        val group = OpenSourceLicensePresentationBuilder.build(listOf(a, b)).single()

        assertThat(group.licenses).containsExactly(a, b)
    }
}

class OpenSourceLicenseCardsTest {

    private fun license(name: String, type: OpenSourceLicenseType, url: String = "https://example.com/$name") =
        OpenSourceLicense(name = name, author = "Author", type = type, url = url)

    @Test
    fun `cards gives one card per library, not one block per type`() {
        val cards = OpenSourceLicensePresentationBuilder.cards(
            listOf(
                license("Okio", OpenSourceLicenseType.APACHE_2_0),
                license("Coil", OpenSourceLicenseType.APACHE_2_0),
                license("Socket.IO", OpenSourceLicenseType.MIT),
            ),
        )

        assertThat(cards.map { it.name }).containsExactly("Socket.IO", "Coil", "Okio").inOrder()
    }

    @Test
    fun `the capsule colour follows the license family`() {
        assertThat(OpenSourceLicensePresentationBuilder.badge(OpenSourceLicenseType.MIT)).isEqualTo(LicenseBadge.SUCCESS)
        assertThat(OpenSourceLicensePresentationBuilder.badge(OpenSourceLicenseType.APACHE_2_0)).isEqualTo(LicenseBadge.WARNING)
        assertThat(OpenSourceLicensePresentationBuilder.badge(OpenSourceLicenseType.BSD)).isEqualTo(LicenseBadge.INFO)
        assertThat(OpenSourceLicensePresentationBuilder.badge(OpenSourceLicenseType.OTHER)).isEqualTo(LicenseBadge.NEUTRAL)
    }

    @Test
    fun `a card carries the capsule text and the repository to open`() {
        val card = OpenSourceLicensePresentationBuilder.cards(
            listOf(license("Coil", OpenSourceLicenseType.APACHE_2_0, "https://github.com/coil-kt/coil")),
        ).single()

        assertThat(card.typeName).isEqualTo("Apache 2.0")
        assertThat(card.badge).isEqualTo(LicenseBadge.WARNING)
        assertThat(card.url).isEqualTo("https://github.com/coil-kt/coil")
    }

    @Test
    fun `the other family has no fixed name so the app localizes it`() {
        val card = OpenSourceLicensePresentationBuilder.cards(listOf(license("X", OpenSourceLicenseType.OTHER))).single()
        assertThat(card.typeName).isNull()
    }

    @Test
    fun `non launchable entries never become cards`() {
        assertThat(OpenSourceLicensePresentationBuilder.cards(listOf(license("Dead", OpenSourceLicenseType.MIT, url = "")))).isEmpty()
    }

    @Test
    fun `the Android catalog keeps every dependency as one card`() {
        val grouped = OpenSourceLicenseCatalog.groups().flatMap { it.licenses }
        assertThat(OpenSourceLicenseCatalog.cards().map { it.name }).containsExactlyElementsIn(grouped.map { it.name }).inOrder()
    }
}
