package me.meeshy.ui.component.imageedit

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * La boucle de rendu d'un curseur : hors du fil principal, sans délai, sans file d'attente.
 * Miroir de `LatestWinsRenderLoop` (iOS).
 *
 * Un curseur émet plus vite qu'un rendu ne cuit. La boucle n'en garde qu'UN en vol : les demandes
 * arrivées pendant ce rendu se replient sur la DERNIÈRE, rendue dès que le processeur se libère.
 * Chaque rendu terminé est livré, dans l'ordre, sur le dispatcher de [scope] (le fil principal) —
 * le glissé montre le look le plus récent disponible, et le dernier cran est toujours celui qui reste.
 *
 * Brique à paramètres opaques : elle ne sait ni ce qu'elle rend ni où le résultat se pose.
 * [submit] et [discardPending] s'appellent depuis le dispatcher de [scope].
 */
public class LatestWinsRenderLoop<Request, Output>(
    private val scope: CoroutineScope,
    private val renderDispatcher: CoroutineDispatcher,
    private val render: (Request) -> Output,
    private val deliver: (Request, Output) -> Unit,
) {
    private var pending: Request? = null
    private var hasPending = false
    private var draining = false

    /** Vrai tant qu'un rendu est en vol ou qu'une demande l'attend. */
    public val isBusy: Boolean get() = draining

    /** Rendue tout de suite si la boucle est libre ; sinon elle REMPLACE la demande en attente. */
    public fun submit(request: Request) {
        pending = request
        hasPending = true
        if (draining) return
        draining = true
        scope.launch { drain() }
    }

    /** Oublie la demande en attente — le rendu en vol, lui, sera livré. */
    public fun discardPending() {
        pending = null
        hasPending = false
    }

    private suspend fun drain() {
        try {
            while (hasPending) {
                @Suppress("UNCHECKED_CAST")
                val next = pending as Request
                pending = null
                hasPending = false
                val output = try {
                    withContext(renderDispatcher) { render(next) }
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (_: Exception) {
                    continue
                }
                deliver(next, output)
            }
        } finally {
            draining = false
        }
    }
}
