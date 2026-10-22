package me.meeshy.sdk.model.scene

/**
 * UNE sélection à la fois, quel que soit le genre. Un fond n'a ni puce ni sélection (#4918) ;
 * un identifiant qui ne désigne plus rien (objet supprimé) se rabat sur « rien de sélectionné ».
 */
public object SceneSelection {
    /** [id] si l'objet existe et peut être sélectionné, sinon `null`. */
    public fun select(lists: SceneLists, id: String?): String? =
        id?.takeIf { wanted -> lists.sceneObject(wanted)?.isBackground == false }

    /** La sélection courante, si elle tient toujours. */
    public fun reconcile(lists: SceneLists, selected: String?): String? = select(lists, selected)
}
