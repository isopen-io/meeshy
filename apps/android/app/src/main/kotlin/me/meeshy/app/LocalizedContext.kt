package me.meeshy.app

import android.content.Context
import android.content.ContextWrapper
import android.content.res.AssetManager
import android.content.res.Configuration
import android.content.res.Resources
import java.util.Locale

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
