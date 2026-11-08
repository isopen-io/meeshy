package me.meeshy.core.e2ee.device

import me.meeshy.core.e2ee.wire.E2eeAckResult
import me.meeshy.core.e2ee.wire.E2eeEnrollDeviceRequest
import me.meeshy.core.e2ee.wire.E2eeEnrollment
import me.meeshy.core.e2ee.wire.E2eeEnvelopePage
import me.meeshy.core.e2ee.wire.E2eePreKeyStock
import me.meeshy.core.e2ee.wire.E2eePublishKeysRequest
import me.meeshy.core.e2ee.wire.E2eeRetirement
import me.meeshy.core.e2ee.wire.E2eeUserBundles
import me.meeshy.core.e2ee.wire.E2eeUserDevices

/**
 * Le client des routes de l'annuaire par appareil et du relais d'enveloppes (#3706, spec § 3.3 et § 4.3), miroir de
 * `E2EEDirectoryClientProviding` (iOS). Il ne connaît ni libsignal ni le coffre : il transporte des clés publiques et
 * des enveloppes opaques, au nom de la session courante, que la passerelle lie à l'appareil. Un refus lève
 * [me.meeshy.core.e2ee.wire.E2eeRemoteException] avec son code stable.
 */
public interface E2eeDirectoryClient {
    public suspend fun enroll(request: E2eeEnrollDeviceRequest): E2eeEnrollment
    public suspend fun publishKeys(deviceId: Int, request: E2eePublishKeysRequest): E2eePreKeyStock
    public suspend fun preKeyStock(): E2eePreKeyStock
    public suspend fun retireDevice(deviceId: Int, registrationId: Int): E2eeRetirement
    public suspend fun bundles(userId: String, deviceIds: List<Int>?): E2eeUserBundles
    public suspend fun devices(userId: String): E2eeUserDevices
    public suspend fun envelopes(after: String?, limit: Int?): E2eeEnvelopePage
    public suspend fun acknowledge(envelopeIds: List<String>): E2eeAckResult
}
