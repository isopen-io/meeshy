package me.meeshy.sdk.model.composer

/**
 * Par où part ce qu'on vient de composer — port de iOS `ComposerPublishChannel` (#4869). Le critère est où la MATIÈRE vit :
 * une story est une suite d'unités autonomes (un post par scène, canal [SCENE]) ; un post, un mood et un réel sont UNE
 * publication portant tous leurs médias (canal [DOCUMENT]). Le réel n'a jamais le canal de la scène : il y produirait un
 * post par slide.
 */
enum class ComposerPublishChannel {
    SCENE,
    DOCUMENT,

    /** Aucun canal ne sait porter ce format : le refus est EXPLICITE, jamais un silence. Aucun format n'y mène aujourd'hui. */
    UNSUPPORTED,
    ;

    companion object {
        /** Exhaustif : un cinquième format ne compile pas tant qu'on n'a pas décidé par où il part. */
        fun of(format: ComposerFormat): ComposerPublishChannel = when (format) {
            ComposerFormat.STORY -> SCENE
            ComposerFormat.POST, ComposerFormat.REEL, ComposerFormat.STATUS -> DOCUMENT
        }
    }
}
