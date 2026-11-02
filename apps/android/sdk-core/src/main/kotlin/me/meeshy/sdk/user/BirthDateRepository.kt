package me.meeshy.sdk.user

import java.time.ZoneId
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.sdk.model.BirthDateDeclaration
import me.meeshy.sdk.model.BirthDateDeclarationError
import me.meeshy.sdk.model.BirthDateRequest
import me.meeshy.sdk.model.BirthDateRules
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.UserApi
import me.meeshy.sdk.net.apiCall

/** Ce que rend une declaration : la classe d'age servie, ou la raison classee du refus. */
sealed interface BirthDateOutcome {
    data class Declared(val declaration: BirthDateDeclaration) : BirthDateOutcome
    data class Refused(val reason: BirthDateDeclarationError) : BirthDateOutcome
}

/**
 * Declare la date de naissance du compte connecte (`PUT me/birth-date`, ecrite UNE fois) —
 * port de `BirthDateService`. Pas de file : la reponse (classe d'age, restriction d'ecriture)
 * fait foi et un refus appelle un geste different selon sa cause.
 */
@Singleton
class BirthDateRepository @Inject constructor(
    private val userApi: UserApi,
) {
    private val _writeRestricted = MutableStateFlow(false)

    /**
     * `viewerWriteRestrictionGlobal` de la derniere declaration : vrai pour un mineur, qui lit
     * sans ecrire. Les surfaces d'ecriture lisent ce drapeau ; la passerelle reste l'autorite.
     */
    val writeRestricted: StateFlow<Boolean> = _writeRestricted.asStateFlow()

    suspend fun setBirthDate(
        epochMillis: Long,
        zone: ZoneId = ZoneId.systemDefault(),
    ): BirthDateOutcome = declare(BirthDateRules.wireDay(epochMillis, zone))

    /** Le selecteur Material3 rend minuit UTC du jour choisi. */
    suspend fun setBirthDateFromPicker(pickerUtcMillis: Long): BirthDateOutcome =
        declare(BirthDateRules.wireDayFromPicker(pickerUtcMillis))

    private suspend fun declare(wireDay: String): BirthDateOutcome =
        when (val result = apiCall { userApi.setBirthDate(BirthDateRequest(wireDay)) }) {
            is NetworkResult.Success -> {
                _writeRestricted.value = BirthDateRules.restrictsWriting(result.data)
                BirthDateOutcome.Declared(result.data)
            }
            is NetworkResult.Failure -> BirthDateOutcome.Refused(
                BirthDateDeclarationError.classify(result.error.httpStatus, result.error.code),
            )
        }
}
