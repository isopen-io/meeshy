package me.meeshy.app.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.StateFlow
import me.meeshy.sdk.relation.BringGateway
import me.meeshy.sdk.relation.BringSendControl
import me.meeshy.sdk.relation.BringSendState

/** L'état de la ligne du Bring d'une fiche : celui que l'en-tête d'un direct lit aussi (#17442). */
typealias ProfileBringState = BringSendState

/** Ce que la ligne du Bring dit après un refus, sans jamais dire « bloqué ». */
typealias BringNotice = me.meeshy.sdk.relation.BringNotice

/**
 * Le Bring sur la fiche d'un ami (#16617) — iso `ProfileBringViewModel.swift` : « Bring » expliqué, « Restants
 * aujourd'hui », ABSENT quand la passerelle ne l'ouvre pas — ni bouton grisé, ni raison. La machine d'envoi est
 * [BringSendControl], partagée avec l'en-tête d'un direct.
 */
@HiltViewModel
class ProfileBringViewModel @Inject constructor(
    gateway: BringGateway,
) : ViewModel() {

    private val control = BringSendControl(gateway, viewModelScope)

    val state: StateFlow<ProfileBringState> = control.state

    fun load(userId: String) = control.load(userId)

    /** Après la confirmation : envoyer, puis dire ce que la passerelle a répondu. */
    fun send() = control.send()

    /** « Annuler » : le Bring cesse chez l'autre, optimiste. */
    fun cancel() = control.cancel()

    fun consumeNotice() = control.consumeNotice()
}
