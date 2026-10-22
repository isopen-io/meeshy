package me.meeshy.app.calls

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import me.meeshy.sdk.model.ongoing.CallActivitySnapshot
import javax.inject.Inject
import javax.inject.Singleton

/** Ce que la notification (et son récepteur) peut demander à l'appel en cours, sans ouvrir l'app. */
interface ActiveCallCommands {
    fun hangUp()
    fun toggleMute()
}

/**
 * Le pont entre l'appel (écran, ViewModel) et sa surface système : la notification
 * « appel en cours » lit [snapshot] et ses boutons rappellent [hangUp] / [toggleMute].
 * Sans appel actif ([attach] jamais appelé ou [detach] fait), les commandes sont sans effet.
 */
@Singleton
class ActiveCallSnapshotHolder @Inject constructor() {

    private val _snapshot = MutableStateFlow<CallActivitySnapshot?>(null)

    /** Le dernier instantané servi par la loi ; `null` = aucun appel à montrer. */
    val snapshot: StateFlow<CallActivitySnapshot?> = _snapshot.asStateFlow()

    @Volatile
    private var commands: ActiveCallCommands? = null

    fun publish(snapshot: CallActivitySnapshot?) {
        _snapshot.value = snapshot
    }

    fun attach(commands: ActiveCallCommands) {
        this.commands = commands
    }

    /** Ne retire que ses propres commandes : un appel plus récent garde les siennes. */
    fun detach(commands: ActiveCallCommands) {
        if (this.commands === commands) this.commands = null
    }

    fun hangUp() {
        commands?.hangUp()
    }

    fun toggleMute() {
        commands?.toggleMute()
    }
}
