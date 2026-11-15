package me.meeshy.sdk.model

/**
 * Les noms de clés de session NAMESPACÉS par compte — identiques à ceux de l'iOS (`AuthStorageKeys`,
 * `AuthProfileKeychainStore.swift`). Un seul endroit les écrit : le dépôt d'authentification, le widget Glance et le
 * gestionnaire FCM passent par ici et ne composent jamais une clé à la main.
 *
 * Les jetons actifs de ce coffre gardent leurs emplacements historiques (`jwt`, `session_token`, voir
 * `EncryptedAccountTokenVault`) : renommer des clés déjà écrites déconnecterait les appareils installés.
 */
object AuthStorageKeys {
    fun token(userId: String): String = "meeshy_token_$userId"
    fun user(userId: String): String = "meeshy_user_$userId"
    fun sessionToken(userId: String): String = "meeshy_session_token_$userId"
    fun tokenDate(userId: String): String = "meeshy_token_date_$userId"
}
