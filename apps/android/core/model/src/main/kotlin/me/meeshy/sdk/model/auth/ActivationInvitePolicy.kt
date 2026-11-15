package me.meeshy.sdk.model.auth

import java.time.Instant
import java.time.ZoneId
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.UserActivation
import me.meeshy.sdk.model.UserActivation.Channel

/**
 * L'etat de la feuille « Validez votre compte » (#8239) : l'activation figee a l'ouverture, l'adresse a prouver
 * et les canaux prouves depuis. Miroir de `ActivationInviteViewModel` (iOS).
 */
data class ActivationInviteState(
    val activation: UserActivation? = null,
    val email: String? = null,
    val proven: List<Channel> = emptyList(),
    val isPresented: Boolean = false,
) {
    val missing: List<Channel> get() = activation?.missing.orEmpty()
    val isComplete: Boolean get() = activation != null && missing.isEmpty()
    fun daysLeft(nowEpochMillis: Long): Int? = activation?.daysLeft(nowEpochMillis)
}

/** La regle d'ouverture, la preuve et l'absorption de la feuille d'invitation — pure, sans horloge ni stockage. */
object ActivationInvitePolicy {

    /** Accroche selon les jours restants : aucun ou 0, 1 jour, N jours. */
    sealed interface Lead {
        data object Open : Lead
        data object OneDay : Lead
        data class Days(val days: Int) : Lead
    }

    /** Phase `invite` avec quelque chose a demander, pas deja montree ce jour civil, jamais sous l'onboarding. */
    fun shouldOpen(user: MeeshyUser?, shownToday: Boolean, onboardingVisible: Boolean): Boolean =
        user?.activation?.invites == true && !shownToday && !onboardingVisible

    fun open(user: MeeshyUser): ActivationInviteState =
        ActivationInviteState(activation = user.activation, email = user.email, proven = emptyList(), isPresented = true)

    fun prove(state: ActivationInviteState, channel: Channel): ActivationInviteState {
        val current = state.activation ?: return state
        if (channel !in current.missing) return state
        val rest = current.missing - channel
        val next = if (channel == Channel.EMAIL) {
            UserActivation(phase = UserActivation.Phase.DONE, deadline = null, missing = rest)
        } else {
            current.copy(missing = rest)
        }
        return state.copy(activation = next, proven = state.proven + channel)
    }

    /** Les preuves qui arrivent par l'utilisateur courant : adresse prouvee, numero verifie ET non vide. */
    fun absorb(state: ActivationInviteState, user: MeeshyUser): ActivationInviteState {
        var next = state
        if (user.emailVerifiedAt != null) next = prove(next, Channel.EMAIL)
        if (user.phoneVerifiedAt != null && !user.phoneNumber.isNullOrEmpty()) next = prove(next, Channel.PHONE)
        return next
    }

    fun lead(daysLeft: Int?): Lead = when (daysLeft) {
        null, 0 -> Lead.Open
        1 -> Lead.OneDay
        else -> Lead.Days(daysLeft)
    }
}

/** Le jour civil LOCAL en cle stable (`annee-mois-jour`, sans zero de tete — comme iOS). */
object ActivationInviteDay {
    fun key(epochMillis: Long, zone: ZoneId): String {
        val date = Instant.ofEpochMilli(epochMillis).atZone(zone).toLocalDate()
        return "${date.year}-${date.monthValue}-${date.dayOfMonth}"
    }
}
