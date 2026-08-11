# Story Reaction Scrub — Android Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rail latéral (cœur + langue) dans le viewer de stories Android avec sélection de réaction par longpress + glissement continu, animation de vol ≤ 1 s, et override de langue éphémère — parité iOS.

**Architecture:** Objets purs testés en JVM (`ScrubHitResolver`, `StoryRailPlan`, `StoryContentResolver` étendu) ; composants sdk-ui étendus par paramètres opaques (`highlightedIndex`, `onTileBounds`) ; orchestration des gestes/animations dans `StoryViewerScreen` (app-side). Envoi réseau inchangé (`StoryViewerViewModel.react`).

**Tech Stack:** Kotlin, Jetpack Compose, Hilt, JUnit4 + Truth + MockK (tests JVM), springs `MeeshyMotion`.

**Spec:** `docs/superpowers/specs/2026-08-11-story-reaction-scrub-design.md`

## Global Constraints

- Branche : `feat/story-reaction-scrub` (déjà créée depuis `origin/dev`). Commits fréquents, PAS de trailer `Co-Authored-By` (préférence utilisateur), pas de backticks dans `git commit -m`.
- Répertoire : toutes les commandes Gradle depuis `apps/android/` du worktree `/Users/smpceo/Documents/v2_meeshy/.claude/worktrees/post-hashtags/`.
- Avant tout `./gradlew` : `export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home` et vérifier que `apps/android/local.properties` contient `sdk.dir=/Users/smpceo/android-sdk` (gitignored — le créer si absent).
- Springs : UNIQUEMENT `MeeshyMotion.bouncySpring()` pour les scale du système scrub (jamais de tween sur un scale). Vol de position : `tween(450, FastOutSlowInEasing)`.
- Grossissement survol : ×1.35. Tolérance verticale hit-test : 16.dp. Longpress : celui de `detectDragGesturesAfterLongPress` (défaut système).
- Aucun changement backend/gateway. Aucun `any`-like (`Any`) ni mutation d'état partagé hors `MutableStateFlow`.
- Chaque nouvelle string UI est ajoutée dans les 4 locales du module stories : `values/`, `values-fr/`, `values-es/`, `values-pt/`.

---

### Task 1: `ScrubHitResolver` (objet pur + tests)

**Files:**
- Create: `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/ScrubHitResolver.kt`
- Test: `apps/android/feature/stories/src/test/kotlin/me/meeshy/app/stories/ScrubHitResolverTest.kt`

**Interfaces:**
- Produces: `ScrubHitResolver.hoveredIndex(tileBounds: Map<Int, Rect>, position: Offset, verticalTolerance: Float): Int?` et `ScrubHitResolver.release(hoveredIndex: Int?, emojis: List<String>): ScrubRelease` ; `sealed interface ScrubRelease { data class React(val emoji: String); data object Expand; data object KeepOpen }`. Consommés par Task 7 (rail) et Task 8 (screen).

- [ ] **Step 1: Write the failing test**

```kotlin
package me.meeshy.app.stories

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Pure hit-testing behind the scrubbable reaction/language bars: finger
 * position -> hovered tile index (with a vertical tolerance band so a
 * trembling finger never loses the hover), and release -> action.
 */
class ScrubHitResolverTest {

    // Three 40x40 tiles side by side at y=100, then the "+" tile (index 3).
    private val bounds = mapOf(
        0 to Rect(0f, 100f, 40f, 140f),
        1 to Rect(44f, 100f, 84f, 140f),
        2 to Rect(88f, 100f, 128f, 140f),
        3 to Rect(132f, 100f, 172f, 140f),
    )
    private val emojis = listOf("❤️", "😂", "🔥")

    private fun hovered(x: Float, y: Float) =
        ScrubHitResolver.hoveredIndex(bounds, Offset(x, y), verticalTolerance = 16f)

    @Test
    fun `a position inside a tile hovers that tile`() {
        assertThat(hovered(60f, 120f)).isEqualTo(1)
    }

    @Test
    fun `a position slightly above a tile still hovers it within the tolerance band`() {
        assertThat(hovered(60f, 90f)).isEqualTo(1)
    }

    @Test
    fun `a position slightly below a tile still hovers it within the tolerance band`() {
        assertThat(hovered(60f, 150f)).isEqualTo(1)
    }

    @Test
    fun `a position beyond the tolerance band hovers nothing`() {
        assertThat(hovered(60f, 200f)).isNull()
    }

    @Test
    fun `a position horizontally outside every tile hovers nothing`() {
        assertThat(hovered(500f, 120f)).isNull()
    }

    @Test
    fun `an empty bounds map hovers nothing`() {
        assertThat(ScrubHitResolver.hoveredIndex(emptyMap(), Offset(60f, 120f), 16f)).isNull()
    }

    @Test
    fun `releasing over an emoji tile reacts with that emoji`() {
        assertThat(ScrubHitResolver.release(1, emojis))
            .isEqualTo(ScrubRelease.React("😂"))
    }

    @Test
    fun `releasing over the trailing plus tile expands the full picker`() {
        assertThat(ScrubHitResolver.release(emojis.size, emojis)).isEqualTo(ScrubRelease.Expand)
    }

    @Test
    fun `releasing outside every tile keeps the bar open`() {
        assertThat(ScrubHitResolver.release(null, emojis)).isEqualTo(ScrubRelease.KeepOpen)
    }

    @Test
    fun `releasing on an out-of-range index keeps the bar open`() {
        assertThat(ScrubHitResolver.release(9, emojis)).isEqualTo(ScrubRelease.KeepOpen)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/android && export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home && ./gradlew :feature:stories:testDebugUnitTest --tests '*ScrubHitResolverTest*'`
Expected: FAIL (unresolved reference `ScrubHitResolver`)

- [ ] **Step 3: Write minimal implementation**

```kotlin
package me.meeshy.app.stories

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import kotlin.math.abs

/** What lifting the finger at the end of a scrub gesture resolves to. */
sealed interface ScrubRelease {
    /** Released over an emoji tile — send this reaction. */
    data class React(val emoji: String) : ScrubRelease

    /** Released over the trailing "+" tile — open the full picker. */
    data object Expand : ScrubRelease

    /** Released outside every tile — the bar stays open in "posed" mode. */
    data object KeepOpen : ScrubRelease
}

/**
 * Pure hit-testing for the scrubbable bars (reactions, languages) of the
 * story viewer. Tiles report their bounds in root coordinates; the finger
 * position is matched exactly first, then within a vertical tolerance band
 * so a small drift above/below the bar never loses the hover. Kept pure
 * (pattern [StorySwipeResolver]) so the decision is fully testable.
 */
object ScrubHitResolver {

    fun hoveredIndex(
        tileBounds: Map<Int, Rect>,
        position: Offset,
        verticalTolerance: Float,
    ): Int? {
        tileBounds.entries.firstOrNull { it.value.contains(position) }?.let { return it.key }
        return tileBounds.entries
            .filter { (_, rect) ->
                position.x >= rect.left && position.x < rect.right &&
                    position.y >= rect.top - verticalTolerance &&
                    position.y < rect.bottom + verticalTolerance
            }
            .minByOrNull { (_, rect) -> abs(position.y - rect.center.y) }
            ?.key
    }

    /** The trailing "+" tile carries index `emojis.size` (one past the last emoji). */
    fun release(hoveredIndex: Int?, emojis: List<String>): ScrubRelease = when {
        hoveredIndex == null -> ScrubRelease.KeepOpen
        hoveredIndex == emojis.size -> ScrubRelease.Expand
        hoveredIndex in emojis.indices -> ScrubRelease.React(emojis[hoveredIndex])
        else -> ScrubRelease.KeepOpen
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./gradlew :feature:stories:testDebugUnitTest --tests '*ScrubHitResolverTest*'`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add feature/stories/src/main/kotlin/me/meeshy/app/stories/ScrubHitResolver.kt feature/stories/src/test/kotlin/me/meeshy/app/stories/ScrubHitResolverTest.kt
git commit -m 'feat(android/stories): resolver pur de survol scrub (hit-test + action au relachement)'
```

---

### Task 2: `StoryRailPlan` (objet pur + tests)

**Files:**
- Create: `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryRailPlan.kt`
- Test: `apps/android/feature/stories/src/test/kotlin/me/meeshy/app/stories/StoryRailPlanTest.kt`

**Interfaces:**
- Produces: `StoryRailPlan(showsReact: Boolean, showsLanguage: Boolean)` + `StoryRailPlan.resolve(isOwnStory: Boolean, hasTranslatableContent: Boolean): StoryRailPlan`. Consommé par Tasks 7–8.

- [ ] **Step 1: Write the failing test**

```kotlin
package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Membership of the story viewer's right-side rail — Android mirror of the
 * iOS StoryActionRailPlan rules for the two buttons this viewer ships:
 * react (viewers only, never the author) and language (whenever the slide
 * has translatable content, author included — the Prisme is a reading tool,
 * not a permission).
 */
class StoryRailPlanTest {

    @Test
    fun `a viewer sees the react button`() {
        assertThat(StoryRailPlan.resolve(isOwnStory = false, hasTranslatableContent = false).showsReact).isTrue()
    }

    @Test
    fun `the author never sees the react button`() {
        assertThat(StoryRailPlan.resolve(isOwnStory = true, hasTranslatableContent = true).showsReact).isFalse()
    }

    @Test
    fun `translatable content shows the language button even for the author`() {
        assertThat(StoryRailPlan.resolve(isOwnStory = true, hasTranslatableContent = true).showsLanguage).isTrue()
    }

    @Test
    fun `no translatable content hides the language button`() {
        assertThat(StoryRailPlan.resolve(isOwnStory = false, hasTranslatableContent = false).showsLanguage).isFalse()
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./gradlew :feature:stories:testDebugUnitTest --tests '*StoryRailPlanTest*'`
Expected: FAIL (unresolved reference `StoryRailPlan`)

- [ ] **Step 3: Write minimal implementation**

```kotlin
package me.meeshy.app.stories

/**
 * Which action buttons the story viewer's right-side rail shows for the
 * current slide — Android mirror of the iOS `StoryActionRailPlan` membership
 * rules for the two buttons this viewer ships (react + language).
 */
data class StoryRailPlan(
    val showsReact: Boolean,
    val showsLanguage: Boolean,
) {
    companion object {
        fun resolve(isOwnStory: Boolean, hasTranslatableContent: Boolean): StoryRailPlan =
            StoryRailPlan(
                showsReact = !isOwnStory,
                showsLanguage = hasTranslatableContent,
            )
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./gradlew :feature:stories:testDebugUnitTest --tests '*StoryRailPlanTest*'`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryRailPlan.kt feature/stories/src/test/kotlin/me/meeshy/app/stories/StoryRailPlanTest.kt
git commit -m 'feat(android/stories): plan du rail lateral (react + langue) en parite iOS'
```

---

### Task 3: Override de langue dans `StoryContentResolver`

**Files:**
- Modify: `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryContentResolver.kt`
- Test: `apps/android/feature/stories/src/test/kotlin/me/meeshy/app/stories/StoryContentResolverTest.kt` (compléter s'il existe, créer sinon — vérifier avec `ls feature/stories/src/test/kotlin/me/meeshy/app/stories/`)

**Interfaces:**
- Consumes: `LanguageResolver.preferredTranslation`, `StoryItem` (`me.meeshy.sdk.model`).
- Produces: `StoryContentResolver.resolve(item: StoryItem, prefs: ContentLanguagePreferences, overrideLanguage: String? = null): ResolvedStoryText` où `ResolvedStoryText(content: String, isTranslated: Boolean, languageCode: String?)` — `languageCode` = langue de la traduction affichée, `null` pour l'original. Consommé par Task 4.

- [ ] **Step 1: Write the failing tests** (ajouter au fichier de test)

```kotlin
package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.StoryItem
import me.meeshy.sdk.model.StoryTranslation
import org.junit.Test

class StoryContentResolverTest {

    private object FrenchPrefs : LanguageResolver.ContentLanguagePreferences {
        override val systemLanguage: String? = "fr"
        override val regionalLanguage: String? = null
        override val customDestinationLanguage: String? = null
    }

    private val item = StoryItem(
        id = "s1",
        content = "original english",
        translations = listOf(
            StoryTranslation(language = "fr", content = "texte francais"),
            StoryTranslation(language = "es", content = "texto espanol"),
        ),
    )

    @Test
    fun `without override the Prisme picks the preferred translation`() {
        val resolved = StoryContentResolver.resolve(item, FrenchPrefs)
        assertThat(resolved.content).isEqualTo("texte francais")
        assertThat(resolved.isTranslated).isTrue()
        assertThat(resolved.languageCode).isEqualTo("fr")
    }

    @Test
    fun `an override wins over the preferred chain`() {
        val resolved = StoryContentResolver.resolve(item, FrenchPrefs, overrideLanguage = "es")
        assertThat(resolved.content).isEqualTo("texto espanol")
        assertThat(resolved.languageCode).isEqualTo("es")
    }

    @Test
    fun `the override match is case-insensitive`() {
        val resolved = StoryContentResolver.resolve(item, FrenchPrefs, overrideLanguage = "ES")
        assertThat(resolved.content).isEqualTo("texto espanol")
    }

    @Test
    fun `an override without a matching translation falls back to the preferred chain`() {
        val resolved = StoryContentResolver.resolve(item, FrenchPrefs, overrideLanguage = "de")
        assertThat(resolved.content).isEqualTo("texte francais")
    }

    @Test
    fun `no matching translation at all shows the original, never an arbitrary one`() {
        val resolved = StoryContentResolver.resolve(
            item.copy(translations = listOf(StoryTranslation(language = "it", content = "testo"))),
            FrenchPrefs,
        )
        assertThat(resolved.content).isEqualTo("original english")
        assertThat(resolved.isTranslated).isFalse()
        assertThat(resolved.languageCode).isNull()
    }
}
```

- [ ] **Step 2: Run to verify failure**

Run: `./gradlew :feature:stories:testDebugUnitTest --tests '*StoryContentResolverTest*'`
Expected: FAIL (`languageCode` unresolved, paramètre `overrideLanguage` inexistant). Si un fichier de test existait déjà avec d'autres cas, les conserver tels quels.

- [ ] **Step 3: Implement**

Dans `StoryContentResolver.kt`, remplacer `ResolvedStoryText` et `resolve` :

```kotlin
/** A story slide's text resolved through the Prisme Linguistique. */
@Immutable
data class ResolvedStoryText(
    val content: String,
    val isTranslated: Boolean,
    val languageCode: String? = null,
)
```

```kotlin
object StoryContentResolver {

    /**
     * [overrideLanguage] is the ephemeral "Exploration" pick from the language
     * bar (iOS `sessionLanguageOverride` parity): it is tried FIRST, without
     * removing the user's preference chain — an override with no matching
     * translation falls back to the normal Prisme resolution.
     */
    fun resolve(
        item: StoryItem,
        prefs: ContentLanguagePreferences,
        overrideLanguage: String? = null,
    ): ResolvedStoryText {
        val original = item.content.orEmpty()
        val candidates = item.translations.orEmpty().map {
            StoryTranslationLike(targetLanguage = it.language, translatedContent = it.content)
        }
        val overrideMatch = overrideLanguage?.let { override ->
            candidates.firstOrNull {
                it.targetLanguage.equals(override, ignoreCase = true) &&
                    it.translatedContent.isNotBlank()
            }
        }
        val match = overrideMatch ?: LanguageResolver.preferredTranslation(candidates, prefs)
        return if (match != null) {
            ResolvedStoryText(
                content = match.translatedContent,
                isTranslated = true,
                languageCode = match.targetLanguage,
            )
        } else {
            ResolvedStoryText(content = original, isTranslated = false, languageCode = null)
        }
    }
}
```

- [ ] **Step 4: Run tests (resolver + toute la suite stories, le VM consomme `ResolvedStoryText`)**

Run: `./gradlew :feature:stories:testDebugUnitTest`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryContentResolver.kt feature/stories/src/test/kotlin/me/meeshy/app/stories/StoryContentResolverTest.kt
git commit -m 'feat(android/stories): override de langue (Exploration) dans la resolution Prisme des stories'
```

---

### Task 4: ViewModel — langues disponibles + override éphémère

**Files:**
- Modify: `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewerViewModel.kt`
- Test: `apps/android/feature/stories/src/test/kotlin/me/meeshy/app/stories/StoryViewerViewModelTest.kt` (compléter)

**Interfaces:**
- Consumes: `StoryContentResolver.resolve(item, prefs, overrideLanguage)` (Task 3), `LanguageData.info(code)` (`me.meeshy.sdk.model`).
- Produces (état pour Tasks 7–8): `StoryViewerUiState.availableLanguages: List<StoryLanguageOption>`, `StoryViewerUiState.languageOverride: String?`, `StorySlideView.languageCode: String?`, `data class StoryLanguageOption(code: String, flag: String, label: String)`, `fun toggleLanguageOverride(code: String)`.

- [ ] **Step 1: Write the failing tests** (ajouter à `StoryViewerViewModelTest.kt` ; réutiliser les helpers existants `storyPost(...)` / `viewModel(...)` du fichier ; ajouter aux imports `me.meeshy.sdk.model.PostTranslation`)

Le helper `storyPost` doit accepter les traductions — étendre sa signature existante avec un paramètre par défaut :

```kotlin
    private fun storyPost(
        id: String,
        authorId: String,
        hoursAgo: Long,
        reactionSummary: Map<String, Int>? = null,
        translations: Map<String, PostTranslation>? = null,
    ) = ApiPost(
        id = id,
        type = "STORY",
        content = "text-$id",
        createdAt = isoAgo(hoursAgo),
        author = ApiAuthor(id = authorId, username = "name-$authorId"),
        isViewedByMe = false,
        reactionSummary = reactionSummary,
        translations = translations,
    )
```

Nouveaux tests :

```kotlin
    @Test
    fun `available languages list the slide translations with flags`() = runTest {
        val vm = viewModel(
            startUserId = "a1",
            posts = listOf(
                storyPost(
                    id = "s1", authorId = "a1", hoursAgo = 1,
                    translations = mapOf(
                        "fr" to PostTranslation(text = "bonjour"),
                        "es" to PostTranslation(text = "hola"),
                    ),
                ),
            ),
        )
        val languages = vm.state.value.availableLanguages
        assertThat(languages.map { it.code }).containsExactly("fr", "es")
        assertThat(languages.first { it.code == "fr" }.flag).isNotEmpty()
    }

    @Test
    fun `toggling a language override re-resolves the current slide text`() = runTest {
        val vm = viewModel(
            startUserId = "a1",
            posts = listOf(
                storyPost(
                    id = "s1", authorId = "a1", hoursAgo = 1,
                    translations = mapOf("es" to PostTranslation(text = "hola")),
                ),
            ),
        )
        vm.toggleLanguageOverride("es")
        assertThat(vm.state.value.current?.text).isEqualTo("hola")
        assertThat(vm.state.value.languageOverride).isEqualTo("es")
    }

    @Test
    fun `re-toggling the same language clears the override`() = runTest {
        val vm = viewModel(
            startUserId = "a1",
            posts = listOf(
                storyPost(
                    id = "s1", authorId = "a1", hoursAgo = 1,
                    translations = mapOf("es" to PostTranslation(text = "hola")),
                ),
            ),
        )
        vm.toggleLanguageOverride("es")
        vm.toggleLanguageOverride("es")
        assertThat(vm.state.value.current?.text).isEqualTo("text-s1")
        assertThat(vm.state.value.languageOverride).isNull()
    }

    @Test
    fun `advancing to another slide resets the override`() = runTest {
        val vm = viewModel(
            startUserId = "a1",
            posts = listOf(
                storyPost(
                    id = "s1", authorId = "a1", hoursAgo = 2,
                    translations = mapOf("es" to PostTranslation(text = "hola")),
                ),
                storyPost(id = "s2", authorId = "a1", hoursAgo = 1),
            ),
        )
        vm.toggleLanguageOverride("es")
        vm.advance()
        assertThat(vm.state.value.languageOverride).isNull()
        vm.back()
        assertThat(vm.state.value.current?.text).isEqualTo("text-s1")
    }
```

- [ ] **Step 2: Run to verify failure**

Run: `./gradlew :feature:stories:testDebugUnitTest --tests '*StoryViewerViewModelTest*'`
Expected: FAIL (unresolved `availableLanguages` / `toggleLanguageOverride` / `languageOverride`)

- [ ] **Step 3: Implement in `StoryViewerViewModel.kt`**

Ajouts au modèle (en haut du fichier, sous `StorySlideView`) :

```kotlin
/** One language chip of the story language bar. Pure data. */
@Immutable
data class StoryLanguageOption(
    val code: String,
    val flag: String,
    val label: String,
)
```

`StorySlideView` : ajouter `val languageCode: String? = null`.

`StoryViewerUiState` : ajouter
```kotlin
    val availableLanguages: List<StoryLanguageOption> = emptyList(),
    val languageOverride: String? = null,
```

Dans le ViewModel :

```kotlin
    /** Raw items by slide id — needed to re-resolve text when the language override changes. */
    private val rawItems = mutableMapOf<String, StoryItem>()

    /** Ephemeral "Exploration" override, keyed to the slide it was chosen on. */
    private var languageOverride: Pair<String, String>? = null

    /**
     * Prisme « Exploration » : bascule la langue AFFICHÉE du slide courant.
     * Re-tap sur la langue active = retour à la résolution automatique.
     * L'override est éphémère — il meurt au changement de slide.
     */
    fun toggleLanguageOverride(code: String) {
        val storyId = playback.currentSlide?.id ?: return
        languageOverride = if (languageOverride == storyId to code) null else storyId to code
        emit()
    }
```

`toSlideView` : enregistrer l'item brut et le code de langue résolu —

```kotlin
    private fun StoryItem.toSlideView(
        accentHex: String,
        prefs: LanguageResolver.ContentLanguagePreferences,
    ): StorySlideView {
        rawItems[id] = this
        val resolved = StoryContentResolver.resolve(this, prefs)
        val image = media.firstOrNull { it.type == FeedMediaType.IMAGE && it.url != null }
            ?: media.firstOrNull { it.thumbnailUrl != null }
        val imageUrl = (image?.url ?: image?.thumbnailUrl)
            ?.let { resolveMediaUrl(it, config.socketUrl) }
        return StorySlideView(
            id = id,
            text = resolved.content,
            isTranslated = resolved.isTranslated,
            imageUrl = imageUrl,
            accentHex = accentHex,
            reactionCount = reactionCount,
            languageCode = resolved.languageCode,
        )
    }
```

`emit()` : purger l'override obsolète, ré-résoudre le slide courant, exposer les langues —

```kotlin
    private fun emit() {
        val currentId = playback.currentSlide?.id
        if (languageOverride != null && languageOverride?.first != currentId) languageOverride = null
        val override = languageOverride?.second
        val reaction = playback.currentSlide?.let { reactionStateFor(it) } ?: StoryReactionState()
        val slides = if (override == null) playback.slides else playback.slides.map { slideView ->
            if (slideView.id != currentId) return@map slideView
            val item = rawItems[slideView.id] ?: return@map slideView
            val prefs = sessionRepository.currentUser.value ?: EmptyContentPreferences
            val resolved = StoryContentResolver.resolve(item, prefs, override)
            slideView.copy(
                text = resolved.content,
                isTranslated = resolved.isTranslated,
                languageCode = resolved.languageCode,
            )
        }
        _state.value = StoryViewerUiState(
            authorName = playback.authorName,
            slides = slides,
            index = playback.slideIndex,
            groupIndex = playback.groupIndex,
            isLoading = false,
            isDismissed = playback.isDismissed,
            reactionCount = reaction.count,
            myReactions = reaction.mine,
            isOwnStory = playback.currentGroup?.userId == sessionRepository.currentUserId,
            currentStoryId = currentId,
            prefetchUrls = StoryPrefetchPlanner.plan(playback),
            canAutoAdvance = StoryAutoAdvanceGate.shouldCountdown(playback.currentSlide, resolvedImageUrls),
            availableLanguages = availableLanguagesFor(currentId),
            languageOverride = override,
        )
    }

    private fun availableLanguagesFor(storyId: String?): List<StoryLanguageOption> {
        val item = storyId?.let { rawItems[it] } ?: return emptyList()
        return item.translations.orEmpty()
            .filter { it.language.isNotBlank() && it.content.isNotBlank() }
            .distinctBy { it.language.lowercase() }
            .map { translation ->
                val info = LanguageData.info(translation.language)
                StoryLanguageOption(
                    code = translation.language,
                    flag = info?.flag ?: "🌐",
                    label = info?.nativeName ?: translation.language,
                )
            }
    }
```

Import à ajouter : `me.meeshy.sdk.model.LanguageData`.

- [ ] **Step 4: Run tests**

Run: `./gradlew :feature:stories:testDebugUnitTest`
Expected: PASS (toute la suite stories)

- [ ] **Step 5: Commit**

```bash
git add feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewerViewModel.kt feature/stories/src/test/kotlin/me/meeshy/app/stories/StoryViewerViewModelTest.kt
git commit -m 'feat(android/stories): langues disponibles + override de langue ephemere dans le viewer'
```

---

### Task 5: `EmojiQuickStrip` scrubbable (sdk-ui, paramètres opaques)

**Files:**
- Modify: `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/EmojiPicker.kt`

**Interfaces:**
- Produces: `EmojiQuickStrip(..., highlightedIndex: Int? = null, onTileBounds: ((Int, Rect) -> Unit)? = null)` — le « + » porte l'index `emojis.size`. Consommé par Task 8. Les appels existants (chat) compilent sans changement (paramètres par défaut).

- [ ] **Step 1: Étendre la signature et les tuiles**

Nouveaux imports : `androidx.compose.animation.core.animateFloatAsState`, `androidx.compose.runtime.getValue`, `androidx.compose.ui.geometry.Rect`, `androidx.compose.ui.graphics.graphicsLayer`, `androidx.compose.ui.layout.boundsInRoot`, `androidx.compose.ui.layout.onGloballyPositioned`, `me.meeshy.ui.theme.MeeshyMotion`.

```kotlin
@Composable
fun EmojiQuickStrip(
    emojis: List<String>,
    onReact: (String) -> Unit,
    modifier: Modifier = Modifier,
    accentColor: Color = MeeshyPalette.Indigo500,
    ownReactions: Set<String> = emptySet(),
    onExpand: (() -> Unit)? = null,
    highlightedIndex: Int? = null,
    onTileBounds: ((Int, Rect) -> Unit)? = null,
) {
    // Scrub mode (bounds requested): keep the pill as a BACKGROUND shape only,
    // without clipping — a hovered tile scaled ×1.35 must overflow the pill.
    // Non-scrub callers (chat) keep the original clipped pill.
    val scrubMode = onTileBounds != null
    Row(
        modifier = modifier
            .let { base ->
                if (scrubMode) {
                    base.background(
                        MeeshyTheme.tokens.backgroundSecondary,
                        RoundedCornerShape(MeeshyRadius.pill),
                    )
                } else {
                    base
                        .clip(RoundedCornerShape(MeeshyRadius.pill))
                        .background(MeeshyTheme.tokens.backgroundSecondary)
                }
            }
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        emojis.forEachIndexed { index, emoji ->
            EmojiTile(
                emoji = emoji,
                isMine = emoji in ownReactions,
                isHighlighted = highlightedIndex == index,
                accentColor = accentColor,
                onClick = { onReact(emoji) },
                onBounds = onTileBounds?.let { report -> { rect -> report(index, rect) } },
            )
        }
        if (onExpand != null) {
            val expandLabel = stringResource(R.string.emoji_picker_expand)
            val plusIndex = emojis.size
            val plusScale by animateFloatAsState(
                targetValue = if (highlightedIndex == plusIndex) 1.35f else 1f,
                animationSpec = MeeshyMotion.bouncySpring(),
                label = "emojiPlusScale",
            )
            Box(
                modifier = Modifier
                    .size(36.dp)
                    .let { base ->
                        val report = onTileBounds
                        if (report != null) {
                            base.onGloballyPositioned { report(plusIndex, it.boundsInRoot()) }
                        } else {
                            base
                        }
                    }
                    .graphicsLayer { scaleX = plusScale; scaleY = plusScale }
                    .clip(CircleShape)
                    .background(MeeshyTheme.tokens.backgroundTertiary)
                    .clickable(onClick = onExpand)
                    .semantics { contentDescription = expandLabel },
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = Icons.Filled.Add,
                    contentDescription = null,
                    tint = MeeshyTheme.tokens.textSecondary,
                    modifier = Modifier.size(18.dp),
                )
            }
        }
    }
}
```

`EmojiTile` :

```kotlin
@Composable
private fun EmojiTile(
    emoji: String,
    isMine: Boolean,
    isHighlighted: Boolean,
    accentColor: Color,
    onClick: () -> Unit,
    onBounds: ((Rect) -> Unit)?,
) {
    val reactLabel = stringResource(R.string.emoji_react_with, emoji)
    val scale by animateFloatAsState(
        targetValue = if (isHighlighted) 1.35f else 1f,
        animationSpec = MeeshyMotion.bouncySpring(),
        label = "emojiTileScale",
    )
    Box(
        modifier = Modifier
            .size(36.dp)
            .let { base ->
                if (onBounds != null) base.onGloballyPositioned { onBounds(it.boundsInRoot()) } else base
            }
            .graphicsLayer { scaleX = scale; scaleY = scale }
            .clip(CircleShape)
            .background(if (isMine) accentColor.copy(alpha = 0.22f) else Color.Transparent)
            .let { base ->
                if (isMine) base.border(1.dp, accentColor, CircleShape) else base
            }
            .clickable(onClick = onClick)
            .semantics { contentDescription = reactLabel },
        contentAlignment = Alignment.Center,
    ) {
        Text(text = emoji, fontSize = 22.sp)
    }
}
```

(L'appel existant dans `EmojiQuickStrip` passe désormais `isHighlighted` et `onBounds` ; l'appelant chat n'est pas touché.)

- [ ] **Step 2: Compiler le module et les consommateurs**

Run: `./gradlew :sdk-ui:compileDebugKotlin :feature:chat:compileDebugKotlin`
Expected: BUILD SUCCESSFUL (l'appel chat `ChatScreen.kt:1953` compile inchangé grâce aux valeurs par défaut)

- [ ] **Step 3: Commit**

```bash
git add sdk-ui/src/main/kotlin/me/meeshy/ui/component/EmojiPicker.kt
git commit -m 'feat(android/sdk-ui): EmojiQuickStrip scrubbable (survol + bounds, parametres opaques)'
```

---

### Task 6: `LanguageQuickStrip` (sdk-ui, nouveau composant)

**Files:**
- Create: `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/LanguageQuickStrip.kt`
- Modify: `apps/android/sdk-ui/src/main/res/values/strings.xml` (+ `values-fr/`, `values-es/`, `values-pt/`) — string `language_strip_select` (« Read in %1$s » / « Lire en %1$s » / « Leer en %1$s » / « Ler em %1$s »)

**Interfaces:**
- Consumes: `MeeshyMotion.bouncySpring()`, `MeeshyTheme.tokens`, `MeeshyRadius.pill`.
- Produces: `LanguageQuickStrip(options: List<LanguageQuickOption>, onSelect: (LanguageQuickOption) -> Unit, modifier, activeCode: String?, highlightedIndex: Int?, onTileBounds: ((Int, Rect) -> Unit)?)` + `data class LanguageQuickOption(code: String, flag: String, label: String)`. Consommé par Task 8 (mappé depuis `StoryLanguageOption`). Pas de bouton « + » (spec : hors périmètre v1).

- [ ] **Step 1: Write the component**

```kotlin
package me.meeshy.ui.component

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.ui.R
import me.meeshy.ui.theme.MeeshyMotion
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** One flag chip of the scrubbable language bar. Pure data, opaque to the SDK. */
@Immutable
data class LanguageQuickOption(
    val code: String,
    val flag: String,
    val label: String,
)

/**
 * Horizontal flag strip — Android port of the iOS `StoryLanguageQuickBar`
 * pill, sharing the scrub contract of [EmojiQuickStrip]: the caller drives
 * [highlightedIndex] (hovered chip, scaled ×1.35 with the brand bouncy
 * spring) and collects chip bounds via [onTileBounds] for its own
 * hit-testing. The active chip (currently displayed language) reads at full
 * opacity with an accent underline; others are dimmed. The pill is a
 * background shape (never a clip) so a hovered chip can overflow it.
 */
@Composable
fun LanguageQuickStrip(
    options: List<LanguageQuickOption>,
    onSelect: (LanguageQuickOption) -> Unit,
    modifier: Modifier = Modifier,
    activeCode: String? = null,
    highlightedIndex: Int? = null,
    onTileBounds: ((Int, Rect) -> Unit)? = null,
) {
    Row(
        modifier = modifier
            .background(MeeshyTheme.tokens.backgroundSecondary, RoundedCornerShape(MeeshyRadius.pill))
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        options.forEachIndexed { index, option ->
            LanguageChipTile(
                option = option,
                isActive = isActiveCode(option.code, activeCode),
                isHighlighted = highlightedIndex == index,
                onClick = { onSelect(option) },
                onBounds = onTileBounds?.let { report -> { rect -> report(index, rect) } },
            )
        }
    }
}

@Composable
private fun LanguageChipTile(
    option: LanguageQuickOption,
    isActive: Boolean,
    isHighlighted: Boolean,
    onClick: () -> Unit,
    onBounds: ((Rect) -> Unit)?,
) {
    val selectLabel = stringResource(R.string.language_strip_select, option.label)
    val scale by animateFloatAsState(
        targetValue = if (isHighlighted) 1.35f else 1f,
        animationSpec = MeeshyMotion.bouncySpring(),
        label = "languageChipScale",
    )
    Box(
        modifier = Modifier
            .size(36.dp)
            .let { base ->
                if (onBounds != null) base.onGloballyPositioned { onBounds(it.boundsInRoot()) } else base
            }
            .graphicsLayer {
                scaleX = scale
                scaleY = scale
                alpha = if (isActive || isHighlighted) 1f else 0.55f
            }
            .clip(CircleShape)
            .clickable(onClick = onClick)
            .semantics { contentDescription = selectLabel },
        contentAlignment = Alignment.Center,
    ) {
        Text(text = option.flag, fontSize = 22.sp)
        if (isActive) {
            Box(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(bottom = 2.dp)
                    .size(width = 14.dp, height = 2.dp)
                    .clip(CircleShape)
                    .background(MeeshyPalette.Indigo400),
            )
        }
    }
}

/**
 * A chip is active when its language is the one currently displayed —
 * case-insensitive, matched on the BCP-47 base (`pt-BR` ↔ `pt`) so regional
 * variants stay highlighted. Mirror of iOS `StoryLanguageQuickBar.isActive`.
 */
internal fun isActiveCode(code: String, active: String?): Boolean {
    if (active == null) return false
    val lhs = code.lowercase()
    val rhs = active.lowercase()
    if (lhs == rhs) return true
    val lhsBase = lhs.substringBefore('-')
    val rhsBase = rhs.substringBefore('-')
    return lhsBase.isNotEmpty() && lhsBase == rhsBase
}
```

- [ ] **Step 2: Test JVM de `isActiveCode`** — Create `apps/android/sdk-ui/src/test/kotlin/me/meeshy/ui/component/LanguageQuickStripTest.kt` (créer l'arborescence si le module n'a pas encore de `src/test`) :

```kotlin
package me.meeshy.ui.component

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class LanguageQuickStripTest {

    @Test
    fun `exact code matches`() {
        assertThat(isActiveCode("fr", "fr")).isTrue()
    }

    @Test
    fun `match is case-insensitive`() {
        assertThat(isActiveCode("FR", "fr")).isTrue()
    }

    @Test
    fun `regional variant matches its base`() {
        assertThat(isActiveCode("pt-BR", "pt")).isTrue()
        assertThat(isActiveCode("pt", "pt-BR")).isTrue()
    }

    @Test
    fun `different languages do not match`() {
        assertThat(isActiveCode("fr", "es")).isFalse()
    }

    @Test
    fun `no active language matches nothing`() {
        assertThat(isActiveCode("fr", null)).isFalse()
    }
}
```

Si `:sdk-ui:testDebugUnitTest` échoue faute de dépendances de test (Truth/JUnit absentes du build.gradle du module), les ajouter au `apps/android/sdk-ui/build.gradle.kts` sur le modèle de `feature/stories` (`testImplementation` JUnit + Truth).

- [ ] **Step 3: Run**

Run: `./gradlew :sdk-ui:testDebugUnitTest --tests '*LanguageQuickStripTest*' :sdk-ui:compileDebugKotlin`
Expected: PASS + BUILD SUCCESSFUL

- [ ] **Step 4: Commit**

```bash
git add sdk-ui/src/main/kotlin/me/meeshy/ui/component/LanguageQuickStrip.kt sdk-ui/src/test sdk-ui/src/main/res sdk-ui/build.gradle.kts
git commit -m 'feat(android/sdk-ui): LanguageQuickStrip scrubbable (chips drapeau, actif souligne)'
```

---

### Task 7: `StoryActionRail` (composable rail + gestes + strings)

**Files:**
- Create: `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryActionRail.kt`
- Modify: `apps/android/feature/stories/src/main/res/values/strings.xml` (+ `values-fr/`, `values-es/`, `values-pt/`)

**Interfaces:**
- Consumes: `StoryRailPlan` (Task 2), `MeeshyMotion.bouncySpring()`.
- Produces (consommé par Task 8):
  - `enum class StoryScrubKind { Reactions, Languages }`
  - `sealed interface StoryScrubEvent { data class Started(val kind: StoryScrubKind, val rootPosition: Offset); data class Moved(val rootPosition: Offset); data object Ended; data object Cancelled }`
  - `StoryActionRail(plan, reactionCount, hasReacted, languageBadgeCode, heartBouncePulse, onTapHeart, onTapLanguage, onScrubEvent, onHeartBounds, onLanguageBounds, modifier)`

- [ ] **Step 1: Strings** — ajouter dans `feature/stories/src/main/res/values/strings.xml` :

```xml
    <string name="stories_action_react">React</string>
    <string name="stories_action_translations">Translations</string>
```

`values-fr/` : `Réagir` / `Traductions` — `values-es/` : `Reaccionar` / `Traducciones` — `values-pt/` : `Reagir` / `Traduções`.

- [ ] **Step 2: Write the component**

```kotlin
package me.meeshy.app.stories

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Translate
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import me.meeshy.feature.stories.R
import me.meeshy.ui.theme.MeeshyMotion
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing

/** Which scrubbable bar a rail longpress opens. */
enum class StoryScrubKind { Reactions, Languages }

/** Raw scrub gesture stream from a rail button, in ROOT coordinates. */
sealed interface StoryScrubEvent {
    data class Started(val kind: StoryScrubKind, val rootPosition: Offset) : StoryScrubEvent
    data class Moved(val rootPosition: Offset) : StoryScrubEvent
    data object Ended : StoryScrubEvent
    data object Cancelled : StoryScrubEvent
}

/**
 * Right-side action rail of the story viewer — Android mirror of the iOS
 * `StoryActionSidebarView` for the react + language buttons. Each button
 * carries two gesture layers: a plain tap (instant ❤️ / language-bar toggle)
 * and a longpress-then-drag that streams [StoryScrubEvent]s to the screen,
 * which owns the bars, the hit-testing and the flight animation.
 */
@Composable
fun StoryActionRail(
    plan: StoryRailPlan,
    reactionCount: Int,
    hasReacted: Boolean,
    languageBadgeCode: String?,
    heartBouncePulse: Int,
    onTapHeart: () -> Unit,
    onTapLanguage: () -> Unit,
    onScrubEvent: (StoryScrubEvent) -> Unit,
    onHeartBounds: (Rect) -> Unit,
    onLanguageBounds: (Rect) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        if (plan.showsReact) {
            var bounceTarget by remember { mutableStateOf(1f) }
            LaunchedEffect(heartBouncePulse) {
                if (heartBouncePulse == 0) return@LaunchedEffect
                bounceTarget = 1.35f
                delay(160)
                bounceTarget = 1f
            }
            val heartScale by animateFloatAsState(
                targetValue = bounceTarget,
                animationSpec = MeeshyMotion.bouncySpring(),
                label = "heartScale",
            )
            RailButton(
                icon = Icons.Filled.Favorite,
                label = if (reactionCount > 0) reactionCount.toString()
                else stringResource(R.string.stories_action_react),
                tint = if (hasReacted) MeeshyPalette.Indigo400 else MeeshyPalette.White,
                scale = heartScale,
                onTap = onTapHeart,
                scrubKind = StoryScrubKind.Reactions,
                onScrubEvent = onScrubEvent,
                onBounds = onHeartBounds,
            )
        }
        if (plan.showsLanguage) {
            Box {
                RailButton(
                    icon = Icons.Filled.Translate,
                    label = stringResource(R.string.stories_action_translations),
                    tint = MeeshyPalette.White,
                    scale = 1f,
                    onTap = onTapLanguage,
                    scrubKind = StoryScrubKind.Languages,
                    onScrubEvent = onScrubEvent,
                    onBounds = onLanguageBounds,
                )
                if (!languageBadgeCode.isNullOrBlank()) {
                    Text(
                        text = languageBadgeCode.uppercase(),
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        color = MeeshyPalette.White,
                        modifier = Modifier
                            .align(Alignment.TopStart)
                            .clip(CircleShape)
                            .background(MeeshyPalette.Indigo500)
                            .padding(horizontal = 5.dp, vertical = 1.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun RailButton(
    icon: ImageVector,
    label: String,
    tint: Color,
    scale: Float,
    onTap: () -> Unit,
    scrubKind: StoryScrubKind,
    onScrubEvent: (StoryScrubEvent) -> Unit,
    onBounds: (Rect) -> Unit,
) {
    var coords by remember { mutableStateOf<LayoutCoordinates?>(null) }
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Box(
            modifier = Modifier
                .size(46.dp)
                .onGloballyPositioned {
                    coords = it
                    onBounds(it.boundsInRoot())
                }
                .graphicsLayer { scaleX = scale; scaleY = scale }
                .clip(CircleShape)
                .background(Color.Black.copy(alpha = 0.35f))
                .pointerInput(Unit) {
                    detectTapGestures { onTap() }
                }
                .pointerInput(scrubKind) {
                    detectDragGesturesAfterLongPress(
                        onDragStart = { offset ->
                            val root = coords?.localToRoot(offset) ?: offset
                            onScrubEvent(StoryScrubEvent.Started(scrubKind, root))
                        },
                        onDrag = { change, _ ->
                            change.consume()
                            val root = coords?.localToRoot(change.position) ?: change.position
                            onScrubEvent(StoryScrubEvent.Moved(root))
                        },
                        onDragEnd = { onScrubEvent(StoryScrubEvent.Ended) },
                        onDragCancel = { onScrubEvent(StoryScrubEvent.Cancelled) },
                    )
                }
                .semantics { contentDescription = label },
            contentAlignment = Alignment.Center,
        ) {
            Icon(imageVector = icon, contentDescription = null, tint = tint, modifier = Modifier.size(22.dp))
        }
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = MeeshyPalette.White,
        )
    }
}
```

(import supplémentaire : `androidx.compose.ui.semantics.contentDescription` / `androidx.compose.ui.semantics.semantics`)

- [ ] **Step 3: Compile**

Run: `./gradlew :feature:stories:compileDebugKotlin`
Expected: BUILD SUCCESSFUL

- [ ] **Step 4: Commit**

```bash
git add feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryActionRail.kt feature/stories/src/main/res
git commit -m 'feat(android/stories): rail lateral coeur+langue avec tap et flux de scrub longpress'
```

---

### Task 8: Intégration `StoryViewerScreen` — barres, scrub, vol, blocage swipe

**Files:**
- Modify: `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewerScreen.kt`

**Interfaces:**
- Consumes: TOUT ce qui précède — `ScrubHitResolver`, `ScrubRelease`, `StoryRailPlan`, `StoryActionRail`, `StoryScrubEvent`, `StoryScrubKind`, `EmojiQuickStrip(highlightedIndex, onTileBounds)`, `LanguageQuickStrip`, `LanguageQuickOption`, `EmojiFullPicker`, `viewModel.react`, `viewModel.toggleLanguageOverride`, `state.availableLanguages`, `state.languageOverride`, `slide.languageCode`.

- [ ] **Step 1: Supprimer la strip permanente** — retirer le bloc d'appel `ReactionStrip(...)` (lignes 342-353) et le composable privé `ReactionStrip` (lignes 383-427).

- [ ] **Step 2: Ajouter l'état scrub et le handler dans `StoryViewerScreen`** (après les `var show*` existants) :

```kotlin
    val haptics = LocalHapticFeedback.current
    val density = LocalDensity.current
    var scrubKind by remember { mutableStateOf<StoryScrubKind?>(null) }
    var reactionBarVisible by remember { mutableStateOf(false) }
    var languageBarVisible by remember { mutableStateOf(false) }
    var hoveredIndex by remember { mutableStateOf<Int?>(null) }
    val reactionTileBounds = remember { mutableStateMapOf<Int, Rect>() }
    val languageTileBounds = remember { mutableStateMapOf<Int, Rect>() }
    var heartBounds by remember { mutableStateOf<Rect?>(null) }
    var languageButtonBounds by remember { mutableStateOf<Rect?>(null) }
    var showFullEmojiPicker by remember { mutableStateOf(false) }
    var reactionFlight by remember { mutableStateOf<ReactionFlight?>(null) }
    var heartBouncePulse by remember { mutableIntStateOf(0) }
    val railOverlayActive = reactionBarVisible || languageBarVisible || scrubKind != null
```

et les fonctions locales :

```kotlin
    fun closeRailBars() {
        reactionBarVisible = false
        languageBarVisible = false
        hoveredIndex = null
    }

    fun sendReaction(emoji: String, from: Rect?) {
        haptics.performHapticFeedback(HapticFeedbackType.LongPress)
        viewModel.react(emoji)
        closeRailBars()
        val target = heartBounds
        if (from != null && target != null) {
            reactionFlight = ReactionFlight(emoji = emoji, from = from)
        } else {
            heartBouncePulse++
        }
    }

    fun handleScrub(event: StoryScrubEvent) {
        when (event) {
            is StoryScrubEvent.Started -> {
                haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                scrubKind = event.kind
                when (event.kind) {
                    StoryScrubKind.Reactions -> reactionBarVisible = true
                    StoryScrubKind.Languages -> languageBarVisible = true
                }
                hoveredIndex = null
            }
            is StoryScrubEvent.Moved -> {
                val bounds = when (scrubKind) {
                    StoryScrubKind.Reactions -> reactionTileBounds
                    StoryScrubKind.Languages -> languageTileBounds
                    null -> return
                }
                val tolerance = with(density) { 16.dp.toPx() }
                val next = ScrubHitResolver.hoveredIndex(bounds, event.rootPosition, tolerance)
                if (next != hoveredIndex) {
                    haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                }
                hoveredIndex = next
            }
            StoryScrubEvent.Ended -> {
                val kind = scrubKind
                val hovered = hoveredIndex
                scrubKind = null
                hoveredIndex = null
                when (kind) {
                    StoryScrubKind.Reactions -> when (
                        val release = ScrubHitResolver.release(hovered, state.quickReactions)
                    ) {
                        is ScrubRelease.React ->
                            sendReaction(release.emoji, from = reactionTileBounds[hovered])
                        ScrubRelease.Expand -> {
                            closeRailBars()
                            showFullEmojiPicker = true
                        }
                        ScrubRelease.KeepOpen -> Unit
                    }
                    StoryScrubKind.Languages -> {
                        val options = state.availableLanguages
                        if (hovered != null && hovered in options.indices) {
                            haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                            viewModel.toggleLanguageOverride(options[hovered].code)
                            closeRailBars()
                        }
                    }
                    null -> Unit
                }
            }
            StoryScrubEvent.Cancelled -> {
                scrubKind = null
                closeRailBars()
            }
        }
    }
```

avec en fin de fichier :

```kotlin
/** A reaction emoji flying from its (scaled) bar tile to the heart button. */
private data class ReactionFlight(val emoji: String, val from: Rect)
```

Imports à ajouter : `androidx.compose.animation.AnimatedVisibility`, `androidx.compose.animation.fadeIn/fadeOut/scaleIn/scaleOut`, `androidx.compose.animation.core.FastOutSlowInEasing`, `androidx.compose.runtime.mutableIntStateOf`, `androidx.compose.runtime.mutableStateMapOf`, `androidx.compose.ui.geometry.Rect`, `androidx.compose.ui.graphics.graphicsLayer`, `androidx.compose.ui.hapticfeedback.HapticFeedbackType`, `androidx.compose.ui.layout.onSizeChanged`, `androidx.compose.ui.platform.LocalDensity`, `androidx.compose.ui.platform.LocalHapticFeedback`, `androidx.compose.ui.unit.IntOffset`, `androidx.compose.ui.unit.sp`, `androidx.compose.material3.ModalBottomSheet`, `me.meeshy.ui.component.EmojiQuickStrip`, `me.meeshy.ui.component.EmojiFullPicker`, `me.meeshy.ui.component.LanguageQuickStrip`, `me.meeshy.ui.component.LanguageQuickOption`, `kotlin.math.roundToInt`.

- [ ] **Step 3: Neutraliser tap/swipe racine pendant l'overlay + pause auto-advance**

Le `LaunchedEffect` d'auto-advance (lignes 158-175) : ajouter `railOverlayActive` à SES CLÉS et à sa garde :

```kotlin
    androidx.compose.runtime.LaunchedEffect(
        state.groupIndex,
        state.index,
        state.slides.size,
        state.canAutoAdvance,
        showViewers,
        showComments,
        railOverlayActive,
    ) {
        if (state.slides.isEmpty() || state.isDismissed || showViewers || showComments || railOverlayActive) return@LaunchedEffect
        ...
```

Les deux `pointerInput` racine : capturer l'état via `rememberUpdatedState` (déclaré AVANT le `Box`) :

```kotlin
    val overlayActiveState = rememberUpdatedState(railOverlayActive)
```

- tap racine (lignes 181-189) :

```kotlin
                detectTapGestures { offset ->
                    if (overlayActiveState.value) {
                        closeRailBars()
                        return@detectTapGestures
                    }
                    if (offset.x < size.width / 2f) {
                        viewModel.back()
                    } else {
                        viewModel.advance()
                    }
                }
```

- drag racine (lignes 190-213) — dans `onDragEnd`, court-circuiter :

```kotlin
                    onDragEnd = {
                        if (overlayActiveState.value) return@detectDragGestures
                        viewModel.onSwipe(...)
                    },
```

(le drag démarré SUR un bouton du rail est de toute façon consommé par le rail — ceci est la ceinture de sécurité exigée par la spec)
Import : `androidx.compose.runtime.rememberUpdatedState`.

- [ ] **Step 4: Monter le rail + les barres + le vol dans le `Box` racine** (à la place de l'ancien bloc ReactionStrip) :

```kotlin
        val languageBadge = slide?.languageCode ?: state.languageOverride
        if (slide != null && !state.isDismissed) {
            StoryActionRail(
                plan = StoryRailPlan.resolve(
                    isOwnStory = state.isOwnStory,
                    hasTranslatableContent = state.availableLanguages.isNotEmpty(),
                ),
                reactionCount = state.reactionCount,
                hasReacted = state.myReactions.isNotEmpty(),
                languageBadgeCode = languageBadge,
                heartBouncePulse = heartBouncePulse,
                onTapHeart = { sendReaction("❤️", from = heartBounds) },
                onTapLanguage = { languageBarVisible = !languageBarVisible },
                onScrubEvent = ::handleScrub,
                onHeartBounds = { heartBounds = it },
                onLanguageBounds = { languageButtonBounds = it },
                modifier = Modifier
                    .align(Alignment.CenterEnd)
                    .padding(end = MeeshySpacing.sm),
            )
        }

        RailAnchoredBar(
            visible = reactionBarVisible || scrubKind == StoryScrubKind.Reactions,
            anchor = heartBounds,
        ) {
            EmojiQuickStrip(
                emojis = state.quickReactions,
                onReact = { emoji ->
                    sendReaction(
                        emoji,
                        from = reactionTileBounds[state.quickReactions.indexOf(emoji)],
                    )
                },
                ownReactions = state.myReactions,
                onExpand = {
                    closeRailBars()
                    showFullEmojiPicker = true
                },
                highlightedIndex = if (scrubKind == StoryScrubKind.Reactions) hoveredIndex else null,
                onTileBounds = { index, rect -> reactionTileBounds[index] = rect },
            )
        }

        RailAnchoredBar(
            visible = languageBarVisible || scrubKind == StoryScrubKind.Languages,
            anchor = languageButtonBounds,
        ) {
            LanguageQuickStrip(
                options = state.availableLanguages.map {
                    LanguageQuickOption(code = it.code, flag = it.flag, label = it.label)
                },
                onSelect = { option ->
                    viewModel.toggleLanguageOverride(option.code)
                    closeRailBars()
                },
                activeCode = languageBadge,
                highlightedIndex = if (scrubKind == StoryScrubKind.Languages) hoveredIndex else null,
                onTileBounds = { index, rect -> languageTileBounds[index] = rect },
            )
        }

        val flight = reactionFlight
        val flightTarget = heartBounds
        if (flight != null && flightTarget != null) {
            ReactionFlightOverlay(
                flight = flight,
                target = flightTarget,
                onArrived = { heartBouncePulse++ },
                onFinished = { reactionFlight = null },
            )
        }
```

et après le `Box` racine, la sheet du picker complet :

```kotlin
    if (showFullEmojiPicker) {
        ModalBottomSheet(onDismissRequest = { showFullEmojiPicker = false }) {
            EmojiFullPicker(
                onSelect = { emoji ->
                    showFullEmojiPicker = false
                    sendReaction(emoji, from = null)
                },
            )
        }
    }
```

- [ ] **Step 5: Composables privés `RailAnchoredBar` et `ReactionFlightOverlay`** (en fin de fichier) :

```kotlin
/**
 * Positions a scrubbable bar to the LEFT of its rail button, vertically
 * centred on it — the Android mirror of the iOS `.overlay(alignment:
 * .trailing) + .offset(x: -56)` anchoring. Enters/leaves with a fast
 * (~120 ms) fade+scale so a selected reaction clears the bar before the
 * flight animation starts (spec: bar must vanish quickly).
 */
@Composable
private fun BoxScope.RailAnchoredBar(
    visible: Boolean,
    anchor: Rect?,
    content: @Composable () -> Unit,
) {
    var barHeight by remember { mutableIntStateOf(0) }
    AnimatedVisibility(
        visible = visible,
        enter = fadeIn(tween(120)) + scaleIn(initialScale = 0.8f, animationSpec = tween(120)),
        exit = fadeOut(tween(120)) + scaleOut(targetScale = 0.8f, animationSpec = tween(120)),
        modifier = Modifier
            .align(Alignment.TopEnd)
            .padding(end = 76.dp)
            .offset {
                val centerY = anchor?.center?.y ?: 0f
                IntOffset(x = 0, y = (centerY - barHeight / 2f).roundToInt().coerceAtLeast(0))
            }
            .onSizeChanged { barHeight = it.height },
    ) {
        content()
    }
}

/**
 * The chosen emoji flying from its scaled bar tile to the heart button:
 * position tween ~450 ms while shrinking 1.35 -> 0.5; on arrival the heart
 * bounces (bouncy spring, via [onArrived] -> heartBouncePulse) and the
 * overlay clears ~300 ms later. Total stays under the 1 s budget.
 */
@Composable
private fun ReactionFlightOverlay(
    flight: ReactionFlight,
    target: Rect,
    onArrived: () -> Unit,
    onFinished: () -> Unit,
) {
    val progress = remember(flight) { Animatable(0f) }
    LaunchedEffect(flight) {
        progress.animateTo(1f, tween(durationMillis = 450, easing = FastOutSlowInEasing))
        onArrived()
        delay(300)
        onFinished()
    }
    val from = flight.from.center
    val to = target.center
    val emojiSize = 36.dp
    Text(
        text = flight.emoji,
        fontSize = 22.sp,
        modifier = Modifier
            .offset {
                val t = progress.value
                val x = from.x + (to.x - from.x) * t
                val y = from.y + (to.y - from.y) * t
                val half = (emojiSize.toPx() / 2f)
                IntOffset((x - half).roundToInt(), (y - half).roundToInt())
            }
            .size(emojiSize)
            .graphicsLayer {
                val scale = 1.35f + (0.5f - 1.35f) * progress.value
                scaleX = scale
                scaleY = scale
            }
            .wrapContentSize(Alignment.Center),
    )
}
```

Imports supplémentaires : `androidx.compose.foundation.layout.BoxScope`, `androidx.compose.foundation.layout.offset`, `androidx.compose.foundation.layout.wrapContentSize`, `kotlinx.coroutines.delay`.

- [ ] **Step 6: Compile + toute la suite stories**

Run: `./gradlew :feature:stories:compileDebugKotlin :feature:stories:testDebugUnitTest`
Expected: BUILD SUCCESSFUL, tests PASS

- [ ] **Step 7: Commit**

```bash
git add feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryViewerScreen.kt
git commit -m 'feat(android/stories): scrub de reactions/langues au longpress + vol vers le coeur, strip du bas retiree'
```

---

### Task 9: Gate final Android

- [ ] **Step 1: Suite complète des modules touchés**

Run: `./gradlew :feature:stories:testDebugUnitTest :sdk-ui:testDebugUnitTest :app:assembleDebug`
Expected: tests PASS, APK BUILD SUCCESSFUL

- [ ] **Step 2 (optionnel si émulateur dispo): vérification visuelle**

Run: `../../apps/android/meeshy.sh run` (compte `atabeth`, creds `apps/ios/fastlane/.env`) — ouvrir une story d'un autre utilisateur, vérifier : longpress cœur → barre + drag → grossissement/rebond → relâchement → vol ≤ 1 s → bump du cœur ; swipe horizontal inerte pendant le geste ; tap cœur → ❤️ + pop ; longpress langue → drapeaux → sélection → texte re-résolu + badge.

- [ ] **Step 3: Commit final si des retouches ont eu lieu, sinon rien**
