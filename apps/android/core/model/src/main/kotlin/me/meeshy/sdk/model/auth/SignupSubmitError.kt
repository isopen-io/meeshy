package me.meeshy.sdk.model.auth

import me.meeshy.sdk.model.ApiViolation

/**
 * Pourquoi la passerelle a refusé une inscription — un cas par refus que
 * l'écran rend DIFFÉREMMENT. Deux refus qui se lisent pareil n'ont pas à se
 * distinguer ici ; deux refus qui appellent une action différente, si.
 */
public enum class SignupRefusal {
    /**
     * `200` + `phoneOwnershipConflict` : le numéro appartient déjà à un compte
     * vérifié et AUCUN compte n'a été créé. Le seul refus qui ne porte pas de
     * code d'erreur — il arrive sous un statut de succès.
     */
    PHONE_OWNERSHIP_CONFLICT,

    /** `400 PHONE_INVALID` — le numéro n'est pas composable. */
    PHONE_INVALID,

    /** `409 EMAIL_TAKEN` — l'adresse a déjà un compte ; l'issue est de s'y connecter. */
    EMAIL_TAKEN,

    /**
     * `409 USERNAME_TAKEN` — la passerelle dérive le pseudo du nom affiché, et
     * ce pseudo est pris. L'écran n'ayant plus de champ pseudo, le refus se pose
     * sous le NOM AFFICHÉ : c'est la seule saisie qui peut le changer.
     */
    NAME_TAKEN,

    /** `400 VALIDATION_ERROR` — une violation nommant un champ de cet écran. */
    INVALID,
}

/**
 * Le refus d'une soumission, rangé par ce que l'écran doit en faire.
 *
 * [Field] se pose SOUS son champ (`supportingText` + `isError`) ; [Network] et
 * [Global] au-dessus du bouton. Un refus typé qui atterrirait dans une bannière
 * globale obligerait l'utilisateur à retrouver seul lequel de ses cinq champs
 * est en cause.
 */
public sealed interface SignupSubmitError {

    /** Un refus attribuable à un champ précis. */
    public data class Field(
        val target: SignupField,
        val refusal: SignupRefusal,
        /** Le texte de la passerelle, quand elle en donne un de plus précis. */
        val serverMessage: String?,
    ) : SignupSubmitError

    /** Le réseau n'a pas répondu — rien n'a été tenté côté serveur. */
    public data object Network : SignupSubmitError

    /** Un refus qu'aucun champ ne porte : message global au-dessus du bouton. */
    public data class Global(val message: String?) : SignupSubmitError
}

/**
 * Le routage pur d'une réponse de refus vers le champ qui la porte.
 *
 * Les clés lues (`code`, `field`, `violations`) sont à la RACINE de l'enveloppe
 * d'erreur, pas sous `error` — c'est `ApiResponse` qui les décode et `ApiError`
 * qui les transporte. Ce cœur ne connaît que des primitives : il reste dans
 * `:core:model`, que `:core:network` peut dépendre de, jamais l'inverse.
 */
public object SignupErrorRouter {

    public const val CODE_VALIDATION_ERROR: String = "VALIDATION_ERROR"
    public const val CODE_PHONE_INVALID: String = "PHONE_INVALID"
    public const val CODE_USERNAME_TAKEN: String = "USERNAME_TAKEN"
    public const val CODE_EMAIL_TAKEN: String = "EMAIL_TAKEN"

    /** Le code que `apiCall` pose sur une panne de transport (`IOException`). */
    public const val CODE_NETWORK: String = "NETWORK"

    /**
     * Le refus du `200 phoneOwnershipConflict` — construit ici plutôt que chez
     * l'appelant pour que le seul refus SANS code sorte du même site que les
     * autres.
     */
    public val phoneOwnershipConflict: SignupSubmitError.Field = SignupSubmitError.Field(
        target = SignupField.PHONE,
        refusal = SignupRefusal.PHONE_OWNERSHIP_CONFLICT,
        serverMessage = null,
    )

    /**
     * Range un refus HTTP sous son champ.
     *
     * L'ordre compte : un `code` typé décide seul, parce qu'il dit le POURQUOI
     * (une adresse déjà prise n'est pas une adresse malformée) ; à défaut on
     * suit le `field` de la racine ; à défaut la première violation qui nomme un
     * champ de cet écran ; et sinon le refus reste global plutôt que d'être
     * arbitrairement attribué.
     */
    public fun route(
        code: String?,
        fieldName: String? = null,
        message: String? = null,
        violations: List<ApiViolation> = emptyList(),
    ): SignupSubmitError {
        val normalizedCode = code?.trim()?.uppercase()
        if (normalizedCode == CODE_NETWORK) return SignupSubmitError.Network

        val typed = when (normalizedCode) {
            CODE_PHONE_INVALID -> SignupField.PHONE to SignupRefusal.PHONE_INVALID
            CODE_EMAIL_TAKEN -> SignupField.EMAIL to SignupRefusal.EMAIL_TAKEN
            CODE_USERNAME_TAKEN -> SignupField.DISPLAY_NAME to SignupRefusal.NAME_TAKEN
            else -> null
        }
        if (typed != null) {
            return SignupSubmitError.Field(typed.first, typed.second, message)
        }

        fieldFor(fieldName)?.let { return SignupSubmitError.Field(it, SignupRefusal.INVALID, message) }

        violations.firstNotNullOfOrNull { violation ->
            fieldFor(violation.path)?.let { target ->
                SignupSubmitError.Field(target, SignupRefusal.INVALID, violation.message ?: message)
            }
        }?.let { return it }

        return SignupSubmitError.Global(message)
    }

    /**
     * Le champ que nomme une clé de fil.
     *
     * `username` y mène au nom affiché : la passerelle dérive le pseudo du nom,
     * donc c'est le nom qu'il faut changer. `firstName` / `lastName` y mènent
     * aussi — l'ancien wizard les envoyait, et une passerelle qui refuserait
     * encore sur eux doit pointer la seule saisie qui les compose.
     *
     * Le chemin d'une violation arrive nu (`"email"`) ou pointé
     * (`"/body/email"`) : seule sa FEUILLE est comparée.
     */
    public fun fieldFor(name: String?): SignupField? = when (leafOf(name)) {
        "displayname", "name", "username", "firstname", "lastname" -> SignupField.DISPLAY_NAME
        "email" -> SignupField.EMAIL
        "phone", "phonenumber", "phonecountrycode" -> SignupField.PHONE
        "password" -> SignupField.PASSWORD
        else -> null
    }

    private fun leafOf(name: String?): String? = name
        ?.trim()
        ?.trimEnd('/', '.')
        ?.substringAfterLast('/')
        ?.substringAfterLast('.')
        ?.lowercase()
        ?.takeIf { it.isNotEmpty() }
}

/** Ce qu'un champ affiche sous lui — au plus un message à la fois. */
public sealed interface SignupFieldMessage {

    /** Un refus local ([SignupForm.visibleValidation]). */
    public data class Local(val issue: SignupFieldIssue) : SignupFieldMessage

    /** Un refus de la passerelle attribué à ce champ. */
    public data class Refused(
        val refusal: SignupRefusal,
        val serverMessage: String?,
    ) : SignupFieldMessage
}

/** Quel message un champ porte, du refus serveur au refus local. */
public object SignupFieldMessages {

    /**
     * Le refus de la passerelle GAGNE sur le verdict local : il est le plus
     * récent et le seul à savoir ce que le serveur sait (une adresse valide peut
     * être déjà prise). Le verdict local ne reprend la main qu'une fois le refus
     * serveur effacé — ce que fait la moindre modification de la saisie.
     */
    public fun resolve(
        field: SignupField,
        validation: SignupValidation,
        submitError: SignupSubmitError?,
    ): SignupFieldMessage? {
        val refused = (submitError as? SignupSubmitError.Field)?.takeIf { it.target == field }
        if (refused != null) return SignupFieldMessage.Refused(refused.refusal, refused.serverMessage)
        return validation.issueFor(field)?.let { SignupFieldMessage.Local(it) }
    }
}
