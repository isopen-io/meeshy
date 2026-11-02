package me.meeshy.sdk.model.relation

import kotlinx.serialization.Serializable

/** Un niveau tel que `GET /relations/config` le présente (#13933) : sa clé de libellé, son icône, ses libellés des sept langues. */
@Serializable
public data class RelationLevelPresentation(
    val level: String,
    val labelKey: String? = null,
    val icon: String? = null,
    val labels: Map<String, String> = emptyMap(),
)

/**
 * La table des cercles servie par la passerelle — miroir de `RelationsConfig.swift`. Les seuils et la matrice des features
 * existent dans la réponse ; ce client ne lit que ce qu'il AFFICHE (libellés, icônes) : aucun seuil n'est recopié ici, la
 * progression servie par lien dit déjà ce qu'il faut.
 */
@Serializable
public data class RelationsConfig(
    val levels: List<RelationLevelPresentation> = emptyList(),
) {
    /**
     * Le libellé du niveau dans [language], ou `null` : l'appelant retombe alors sur le catalogue local, jamais sur la clé.
     * La table sert `pt-BR` quand l'appareil dit `pt` : une langue nue retrouve sa variante servie.
     */
    public fun label(level: RelationLevel, language: String): String? {
        val labels = presentation(level)?.labels ?: return null
        val served = labels[language] ?: labels.entries.firstOrNull { it.key.substringBefore('-') == language }?.value
        return served?.takeIf { it.isNotBlank() }
    }

    public fun icon(level: RelationLevel): String? = presentation(level)?.icon?.takeIf { it.isNotBlank() }

    private fun presentation(level: RelationLevel): RelationLevelPresentation? = levels.firstOrNull { it.level == level.wire }
}

/** Les icônes de repli, quand la table servie n'est pas là (hors ligne au premier lancement, passerelle plus ancienne). */
public object CircleLevelIcons {
    public fun of(level: RelationLevel): String = when (level) {
        RelationLevel.BLOOD -> "🩸"
        RelationLevel.CLOSE -> "🔥"
        RelationLevel.FRIEND -> "🤝"
        RelationLevel.ACQUAINTANCE -> "👋"
        RelationLevel.COMMUNITY -> "👥"
        RelationLevel.PUBLIC -> "🌐"
    }
}
