package me.meeshy.sdk.conversation

import javax.inject.Inject
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.launch

/**
 * Le préchauffage de la liste dès l'authentification (miroir de iOS
 * `ConversationListVMOwner.prewarm`, #10927) : la session restaurée, la liste se synchronise tout
 * de suite au lieu d'attendre que l'écran s'ouvre, si bien que la première image de la liste lit un
 * cache déjà frais. Un changement de compte ANNULE le préchauffage en cours (`collectLatest`) : la
 * liste d'un compte quitté n'est jamais poursuivie pour le suivant.
 */
class ConversationListPrewarmer(
    private val sync: suspend () -> Boolean,
    private val scope: CoroutineScope,
) {
    @Inject
    constructor(repository: ConversationRepository) :
        this({ repository.syncSilently() }, CoroutineScope(SupervisorJob() + Dispatchers.IO))

    /** Préchauffe pour chaque compte authentifié publié par [accounts] (`null` = aucun compte). */
    fun start(accounts: Flow<String?>): Job = scope.launch {
        accounts.distinctUntilChanged().collectLatest { accountId ->
            if (!accountId.isNullOrBlank()) sync()
        }
    }
}
