package me.meeshy.core.crypto.session

import me.meeshy.core.crypto.keys.X25519KeyPair
import me.meeshy.core.crypto.primitives.CryptoException
import me.meeshy.core.crypto.primitives.HkdfSha256
import me.meeshy.core.crypto.primitives.X25519Agreement

/**
 * La dérivation de la clé de session (version 2). Elle corrige le MVP, où chaque côté combinait SA propre
 * identité avec la pré-clé du pair : deux premiers messages croisés donnaient deux clés différentes.
 *
 * Règle canonique, identique des deux côtés : on ordonne les deux userId (comparaison lexicographique) ;
 * le secret est `X25519(identité privée du plus PETIT, pré-clé signée publique du plus GRAND)`, que le plus
 * grand retrouve par `X25519(pré-clé signée privée, identité publique du plus petit)`. La clé est
 * `HKDF-SHA256(sel vide, secret, info = "MeeshyE2EE.v2|<petit>|<grand>", 32)` — les deux userId liés à la clé.
 * Vecteurs communs : `packages/shared/fixtures/e2ee-session-derivation-vectors.json`.
 */
public object SessionKeyDerivation {
    public const val VERSION: Int = 2
    private const val KEY_LENGTH = 32

    public fun derive(
        myUserId: String,
        peerUserId: String,
        myIdentity: X25519KeyPair,
        mySignedPreKey: X25519KeyPair,
        peer: PeerBundle,
    ): ByteArray {
        if (myUserId == peerUserId) throw CryptoException("Session avec soi-même refusée")
        val iAmLow = myUserId < peerUserId
        val secret = if (iAmLow) {
            X25519Agreement.sharedSecret(myIdentity.privateKey, peer.signedPreKeyPublic)
        } else {
            X25519Agreement.sharedSecret(mySignedPreKey.privateKey, peer.identityKey)
        }
        val low = if (iAmLow) myUserId else peerUserId
        val high = if (iAmLow) peerUserId else myUserId
        return HkdfSha256.derive(secret, ByteArray(0), "MeeshyE2EE.v$VERSION|$low|$high".toByteArray(Charsets.UTF_8), KEY_LENGTH)
    }
}
