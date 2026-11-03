package me.meeshy.sdk.model.composer

import me.meeshy.sdk.model.StorySlidePublishMatter

/**
 * Ce qu'une story est dans l'hôte unique (miroir de `ComposerStoryCanvas`, iOS) : le canevas naît avec la porte, il n'attend
 * pas qu'on y pose quelque chose.
 *
 * « Canevas » ne veut pas dire la même chose selon le format : pour un post ou un réel, une diapo naît d'un média ingéré ;
 * pour une story, la diapo EST l'unité de publication et précède tout contenu.
 */
public object ComposerStoryCanvas {

    /**
     * La scène est montée pour la story, le post et le réel TOUJOURS (un post vide ouvert depuis le fil se compose sur la
     * scène) ; [documentHasScene] ne décide plus de ce qu'on montre, il décide de ce qui part ([publishesScene]) — et garde le
     * mood hors de cette boucle : la question du mood reste posée à la scène, jamais au format déjà choisi.
     */
    public fun showsCanvas(format: ComposerFormat, documentHasScene: Boolean): Boolean =
        ComposerFormatVariant.of(format).composesOnScene || documentHasScene

    /** La scène PART-elle ? Un post qui ne porte que son texte part comme un post texte ; une story part toujours avec ses canevas. */
    public fun publishesScene(format: ComposerFormat, documentHasScene: Boolean): Boolean =
        format == ComposerFormat.STORY || documentHasScene

    /** Faut-il semer la première diapo ? Défensif : un paquet vide (reprise, republication) ne montrerait aucun canevas. */
    public fun needsSeedSlide(format: ComposerFormat, slideCount: Int): Boolean =
        format == ComposerFormat.STORY && slideCount == 0

    /**
     * Ce que le FORMAT exige du canevas pour partir : une story se publie sur un fond CHOISI (le geste le plus court qui
     * produise une story qu'on regarde) ; un post, un réel ou une humeur exigent un OBJET. Le semis ne compte jamais comme
     * matière : [slides] ne contient que ce que l'auteur a posé.
     */
    public fun hasPublishableCanvas(format: ComposerFormat, slides: List<StorySlidePublishMatter.Facts>): Boolean = when (format) {
        ComposerFormat.STORY -> StorySlidePublishMatter.anyDeservesAPost(slides)
        ComposerFormat.POST, ComposerFormat.STATUS, ComposerFormat.REEL -> slides.any(StorySlidePublishMatter::carriesObject)
    }
}
