package me.meeshy.sdk.outbox

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.dao.SendAttemptDao
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import me.meeshy.sdk.model.SendAttempt
import me.meeshy.sdk.model.SendOutcome
import me.meeshy.sdk.model.SendTransport

/**
 * Journal des tentatives d'envoi d'un message sortant (miroir de `SendAttemptRecord.log`, iOS) : une ligne par tentative,
 * numérotée par message, conservée après l'accusé du serveur.
 *
 * Écrit AU MIEUX : une panne du journal ne doit jamais retarder ni faire échouer un envoi. L'implémentation avale donc toute
 * erreur (sauf l'annulation) et borne son attente.
 */
public interface SendAttemptRecorder {
    public suspend fun record(
        localId: String,
        transport: SendTransport,
        startedAtMillis: Long,
        finishedAtMillis: Long,
        outcome: SendOutcome,
        errorMessage: String? = null,
    )

    /** Aucun journal : le défaut inerte des gestionnaires construits hors Hilt. */
    public data object None : SendAttemptRecorder {
        override suspend fun record(
            localId: String,
            transport: SendTransport,
            startedAtMillis: Long,
            finishedAtMillis: Long,
            outcome: SendOutcome,
            errorMessage: String?,
        ) = Unit
    }
}

/** Lecture du journal pour la fiche d'un message : les tentatives d'un envoi, de la première à la dernière. */
public fun interface SendAttemptReader {
    public fun observe(localId: String): Flow<List<SendAttempt>>
}

internal class RoomSendAttemptRecorder(
    private val dao: SendAttemptDao,
) : SendAttemptRecorder, SendAttemptReader {

    override fun observe(localId: String): Flow<List<SendAttempt>> =
        dao.observe(localId).map { rows ->
            rows.map {
                SendAttempt(it.localId, it.attemptNumber, it.transport, it.startedAt, it.finishedAt, it.outcome, it.errorMessage)
            }
        }

    override suspend fun record(
        localId: String,
        transport: SendTransport,
        startedAtMillis: Long,
        finishedAtMillis: Long,
        outcome: SendOutcome,
        errorMessage: String?,
    ) {
        try {
            // Le budget se compte en temps RÉEL : hors du dispatcher de l'appelant, un test à horloge virtuelle
            // (runTest) ne le voit pas expirer pendant que Room écrit sur son propre fil.
            withContext(Dispatchers.IO) {
                withTimeoutOrNull(WRITE_BUDGET_MS) {
                    dao.append(
                        localId = localId,
                        transport = transport.wire,
                        startedAt = startedAtMillis,
                        finishedAt = finishedAtMillis,
                        outcome = outcome.wire,
                        errorMessage = errorMessage?.take(MAX_ERROR_LENGTH),
                    )
                }
            }
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            // Journal au mieux : jamais de raison de retarder l'envoi.
        }
    }

    private companion object {
        const val WRITE_BUDGET_MS = 2_000L
        const val MAX_ERROR_LENGTH = 300
    }
}

@Module
@InstallIn(SingletonComponent::class)
public object SendAttemptModule {

    @Provides
    public fun sendAttemptDao(database: MeeshyDatabase): SendAttemptDao = database.sendAttemptDao()

    @Provides
    public fun sendAttemptRecorder(dao: SendAttemptDao): SendAttemptRecorder = RoomSendAttemptRecorder(dao)

    @Provides
    public fun sendAttemptReader(dao: SendAttemptDao): SendAttemptReader = RoomSendAttemptRecorder(dao)
}
