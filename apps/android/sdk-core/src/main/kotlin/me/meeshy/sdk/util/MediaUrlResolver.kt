package me.meeshy.sdk.util

/**
 * Le site UNIQUE qui compose l'adresse d'un média (#4324).
 *
 * ## Ce que la base porte, et ce qu'elle ne porte pas
 *
 * Elle porte la CLÉ du média — `2025/10/<id>/photo.png` — et rien d'autre : ni
 * hôte, ni préfixe d'API, ni version. Ce sont des décisions de déploiement, et
 * une donnée qui les porte devient fausse le jour où l'une d'elles change, sans
 * que rien ne le signale. Le serveur SERT ; c'est au SDK de poser la route.
 *
 * ## Pourquoi ce fichier existe
 *
 * Ce résolveur existait en QUATRE exemplaires identiques mot pour mot —
 * `BubbleContentBuilder`, `ReelPresentation`, `StoryRingPresentation`,
 * `FeedMediaUrl` — et les quatre avaient le même défaut : pour une clé nue, ils
 * rendaient `base + "/" + clé`, soit `https://gate.meeshy.me/2025/10/…`. Le
 * segment de service manquait, et les 514 attachements déjà stockés sous cette
 * forme étaient illisibles sur Android comme sur iOS (corrigé côté iOS par
 * `MeeshyConfig.resolveMediaURL`).
 *
 * Corriger une jumelle sur quatre aurait réparé un quart du défaut en laissant
 * trois copies diverger — le motif que ce dépôt paie en boucle.
 */

/** Le segment sous lequel la passerelle sert un fichier, RELATIF au préfixe d'API. */
private const val ATTACHMENT_FILE_ROUTE = "attachments/file/"

/**
 * Rend l'adresse chargeable d'un média.
 *
 * @param url ce que la base porte : une clé de stockage, un chemin absolu, ou
 *   une URL complète (formes héritées, encore présentes en base).
 * @param apiBaseUrl la base d'API CONFIGURÉE — origine + préfixe versionné
 *   (`https://gate.meeshy.me/api/v1`). C'est d'elle que vient la version : elle
 *   n'est jamais écrite ici.
 */
fun resolveMediaUrl(url: String, apiBaseUrl: String?): String = when {
    // Une URL complète porte déjà tout : hôte, route, version.
    url.startsWith("http") -> url

    // Sans base configurée, on ne peut RIEN composer — rendre la valeur telle
    // quelle plutôt qu'une adresse inventée qui échouerait plus loin.
    apiBaseUrl == null -> url

    // Un chemin absolu porte déjà sa route : il se raccroche à l'ORIGINE, pas à
    // la base d'API, sinon `/api/v1/x` deviendrait `/api/v1/api/v1/x`.
    url.startsWith("/") -> originOf(apiBaseUrl) + url

    // Idem pour une chaîne qui porte le segment de service sans barre initiale.
    url.contains(ATTACHMENT_FILE_ROUTE) -> originOf(apiBaseUrl) + "/" + url

    // Une chaîne VIDE ne désigne aucun média : ne pas lui poser de route.
    url.isEmpty() -> originOf(apiBaseUrl) + "/"

    // Ce qui reste est une CLÉ DE STOCKAGE : le SDK pose la route.
    else -> apiBaseUrl.trimEnd('/') + "/" + ATTACHMENT_FILE_ROUTE + encodePathSegments(url)
}

/** L'origine (schéma + hôte + port) d'une base d'API, sans son chemin. */
private fun originOf(apiBaseUrl: String): String {
    val sansSchema = apiBaseUrl.substringAfter("://", "")
    if (sansSchema.isEmpty()) return apiBaseUrl.trimEnd('/')
    val schema = apiBaseUrl.substringBefore("://")
    return schema + "://" + sansSchema.substringBefore('/')
}

/**
 * Encode ce qu'une URL ne peut pas porter tel quel, SANS toucher aux barres
 * obliques : ce sont les séparateurs du chemin, pas des caractères à échapper.
 * Le serveur décode ensuite (`decodeURIComponent`), donc les deux formes lui
 * conviennent — mais un espace non encodé casse l'URL avant d'y arriver.
 */
private fun encodePathSegments(chemin: String): String =
    chemin.split('/').joinToString("/") { segment ->
        segment.flatMap { c ->
            if (c.isLetterOrDigit() || c in "-._~!$&'()*+,;=:@") listOf(c)
            else c.toString().toByteArray(Charsets.UTF_8).flatMap { b ->
                "%%%02X".format(b.toInt() and 0xFF).toList()
            }
        }.joinToString("")
    }
