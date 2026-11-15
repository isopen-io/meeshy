package me.meeshy.sdk.model.voice

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import me.meeshy.sdk.model.VoiceProfile

/** Les cinq étapes de l'assistant de création du profil vocal — miroir de `VoiceProfileWizardStep` (iOS), dans le même ordre. */
enum class VoiceWizardStep {
    CONSENT,
    AGE_VERIFICATION,
    RECORDING,
    PROCESSING,
    COMPLETE;

    /** Un segment de la barre de progression s'allume jusqu'à l'étape courante comprise. */
    fun isReached(current: VoiceWizardStep): Boolean = ordinal <= current.ordinal
}

/** Les trois alertes de l'assistant : jamais un message libre, l'écran choisit le libellé localisé. */
enum class VoiceWizardError { UNDER_AGE, CONSENT, UPLOAD }

/** Les règles de la vérification d'âge et de la progression d'envoi. */
object VoiceWizardRules {
    const val MINIMUM_AGE: Int = 18
    private const val DEFAULT_AGE_YEARS: Long = 20

    /**
     * La date de naissance la plus récente admise au clonage vocal : aujourd'hui moins 18 années civiles, au jour
     * près (#17309). `minusYears` ramène un 29 février au 28 quand l'année visée n'en a pas — même loi que la
     * passerelle (`voiceCloningBirthDateLimit`, `packages/shared/utils/age.ts`), qui reste la garde finale.
     */
    fun voiceCloningBirthDateLimit(today: LocalDate): LocalDate = today.minusYears(MINIMUM_AGE.toLong())

    fun isAdult(birthDate: LocalDate, today: LocalDate): Boolean = !birthDate.isAfter(voiceCloningBirthDateLimit(today))

    /** Le sélecteur ne propose que des jours admis : sa date maximale est la limite du clonage vocal. */
    fun isSelectableBirthDate(day: LocalDate, today: LocalDate): Boolean = isAdult(day, today)

    /** Le sélecteur s'ouvre sur un adulte (vingt ans), comme iOS. */
    fun defaultBirthDate(today: LocalDate): LocalDate = today.minusYears(DEFAULT_AGE_YEARS)

    /** `AAAA-MM-JJ` strict : la passerelle rejette un ISO8601 complet. */
    fun wireBirthDate(birthDate: LocalDate): String =
        "${birthDate.year.toString().padStart(4, '0')}-${birthDate.monthValue.toString().padStart(2, '0')}-${birthDate.dayOfMonth.toString().padStart(2, '0')}"

    /** Le sélecteur Material 3 rend minuit UTC du jour choisi : il se lit en UTC. */
    fun dayFromPicker(pickerUtcMillis: Long): LocalDate = Instant.ofEpochMilli(pickerUtcMillis).atZone(ZoneOffset.UTC).toLocalDate()
}

/**
 * L'état de l'assistant (iOS `VoiceProfileWizardViewModel`), réduit par des fonctions pures : l'écran n'en est que la
 * projection, le modèle de vue n'y branche que le réseau.
 */
data class VoiceWizardState(
    val step: VoiceWizardStep = VoiceWizardStep.CONSENT,
    val consentGiven: Boolean = false,
    val birthDate: LocalDate = LocalDate.of(2000, 1, 1),
    val isLoading: Boolean = false,
    val uploadedCount: Int = 0,
    val totalToUpload: Int = 0,
    val profile: VoiceProfile? = null,
    val error: VoiceWizardError? = null,
) {
    sealed interface AgeSubmission {
        data class Refused(val state: VoiceWizardState) : AgeSubmission
        data class Accepted(val state: VoiceWizardState, val wireBirthDate: String) : AgeSubmission
    }

    val canContinueFromConsent: Boolean get() = consentGiven

    val uploadFraction: Float
        get() = if (totalToUpload <= 0) 0f else (uploadedCount.toFloat() / totalToUpload).coerceIn(0f, 1f)

    fun continueFromConsent(): VoiceWizardState =
        if (consentGiven) copy(step = VoiceWizardStep.AGE_VERIFICATION, error = null) else this

    fun submitAge(today: LocalDate): AgeSubmission =
        if (!VoiceWizardRules.isAdult(birthDate, today)) {
            AgeSubmission.Refused(copy(isLoading = false, error = VoiceWizardError.UNDER_AGE))
        } else {
            AgeSubmission.Accepted(copy(isLoading = true, error = null), VoiceWizardRules.wireBirthDate(birthDate))
        }

    fun consentGranted(): VoiceWizardState = copy(step = VoiceWizardStep.RECORDING, isLoading = false, error = null)

    fun consentFailed(): VoiceWizardState = copy(isLoading = false, error = VoiceWizardError.CONSENT)

    fun uploadStarted(total: Int): VoiceWizardState =
        copy(step = VoiceWizardStep.PROCESSING, uploadedCount = 0, totalToUpload = total, error = null)

    fun sampleUploaded(): VoiceWizardState = copy(uploadedCount = uploadedCount + 1)

    fun uploadCompleted(profile: VoiceProfile?): VoiceWizardState = copy(step = VoiceWizardStep.COMPLETE, profile = profile)

    fun uploadFailed(): VoiceWizardState = copy(step = VoiceWizardStep.RECORDING, error = VoiceWizardError.UPLOAD)

    fun errorDismissed(): VoiceWizardState = copy(error = null)
}
