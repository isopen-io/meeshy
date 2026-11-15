package me.meeshy.sdk.model.auth

import me.meeshy.sdk.model.MeeshyUser
import java.net.URI

/**
 * Ce que dit la question « Se connecter en tant que @x ? » (#10872, #10880) — le contrat de la réponse
 * `requiresConfirmation` de la passerelle (`id`, `username`, `displayName`, `avatar`, `maskedEmail`),
 * mis en données UNE fois. Miroir de `LinkSignInConfirmationContent` (iOS `LinkSignInConfirmationSheet.swift`).
 *
 * Les PHRASES vivent dans les ressources (7 langues) ; ici, seulement ce qui s'y insère et les décisions
 * qui précèdent le rendu : quel nom afficher, quel avatar le lien a le droit de faire charger, si le « oui »
 * revendique l'adresse.
 */
data class LinkSignInConfirmationContent(
    /** « @pseudo » — le titre de la feuille s'écrit avec. */
    val handle: String,
    /** `null` quand il manque, est blanc ou répète le pseudo. */
    val displayName: String?,
    /** `null` ⇒ l'avatar se rend en initiales. */
    val avatarUrl: String?,
    val avatarName: String,
    /** L'adresse en jeu, masquée PAR LA PASSERELLE ; `null` quand elle manque ou est blanche. */
    val maskedEmail: String?,
    /** « Nom (@pseudo) » ou « @pseudo » : le compte que le lien ouvre. */
    val incomingLabel: String,
    /** Le compte actuellement ouvert, nommé de la même façon ; `null` quand personne n'est connecté. */
    val currentLabel: String?,
    /** Le « oui » rattache aussi l'adresse à ce compte (elle quitte celui qui la porte). */
    val claimsEmail: Boolean,
) {
    /** La phrase lue en UN geste par un lecteur d'écran : le compte, puis l'adresse masquée. */
    val accountAccessibilityLabel: String
        get() = maskedEmail?.let { "$incomingLabel, $it" } ?: incomingLabel

    companion object {
        /** Délai avant que « Se connecter » s'arme : la feuille monte après un aller-retour réseau, sous un doigt déjà ailleurs. */
        const val ARMING_DELAY_MS: Long = 700L

        fun of(question: LoginOutcome.LinkConfirmationRequired, signedIn: MeeshyUser?): LinkSignInConfirmationContent {
            val account = question.account
            val name = account.displayName?.trim().orEmpty()
            val shownName = name.takeUnless { it.isEmpty() || it == account.username }
            val email = question.maskedEmail?.trim().orEmpty()
            return LinkSignInConfirmationContent(
                handle = "@${account.username}",
                displayName = shownName,
                avatarUrl = account.avatar?.trim()?.takeIf(::isMeeshyHosted),
                avatarName = shownName ?: account.username,
                maskedEmail = email.ifEmpty { null },
                incomingLabel = accountLabel(account.displayName, account.username),
                currentLabel = signedIn?.takeIf { it.username.isNotEmpty() }
                    ?.let { accountLabel(it.displayName, it.username) },
                claimsEmail = question.intent == LinkSignInIntent.CLAIM_EMAIL,
            )
        }

        /** « Nom (@pseudo) », ou « @pseudo » quand le nom affiché manque ou le répète. */
        fun accountLabel(displayName: String?, username: String): String {
            val name = displayName?.trim().orEmpty()
            return if (name.isEmpty() || name == username) "@$username" else "$name (@$username)"
        }

        /**
         * L'avatar est choisi par le compte du lien : il ne se charge que depuis Meeshy — une URL libre
         * pisterait celui qui ouvre le lien, au moment où il l'ouvre. Ailleurs, les initiales.
         */
        fun isMeeshyHosted(avatar: String): Boolean {
            if (avatar.startsWith("/") && !avatar.startsWith("//")) return true
            val uri = runCatching { URI(avatar) }.getOrNull() ?: return false
            val host = uri.host?.lowercase() ?: return false
            return uri.scheme.equals("https", ignoreCase = true) &&
                uri.userInfo == null &&
                (host == "meeshy.me" || host.endsWith(".meeshy.me"))
        }
    }
}
