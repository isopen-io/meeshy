package me.meeshy.sdk.model.relation

/**
 * **LE LOGO DE CERCLE PEINT SUR L'INTRO D'UNE STORY EXPORTÉE** (#13997 ; miroir de `relationExportBadge`,
 * `packages/shared/utils/relation-export-badge.ts`, rejoué sur `fixtures/relation-export-badge.vectors.json`).
 *
 * Entrée : le niveau EFFECTIF du lien exportateur et auteur, tel que le serveur le SERT. Sortie : l'emoji du cercle, ou `null` =
 * rien n'est peint. À partir de Proche seulement (Proche 🔥, Sang 🩸) ; Ami et en dessous, une valeur absente, inconnue,
 * en minuscules ou réservée (`ATOM`) ne montrent rien : le logo se ferme sur le doute.
 */
public object RelationExportBadge {

    private val badges: Map<String, String> = mapOf("CLOSE" to "🔥", "BLOOD" to "🩸")

    public fun of(servedLevel: String?): String? = servedLevel?.let(badges::get)
}
