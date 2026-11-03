package me.meeshy.sdk.auth

import me.meeshy.sdk.model.auth.LoginAccountIntent
import me.meeshy.sdk.model.auth.LoginHandoffSlot
import me.meeshy.sdk.model.auth.SentEmailCode
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Les transferts d'intention vers l'écran de connexion (iOS `LoginEmailHandoff` +
 * `LoginAccountHandoff`), à usage unique chacun.
 *
 * - [signupEmail] : l'inscription bascule vers la connexion avec l'adresse qu'on venait de taper.
 * - [account] : « Changer de compte » / « Ajouter un compte » a quitté le compte actuel.
 * - [recoveryEmail] : l'adresse tapée dans l'identifiant, pour le lien par e-mail et le mot de passe oublié.
 * - [sentEmailCode] : un code et un lien déjà partis (inscription d'une adresse déjà utilisée) — la connexion par
 *   e-mail s'ouvre sur leur attente.
 */
@Singleton
class LoginHandoffs @Inject constructor() {
    val signupEmail: LoginHandoffSlot<String> = LoginHandoffSlot()
    val account: LoginHandoffSlot<LoginAccountIntent> = LoginHandoffSlot()
    val recoveryEmail: LoginHandoffSlot<String> = LoginHandoffSlot()
    val sentEmailCode: LoginHandoffSlot<SentEmailCode> = LoginHandoffSlot()
}
