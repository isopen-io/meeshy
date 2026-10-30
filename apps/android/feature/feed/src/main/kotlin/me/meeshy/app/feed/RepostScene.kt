package me.meeshy.app.feed

import androidx.compose.runtime.Composable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import me.meeshy.sdk.model.StoryItem

/**
 * Comment la scène d'une story reposté se dessine dans le fil : le lecteur de scène vit dans le module des
 * stories, que le fil ne connaît pas — l'application le fournit (même schéma que `LocalShareLauncher`).
 * Arguments : la story citée, le nom de son auteur (libellé TalkBack), [live] (la scène que le fil élit : elle seule joue,
 * muette ; les autres sont une image fixe sans lecteur, #13663), l'ouverture de l'original.
 */
typealias RepostSceneRenderer = @Composable (item: StoryItem, authorName: String?, live: Boolean, onOpen: () -> Unit, modifier: Modifier) -> Unit

/** `null` hors de l'application (tests, aperçus) : la carte retombe alors sur le bloc de citation. */
val LocalRepostSceneRenderer = staticCompositionLocalOf<RepostSceneRenderer?> { null }

/**
 * Ouvre une story PRÉCISE (`storyId`, de l'auteur `authorId`) en plein écran, dans le lecteur de stories (iOS : toucher une story
 * republiée l'ouvre, il n'ouvre pas la fiche du post). `null` hors de l'application : la carte retombe sur la fiche du post.
 */
val LocalStoryOpener = staticCompositionLocalOf<((authorId: String, storyId: String) -> Unit)?> { null }

/**
 * Comment la scène d'un RÉEL se dessine sur sa carte (iOS `ReelCardSceneBackdrop`) : non plus une carte de story 9:16 centrée,
 * mais la scène qui REMPLIT le cadre reçu (cadrage « fill », rognée au centre), sur du noir, muette, sans geste ni libellé propres
 * — la carte porte l'ouverture et son libellé. Arguments : le réel composé, la couleur de son auteur, [live] (élu par le fil),
 * le cadre à remplir.
 */
typealias ReelSceneRenderer = @Composable (item: StoryItem, accentHex: String?, live: Boolean, modifier: Modifier) -> Unit

/** `null` hors de l'application (tests, aperçus) : la couverture retombe alors sur l'aplat d'accent. */
val LocalReelSceneRenderer = staticCompositionLocalOf<ReelSceneRenderer?> { null }
