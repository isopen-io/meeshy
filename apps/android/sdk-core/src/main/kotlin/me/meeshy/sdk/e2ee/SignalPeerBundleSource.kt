package me.meeshy.sdk.e2ee

import me.meeshy.core.crypto.primitives.CanonicalBase64
import me.meeshy.core.crypto.session.PeerBundle
import me.meeshy.core.crypto.session.PeerBundleLookup
import me.meeshy.core.crypto.session.PeerBundleSource
import me.meeshy.sdk.model.signal.EstablishSessionRequest
import me.meeshy.sdk.net.NetworkResult

/**
 * Le gestionnaire de sessions parle à la passerelle par ici : `GET signal/keys/{userId}` (le bundle du pair, y
 * compris celui d'un EXPÉDITEUR sans session préalable) et `POST signal/session/establish`. 404 = le pair n'a
 * jamais publié de clés ; toute autre panne = indisponible. Aucun repli en clair.
 */
class SignalPeerBundleSource(private val repository: SignalRepository) : PeerBundleSource {

    override suspend fun fetchBundle(peerId: String): PeerBundleLookup = when (val result = repository.fetchBundle(peerId)) {
        is NetworkResult.Success -> {
            val identity = CanonicalBase64.decode(result.data.identityKey)
            val signed = CanonicalBase64.decode(result.data.signedPreKeyPublic)
            if (identity == null || signed == null) PeerBundleLookup.Malformed
            else PeerBundleLookup.Found(PeerBundle(identity, signed))
        }
        is NetworkResult.Failure -> when {
            result.error.httpStatus == NOT_FOUND -> PeerBundleLookup.NotPublished
            result.error.code == MALFORMED_RESPONSE -> PeerBundleLookup.Malformed
            else -> PeerBundleLookup.Unavailable
        }
    }

    override suspend fun announceSession(peerId: String, conversationId: String): Boolean =
        repository.establishSession(EstablishSessionRequest(recipientUserId = peerId, conversationId = conversationId)).isSuccess

    private companion object {
        const val NOT_FOUND = 404
        const val MALFORMED_RESPONSE = "MALFORMED_RESPONSE"
    }
}
