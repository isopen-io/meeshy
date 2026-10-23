package me.meeshy.sdk.conversation

/**
 * Le mot qui désigne le LECTEUR dans l'aperçu d'une ligne (« Vous : … »), localisé par l'app :
 * le SDK ne lit aucun catalogue de chaînes, il reçoit le mot par cette couture.
 */
interface ReaderLabelProvider {
    fun youLabel(): String
}
