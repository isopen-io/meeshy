package me.meeshy.sdk.net

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow

/**
 * Annonce qu'une session n'est plus valide, sans que la couche reseau ait a
 * connaitre ce qu'est une deconnexion.
 *
 * Cette indirection n'est pas decorative : `AuthRepository.logout()` vit dans
 * `sdk-core`, qui DEPEND de `core:network`. Appeler la deconnexion depuis
 * l'intercepteur fermerait un cycle entre les deux modules. Le reseau se contente
 * donc d'annoncer ; l'application ecoute et decide quoi faire.
 *
 * `extraBufferCapacity = 1` avec repli sur la valeur la plus recente : l'expiration
 * arrive typiquement en RAFALE (plusieurs ecrans rechargent en meme temps, comme
 * les trois routes observees), et emettre depuis un intercepteur ne doit jamais
 * bloquer le thread reseau.
 */
public class SessionExpiryNotifier {

    private val _expirations = MutableSharedFlow<Unit>(
        extraBufferCapacity = 1,
        onBufferOverflow = kotlinx.coroutines.channels.BufferOverflow.DROP_OLDEST,
    )

    /** Emis a chaque fois que la passerelle refuse l'identite hors route d'auth. */
    public val expirations: SharedFlow<Unit> = _expirations.asSharedFlow()

    /** Appelable depuis n'importe quel thread : ne suspend pas, ne bloque pas. */
    public fun notifyExpired() {
        _expirations.tryEmit(Unit)
    }
}
