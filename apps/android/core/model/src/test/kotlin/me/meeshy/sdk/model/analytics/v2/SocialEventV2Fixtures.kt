package me.meeshy.sdk.model.analytics.v2

import java.io.File

internal const val T0 = 1_760_000_000_000L

internal fun event(
    payload: SocialEventV2Payload,
    target: SocialTarget? = SocialTarget(SocialTargetKind.POST, "p1"),
    surface: String? = null,
    listing: SocialListing? = null,
    prism: SocialPrism? = null,
    at: Long = T0,
) = SocialEventV2(payload, at, target, surface, listing, prism, eventId = "e1")

internal fun sampleEvents(): List<SocialEventV2Payload> = listOf(
    SocialInteraction(SocialInteraction.Action.REACT),
    SocialNegative(SocialNegative.Action.HIDE),
    SocialLinkEvent(SocialLinkEvent.Action.OUTBOUND_CLICK, "example.com"),
    SocialDiscovery(SocialDiscovery.Action.SEARCH_SUBMITTED),
    SocialStoryEvent(SocialStoryEvent.Action.TAP_FORWARD, 1, 3, 500),
    SocialNotificationEvent(SocialNotificationEvent.Action.OPENED, "like", SocialNotificationEvent.Channel.FCM),
    SocialScreenCapture(SocialScreenCapture.Action.SCREENSHOT, emptyList()),
    scrollListing(),
    scrollContent(),
    SocialVisibility(0.5, 1000, true),
    playback(),
)

internal fun scrollListing() = ScrollListingSummary(
    "ls1", 0, 1000, 800, 10, 6, 9, 1200, listOf(1, 2, 3, 4), 2, 0.25, 1, 2, 0, 1, false,
)

internal fun scrollContent() =
    ScrollContentSummary(ScrollContentSummary.ContentKind.CAROUSEL, 5, 3, 3, 0.4, 0.2, 7000)

internal fun playback() = PlaybackSummary(
    "pb1", "m1", 30000, 250, false, 12000, 1, 300, null, null, 1800, 0, 0, 1, 0,
    true, 0, false, 3, PlaybackSummary.ExitReason.SWIPED,
)

/** Le contrat TS : lu depuis le fichier du dépôt, échec fort s'il est introuvable. */
internal object TsContract {
    private val source: String by lazy {
        var dir: File? = File(System.getProperty("user.dir")).absoluteFile
        while (dir != null) {
            val candidate = File(dir, "packages/shared/types/social-events-v2.ts")
            if (candidate.isFile) return@lazy candidate.readText()
            dir = dir.parentFile
        }
        error("packages/shared/types/social-events-v2.ts introuvable depuis ${System.getProperty("user.dir")}")
    }

    fun list(name: String): List<String> {
        val body = Regex("""export const $name\s*=\s*\[([^\]]*)]""").find(source)?.groupValues?.get(1)
            ?: error("constante TS $name introuvable")
        return Regex("""'([^']+)'""").findAll(body).map { it.groupValues[1] }.toList()
    }

    fun number(name: String): Long {
        val expr = Regex("""export const $name\s*=\s*([^;]+);""").find(source)?.groupValues?.get(1)
            ?: error("constante TS $name introuvable")
        return expr.substringBefore("as const").replace("_", "").split("*").map { it.trim().toLong() }.reduce(Long::times)
    }
}
