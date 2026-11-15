package me.meeshy.sdk.model.paste

/** Les noms à citer dans « Impossible d'importer : <liste> » : le repli remplace un nom absent ou blanc. */
public object ComposerImportFailure {
    public fun names(failed: List<String?>, fallback: String): String =
        failed.joinToString(", ") { it?.trim()?.takeIf(String::isNotEmpty) ?: fallback }
}
