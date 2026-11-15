package me.meeshy.sdk.model.scene

/** Le badge de l'objet sélectionné, « TEXT · PLAN FG · z 2 » : le plan et le rang rendent l'empilement lisible. */
public object SceneSelectionBadge {

    public fun text(obj: MeeshySceneObject): String =
        "${kindCode(obj.kind)} · PLAN ${if (obj.isBackground) "BG" else "FG"} · z ${obj.zIndex}"

    public fun text(lists: SceneLists, id: String): String? = lists.sceneObject(id)?.let(::text)

    private fun kindCode(kind: MeeshySceneObject.Kind): String = when (kind) {
        MeeshySceneObject.Kind.TEXT -> "TEXT"
        MeeshySceneObject.Kind.MEDIA -> "MEDIA"
        MeeshySceneObject.Kind.STICKER -> "STICKER"
        MeeshySceneObject.Kind.PLACE -> "PLACE"
        MeeshySceneObject.Kind.AUDIO -> "AUDIO"
    }
}
