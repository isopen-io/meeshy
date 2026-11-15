package me.meeshy.app.navigation

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import org.junit.Test

/**
 * #18387 — les quatre couches de la racine ne sont tenues par leurs tests de comportement que si leur composable
 * APPELLE la transition testée. Cette garde lit le câblage : un retour au `if` nu, au retour anticipé ou à une
 * transition littérale fait rougir le site nommé.
 */
class RootLayersMotionWiringTest {

    private data class Site(val file: String, val required: List<Regex>, val forbidden: List<Regex> = emptyList())

    private val sites = listOf(
        Site(
            "src/main/kotlin/me/meeshy/app/navigation/PendingLinkBanner.kt",
            required = listOf(
                Regex("""enter = pendingLinkBannerEnter\(reduce = FeedOverlayTransition\.reduceMotion\)"""),
                Regex("""exit = pendingLinkBannerExit\(reduce = FeedOverlayTransition\.reduceMotion\)"""),
            ),
        ),
        Site(
            "src/main/kotlin/me/meeshy/app/sync/PendingBanners.kt",
            required = listOf(
                Regex("""val reduce = FeedOverlayTransition\.reduceMotion"""),
                Regex("""enter = PendingBannerMotion\.enter\(reduce\)"""),
                Regex("""exit = PendingBannerMotion\.exit\(reduce\)"""),
            ),
        ),
        Site(
            "src/main/kotlin/me/meeshy/app/navigation/RootFloatingChrome.kt",
            required = listOf(
                Regex("""Crossfade\( targetState = feedOpen, animationSpec = feedButtonFaceSpec\(FeedOverlayTransition\.reduceMotion\)"""),
            ),
            forbidden = listOf(Regex("""if \(feedOpen\) \{ AnimatedBrandLogo""")),
        ),
        Site(
            "src/main/kotlin/me/meeshy/app/navigation/SyncPillOverlay.kt",
            required = listOf(
                Regex("""SyncPillLayer\(visible = visible, reduce = FeedOverlayTransition\.reduceMotion\) \{ SyncPillHost\("""),
            ),
            forbidden = listOf(Regex("""SyncPillVisibility\.isVisible\(.*?\)\) return""")),
        ),
    )

    private fun flatten(source: String): String = source
        .replace(Regex("""/\*.*?\*/""", RegexOption.DOT_MATCHES_ALL), "")
        .replace(Regex("""//[^\n]*"""), "")
        .replace(Regex("""\s+"""), " ")

    private fun defects(read: (String) -> String): List<String> = sites.flatMap { site ->
        val code = flatten(read(site.file))
        site.required.filterNot { it.containsMatchIn(code) }.map { "${site.file} : manque ${it.pattern}" } +
            site.forbidden.filter { it.containsMatchIn(code) }.map { "${site.file} : interdit ${it.pattern}" }
    }

    @Test
    fun `les quatre couches de la racine appellent leurs transitions reduites`() {
        val found = defects { File(it).readText() }
        assertWithMessage(found.joinToString("\n")).that(found).isEmpty()
    }

    @Test
    fun `la garde rougit sur la forme d'avant le lot, site par site`() {
        val before = mapOf(
            sites[0].file to """
                AnimatedVisibility(visible = isVisible, modifier = modifier,
                    enter = fadeIn(tween(PENDING_LINK_ENTER_MILLIS)) + expandVertically(tween(PENDING_LINK_ENTER_MILLIS)),
                    exit = fadeOut(tween(PENDING_LINK_ENTER_MILLIS)) + shrinkVertically(tween(PENDING_LINK_ENTER_MILLIS)))
            """,
            sites[1].file to """
                val spec = spring<Float>(dampingRatio = 0.8f)
                AnimatedVisibility(visible = visible,
                    enter = slideInVertically(spec) { -it } + fadeIn(spec),
                    exit = slideOutVertically { -it } + fadeOut())
            """,
            sites[2].file to """
                Box(contentAlignment = Alignment.Center) {
                    if (feedOpen) {
                        AnimatedBrandLogo(modifier = Modifier.size(MeeshyIconSize.xxxl))
                    } else { Icon(imageVector = FeedButtonIcon, contentDescription = null) }
                }
            """,
            sites[3].file to """
                if (!SyncPillVisibility.isVisible(entry?.destination?.route, inAppBannerPresenting = banner != null)) return
                Box(Modifier.fillMaxSize()) { SyncPillHost(toasts = toasts, onOpen = {}) }
            """,
        )
        val found = defects { before.getValue(it) }
        assertThat(found.map { it.substringBefore(" : ") }.distinct()).containsExactlyElementsIn(sites.map { it.file })
        assertThat(found.filter { it.contains("interdit") }).hasSize(2)
    }
}
