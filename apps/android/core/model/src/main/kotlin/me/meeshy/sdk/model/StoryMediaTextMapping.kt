package me.meeshy.sdk.model

/**
 * Traduction des clés d'un texte de média (texte alternatif, légende), de l'espace d'ids du COMPOSEUR vers celui du
 * SERVEUR — miroir de `StoryMediaTextMapping` (iOS). `mediaAlt` n'accepte côté passerelle que des ids de `mediaIds` : les
 * autres clés sont filtrées sans bruit, d'où une requête acceptée et un texte jamais enregistré si l'on envoie l'id du composeur.
 */
object StoryMediaTextMapping {

    /**
     * Re-clé [composerKeyed] sur les ids de `PostMedia` d'après les objets média TELS QU'APRÈS ENVOI. Un objet sans
     * `postMediaId` (envoi échoué) ou dont le texte est vide est omis.
     */
    fun serverKeyed(composerKeyed: Map<String, String>, mediaObjects: List<StoryMediaObject>): Map<String, String> =
        buildMap {
            mediaObjects.forEach { media ->
                if (media.postMediaId.isEmpty()) return@forEach
                val text = composerKeyed[media.id]?.takeIf { it.isNotEmpty() } ?: return@forEach
                put(media.postMediaId, text)
            }
        }
}
