package me.meeshy.sdk.model.auth

import java.util.concurrent.atomic.AtomicReference

/**
 * Une valeur remise à l'écran de connexion avant qu'il n'existe (iOS `LoginEmailHandoff`,
 * `LoginAccountHandoff`) : l'écran d'origine est refermé ou démonté avant que la connexion
 * ne se monte, la valeur l'y attend donc ici, en mémoire vive, et ne sert QU'UNE FOIS.
 * La dernière écriture gagne ; rien n'est persisté.
 */
public class LoginHandoffSlot<T : Any> {
    private val held = AtomicReference<T?>(null)

    public fun hold(value: T?) {
        held.set(value)
    }

    /** Lire vide la case. */
    public fun take(): T? = held.getAndSet(null)
}

/** Ce que « Changer de compte » / « Ajouter un compte » demande à la connexion d'ouvrir (iOS `LoginAccountHandoff.Intent`). */
public sealed interface LoginAccountIntent {
    /** Le formulaire d'un nouveau compte, pas le sélecteur. */
    public data object AddAccount : LoginAccountIntent

    /** La saisie du mot de passe de CE compte. */
    public data class Account(val id: String) : LoginAccountIntent
}

/** L'identifiant tapé quand c'est une ADRESSE (iOS `LoginView.prefillableEmail`) : la connexion par e-mail et le mot de passe oublié la reçoivent. */
public object LoginEmailCandidate {
    public fun from(username: String): String {
        val trimmed = username.trim()
        return if (SignupFieldValidation.isEmailValidLocally(trimmed)) trimmed else ""
    }
}
