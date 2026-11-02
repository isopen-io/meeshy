package me.meeshy.sdk.model.scene

/**
 * L'empreinte de cache d'un élément rendu (miroir de `StoryRendererCache.ItemSignature`) : id,
 * pose interpolée, présence, langues du lecteur et empreinte de contenu. Deux signatures sont
 * égales si et seulement si l'élément se peindrait à l'identique ; elle change dès qu'un de
 * ces éléments change.
 */
public data class SceneItemSignature(
    val id: String,
    val pose: ScenePose,
    val presence: ScenePresence,
    val languages: List<String>,
    val content: String?,
)
