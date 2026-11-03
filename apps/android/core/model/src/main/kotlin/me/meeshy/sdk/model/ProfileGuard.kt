package me.meeshy.sdk.model

/**
 * La garde du profil optimiste : une relecture serveur ne ré-écrase jamais une édition que la passerelle n'a pas
 * encore confirmée. La liste des éditions en attente est celle de l'outbox durable (lignes `UPDATE_PROFILE`) : la
 * garde tombe d'elle-même quand la ligne est confirmée ou abandonnée, sans seconde copie à tenir.
 */
object ProfileGuard {
    /** [server] sur lequel les éditions [pending] sont rejouées, de la plus ancienne à la plus récente. */
    fun fold(server: MeeshyUser, pending: List<UpdateProfileRequest>): MeeshyUser =
        pending.fold(server, ProfileEditApply::apply)
}
