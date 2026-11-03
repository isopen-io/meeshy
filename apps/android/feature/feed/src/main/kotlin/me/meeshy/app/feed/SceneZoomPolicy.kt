package me.meeshy.app.feed

/**
 * Quelle carte zoome jusqu'à la galerie, et quand (iOS `SceneZoomTransition`) — la règle, sans vue.
 *
 * L'identité est préfixée : l'espace de noms de la transition est PARTAGÉ avec le plateau de stories, dont les sources sont des
 * identifiants de groupe.
 */
internal object SceneZoomPolicy {

    fun sourceKey(postId: String): String = "post-scene:$postId"

    /**
     * La galerie ne zoome que si elle s'ouvre SUR la scène. Un média du carrousel n'a aucune source enregistrée : le système
     * zoomerait depuis nulle part. `null` ⇒ la présentation habituelle.
     */
    fun destinationKey(postId: String, hasScene: Boolean, startMediaId: String?): String? =
        if (hasScene && startMediaId == null) sourceKey(postId) else null
}
