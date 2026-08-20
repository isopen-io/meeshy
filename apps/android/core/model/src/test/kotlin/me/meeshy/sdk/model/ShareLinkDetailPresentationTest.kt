package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import java.time.Instant
import org.junit.Test

/**
 * Behavioural spec for [ShareLinkDetailPresentation] — the pure projection of a
 * [MyShareLink] into everything the per-link detail surface renders (faithful port
 * of the iOS `ShareLinkDetailView` computed properties). Every field is derived, so
 * every branch is JVM-testable and the screen stays a thin renderer.
 */
class ShareLinkDetailPresentationTest {

    private val now = Instant.parse("2026-07-25T12:00:00Z").toEpochMilli()
    private val origin = "https://meeshy.me"

    private fun link(
        linkId: String = "link-1",
        identifier: String? = null,
        name: String? = null,
        isActive: Boolean = true,
        currentUses: Int = 0,
        maxUses: Int? = null,
        expiresAt: String? = null,
        createdAt: String? = null,
        conversationTitle: String? = null,
    ) = MyShareLink(
        id = "id-1",
        linkId = linkId,
        identifier = identifier,
        name = name,
        isActive = isActive,
        currentUses = currentUses,
        maxUses = maxUses,
        expiresAt = expiresAt,
        createdAt = createdAt,
        conversationTitle = conversationTitle,
    )

    private fun present(l: MyShareLink) = ShareLinkDetailPresentation.from(l, origin, now)

    @Test
    fun displayName_reusesTheSharedFallbackChain() {
        assertThat(present(link(name = "Launch party", identifier = "party")).displayName)
            .isEqualTo("Launch party")
    }

    @Test
    fun joinUrl_reusesTheSharedBuilder() {
        assertThat(present(link(identifier = "party")).joinUrl)
            .isEqualTo("https://meeshy.me/chat/party")
    }

    @Test
    fun identifierLabel_prefersTheHumanIdentifier() {
        assertThat(present(link(identifier = "party", linkId = "link-9")).identifierLabel)
            .isEqualTo("party")
    }

    @Test
    fun identifierLabel_fallsBackToLinkIdWhenIdentifierAbsent() {
        assertThat(present(link(identifier = null, linkId = "link-9")).identifierLabel)
            .isEqualTo("link-9")
    }

    @Test
    fun identifierLabel_treatsBlankIdentifierAsAbsent() {
        assertThat(present(link(identifier = "   ", linkId = "link-9")).identifierLabel)
            .isEqualTo("link-9")
    }

    @Test
    fun isActive_mirrorsTheLink() {
        assertThat(present(link(isActive = false)).isActive).isFalse()
        assertThat(present(link(isActive = true)).isActive).isTrue()
    }

    @Test
    fun conversationTitle_isPassedThroughWhenPresent() {
        assertThat(present(link(conversationTitle = "Team")).conversationTitle).isEqualTo("Team")
    }

    @Test
    fun conversationTitle_isNullWhenBlank() {
        assertThat(present(link(conversationTitle = "   ")).conversationTitle).isNull()
    }

    @Test
    fun conversationTitle_isNullWhenAbsent() {
        assertThat(present(link(conversationTitle = null)).conversationTitle).isNull()
    }

    @Test
    fun usesLabel_isTheCurrentUseCount() {
        assertThat(present(link(currentUses = 7)).usesLabel).isEqualTo("7")
    }

    @Test
    fun maxUsesLabel_isTheLimitWhenCapped() {
        assertThat(present(link(maxUses = 50)).maxUsesLabel).isEqualTo("50")
    }

    @Test
    fun maxUsesLabel_isInfinityGlyphWhenUncapped() {
        assertThat(present(link(maxUses = null)).maxUsesLabel).isEqualTo("∞")
    }

    @Test
    fun hasUsageLimit_reflectsWhetherMaxUsesIsSet() {
        assertThat(present(link(maxUses = 10)).hasUsageLimit).isTrue()
        assertThat(present(link(maxUses = null)).hasUsageLimit).isFalse()
    }

    @Test
    fun isExhausted_isFalseWhenUncapped() {
        assertThat(present(link(maxUses = null, currentUses = 999)).isExhausted).isFalse()
    }

    @Test
    fun isExhausted_isFalseBelowTheLimit() {
        assertThat(present(link(maxUses = 10, currentUses = 9)).isExhausted).isFalse()
    }

    @Test
    fun isExhausted_isTrueAtTheLimit() {
        assertThat(present(link(maxUses = 10, currentUses = 10)).isExhausted).isTrue()
    }

    @Test
    fun isExhausted_isTruePastTheLimit() {
        assertThat(present(link(maxUses = 10, currentUses = 11)).isExhausted).isTrue()
    }

    @Test
    fun isExpired_reusesTheSharedPredicate_pastExpiry() {
        assertThat(present(link(expiresAt = "2026-07-24T12:00:00Z")).isExpired).isTrue()
    }

    @Test
    fun isExpired_reusesTheSharedPredicate_futureExpiry() {
        assertThat(present(link(expiresAt = "2026-07-26T12:00:00Z")).isExpired).isFalse()
    }

    @Test
    fun createdAtMillis_isParsedFromIso() {
        assertThat(present(link(createdAt = "2026-07-20T09:30:00Z")).createdAtMillis)
            .isEqualTo(Instant.parse("2026-07-20T09:30:00Z").toEpochMilli())
    }

    @Test
    fun createdAtMillis_isNullWhenAbsent() {
        assertThat(present(link(createdAt = null)).createdAtMillis).isNull()
    }

    @Test
    fun createdAtMillis_isNullWhenUnparseable() {
        assertThat(present(link(createdAt = "not-a-date")).createdAtMillis).isNull()
    }

    @Test
    fun expiresAtMillis_isParsedFromIso() {
        assertThat(present(link(expiresAt = "2026-07-26T12:00:00Z")).expiresAtMillis)
            .isEqualTo(Instant.parse("2026-07-26T12:00:00Z").toEpochMilli())
    }

    @Test
    fun expiresAtMillis_isNullWhenAbsent() {
        assertThat(present(link(expiresAt = null)).expiresAtMillis).isNull()
    }
}
