package me.meeshy.ui.component.media

/**
 * Les en-têtes d'identité des requêtes média réseau de [MeeshyMediaCache], installés au démarrage par l'app
 * (`MediaRequestCredential` : le jeton ne part que vers l'origine de l'API). Sans eux, l'audio de la bibliothèque de
 * sons (`/api/v1/static/…`, route authentifiée) répond 401. Nue par défaut.
 */
public object MediaRequestHeaders {
    @Volatile
    public var provider: (url: String) -> Map<String, String> = { emptyMap() }
}
