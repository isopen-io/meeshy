package me.meeshy.core.e2ee.device

import me.meeshy.core.e2ee.keys.E2eeDeviceKeyFactory
import me.meeshy.core.e2ee.store.E2eeEnrollmentRecords
import me.meeshy.core.e2ee.store.E2eeIdentityRecords
import me.meeshy.core.e2ee.store.E2eeLocalDevice
import me.meeshy.core.e2ee.store.E2eeLocalIdentity
import me.meeshy.core.e2ee.vault.RecordVault
import me.meeshy.core.e2ee.wire.E2eeDeviceListing
import me.meeshy.core.e2ee.wire.E2eeErrorCode
import me.meeshy.core.e2ee.wire.E2eePlatform
import me.meeshy.core.e2ee.wire.E2eePreKeyStock
import me.meeshy.core.e2ee.wire.E2eeRemoteException

/** Cet appareil, enrôlé, avec l'identité sous laquelle il l'a été : stores et chiffreur se construisent depuis CETTE identité. */
public class E2eeEnrolledDevice(public val device: E2eeLocalDevice, public val identity: E2eeLocalIdentity)

public sealed class E2eeEnrollmentException(message: String) : Exception(message) {
    /** Le compte a déjà `E2EE_MAX_ACTIVE_DEVICES` appareils actifs : il faut en retirer un pour chiffrer sur celui-ci. */
    public class DeviceLimitReached : E2eeEnrollmentException("e2ee device limit reached")

    /** La place a changé d'occupant depuis la liste lue (`E2EE_DEVICE_CHANGED`) : rien n'a été retiré. */
    public class DeviceChanged : E2eeEnrollmentException("e2ee device slot changed hands")
}

/**
 * L'enrôlement de CETTE installation auprès de l'annuaire (spec § 3.1 à 3.3) et son entretien, miroir de
 * `E2EEDeviceRegistrar` (iOS) : une installation déjà enrôlée pour ce compte ne se réenrôle pas à chaque lancement,
 * elle relit son stock et le complète ; elle se réenrôle quand la passerelle dit que sa session ne la porte plus,
 * régénère son identité quand le compte l'a révoquée, et efface tout quand le compte change.
 */
public class E2eeDeviceRegistrar(
    private val vault: RecordVault,
    private val directory: E2eeDirectoryClient,
    private val platform: E2eePlatform,
    private val label: String?,
    private val nowMillis: () -> Long = System::currentTimeMillis,
) {

    public suspend fun ensureEnrolled(userId: String): E2eeEnrolledDevice {
        val recorded = vault.read(E2eeEnrollmentRecords::load)
        // Sans enrôlement pour ce compte, l'identité n'a plus ses sessions ni ses pré-clés : elle est tirée de nouveau.
        if (recorded?.userId != userId) reset()
        val identity = E2eeIdentityRecords.currentOrCreate(vault)
        if (recorded != null && recorded.userId == userId && recorded.registrationId == identity.registrationId) {
            stillBound(recorded, identity)?.let { return it }
        }
        return enroll(userId, identity, returning = recorded?.userId == userId, regenerateOnRevocation = true)
    }

    /** Les appareils actifs de mon compte (pour en retirer un). */
    public suspend fun ownDevices(userId: String): List<E2eeDeviceListing> = directory.devices(userId).devices

    /** Retire un de mes appareils, désigné par sa place ET la génération lue (#13036). */
    public suspend fun retire(deviceId: Int, registrationId: Int) {
        try {
            directory.retireDevice(deviceId, registrationId)
        } catch (error: E2eeRemoteException) {
            if (error.code == E2eeErrorCode.DEVICE_CHANGED) throw E2eeEnrollmentException.DeviceChanged()
            throw error
        }
    }

    /** Efface identité, sessions, pré-clés et clairs de cet appareil. */
    public fun reset() {
        vault.write { it.removeAll() }
    }

    /** Le stock de pré-clés ne se lit que par l'appareil lié à la session : `E2EE_DEVICE_NOT_BOUND` veut dire « se relier ». */
    private suspend fun stillBound(recorded: E2eeLocalDevice, identity: E2eeLocalIdentity): E2eeEnrolledDevice? {
        val stock = try {
            directory.preKeyStock()
        } catch (error: E2eeRemoteException) {
            if (error.code == E2eeErrorCode.DEVICE_NOT_BOUND) return null
            throw error
        }
        if (stock.deviceId != recorded.deviceId) return null
        replenish(stock, identity)
        return E2eeEnrolledDevice(recorded, identity)
    }

    private suspend fun enroll(userId: String, identity: E2eeLocalIdentity, returning: Boolean, regenerateOnRevocation: Boolean): E2eeEnrolledDevice {
        val factory = E2eeDeviceKeyFactory(identity, vault)
        val request = if (returning) factory.reenrollment(userId, platform, label, nowMillis())
        else factory.enrollment(userId, platform, label, nowMillis())
        val enrollment = try {
            directory.enroll(request)
        } catch (error: E2eeRemoteException) {
            when {
                error.code == E2eeErrorCode.IDENTITY_REVOKED && regenerateOnRevocation -> {
                    reset()
                    return enroll(userId, E2eeIdentityRecords.currentOrCreate(vault), returning = false, regenerateOnRevocation = false)
                }
                error.code == E2eeErrorCode.DEVICE_LIMIT_REACHED -> throw E2eeEnrollmentException.DeviceLimitReached()
                else -> throw error
            }
        }
        val device = E2eeLocalDevice(userId, enrollment.deviceId, identity.registrationId)
        vault.write { E2eeEnrollmentRecords.save(device, it) }
        if (returning) replenish(directory.preKeyStock(), identity)
        return E2eeEnrolledDevice(device, identity)
    }

    private suspend fun replenish(stock: E2eePreKeyStock, identity: E2eeLocalIdentity) {
        val request = E2eeDeviceKeyFactory(identity, vault).replenishment(stock, nowMillis()) ?: return
        directory.publishKeys(stock.deviceId, request)
    }
}
