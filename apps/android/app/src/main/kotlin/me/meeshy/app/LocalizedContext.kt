package me.meeshy.app

import android.content.Context
import android.content.ContextWrapper
import android.content.res.AssetManager
import android.content.res.Configuration
import android.content.res.Resources
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import java.util.Locale
import me.meeshy.sdk.model.AppLanguage

/**
 * The context the app's composition reads once a display language is chosen: the Activity,
 * serving the resources of [tag]. A bare `createConfigurationContext` is a `ContextImpl` that no
 * longer leads to the Activity, and `hiltViewModel()` — which walks `baseContext` up to it —
 * threw on every screen, crashing the app at each launch (#12206).
 */
internal fun localizedContext(base: Context, tag: String, baseConfiguration: Configuration): Context {
    val configuration = Configuration(baseConfiguration).apply { setLocale(Locale.forLanguageTag(tag)) }
    return LocalizedResourcesContext(base, base.createConfigurationContext(configuration))
}

private class LocalizedResourcesContext(base: Context, private val localized: Context) : ContextWrapper(base) {
    override fun getResources(): Resources = localized.resources
    override fun getAssets(): AssetManager = localized.assets
}

/**
 * Applies the persisted interface-language preference app-wide by re-localising the
 * [Context]/[Configuration] the whole Compose tree resolves `stringResource`s against.
 *
 * The *decision* — which locale tag to force, or `null` to leave the device locale in
 * place — lives in the pure, tested [AppLanguage.resolveInterfaceLocaleTag]. When the
 * preference is "System" (`null`) the original context is used unchanged, so a device
 * locale the app has no translation for still falls back through Android's own resource
 * resolution. Works on every supported API level (minSdk 26) with no extra dependency.
 * The Activity stays the context's base ([localizedContext]) so links, shares and
 * permission prompts keep working when a language is forced. Menus and dialogs compose in
 * their own window, which reads the Activity's resources again: those follow the chosen
 * language too ([followLocales], #14860), and return to the device's on "System".
 */
@Composable
internal fun LocalizedContent(
    languageCode: String?,
    content: @Composable () -> Unit,
) {
    val tag = languageCode?.takeIf(AppLanguage::isShipped)
    val baseContext = LocalContext.current
    val baseConfiguration = LocalConfiguration.current
    val locale = remember(tag) { tag?.let(Locale::forLanguageTag) }
    if (locale != null) SideEffect { Locale.setDefault(locale) }
    val context = remember(tag, baseContext, baseConfiguration) {
        tag?.let { localizedContext(baseContext, it, baseConfiguration) } ?: baseContext
    }
    val localizedConfiguration = remember(locale, baseConfiguration) {
        locale?.let { Configuration(baseConfiguration).apply { setLocale(it) } } ?: baseConfiguration
    }

    val activityResources = baseContext.resources
    SideEffect { activityResources.followLocales(localizedConfiguration) }

    // Toujours le même nœud : passer de « Système » à une langue ne recrée pas l'arbre,
    // donc la navigation reste sur l'écran où la langue a été choisie.
    CompositionLocalProvider(
        LocalContext provides context,
        LocalConfiguration provides localizedConfiguration,
    ) {
        content()
    }
}

/**
 * Aligns the Activity's own resources on [target]'s locales. A popup or a dialog re-provides the
 * Activity's context and configuration to its content, so below Android 13 — where no per-app
 * locale exists — `DropdownMenu` entries were read in the device language (#14860).
 */
@Suppress("DEPRECATION")
internal fun Resources.followLocales(target: Configuration) {
    if (configuration.locales == target.locales) return
    updateConfiguration(Configuration(configuration).apply { setLocales(target.locales) }, displayMetrics)
}
