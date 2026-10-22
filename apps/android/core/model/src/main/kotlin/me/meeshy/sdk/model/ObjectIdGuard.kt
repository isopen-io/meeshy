package me.meeshy.sdk.model

/**
 * SSOT Kotlin du prédicat « cette chaîne est-elle un ObjectId MongoDB ? » et de son contraire
 * utile au client : « cette chaîne nomme-t-elle une chose qui n'existe que LOCALEMENT ? ».
 *
 * Miroir de `ObjectID` (`packages/MeeshySDK/.../Utils/ObjectID.swift`) et de `OBJECT_ID_REGEX`
 * (`packages/shared/utils/object-id.ts`, `/^[0-9a-fA-F]{24}$/`).
 *
 * ## Pourquoi le client en a besoin
 *
 * Le client FABRIQUE des identifiants locaux — `cid_<uuid>` (bulle optimiste), `cmid_<uuid>`
 * (mutation, téléversement en file) et `pending_<uuid>` (story encore en file de publication).
 * Envoyé à une route qui attend une clé de document, un tel identifiant ne produit pas un 404 :
 * Prisma **lève** (`P2023`, « Malformed ObjectID »), ce que le serveur rend en 500 — et une ligne
 * d'outbox retentée cinq fois y pourrit jusqu'à l'épuisement. Ce garde permet de tenir la MÊME
 * frontière que la passerelle AVANT de laisser partir (ou même d'essayer) la mutation.
 */
public object ObjectIdGuard {

    /** Un ObjectId MongoDB est exactement 24 caractères hexadécimaux, casse indifférente. */
    public const val LENGTH: Int = 24

    /** Les préfixes des identifiants fabriqués par le client. */
    public val LOCAL_ID_PREFIXES: List<String> = listOf("cid_", "cmid_", "pending_")

    /**
     * `true` uniquement pour une chaîne de 24 caractères hexadécimaux ASCII.
     *
     * Écrit sans `Regex` : le prédicat s'appelle sur des chemins chauds (chaque story révélée,
     * chaque ligne d'outbox examinée) et vingt-quatre comparaisons de caractères ne méritent pas
     * une expression compilée. Les chiffres non ASCII (`Char.isDigit`) sont refusés.
     */
    public fun isValid(id: String?): Boolean {
        if (id == null || id.length != LENGTH) return false
        return id.all { it in '0'..'9' || it in 'a'..'f' || it in 'A'..'F' }
    }

    /**
     * `true` pour un identifiant fabriqué par le client (`cid_`, `cmid_`, `pending_` suivis d'un
     * corps non vide). Volontairement PRÉCIS plutôt que « tout ce qui n'est pas un ObjectId » : la
     * passerelle adresse aussi certaines ressources par un identifiant lisible (la conversation
     * `meeshy`, un `mshy_<slug>`), qu'un refus négatif retiendrait à tort.
     */
    public fun isLocalId(id: String?): Boolean {
        if (id.isNullOrEmpty()) return false
        return LOCAL_ID_PREFIXES.any { prefix -> id.length > prefix.length && id.startsWith(prefix) }
    }
}
