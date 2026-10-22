package me.meeshy.app.startup

import androidx.compose.runtime.Composable

/**
 * Fournit des `CompositionLocal` a tout l'arbre de navigation : [Provide] enveloppe le
 * `NavHost`. Contribue en `@IntoSet` ; le fournisseur d'[order] le plus petit est le plus
 * exterieur.
 */
interface AppLocalsProvider {
    val order: Int get() = 0

    @Composable
    fun Provide(content: @Composable () -> Unit)
}

@Composable
internal fun ProvideAppLocals(providers: List<AppLocalsProvider>, content: @Composable () -> Unit) {
    if (providers.isEmpty()) {
        content()
        return
    }
    providers.first().Provide { ProvideAppLocals(providers.drop(1), content) }
}
