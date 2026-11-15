package me.meeshy.core.e2ee.flow

import me.meeshy.core.e2ee.device.E2eeDeviceRegistrar
import me.meeshy.core.e2ee.device.E2eeEnrolledDevice
import me.meeshy.core.e2ee.open.E2eeEnvelopeOpener
import me.meeshy.core.e2ee.seal.E2eeMessageSealer
import me.meeshy.core.e2ee.session.E2eeSessionCipher
import me.meeshy.core.e2ee.store.E2eePlaintextVault
import me.meeshy.core.e2ee.vault.InMemoryRecordBackend
import me.meeshy.core.e2ee.vault.TransactionalRecordVault
import me.meeshy.core.e2ee.wire.E2eePlatform

/** Une installation de test : son coffre, sa session de passerelle, et les outils construits sur SON enrôlement. */
class E2eeTestDevice(server: FakeE2eeServer, val userId: String, val backend: InMemoryRecordBackend = InMemoryRecordBackend()) {
    val vault = TransactionalRecordVault(backend)
    val session = server.Session(userId)
    val registrar = E2eeDeviceRegistrar(vault, session, E2eePlatform.ANDROID, label = "Pixel", nowMillis = { 1_790_000_000_000L })

    lateinit var enrolled: E2eeEnrolledDevice
        private set

    val cipher: E2eeSessionCipher get() = E2eeSessionCipher(enrolled.device.address, enrolled.identity, vault)
    val sealer: E2eeMessageSealer get() = E2eeMessageSealer(enrolled.device, cipher, session, vault)
    val opener: E2eeEnvelopeOpener get() = E2eeEnvelopeOpener(enrolled.device, cipher, session, vault)
    val plaintexts: E2eePlaintextVault get() = E2eePlaintextVault(vault, owner = userId)

    suspend fun enroll(): E2eeTestDevice = apply { enrolled = registrar.ensureEnrolled(userId) }
}
