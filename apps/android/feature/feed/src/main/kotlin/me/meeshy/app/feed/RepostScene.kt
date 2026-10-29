package me.meeshy.app.feed

import androidx.compose.runtime.Composable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import me.meeshy.sdk.model.StoryItem

/**
 * Comment la scène d'une story reposté se dessine dans le fil : le lecteur de scène vit dans le module des
 * stories, que le fil ne connaît pas — l'application le fournit (même schéma que `LocalShareLauncher`).
 * Arguments : la story citée, le nom de son auteur (libellé TalkBack), l'ouverture de l'original.
 */
typealias RepostSceneRenderer = @Composable (item: StoryItem, authorName: String?, onOpen: () -> Unit, modifier: Modifier) -> Unit

/** `null` hors de l'application (tests, aperçus) : la carte retombe alors sur le bloc de citation. */
val LocalRepostSceneRenderer = staticCompositionLocalOf<RepostSceneRenderer?> { null }
