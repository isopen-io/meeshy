package me.meeshy.sdk.model

/** Garde de la creation a la volee d'une categorie (iOS `CategoryPickerField.create`) : une seule a la fois, nom non vide. */
object CategoryCreationGate {

    /** Le nom a creer, ou `null` quand la creation est inerte (deja en cours ou nom vide). */
    fun begin(name: String, isCreating: Boolean): String? {
        if (isCreating) return null
        return name.trim().takeIf { it.isNotEmpty() }
    }
}
