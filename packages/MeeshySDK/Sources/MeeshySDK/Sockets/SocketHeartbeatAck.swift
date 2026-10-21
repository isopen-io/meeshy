import Foundation

/// Le RTT que `heartbeat:ack` permet de lire. `latencyHintMs` est le trajet SIMPLE mesuré par la passerelle depuis
/// le `clientTime` du battement : on le double. Sans indice, l'écart entre l'horloge locale et `serverTime` l'approche.
enum SocketHeartbeatAck {
    static func rtt(from data: [Any], now: Date = Date()) -> Double? {
        guard let payload = data.first as? [String: Any],
              let serverTime = payload["serverTime"] as? String else { return nil }
        if let hint = payload["latencyHintMs"] as? Double { return hint * 2 }
        guard let serverDate = WireDate.date(from: serverTime) else { return nil }
        return abs(now.timeIntervalSince(serverDate)) * 1000
    }
}
