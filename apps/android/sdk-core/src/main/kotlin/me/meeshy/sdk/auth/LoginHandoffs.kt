package me.meeshy.sdk.auth

import me.meeshy.sdk.model.auth.LoginAccountIntent
import me.meeshy.sdk.model.auth.LoginHandoffSlot
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Les transferts d'intention vers l'écran de connexion (iOS `LoginEmailHandoff` +
 * `LoginAccountHandoff`), à usage unique chacun.
 *
 * - [signupEmail] : l'inscription bascule vers la connexion avec l'adresse qu'on venait de taper.
 * - [account] : « Changer de compte » / « Ajouter un compte » a quitté le compte actuel.
 * - [recoveryEmail] : l'adresse tapée dans l'identifiant, pour le lien par e-mail et le mot de passe oublié.
 */
@Singleton
class LoginHandoffs @Inject constructor() {
    val signupEmail: LoginHandoffSlot<String> = LoginHandoffSlot()
    val account: LoginHandoffSlot<LoginAccountIntent> = LoginHandoffSlot()
    val recoveryEmail: LoginHandoffSlot<String> = LoginHandoffSlot()
}
