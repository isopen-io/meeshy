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
 * Le schéma qui déclare qu'une clé vient du magasin STATIQUE (#4625).
 *
 * Miroir Kotlin de `STATIC_STORE_SCHEME` (`packages/shared/api/media-ref.ts`) et
 * de `MeeshyConfig.staticStoreScheme` (iOS). Les trois lisent la MÊME donnée :
 * le changer ici seul servirait les avatars d'un seul client.
 */
const val STATIC_STORE_SCHEME = "static:"

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

    // Le magasin se DÉCLARE dans la donnée (#4625). Il le fallait : aucune
    // FORME de clé ne dit d'où elle vient — `u/i/2025/11/a.jpg` (statique) et
    // `avatars/user/<id>.jpg` (passerelle) se ressemblent trop pour qu'un
    // consommateur les sépare à vue, et chacun de ceux qui essayaient inventait
    // sa propre règle.
    //
    // Sans cette branche, les 272 avatars du magasin statique, réduits à leur
    // clé, partaient se chercher sur la passerelle — où ils ne sont pas. Ils ne
    // s'affichaient jusqu'ici QUE parce qu'ils portaient encore leur hôte.
    //
    // La branche est placée AVANT le repli « base absente » : une clé statique
    // rendue telle quelle serait aussi inutilisable qu'une clé de passerelle,
    // mais `staticOriginOf` a besoin de la base pour dériver l'hôte, et le
    // `?:` ci-dessous rend la valeur brute quand elle manque — même contrat.
    url.startsWith(STATIC_STORE_SCHEME) ->
        staticOriginOf(apiBaseUrl)
            ?.let { origine ->
                val cle = url.removePrefix(STATIC_STORE_SCHEME).trimStart('/')
                if (cle.isEmpty()) url else origine + "/" + encodePathSegments(cle)
            }
            ?: url

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

/**
 * L'origine du magasin STATIQUE — `static.<domaine web>` (#4625).
 *
 * DÉRIVÉE de la base d'API, jamais configurée à part : c'est le même
 * déploiement, et un second réglage à tenir à jour finirait par diverger
 * exactement comme les adresses figées en base que #4625 retire.
 * `gate.meeshy.me` → `static.meeshy.me` ; `gate.staging.meeshy.me` →
 * `static.staging.meeshy.me`.
 *
 * En développement, Next sert `public/` à la RACINE de son origine
 * (`http://localhost:3100/u/i/…`) : il n'y a pas de sous-domaine à poser, et le
 * PORT du web (3100, pas celui de l'API) doit survivre.
 *
 * Miroir Kotlin de `MeeshyConfig.staticOrigin` (iOS).
 */
private fun staticOriginOf(apiBaseUrl: String?): String? {
    if (apiBaseUrl == null) return null
    val origine = originOf(apiBaseUrl)
    val schema = origine.substringBefore("://", "")
    if (schema.isEmpty()) return null
    val hoteEtPort = origine.substringAfter("://")
    val hote = hoteEtPort.substringBefore(':')
    if (hote == "localhost" || hote == "127.0.0.1") return "$schema://$hote:3100"
    val hoteWeb = hote.removePrefix("gate.")
    return "$schema://static.$hoteWeb"
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
