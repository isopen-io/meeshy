package me.meeshy.ui.story.reader

import androidx.compose.runtime.Stable
import java.io.File

/**
 * Le contexte d'exécution UNIQUE d'une surface de lecture de scène (iOS `StoryReaderContext`) : langues du lecteur
 * (Prisme), muet et son verrou, achèvement, résolveurs d'adresses et médias ADOPTÉS. Le viewer de stories, le fil, le
 * repost et l'aperçu de post-story le fournissent à [StoryReaderSurface] sans dépendre les uns des autres.
 *
 * [mute] dit l'ÉTAT, [locksMute] dit s'il a le droit de changer : une carte de fil est muette PAR CONSTRUCTION.
 * [showsImageRectOnly] : l'hôte ne présente que le rectangle de l'image — le remplissage de bande est supprimé.
 */
@Stable
public data class StoryReaderContext(
    public val preferredLanguages: List<String> = emptyList(),
    public val mute: Boolean = false,
    public val locksMute: Boolean = false,
    public val showsImageRectOnly: Boolean = false,
    public val onCompletion: (() -> Unit)? = null,
    public val postMediaUrlResolver: ((String) -> String?)? = null,
    public val localAudioUrlResolver: ((String) -> String?)? = null,
    public val localMediaAliases: Map<String, String> = emptyMap(),
) {
    /** Le muet effectif d'une demande de l'hôte : verrouillé, la demande est ignorée. */
    public fun effectiveMute(requested: Boolean?): Boolean = if (locksMute) mute else requested ?: mute

    /** Copie avec une autre chaîne de langues (exploration en cours de lecture), tous les autres réglages conservés. */
    public fun withPreferredLanguages(languages: List<String>): StoryReaderContext = copy(preferredLanguages = languages)

    /**
     * Un média ADOPTÉ garde son FICHIER local tant qu'il existe : l'échange avec l'adresse téléversée doit rester
     * imperceptible. [key] : l'adresse distante ou l'identifiant de média ; rend [key] tel quel sans fichier.
     */
    public fun aliasing(key: String, fileExists: (String) -> Boolean = { File(it).exists() }): String {
        val local = localMediaAliases[key] ?: return key
        return if (fileExists(local)) local else key
    }

    public companion object {
        public val Empty: StoryReaderContext = StoryReaderContext()
    }
}
