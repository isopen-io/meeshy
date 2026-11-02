package me.meeshy.sdk.model.composer

/**
 * Les portes dont le document arrive DÉJÀ posé ou à reprendre — un brouillon, une pièce reçue, un média de
 * conversation ou de post : leur surface est la SCÈNE, quel que soit le format initial du profil (iOS
 * `ComposerSurfaceRouting` : `.resume` et `.mediaSeeded` sont une scène, et le seul mécanisme de reprise du meuble
 * repeuple l'atelier). Le format reste un champ : un post se choisit ensuite, et les médias posés le suivent.
 */
val ComposerOrigin.landsOnScene: Boolean
    get() = this is ComposerOrigin.Draft || this === ComposerOrigin.Share ||
        this is ComposerOrigin.ConversationMedia || this is ComposerOrigin.SocialMedia

/** Le format d'ouverture explicite d'une porte à scène ; `null` pour les autres, qui suivent leur profil. */
val ComposerOrigin.sceneOpening: ComposerFormat?
    get() = ComposerFormat.STORY.takeIf { landsOnScene }

/**
 * Les portes qui POSENT elles-mêmes la matière de la scène : un brouillon enregistré ne se restaure pas par-dessus, et
 * l'autosave n'écrase pas le brouillon d'avant. Le brouillon, lui, se REPREND : c'est la matière qu'il rend.
 */
val ComposerOrigin.postsItsOwnMatter: Boolean
    get() = this === ComposerOrigin.Share || this is ComposerOrigin.ConversationMedia || this is ComposerOrigin.SocialMedia
