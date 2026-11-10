package me.meeshy.app.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import me.meeshy.sdk.talkie.TalkieSendControl
import me.meeshy.sdk.talkie.TalkieSenderFactory

/**
 * Le talkie sur la fiche d'un Proche ou d'un Sang (#17150, iso `ProfileTalkieRow.swift`) : un émetteur par fiche, sur la
 * portée de ce ViewModel ; quitter la fiche termine la prise de parole en cours.
 */
@HiltViewModel
class ProfileTalkieViewModel @Inject constructor(factory: TalkieSenderFactory) : ViewModel() {
    val control: TalkieSendControl = factory.control(viewModelScope)

    override fun onCleared() {
        control.close()
    }
}
