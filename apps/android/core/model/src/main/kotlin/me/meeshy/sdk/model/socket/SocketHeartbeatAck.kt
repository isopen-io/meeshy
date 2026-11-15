package me.meeshy.sdk.model.socket

import java.time.Instant

/**
 * Le RTT que `heartbeat:ack` permet de lire (miroir de `SocketHeartbeatAck.swift`). `latencyHintMs` est le trajet
 * SIMPLE mesuré par la passerelle depuis le `clientTime` du battement : on le double. Sans indice, l'écart entre
 * l'horloge locale et `serverTime` l'approche. Sans `serverTime`, l'accusé est illisible.
 */
public object SocketHeartbeatAck {
    public fun rttMs(latencyHintMs: Double?, serverTime: String?, nowEpochMs: Long): Double? {
        if (serverTime == null) return null
        if (latencyHintMs != null) return latencyHintMs * 2
        val serverMs = runCatching { Instant.parse(serverTime).toEpochMilli() }.getOrNull() ?: return null
        return kotlin.math.abs(nowEpochMs - serverMs).toDouble()
    }
}
