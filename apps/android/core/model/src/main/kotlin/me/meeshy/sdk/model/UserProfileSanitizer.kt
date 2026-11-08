package me.meeshy.sdk.model

private const val DATA_URI_PREFIX = "data:"

/**
 * Le profil tel qu'il se garde dans le coffre : sans image `data:` (avatar et bannière peints en attendant l'envoi
 * ne sont pas une adresse durable et gonfleraient l'entrée). Miroir de `MeeshyUser.droppingDataURIImages` iOS.
 * Un utilisateur sans image `data:` est rendu tel quel.
 */
fun MeeshyUser.droppingDataUriImages(): MeeshyUser {
    val dataAvatar = avatar?.startsWith(DATA_URI_PREFIX) == true
    val dataBanner = banner?.startsWith(DATA_URI_PREFIX) == true
    if (!dataAvatar && !dataBanner) return this
    return copy(
        avatar = if (dataAvatar) null else avatar,
        avatarThumbHash = if (dataAvatar) null else avatarThumbHash,
        banner = if (dataBanner) null else banner,
        bannerThumbHash = if (dataBanner) null else bannerThumbHash,
    )
}
