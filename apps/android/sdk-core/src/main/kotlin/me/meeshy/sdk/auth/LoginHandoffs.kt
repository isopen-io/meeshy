package me.meeshy.sdk.auth

import java.util.concurrent.atomic.AtomicReference
import javax.inject.Inject
import javax.inject.Singleton

/**
 * L'e-mail déjà tapé dans l'inscription, remis à la connexion quand l'utilisateur bascule (iOS `LoginEmailHandoff`).
 * Il se lit UNE fois : le reprendre l'efface.
 */
@Singleton
public class LoginHandoffs @Inject constructor() {
    private val held = AtomicReference<String?>(null)

    public fun hold(email: String?) {
        held.set(email?.trim()?.takeIf { it.isNotEmpty() })
    }

    public fun take(): String? = held.getAndSet(null)
}
