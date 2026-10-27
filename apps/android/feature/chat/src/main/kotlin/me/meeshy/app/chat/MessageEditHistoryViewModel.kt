package me.meeshy.app.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import me.meeshy.sdk.conversation.EditRevisionLedger
import me.meeshy.sdk.model.EditRevision

/** Les versions antérieures lues sur l'appareil : `null` tant que la première lecture n'est pas revenue. */
@HiltViewModel
class MessageEditHistoryViewModel @Inject constructor(
    private val ledger: EditRevisionLedger,
) : ViewModel() {

    private val _revisions = MutableStateFlow<List<EditRevision>?>(null)
    val revisions: StateFlow<List<EditRevision>?> = _revisions.asStateFlow()

    private var boundMessageId: String? = null
    private var job: Job? = null

    fun bind(messageId: String) {
        val sameMessage = boundMessageId == messageId
        if (sameMessage && job?.isActive == true) return
        boundMessageId = messageId
        job?.cancel()
        if (!sameMessage) _revisions.value = null
        job = viewModelScope.launch { ledger.observe(messageId).collect { _revisions.value = it } }
    }

    /** La fiche refermée cesse de lire la table ; la rouvrir sert d'abord la dernière lecture puis relit la base. */
    fun unbind() {
        job?.cancel()
        job = null
    }
}
