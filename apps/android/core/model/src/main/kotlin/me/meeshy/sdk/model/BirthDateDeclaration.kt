package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/** Corps de `PUT /me/birth-date` : le jour CIVIL `AAAA-MM-JJ`. */
@Serializable
data class BirthDateRequest(val birthDate: String)

/** La classe d'age que la passerelle deduit de la date declaree. */
enum class AgeClass {
    ADULT,
    MINOR,

    /** Une classe qu'une passerelle plus recente sait nommer. */
    UNKNOWN,
    ;

    companion object {
        fun from(raw: String?): AgeClass = when (raw) {
            "adult" -> ADULT
            "minor" -> MINOR
            else -> UNKNOWN
        }
    }
}

/**
 * Ce que `PUT /me/birth-date` rend (port de `APIBirthDateDeclaration`). Les deux champs
 * sont lus tels quels : [ageClass] garde la chaine du fil, [ageClassKind] en donne la lecture
 * typee avec repli.
 */
@Serializable
data class BirthDateDeclaration(
    val ageClass: String? = null,
    /** Global se lit sans s'ecrire (13-17 ans). */
    val viewerWriteRestrictionGlobal: Boolean = false,
) {
    val ageClassKind: AgeClass get() = AgeClass.from(ageClass)
}

/** Pourquoi une declaration n'a pas ete ecrite — chaque cas appelle un geste different. */
enum class BirthDateDeclarationError {
    ALREADY_SET,
    BELOW_MINIMUM_AGE,
    INVALID_DATE,
    UNSUPPORTED,
    UNAVAILABLE,
    ;

    companion object {
        const val ALREADY_SET_CODE = "BIRTH_DATE_ALREADY_SET"
        const val BELOW_MINIMUM_CODE = "AGE_BELOW_MINIMUM"

        /** Le CODE prime sur le statut : c'est lui que le contrat documente. */
        fun classify(httpStatus: Int?, code: String?): BirthDateDeclarationError = when {
            code == ALREADY_SET_CODE || httpStatus == 409 -> ALREADY_SET
            code == BELOW_MINIMUM_CODE || httpStatus == 422 -> BELOW_MINIMUM_AGE
            httpStatus == 404 -> UNSUPPORTED
            httpStatus == 400 -> INVALID_DATE
            else -> UNAVAILABLE
        }
    }
}
