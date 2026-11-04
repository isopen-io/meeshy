package me.meeshy.core.datastore

import com.google.common.truth.Truth.assertThat
import java.io.IOException
import java.security.GeneralSecurityException
import java.security.KeyStoreException
import java.security.ProviderException
import org.junit.Test

/**
 * Les pannes durables du coffre connues sur le terrain, au-delà du tag invalide et de la clé invalidée : un keyset Tink
 * abîmé et une clé maîtresse Keystore inutilisable ne se réparent pas en relançant. Reconnues, elles mènent (après
 * plusieurs lancements consécutifs, comme les autres) à la recréation du coffre ; ignorées, l'app tournait en mémoire
 * indéfiniment devant une base chiffrée. Une panne passagère reste passagère.
 */
class DurableVaultSignaturesTest {

    @Test
    fun `un keyset Tink qui ne se decode plus est une signature durable`() {
        val failure = GeneralSecurityException("keyset", InvalidProtocolBufferException("Protocol message had invalid UTF-8."))

        assertThat(DurableFailureGate.isPermanent(failure)).isTrue()
    }

    @Test
    fun `un blob de cle refuse par le Keystore est une signature durable`() {
        assertThat(DurableFailureGate.isPermanent(KeyStoreException("Invalid key blob"))).isTrue()
        assertThat(DurableFailureGate.isPermanent(IllegalStateException("open", ProviderException("Keystore operation failed: INVALID_KEY_BLOB")))).isTrue()
    }

    @Test
    fun `une cle maitresse qui existe mais est inutilisable est une signature durable`() {
        val failure = KeyStoreException("the master key android-keystore://_androidx_security_master_key_ exists but is unusable")

        assertThat(DurableFailureGate.isPermanent(failure)).isTrue()
    }

    @Test
    fun `une panne passagere du Keystore ou du disque n'est jamais durable`() {
        assertThat(DurableFailureGate.isPermanent(KeyStoreException("keystore not ready"))).isFalse()
        assertThat(DurableFailureGate.isPermanent(ProviderException("Keystore operation failed: system busy"))).isFalse()
        assertThat(DurableFailureGate.isPermanent(IOException("read failed"))).isFalse()
    }
}

/** Le nom de la classe protobuf que Tink lève sur un keyset abîmé (`com.google.protobuf`), absente des tests. */
private class InvalidProtocolBufferException(message: String) : IOException(message)
