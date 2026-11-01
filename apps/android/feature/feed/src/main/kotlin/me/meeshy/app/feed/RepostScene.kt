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
 * [muted] (le fil est muet par construction ; la fiche d'un post laisse le lecteur couper ou rétablir le son, #13893), le
 * cadre à remplir.
 */
typealias ReelSceneRenderer = @Composable (item: StoryItem, accentHex: String?, live: Boolean, muted: Boolean, modifier: Modifier) -> Unit

/** `null` hors de l'application (tests, aperçus) : la couverture retombe alors sur l'aplat d'accent. */
val LocalReelSceneRenderer = staticCompositionLocalOf<ReelSceneRenderer?> { null }

/**
 * Comment une scène de POST se lit en plein écran (iOS `PostSceneCardContainer`) : la scène entière, au centre, et son son joue.
 * Arguments : la scène, la couleur de son auteur, [playing] (la page que le lecteur montre : elle seule joue), le cadre.
 */
typealias PostSceneReaderRenderer = @Composable (item: StoryItem, accentHex: String?, playing: Boolean, modifier: Modifier) -> Unit

/** `null` hors de l'application (tests, aperçus) : toucher une scène n'ouvre alors rien. */
val LocalPostSceneReaderRenderer = staticCompositionLocalOf<PostSceneReaderRenderer?> { null }

/**
 * Le menu d'export du plein écran d'un post à scène (#13896) : Enregistrer, Partager et Imager rendent le post ENTIER, toutes
 * ses scènes bout à bout, par le moteur d'export que l'application fournit. Arguments : les scènes du post, la couleur de
 * son auteur, la place du bouton.
 */
typealias PostSceneExportRenderer = @Composable (scenes: List<StoryItem>, accentHex: String?, modifier: Modifier) -> Unit

/** `null` hors de l'application (tests, aperçus) : le plein écran n'offre alors aucun export. */
val LocalPostSceneExportRenderer = staticCompositionLocalOf<PostSceneExportRenderer?> { null }
