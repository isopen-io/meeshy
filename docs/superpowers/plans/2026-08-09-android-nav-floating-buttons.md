# Navigation Android : deux boutons flottants + compatibilité Oreo → Android 17

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Donner à Android les deux boutons flottants déplaçables d'iOS (Flux / Menu), en montant la configuration SDK à `compileSdk 37` / `targetSdk 36` sans perdre le plancher Oreo, et en cessant de présenter une session expirée comme une panne réseau.

**Architecture:** Les boutons quittent le slot `Scaffold(floatingActionButton=)` — qui positionne lui-même son contenu — pour être posés dans le `Box` au-dessus du `NavHost`, avec un `offset` piloté par une position normalisée (0–1) persistée en DataStore. La logique de position vit dans une unité pure testable sans UI ; les différences d'API entre Oreo et Android 17 passent par un package `compatibility/` calqué sur le pattern iOS `Adaptive*`.

**Tech Stack:** Kotlin 2.0.21, Jetpack Compose (BOM 2024.10.01), Hilt, DataStore Preferences 1.1.1, AGP 8.13 / Gradle 8.13, JUnit + Robolectric.

## Global Constraints

- `minSdk = 26` (Android 8.0 Oreo) — **ne jamais relever**.
- `compileSdk = 37`, `targetSdk = 36`. Ne pas passer `targetSdk` à 37 (hors périmètre).
- AGP **8.13** (dernière 8.x), Gradle **8.13**. **Ne pas** migrer vers AGP 9.x / Gradle 9.5.
- JDK 17 (`jvmTarget = "17"`), inchangé.
- Aucun appelant ne porte de test de version : tout `Build.VERSION.SDK_INT` vit dans `compatibility/`.
- Ne créer un helper de compat que si l'API récente **n'existe pas** en API 26. Sinon, appel direct.
- Pureté SDK : `sdk-ui` reçoit des paramètres opaques ; les décisions « quel bouton → quelle route » restent dans `app/`.
- TDD strict : test en échec d'abord, puis code minimal.
- Messages de commit en français, **sans** trailer `Co-Authored-By`.
- Ne jamais utiliser `git stash` nu (worktrees partagés) ni `git commit --amend`.

---

## File Structure

| Fichier | Responsabilité |
|---|---|
| `apps/android/gradle/libs.versions.toml` | Versions AGP |
| `apps/android/gradle/wrapper/gradle-wrapper.properties` | Version Gradle |
| `apps/android/app/build.gradle.kts` | `compileSdk` / `targetSdk` |
| `apps/android/sdk-ui/.../compatibility/AdaptiveEdgeToEdge.kt` | Edge-to-edge selon la version |
| `apps/android/sdk-ui/.../chrome/FloatingButtonPosition.kt` | Unité **pure** : normalisation, aimantation, bornage |
| `apps/android/sdk-core/.../chrome/FloatingButtonPositionStore.kt` | Interface + impl mémoire + impl DataStore + codec |
| `apps/android/sdk-core/.../di/SdkModule.kt` | `@Provides` du store |
| `apps/android/sdk-ui/.../chrome/MeeshyFloatingButtons.kt` | Composable des deux boutons |
| `apps/android/app/.../navigation/MeeshyApp.kt` | Câblage routes, sortie du slot Scaffold |
| `apps/android/sdk-core/.../network/AuthExpiryInterceptor.kt` | Détection 401/403 → session expirée |

---

### Task 1 : Montée de la toolchain et du SDK

**Files:**
- Modify: `apps/android/gradle/libs.versions.toml` (ligne `agp = "8.7.3"`)
- Modify: `apps/android/gradle/wrapper/gradle-wrapper.properties` (`distributionUrl`)
- Modify: `apps/android/app/build.gradle.kts:11` (`compileSdk`) et `:16` (`targetSdk`)

**Interfaces:**
- Consumes: rien.
- Produces: un projet qui compile en `compileSdk 37` / `targetSdk 36`. Toutes les tâches suivantes en dépendent.

- [ ] **Step 1 : Installer les paquets SDK manquants**

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
~/android-sdk/cmdline-tools/latest/bin/sdkmanager \
  "platforms;android-36" "platforms;android-37.0" "build-tools;37.0.0"
```

- [ ] **Step 2 : Vérifier l'état AVANT de modifier (build de référence)**

```bash
cd apps/android && ./meeshy.sh build
```
Attendu : `BUILD SUCCESSFUL`. Si ça échoue déjà, s'arrêter et le signaler — ne pas empiler une montée de version sur un build cassé.

- [ ] **Step 3 : Passer AGP à 8.13**

Dans `apps/android/gradle/libs.versions.toml`, remplacer `agp = "8.7.3"` par :

```toml
agp = "8.13.0"
```

- [ ] **Step 4 : Passer Gradle à 8.13**

Dans `apps/android/gradle/wrapper/gradle-wrapper.properties` :

```properties
distributionUrl=https\://services.gradle.org/distributions/gradle-8.13-bin.zip
```

- [ ] **Step 5 : Passer compileSdk/targetSdk**

Dans `apps/android/app/build.gradle.kts` : `compileSdk = 37` (ligne 11) et `targetSdk = 36` (ligne 16). **Laisser `minSdk = 26` intact.**

Appliquer le même `compileSdk = 37` à **tous** les modules qui déclarent un bloc `android { }` :

```bash
grep -rln 'compileSdk' apps/android --include="build.gradle.kts"
```

- [ ] **Step 6 : Compiler**

```bash
cd apps/android && ./meeshy.sh build
```
Attendu : `BUILD SUCCESSFUL`. En cas d'échec sur une API dépréciée, **ne pas** la faire taire : noter le site, il relèvera de la Task 2.

- [ ] **Step 7 : Lancer les tests**

```bash
cd apps/android && ./meeshy.sh test
```
Attendu : suite verte. Toute rupture ici vient de la montée de version, pas du code produit.

- [ ] **Step 8 : Créer l'AVD API 36 (l'AVD API 35 est CONSERVÉ)**

```bash
~/android-sdk/cmdline-tools/latest/bin/sdkmanager "system-images;android-36;google_apis;arm64-v8a"
~/android-sdk/cmdline-tools/latest/bin/avdmanager create avd -n meeshy_pixel8_api36 \
  -d pixel_8 -k "system-images;android-36;google_apis;arm64-v8a"
```

- [ ] **Step 9 : Commit**

```bash
git add apps/android/gradle apps/android/app/build.gradle.kts
git commit -m "build(android): compileSdk 37, targetSdk 36, AGP 8.13, Gradle 8.13

Google Play exige targetSdk 36 pour toute mise a jour a partir du
31 aout 2026. compileSdk 37 donne acces aux API d'Android 17 sans
activer ses changements de comportement. minSdk 26 inchange."
```

---

### Task 2 : Couche de compatibilité et edge-to-edge

`targetSdk 36` rend l'edge-to-edge obligatoire : le contenu passe sous les barres système. Sans traitement, les boutons flottants se retrouveraient sous la barre de gestes.

**Files:**
- Create: `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/compatibility/AdaptiveEdgeToEdge.kt`
- Test: `apps/android/sdk-ui/src/test/kotlin/me/meeshy/ui/compatibility/AdaptiveEdgeToEdgeTest.kt`

**Interfaces:**
- Consumes: Task 1.
- Produces: `fun systemGestureInsetsCompat(): PaddingValues` et `object MeeshyApiLevel { fun supportsDynamicColor(sdkInt: Int): Boolean }` — consommés par les Tasks 5 et 6.

- [ ] **Step 1 : Écrire le test en échec**

```kotlin
package me.meeshy.ui.compatibility

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AdaptiveEdgeToEdgeTest {

    @Test
    fun `dynamic color is unavailable below API 31`() {
        assertFalse(MeeshyApiLevel.supportsDynamicColor(26))
        assertFalse(MeeshyApiLevel.supportsDynamicColor(30))
    }

    @Test
    fun `dynamic color is available from API 31 up to Android 17`() {
        assertTrue(MeeshyApiLevel.supportsDynamicColor(31))
        assertTrue(MeeshyApiLevel.supportsDynamicColor(36))
        assertTrue(MeeshyApiLevel.supportsDynamicColor(37))
    }
}
```

- [ ] **Step 2 : Lancer le test, vérifier qu'il échoue**

```bash
cd apps/android && ./meeshy.sh :sdk-ui:testDebugUnitTest --tests '*AdaptiveEdgeToEdgeTest*'
```
Attendu : ÉCHEC — `Unresolved reference: MeeshyApiLevel`.

- [ ] **Step 3 : Implémentation minimale**

```kotlin
package me.meeshy.ui.compatibility

import android.os.Build
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.systemBars
import androidx.compose.runtime.Composable

/**
 * Le SEUL endroit qui interroge le niveau d'API pour ces capacites.
 *
 * Pendant : `MeeshyUI/Compatibility/` cote iOS (helpers `Adaptive*`). La regle est
 * la meme : un appelant ne teste jamais la version lui-meme. Le parametre `sdkInt`
 * est explicite pour que la decision soit testable aux deux bornes du seuil, sans
 * emulateur.
 */
public object MeeshyApiLevel {

    /** Material You : couleurs dynamiques, absentes avant Android 12. */
    public fun supportsDynamicColor(sdkInt: Int = Build.VERSION.SDK_INT): Boolean =
        sdkInt >= Build.VERSION_CODES.S
}

/**
 * Les insets a respecter pour poser un element flottant.
 *
 * `targetSdk 36` impose l'edge-to-edge : le contenu passe SOUS les barres systeme.
 * Un bouton flottant place sans ces marges tomberait sous la barre de gestes, ou il
 * est materiellement inatteignable.
 */
@Composable
public fun systemGestureInsetsCompat(): PaddingValues =
    WindowInsets.systemBars.asPaddingValues()
```

- [ ] **Step 4 : Relancer le test**

```bash
cd apps/android && ./meeshy.sh :sdk-ui:testDebugUnitTest --tests '*AdaptiveEdgeToEdgeTest*'
```
Attendu : SUCCÈS.

- [ ] **Step 5 : Câbler `supportsDynamicColor`, ou le supprimer**

`systemGestureInsetsCompat` a un appelant dès la Task 5. `supportsDynamicColor` n'en a aucun pour l'instant, et la spec l'interdit explicitement : « ne créer un helper que si l'API récente n'existe pas au plancher », pas de shim décoratif.

Deux issues, au choix, mais **une des deux est obligatoire** :

1. Le câbler dans le thème s'il y a une couleur dynamique à activer :
   ```bash
   grep -rn "dynamicLightColorScheme\|dynamicDarkColorScheme\|dynamicColor" apps/android --include="*.kt"
   ```
   S'il existe un site qui teste la version en ligne, le remplacer par `MeeshyApiLevel.supportsDynamicColor()`.
2. Sinon, **supprimer `MeeshyApiLevel` et son test** de cette tâche, et ne garder que `systemGestureInsetsCompat`. Le package `compatibility/` reste créé et documenté ; il se remplira quand un vrai besoin de version-gating apparaîtra.

Ne pas laisser un helper sans appelant : c'est du code mort qui se fait passer pour de l'architecture.

- [ ] **Step 6 : Commit**

```bash
git add apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/compatibility apps/android/sdk-ui/src/test/kotlin/me/meeshy/ui/compatibility
git commit -m "feat(android/sdk-ui): couche compatibility, sur le modele des Adaptive* iOS

Un seul endroit interroge SDK_INT. Le seuil est teste des deux cotes
sans emulateur, le parametre sdkInt etant explicite."
```

---

### Task 3 : Unité pure de position

**Files:**
- Create: `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/chrome/FloatingButtonPosition.kt`
- Test: `apps/android/sdk-ui/src/test/kotlin/me/meeshy/ui/component/chrome/FloatingButtonPositionTest.kt`

**Interfaces:**
- Consumes: rien (unité pure, aucun import Compose).
- Produces: `data class FloatingButtonPosition(val x: Float, val y: Float)` avec `isLeft`, `isTop`, `companion { TOP_LEFT, TOP_RIGHT, BOTTOM_LEFT, BOTTOM_RIGHT, DEFAULT_LEFT, DEFAULT_RIGHT }` ; `fun snapToNearestEdge(position): FloatingButtonPosition` ; `fun clampToBounds(position): FloatingButtonPosition` ; `fun encodePosition(position): String` ; `fun decodePosition(raw: String?, fallback): FloatingButtonPosition`. Consommés par les Tasks 4 et 5.

- [ ] **Step 1 : Écrire le test en échec**

```kotlin
package me.meeshy.ui.component.chrome

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class FloatingButtonPositionTest {

    @Test
    fun `snaps to the nearest horizontal edge`() {
        assertEquals(0f, snapToNearestEdge(FloatingButtonPosition(0.3f, 0.5f)).x, 0.001f)
        assertEquals(1f, snapToNearestEdge(FloatingButtonPosition(0.7f, 0.5f)).x, 0.001f)
    }

    @Test
    fun `snapping preserves the vertical position`() {
        assertEquals(0.42f, snapToNearestEdge(FloatingButtonPosition(0.9f, 0.42f)).y, 0.001f)
    }

    @Test
    fun `clamps out-of-bounds values into 0-1`() {
        val clamped = clampToBounds(FloatingButtonPosition(-3f, 12f))
        assertEquals(0f, clamped.x, 0.001f)
        assertEquals(1f, clamped.y, 0.001f)
    }

    @Test
    fun `a decoded position round-trips through encoding`() {
        val original = FloatingButtonPosition(0.25f, 0.75f)
        assertEquals(original, decodePosition(encodePosition(original), FloatingButtonPosition.DEFAULT_LEFT))
    }

    // Une preference corrompue ne doit pas faire disparaitre le bouton principal
    // de navigation : elle degrade vers la position par defaut.
    @Test
    fun `a corrupt stored value degrades to the fallback`() {
        val fallback = FloatingButtonPosition.DEFAULT_RIGHT
        assertEquals(fallback, decodePosition("nawak", fallback))
        assertEquals(fallback, decodePosition(null, fallback))
        assertEquals(fallback, decodePosition("0.5", fallback))
        assertEquals(fallback, decodePosition("abc,def", fallback))
    }

    // Hors bornes en base = valeur ecrite par une version anterieure ou corrompue.
    @Test
    fun `a decoded out-of-bounds value is clamped, not rejected`() {
        assertEquals(
            FloatingButtonPosition(1f, 0f),
            decodePosition("5.0,-2.0", FloatingButtonPosition.DEFAULT_LEFT),
        )
    }

    @Test
    fun `isLeft and isTop split the screen at the midpoint`() {
        assertTrue(FloatingButtonPosition(0.2f, 0.2f).isLeft)
        assertTrue(FloatingButtonPosition(0.2f, 0.2f).isTop)
        assertTrue(!FloatingButtonPosition(0.8f, 0.8f).isLeft)
        assertTrue(!FloatingButtonPosition(0.8f, 0.8f).isTop)
    }
}
```

- [ ] **Step 2 : Lancer le test, vérifier qu'il échoue**

```bash
cd apps/android && ./meeshy.sh :sdk-ui:testDebugUnitTest --tests '*FloatingButtonPositionTest*'
```
Attendu : ÉCHEC — `Unresolved reference: FloatingButtonPosition`.

- [ ] **Step 3 : Implémentation minimale**

```kotlin
package me.meeshy.ui.component.chrome

/**
 * Position d'un bouton flottant, NORMALISEE dans [0,1] sur les deux axes.
 *
 * Normalisee et non en dp : la meme preference doit valoir pour un telephone, une
 * tablette et une rotation. Stocker des pixels ferait sortir le bouton de l'ecran
 * au premier changement de taille.
 *
 * Pendant iOS : `ButtonPosition` (MeeshyUI/Primitives/FloatingButtons.swift).
 */
public data class FloatingButtonPosition(val x: Float, val y: Float) {

    public val isLeft: Boolean get() = x < 0.5f
    public val isTop: Boolean get() = y < 0.5f

    public companion object {
        public val TOP_LEFT: FloatingButtonPosition = FloatingButtonPosition(0f, 0f)
        public val TOP_RIGHT: FloatingButtonPosition = FloatingButtonPosition(1f, 0f)
        public val BOTTOM_LEFT: FloatingButtonPosition = FloatingButtonPosition(0f, 1f)
        public val BOTTOM_RIGHT: FloatingButtonPosition = FloatingButtonPosition(1f, 1f)

        /** Defauts choisis pour refleter iOS : Flux a gauche, Menu a droite. */
        public val DEFAULT_LEFT: FloatingButtonPosition = FloatingButtonPosition(0f, 0.82f)
        public val DEFAULT_RIGHT: FloatingButtonPosition = FloatingButtonPosition(1f, 0.82f)
    }
}

/** Ramene [position] dans [0,1] sur les deux axes. */
public fun clampToBounds(position: FloatingButtonPosition): FloatingButtonPosition =
    FloatingButtonPosition(
        x = position.x.coerceIn(0f, 1f),
        y = position.y.coerceIn(0f, 1f),
    )

/**
 * Colle le bouton au bord vertical le plus proche, en gardant sa hauteur.
 *
 * Seul l'axe X est aimante : l'utilisateur choisit la HAUTEUR qui lui convient
 * (portee du pouce), le bord n'etant qu'un ancrage.
 */
public fun snapToNearestEdge(position: FloatingButtonPosition): FloatingButtonPosition {
    val bounded = clampToBounds(position)
    return FloatingButtonPosition(x = if (bounded.isLeft) 0f else 1f, y = bounded.y)
}

/** Encode pour DataStore. Format : `"x,y"`. */
public fun encodePosition(position: FloatingButtonPosition): String =
    "${position.x},${position.y}"

/**
 * Decode une valeur stockee. Ne leve JAMAIS : une preference illisible degrade vers
 * [fallback]. Un bouton de navigation qui disparait sur une donnee corrompue rendrait
 * l'application impilotable.
 */
public fun decodePosition(raw: String?, fallback: FloatingButtonPosition): FloatingButtonPosition {
    val parts = raw?.split(',') ?: return fallback
    if (parts.size != 2) return fallback
    val x = parts[0].toFloatOrNull() ?: return fallback
    val y = parts[1].toFloatOrNull() ?: return fallback
    if (x.isNaN() || y.isNaN()) return fallback
    return clampToBounds(FloatingButtonPosition(x, y))
}
```

- [ ] **Step 4 : Relancer le test**

```bash
cd apps/android && ./meeshy.sh :sdk-ui:testDebugUnitTest --tests '*FloatingButtonPositionTest*'
```
Attendu : SUCCÈS, 7 tests.

- [ ] **Step 5 : Commit**

```bash
git add apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/chrome/FloatingButtonPosition.kt apps/android/sdk-ui/src/test/kotlin/me/meeshy/ui/component/chrome/FloatingButtonPositionTest.kt
git commit -m "feat(android/sdk-ui): position normalisee des boutons flottants, unite pure

Normalisee 0-1 comme iOS : la meme preference vaut pour telephone,
tablette et rotation. Une valeur corrompue degrade vers le defaut au
lieu de faire disparaitre le bouton de navigation."
```

---

### Task 4 : Persistance des positions

**Files:**
- Create: `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/chrome/FloatingButtonPositionStore.kt`
- Modify: `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/di/SdkModule.kt` (ajouter un `@Provides`, à côté de `providesThemeStore`)
- Test: `apps/android/sdk-core/src/test/kotlin/me/meeshy/sdk/chrome/FloatingButtonPositionStoreTest.kt`

**Interfaces:**
- Consumes: `FloatingButtonPosition`, `encodePosition`, `decodePosition` (Task 3).
- Produces: `interface FloatingButtonPositionStore { val leftPosition: StateFlow<FloatingButtonPosition>; val rightPosition: StateFlow<FloatingButtonPosition>; suspend fun setLeftPosition(p); suspend fun setRightPosition(p) }` et `InMemoryFloatingButtonPositionStore`. Consommés par la Task 6.

- [ ] **Step 1 : Écrire le test en échec**

```kotlin
package me.meeshy.sdk.chrome

import kotlinx.coroutines.test.runTest
import me.meeshy.ui.component.chrome.FloatingButtonPosition
import org.junit.Assert.assertEquals
import org.junit.Test

class FloatingButtonPositionStoreTest {

    @Test
    fun `defaults mirror iOS - feed on the left, menu on the right`() = runTest {
        val store = InMemoryFloatingButtonPositionStore()
        assertEquals(FloatingButtonPosition.DEFAULT_LEFT, store.leftPosition.value)
        assertEquals(FloatingButtonPosition.DEFAULT_RIGHT, store.rightPosition.value)
    }

    @Test
    fun `a written position is read back`() = runTest {
        val store = InMemoryFloatingButtonPositionStore()
        val moved = FloatingButtonPosition(0f, 0.2f)
        store.setLeftPosition(moved)
        assertEquals(moved, store.leftPosition.value)
    }

    // Les deux boutons ont leur propre cle : deplacer l'un ne doit pas
    // repositionner l'autre.
    @Test
    fun `the two buttons hold independent positions`() = runTest {
        val store = InMemoryFloatingButtonPositionStore()
        store.setLeftPosition(FloatingButtonPosition(0f, 0.1f))
        assertEquals(FloatingButtonPosition.DEFAULT_RIGHT, store.rightPosition.value)
    }
}
```

- [ ] **Step 2 : Lancer le test, vérifier qu'il échoue**

```bash
cd apps/android && ./meeshy.sh :sdk-core:testDebugUnitTest --tests '*FloatingButtonPositionStoreTest*'
```
Attendu : ÉCHEC — `Unresolved reference: InMemoryFloatingButtonPositionStore`.

- [ ] **Step 3 : Implémentation minimale**

Calquer strictement `ThemeStore.kt` (interface + impl mémoire + impl DataStore) :

```kotlin
package me.meeshy.sdk.chrome

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import me.meeshy.ui.component.chrome.FloatingButtonPosition
import me.meeshy.ui.component.chrome.decodePosition
import me.meeshy.ui.component.chrome.encodePosition

/** Ou l'utilisateur a range ses deux boutons flottants. */
public interface FloatingButtonPositionStore {
    public val leftPosition: StateFlow<FloatingButtonPosition>
    public val rightPosition: StateFlow<FloatingButtonPosition>
    public suspend fun setLeftPosition(position: FloatingButtonPosition)
    public suspend fun setRightPosition(position: FloatingButtonPosition)
}

/** Double de test — aucune E/S. */
public class InMemoryFloatingButtonPositionStore : FloatingButtonPositionStore {
    private val _left = MutableStateFlow(FloatingButtonPosition.DEFAULT_LEFT)
    private val _right = MutableStateFlow(FloatingButtonPosition.DEFAULT_RIGHT)

    override val leftPosition: StateFlow<FloatingButtonPosition> = _left.asStateFlow()
    override val rightPosition: StateFlow<FloatingButtonPosition> = _right.asStateFlow()

    override suspend fun setLeftPosition(position: FloatingButtonPosition) { _left.value = position }
    override suspend fun setRightPosition(position: FloatingButtonPosition) { _right.value = position }
}

/**
 * Adossee a un DataStore Preferences, comme [me.meeshy.sdk.theme.DataStoreThemeStore].
 * Le decodage passe par le codec pur, donc une valeur corrompue degrade vers le
 * defaut au lieu de planter.
 */
public class DataStoreFloatingButtonPositionStore(
    private val dataStore: DataStore<Preferences>,
    scope: CoroutineScope,
) : FloatingButtonPositionStore {

    override val leftPosition: StateFlow<FloatingButtonPosition> =
        dataStore.data
            .map { prefs -> decodePosition(prefs[KEY_LEFT], FloatingButtonPosition.DEFAULT_LEFT) }
            .stateIn(scope, SharingStarted.Eagerly, FloatingButtonPosition.DEFAULT_LEFT)

    override val rightPosition: StateFlow<FloatingButtonPosition> =
        dataStore.data
            .map { prefs -> decodePosition(prefs[KEY_RIGHT], FloatingButtonPosition.DEFAULT_RIGHT) }
            .stateIn(scope, SharingStarted.Eagerly, FloatingButtonPosition.DEFAULT_RIGHT)

    override suspend fun setLeftPosition(position: FloatingButtonPosition) {
        dataStore.edit { prefs -> prefs[KEY_LEFT] = encodePosition(position) }
    }

    override suspend fun setRightPosition(position: FloatingButtonPosition) {
        dataStore.edit { prefs -> prefs[KEY_RIGHT] = encodePosition(position) }
    }

    private companion object {
        private val KEY_LEFT = stringPreferencesKey("floating_button_left")
        private val KEY_RIGHT = stringPreferencesKey("floating_button_right")
    }
}
```

- [ ] **Step 4 : Câbler Hilt**

Dans `SdkModule.kt`, juste après `providesThemeStore`, en copiant sa forme :

```kotlin
    @Provides
    @Singleton
    fun providesFloatingButtonPositionStore(
        @ApplicationContext context: Context,
    ): FloatingButtonPositionStore {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val dataStore = PreferenceDataStoreFactory.create(scope = scope) {
            context.preferencesDataStoreFile("meeshy_floating_buttons")
        }
        return DataStoreFloatingButtonPositionStore(dataStore, scope)
    }
```

- [ ] **Step 5 : Relancer les tests**

```bash
cd apps/android && ./meeshy.sh :sdk-core:testDebugUnitTest --tests '*FloatingButtonPositionStoreTest*'
```
Attendu : SUCCÈS, 3 tests.

- [ ] **Step 6 : Commit**

```bash
git add apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/chrome apps/android/sdk-core/src/test/kotlin/me/meeshy/sdk/chrome apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/di/SdkModule.kt
git commit -m "feat(android/sdk-core): persistance des positions de boutons flottants

Meme patron que ThemeStore : interface, double memoire, impl DataStore,
codec pur. Cle DataStore dediee, une par bouton."
```

---

### Task 5 : Le composable des deux boutons

**Files:**
- Create: `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/chrome/MeeshyFloatingButtons.kt`
- Test: `apps/android/sdk-ui/src/test/kotlin/me/meeshy/ui/component/chrome/MeeshyFloatingButtonsTest.kt`

**Interfaces:**
- Consumes: `FloatingButtonPosition`, `snapToNearestEdge` (Task 3), `systemGestureInsetsCompat` (Task 2).
- Produces:

```kotlin
@Composable
public fun MeeshyFloatingButtons(
    leftPosition: FloatingButtonPosition,
    rightPosition: FloatingButtonPosition,
    onLeftPositionChange: (FloatingButtonPosition) -> Unit,
    onRightPositionChange: (FloatingButtonPosition) -> Unit,
    onLeftTap: () -> Unit,
    onLeftLongPress: () -> Unit,
    onRightTap: () -> Unit,
    onRightLongPress: () -> Unit,
    leftContentDescription: String,
    rightContentDescription: String,
    modifier: Modifier = Modifier,
    rightContent: @Composable () -> Unit,
)
```
Consommé par la Task 6.

- [ ] **Step 1 : Écrire le test en échec**

Le test porte sur les **gestes**, seule partie testable sans instrumentation ; la géométrie est déjà couverte par la Task 3.

```kotlin
package me.meeshy.ui.component.chrome

import androidx.compose.material3.Text
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.longClick
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class MeeshyFloatingButtonsTest {

    @get:Rule val compose = createComposeRule()

    private fun setContent(
        onLeftTap: () -> Unit = {},
        onLeftLongPress: () -> Unit = {},
        onRightTap: () -> Unit = {},
        onRightLongPress: () -> Unit = {},
    ) {
        compose.setContent {
            MeeshyFloatingButtons(
                leftPosition = FloatingButtonPosition.DEFAULT_LEFT,
                rightPosition = FloatingButtonPosition.DEFAULT_RIGHT,
                onLeftPositionChange = {},
                onRightPositionChange = {},
                onLeftTap = onLeftTap,
                onLeftLongPress = onLeftLongPress,
                onRightTap = onRightTap,
                onRightLongPress = onRightLongPress,
                leftContentDescription = "Flux",
                rightContentDescription = "Menu",
                rightContent = { Text("A") },
            )
        }
    }

    @Test
    fun `tapping the left button reports a tap, not a long press`() {
        var taps = 0
        var longPresses = 0
        setContent(onLeftTap = { taps++ }, onLeftLongPress = { longPresses++ })

        compose.onNodeWithContentDescription("Flux").performClick()

        assertEquals(1, taps)
        assertEquals(0, longPresses)
    }

    // Le geste que le produit vient de retablir : appui long a gauche = Reels.
    @Test
    fun `long-pressing the left button reports a long press, not a tap`() {
        var taps = 0
        var longPresses = 0
        setContent(onLeftTap = { taps++ }, onLeftLongPress = { longPresses++ })

        compose.onNodeWithContentDescription("Flux").performTouchInput { longClick() }

        assertEquals(0, taps)
        assertEquals(1, longPresses)
    }

    @Test
    fun `the right button separates tap from long press too`() {
        var taps = 0
        var longPresses = 0
        setContent(onRightTap = { taps++ }, onRightLongPress = { longPresses++ })

        compose.onNodeWithContentDescription("Menu").performClick()
        compose.onNodeWithContentDescription("Menu").performTouchInput { longClick() }

        assertEquals(1, taps)
        assertEquals(1, longPresses)
    }
}
```

- [ ] **Step 2 : Lancer le test, vérifier qu'il échoue**

```bash
cd apps/android && ./meeshy.sh :sdk-ui:testDebugUnitTest --tests '*MeeshyFloatingButtonsTest*'
```
Attendu : ÉCHEC — `Unresolved reference: MeeshyFloatingButtons`.

Si Robolectric ou `compose-ui-test-junit4` manquent dans `sdk-ui/build.gradle.kts`, les ajouter au bloc `testImplementation` en reprenant la déclaration d'un module qui teste déjà du Compose (`grep -rn "compose.ui.test" apps/android --include="build.gradle.kts"`), puis relancer.

- [ ] **Step 3 : Implémentation minimale**

```kotlin
package me.meeshy.ui.component.chrome

import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import me.meeshy.ui.compatibility.systemGestureInsetsCompat
import kotlin.math.roundToInt

private val BUTTON_SIZE = 56.dp

/**
 * Les deux boutons flottants qui pilotent le routage, portage du
 * `FreeFloatingButtonsContainer` iOS.
 *
 * NE PAS remettre dans le slot `Scaffold(floatingActionButton = )` : ce slot
 * positionne lui-meme son contenu, ce qui est incompatible avec un bouton
 * deplacable. Le composable est pose dans un Box par-dessus le NavHost.
 *
 * Purete SDK : aucune route, aucun singleton produit. Positions et actions
 * arrivent par parametre ; l'appelant decide de ce que chaque geste declenche.
 */
@Composable
public fun MeeshyFloatingButtons(
    leftPosition: FloatingButtonPosition,
    rightPosition: FloatingButtonPosition,
    onLeftPositionChange: (FloatingButtonPosition) -> Unit,
    onRightPositionChange: (FloatingButtonPosition) -> Unit,
    onLeftTap: () -> Unit,
    onLeftLongPress: () -> Unit,
    onRightTap: () -> Unit,
    onRightLongPress: () -> Unit,
    leftContentDescription: String,
    rightContentDescription: String,
    modifier: Modifier = Modifier,
    rightContent: @Composable () -> Unit,
) {
    val insets = systemGestureInsetsCompat()

    BoxWithConstraints(modifier = modifier.padding(insets)) {
        val widthPx = with(LocalDensity.current) { maxWidth.toPx() }
        val heightPx = with(LocalDensity.current) { maxHeight.toPx() }
        val buttonPx = with(LocalDensity.current) { BUTTON_SIZE.toPx() }

        DraggableButton(
            position = leftPosition,
            onPositionChange = onLeftPositionChange,
            onTap = onLeftTap,
            onLongPress = onLeftLongPress,
            contentDescription = leftContentDescription,
            widthPx = widthPx,
            heightPx = heightPx,
            buttonPx = buttonPx,
        ) {
            Box(
                modifier = Modifier
                    .size(BUTTON_SIZE)
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.primary),
            )
        }

        DraggableButton(
            position = rightPosition,
            onPositionChange = onRightPositionChange,
            onTap = onRightTap,
            onLongPress = onRightLongPress,
            contentDescription = rightContentDescription,
            widthPx = widthPx,
            heightPx = heightPx,
            buttonPx = buttonPx,
            content = rightContent,
        )
    }
}

@Composable
private fun DraggableButton(
    position: FloatingButtonPosition,
    onPositionChange: (FloatingButtonPosition) -> Unit,
    onTap: () -> Unit,
    onLongPress: () -> Unit,
    contentDescription: String,
    widthPx: Float,
    heightPx: Float,
    buttonPx: Float,
    content: @Composable () -> Unit,
) {
    // Position vivante pendant le drag ; la source de verite ne bouge qu'au relachement,
    // sinon chaque pixel parcouru declencherait une ecriture DataStore.
    var dragging by remember { mutableStateOf<FloatingButtonPosition?>(null) }
    val shown = dragging ?: position

    val travelX = (widthPx - buttonPx).coerceAtLeast(0f)
    val travelY = (heightPx - buttonPx).coerceAtLeast(0f)

    Box(
        modifier = Modifier
            .align(Alignment.TopStart)
            .offset { IntOffset((shown.x * travelX).roundToInt(), (shown.y * travelY).roundToInt()) }
            .size(BUTTON_SIZE)
            .semantics { this.contentDescription = contentDescription }
            .pointerInput(Unit) {
                detectTapGestures(onTap = { onTap() }, onLongPress = { onLongPress() })
            }
            .pointerInput(widthPx, heightPx) {
                detectDragGestures(
                    onDragEnd = {
                        dragging?.let { onPositionChange(snapToNearestEdge(it)) }
                        dragging = null
                    },
                    onDragCancel = { dragging = null },
                ) { change, delta ->
                    change.consume()
                    val current = dragging ?: position
                    dragging = clampToBounds(
                        FloatingButtonPosition(
                            x = current.x + (if (travelX == 0f) 0f else delta.x / travelX),
                            y = current.y + (if (travelY == 0f) 0f else delta.y / travelY),
                        ),
                    )
                }
            },
        contentAlignment = Alignment.Center,
    ) { content() }
}
```

- [ ] **Step 4 : Relancer le test**

```bash
cd apps/android && ./meeshy.sh :sdk-ui:testDebugUnitTest --tests '*MeeshyFloatingButtonsTest*'
```
Attendu : SUCCÈS, 3 tests.

- [ ] **Step 5 : Commit**

```bash
git add apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/chrome/MeeshyFloatingButtons.kt apps/android/sdk-ui/src/test/kotlin/me/meeshy/ui/component/chrome/MeeshyFloatingButtonsTest.kt
git commit -m "feat(android/sdk-ui): deux boutons flottants deplacables

Portage du FreeFloatingButtonsContainer iOS. Hors du slot Scaffold, qui
positionne lui-meme son contenu. La position ne s'ecrit qu'au relachement."
```

---

### Task 6 : Câblage de la navigation

**Files:**
- Modify: `apps/android/app/src/main/kotlin/me/meeshy/app/navigation/MeeshyApp.kt` — `rememberRadialMenuItems` (~ligne 163), slot `floatingActionButton` (~ligne 270), `Box` du `NavHost` (~ligne 276)
- Test: `apps/android/app/src/test/kotlin/me/meeshy/app/navigation/MeeshyAppMenuItemsTest.kt`

**Interfaces:**
- Consumes: `MeeshyFloatingButtons` (Task 5), `FloatingButtonPositionStore` (Task 4).
- Produces: le câblage final. Aucune tâche ultérieure n'en dépend.

- [ ] **Step 1 : Écrire le test en échec**

```kotlin
package me.meeshy.app.navigation

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MeeshyAppMenuItemsTest {

    // "Feed" quitte le menu : un simple tap du bouton gauche y mene desormais,
    // l'y laisser offrirait deux chemins pour un meme geste.
    @Test
    fun `the deployed menu no longer offers Feed`() {
        assertFalse(menuItemLabelKeys().contains("tab_feed"))
    }

    // "Reels" RESTE : il n'est atteignable que par appui long, un geste non
    // decouvrable, qui ne doit pas etre le seul chemin.
    @Test
    fun `the deployed menu still offers Reels`() {
        assertTrue(menuItemLabelKeys().contains("menu_reels"))
    }
}
```

- [ ] **Step 2 : Lancer le test, vérifier qu'il échoue**

```bash
cd apps/android && ./meeshy.sh :app:testDebugUnitTest --tests '*MeeshyAppMenuItemsTest*'
```
Attendu : ÉCHEC — `Unresolved reference: menuItemLabelKeys`.

- [ ] **Step 3 : Rendre la liste des entrées inspectable**

`rememberRadialMenuItems` est `@Composable` : elle ne peut pas être appelée depuis un test JVM. Extraire la **liste des clés** dans une fonction pure, dans `MeeshyApp.kt`, juste au-dessus de `rememberRadialMenuItems` :

```kotlin
/**
 * Les entrees du menu, dans l'ordre, par clé de libelle.
 *
 * Extrait de [rememberRadialMenuItems] pour etre verifiable sans Compose : c'est
 * ici que se lit la regle "Feed sort, Reels reste".
 */
internal fun menuItemLabelKeys(): List<String> = listOf(
    "menu_new_conversation",
    "tab_messages",
    "menu_reels",
    "tab_calls",
    "tab_activity",
    "menu_contacts",
    "tab_profile",
)
```

Puis **retirer de `rememberRadialMenuItems` l'entrée `feed`** (le `RadialMenuItem(Icons.Filled.Home, feed, ...)`), ainsi que le `val feed = stringResource(R.string.tab_feed)` devenu inutilisé et sa mention dans la clé du `remember(...)`.

- [ ] **Step 4 : Relancer le test**

```bash
cd apps/android && ./meeshy.sh :app:testDebugUnitTest --tests '*MeeshyAppMenuItemsTest*'
```
Attendu : SUCCÈS, 2 tests.

- [ ] **Step 5 : Vider le slot Scaffold**

Dans `MeeshyApp.kt`, remplacer :

```kotlin
        floatingActionButton = {
            if (showMenuFab) {
                MeeshyMenuFab(items = radialItems)
            }
        },
```

par (le slot disparaît : `MeeshyMenuFab` est désormais rendu par le bouton droit) :

```kotlin
        // Pas de floatingActionButton ici : le slot positionne lui-meme son contenu,
        // ce qui est incompatible avec des boutons deplacables. Ils sont poses dans
        // le Box ci-dessous, par-dessus le NavHost.
```

- [ ] **Step 6 : Poser les boutons au-dessus du NavHost**

Dans le `Box(modifier = Modifier.fillMaxSize())` qui enveloppe le `NavHost`, **après** le `NavHost`, ajouter :

```kotlin
        if (showMenuFab) {
            val leftPosition by floatingButtonPositionStore.leftPosition.collectAsStateWithLifecycle()
            val rightPosition by floatingButtonPositionStore.rightPosition.collectAsStateWithLifecycle()
            val scope = rememberCoroutineScope()
            var menuExpanded by remember { mutableStateOf(false) }

            MeeshyFloatingButtons(
                leftPosition = leftPosition,
                rightPosition = rightPosition,
                onLeftPositionChange = { scope.launch { floatingButtonPositionStore.setLeftPosition(it) } },
                onRightPositionChange = { scope.launch { floatingButtonPositionStore.setRightPosition(it) } },
                // Tap : le Flux. Via le NavHost avec la meme semantique save/restore
                // que les autres destinations de premier niveau.
                onLeftTap = {
                    navController.navigate(Routes.FEED) {
                        popUpTo(navController.graph.startDestinationId) { saveState = true }
                        launchSingleTop = true
                        restoreState = true
                    }
                },
                // Appui long : les Reels. Geste retabli sur decision produit, et
                // identique a celui d'iOS.
                onLeftLongPress = { navController.navigate(Routes.reels()) },
                onRightTap = { menuExpanded = !menuExpanded },
                onRightLongPress = { navController.navigate(Routes.SETTINGS) },
                leftContentDescription = stringResource(R.string.tab_feed),
                rightContentDescription = stringResource(R.string.a11y_floating_menu),
                rightContent = {
                    if (menuExpanded) {
                        MeeshyMenuFab(items = radialItems)
                    } else {
                        MeeshyAvatarButton(username = authState.username)
                    }
                },
            )
        }
```

Ajouter la chaîne manquante dans `app/src/main/res/values/strings.xml` (et son pendant dans chaque `values-*/strings.xml` existant) :

```xml
<string name="a11y_floating_menu">Menu de navigation</string>
```

`MeeshyAvatarButton` : si aucun composable d'avatar n'existe dans `sdk-ui` (`grep -rn "fun MeeshyAvatar" apps/android --include="*.kt"`), en créer un minimal affichant la première lettre de `username` dans un cercle. `AuthState` n'expose pas d'URL d'avatar : **les initiales sont le chemin nominal**, pas un cas dégradé.

Injecter `floatingButtonPositionStore` dans le composable `MeeshyApp` en suivant la façon dont `authViewModel` y arrive déjà.

- [ ] **Step 7 : Compiler et lancer toute la suite**

```bash
cd apps/android && ./meeshy.sh build && ./meeshy.sh test
```
Attendu : `BUILD SUCCESSFUL` et suite verte.

- [ ] **Step 8 : Vérifier à l'œil sur les DEUX émulateurs**

```bash
cd apps/android && MEESHY_AVD=meeshy_pixel8_api36 ./meeshy.sh install
~/android-sdk/platform-tools/adb shell am start -n me.meeshy.app.debug/me.meeshy.app.MainActivity
~/android-sdk/platform-tools/adb exec-out screencap -p > /tmp/android-api36.png
```

Regarder la capture : deux boutons visibles, aucun sous la barre de gestes. Refaire avec `MEESHY_AVD=meeshy_pixel8` (API 35) — la promesse « Oreo → 17 » ne se vérifie pas sur une seule version.

- [ ] **Step 9 : Commit**

```bash
git add apps/android/app
git commit -m "feat(android): deux boutons flottants pilotent le routage

Parite iOS : gauche = Flux (tap) et Reels (appui long), droite = avatar
puis menu. Feed sort du menu deploye, un tap y mene ; Reels y reste, un
appui long n'etant pas decouvrable."
```

---

### Task 7 : Une session expirée n'est plus une panne réseau

**Files:**
- Create: `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/network/AuthExpiryInterceptor.kt`
- Test: `apps/android/sdk-core/src/test/kotlin/me/meeshy/sdk/network/AuthExpiryInterceptorTest.kt`

**Interfaces:**
- Consumes: rien.
- Produces: `class AuthExpiryInterceptor(private val onSessionExpired: () -> Unit) : Interceptor`.

- [ ] **Step 1 : Écrire le test en échec**

```kotlin
package me.meeshy.sdk.network

import okhttp3.Interceptor
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Test

class AuthExpiryInterceptorTest {

    private fun chainReturning(code: Int): Interceptor.Chain {
        val request = Request.Builder().url("https://gate.meeshy.me/api/v1/conversations").build()
        val response = Response.Builder()
            .request(request).protocol(Protocol.HTTP_1_1).code(code)
            .message("m").body("".toResponseBody(null)).build()
        return object : Interceptor.Chain {
            override fun request(): Request = request
            override fun proceed(request: Request): Response = response
            override fun connection() = null
            override fun call() = throw UnsupportedOperationException()
            override fun connectTimeoutMillis() = 0
            override fun withConnectTimeout(timeout: Int, unit: java.util.concurrent.TimeUnit) = this
            override fun readTimeoutMillis() = 0
            override fun withReadTimeout(timeout: Int, unit: java.util.concurrent.TimeUnit) = this
            override fun writeTimeoutMillis() = 0
            override fun withWriteTimeout(timeout: Int, unit: java.util.concurrent.TimeUnit) = this
        }
    }

    @Test
    fun `a 401 signals an expired session`() {
        var expired = 0
        AuthExpiryInterceptor { expired++ }.intercept(chainReturning(401))
        assertEquals(1, expired)
    }

    @Test
    fun `a 403 signals an expired session too`() {
        var expired = 0
        AuthExpiryInterceptor { expired++ }.intercept(chainReturning(403))
        assertEquals(1, expired)
    }

    // Une vraie panne serveur ne doit PAS deconnecter : l'utilisateur perdrait sa
    // session a chaque hoquet de la passerelle.
    @Test
    fun `a 500 does not signal an expired session`() {
        var expired = 0
        AuthExpiryInterceptor { expired++ }.intercept(chainReturning(500))
        assertEquals(0, expired)
    }

    @Test
    fun `a 200 does not signal an expired session`() {
        var expired = 0
        AuthExpiryInterceptor { expired++ }.intercept(chainReturning(200))
        assertEquals(0, expired)
    }
}
```

- [ ] **Step 2 : Lancer le test, vérifier qu'il échoue**

```bash
cd apps/android && ./meeshy.sh :sdk-core:testDebugUnitTest --tests '*AuthExpiryInterceptorTest*'
```
Attendu : ÉCHEC — `Unresolved reference: AuthExpiryInterceptor`.

- [ ] **Step 3 : Implémentation minimale**

```kotlin
package me.meeshy.sdk.network

import okhttp3.Interceptor
import okhttp3.Response

/**
 * Traduit une session expiree en evenement, au lieu de la laisser remonter comme une
 * erreur de chargement.
 *
 * Constate a l'usage : une session expiree produit 401/403 sur /conversations,
 * /posts/feed/stories et /friend-requests, et l'ecran affichait "Check your
 * connection and try again" alors que le reseau fonctionnait. Le message accusait le
 * reseau et l'utilisateur n'avait aucun moyen de comprendre qu'il devait se
 * reconnecter.
 *
 * Le traitement vit ICI, pas dans chaque ecran : les trois routes echouent
 * independamment, et un traitement par ecran laisserait le prochain appelant
 * reproduire le defaut.
 *
 * 500 est volontairement EXCLU : un hoquet de la passerelle deconnecterait
 * l'utilisateur.
 */
public class AuthExpiryInterceptor(
    private val onSessionExpired: () -> Unit,
) : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val response = chain.proceed(chain.request())
        if (response.code == 401 || response.code == 403) onSessionExpired()
        return response
    }
}
```

- [ ] **Step 4 : Relancer le test**

```bash
cd apps/android && ./meeshy.sh :sdk-core:testDebugUnitTest --tests '*AuthExpiryInterceptorTest*'
```
Attendu : SUCCÈS, 4 tests.

- [ ] **Step 5 : Brancher l'intercepteur**

Le trouver via `grep -rn "OkHttpClient.Builder" apps/android --include="*.kt" | grep -v /test/`, puis ajouter `.addInterceptor(AuthExpiryInterceptor { ... })` en déclenchant la déconnexion existante (celle qu'appelle le bouton « se déconnecter » — `grep -rn "fun logout" apps/android --include="*.kt"`), afin que `MeeshyApp` bascule sur `Routes.LOGIN` par son `startDestination`, qui dépend déjà de `authState.isAuthenticated`.

- [ ] **Step 6 : Compiler et tester**

```bash
cd apps/android && ./meeshy.sh build && ./meeshy.sh test
```
Attendu : `BUILD SUCCESSFUL` et suite verte.

- [ ] **Step 7 : Commit**

```bash
git add apps/android/sdk-core
git commit -m "fix(android): une session expiree renvoie au login, pas a une erreur reseau

401/403 etaient presentes comme "Check your connection" alors que le
reseau fonctionnait. Traite dans l'intercepteur et non par ecran : les
routes echouent independamment. 500 exclu, un hoquet passerelle ne doit
pas deconnecter."
```

---

## Vérification finale

- [ ] `cd apps/android && ./meeshy.sh build` — vert
- [ ] `cd apps/android && ./meeshy.sh test` — vert
- [ ] `grep -rn "compileSdk" apps/android --include="build.gradle.kts"` — tous à 37
- [ ] `grep -rn "minSdk" apps/android --include="build.gradle.kts"` — toujours 26
- [ ] `grep -rn "SDK_INT" apps/android --include="*.kt" | grep -v compatibility | grep -v /test/` — aucun test de version hors de `compatibility/`
- [ ] Chaque helper de `compatibility/` a au moins un appelant hors tests — sinon le supprimer
- [ ] Capture d'écran sur AVD API 35 **et** API 36 : deux boutons visibles, hors barre de gestes
- [ ] Ouvrir une PR vers `main`

## Hors de ce plan

- **PR 2 (iOS)** — appui long gauche → Réels dans `RootView.swift`. Plan distinct.
- **AGP 9.x / Gradle 9.5** — chantier séparé.
- **`targetSdk 37`** — exige de traiter l'audio en arrière-plan, l'orientation sur grands écrans et `ACCESS_LOCAL_NETWORK`.
