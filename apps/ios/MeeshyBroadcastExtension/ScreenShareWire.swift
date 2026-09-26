import Foundation

// Le contrat entre l'extension de diffusion ReplayKit (`MeeshyBroadcastExtension`)
// et l'app pendant un partage d'écran d'appel (#8063).
//
// Compilé dans les DEUX cibles (`project.yml`, même mécanique que
// `NSEAttachmentPolicy.swift`) : c'est le seul moyen que l'émetteur (extension)
// et le récepteur (app) parlent le même format, et le seul endroit d'où ce
// format est éprouvable (`MeeshyTests` n'atteint que l'app). Foundation seul.
//
// Transport : un socket Unix dans le conteneur App Group, sur lequel
// l'extension pousse des trames JPEG précédées d'un en-tête fixe ; l'état
// « diffusion commencée / finie / arrêt demandé » voyage par notifications
// Darwin, les seules qui franchissent la frontière de processus sans daemon.

nonisolated enum ScreenShareIPC {
    static let appGroupIdentifier = "group.me.meeshy.apps"
    static let extensionBundleIdentifier = "me.meeshy.app.broadcast"
    static let socketFileName = "screen-share.sock"
    static let broadcastStartedNotification = "me.meeshy.app.screen-share.started"
    static let broadcastFinishedNotification = "me.meeshy.app.screen-share.finished"
    static let stopRequestedNotification = "me.meeshy.app.screen-share.stop-requested"

    static func socketURL(fileManager: FileManager = .default) -> URL? {
        fileManager
            .containerURL(forSecurityApplicationGroupIdentifier: appGroupIdentifier)?
            .appendingPathComponent(socketFileName)
    }
}

nonisolated struct ScreenShareFrameHeader: Equatable, Sendable {
    let width: UInt32
    let height: UInt32
    /// `CGImagePropertyOrientation.rawValue` lu sur la trame ReplayKit
    /// (`RPVideoSampleOrientationKey`) : l'écran ne tourne pas ses pixels, il
    /// déclare leur orientation, et c'est au récepteur de la rendre.
    let orientation: UInt32
    let timestampNs: UInt64
    let payloadLength: UInt32
}

nonisolated struct ScreenShareFrame: Equatable, Sendable {
    let header: ScreenShareFrameHeader
    let payload: Data
}

nonisolated enum ScreenShareFrameCodec {
    /// « MSSF » — Meeshy Screen Share Frame.
    static let magic: UInt32 = 0x4D53_5346
    static let headerLength = 28
    /// Une trame JPEG d'écran à 1280 px fait quelques centaines de Ko ; au-delà
    /// de 8 Mo le flux est corrompu, jamais une trame légitime.
    static let maxPayloadLength: UInt32 = 8 * 1024 * 1024

    static func encode(
        width: UInt32,
        height: UInt32,
        orientation: UInt32,
        timestampNs: UInt64,
        payload: Data
    ) -> Data {
        var data = Data(capacity: headerLength + payload.count)
        appendBigEndian(magic, to: &data)
        appendBigEndian(width, to: &data)
        appendBigEndian(height, to: &data)
        appendBigEndian(orientation, to: &data)
        appendBigEndian(timestampNs, to: &data)
        appendBigEndian(UInt32(payload.count), to: &data)
        data.append(payload)
        return data
    }

    /// `CGImagePropertyOrientation` → rotation que le récepteur applique à la
    /// trame (degrés horaires, la convention de `RTCVideoRotation`). Les
    /// variantes miroir tournent comme leur jumelle : un écran n'est jamais
    /// retourné, seul l'appareil l'est.
    static func rotationDegrees(forOrientation raw: UInt32) -> Int {
        switch raw {
        case 3, 4: return 180
        case 5, 8: return 90
        case 6, 7: return 270
        default: return 0
        }
    }

    private static func appendBigEndian<T: FixedWidthInteger>(_ value: T, to data: inout Data) {
        withUnsafeBytes(of: value.bigEndian) { data.append(contentsOf: $0) }
    }
}

/// Décodeur à flux : le socket rend des morceaux de taille arbitraire, une
/// trame peut arriver en dix lectures ou dix trames en une. Toute incohérence
/// (magie, taille) vide le tampon et lève : un flux désaligné ne se
/// resynchronise pas, le récepteur coupe la connexion.
nonisolated struct ScreenShareFrameDecoder {
    enum Failure: Error, Equatable {
        case badMagic
        case payloadTooLarge
    }

    private var buffer = Data()

    var bufferedByteCount: Int { buffer.count }

    mutating func append(_ bytes: Data) throws -> [ScreenShareFrame] {
        buffer.append(bytes)
        var frames: [ScreenShareFrame] = []
        while buffer.count >= ScreenShareFrameCodec.headerLength {
            guard readUInt32(at: 0) == ScreenShareFrameCodec.magic else {
                buffer = Data()
                throw Failure.badMagic
            }
            let payloadLength = readUInt32(at: 24)
            guard payloadLength <= ScreenShareFrameCodec.maxPayloadLength else {
                buffer = Data()
                throw Failure.payloadTooLarge
            }
            let total = ScreenShareFrameCodec.headerLength + Int(payloadLength)
            guard buffer.count >= total else { break }
            let start = buffer.startIndex
            let header = ScreenShareFrameHeader(
                width: readUInt32(at: 4),
                height: readUInt32(at: 8),
                orientation: readUInt32(at: 12),
                timestampNs: readUInt64(at: 16),
                payloadLength: payloadLength
            )
            let payload = Data(buffer[(start + ScreenShareFrameCodec.headerLength)..<(start + total)])
            frames.append(ScreenShareFrame(header: header, payload: payload))
            buffer = Data(buffer[(start + total)...])
        }
        return frames
    }

    private func readUInt32(at offset: Int) -> UInt32 {
        let start = buffer.startIndex + offset
        return buffer[start..<(start + 4)].reduce(0) { ($0 << 8) | UInt32($1) }
    }

    private func readUInt64(at offset: Int) -> UInt64 {
        let start = buffer.startIndex + offset
        return buffer[start..<(start + 8)].reduce(0) { ($0 << 8) | UInt64($1) }
    }
}

/// Plafond de cadence côté extension : ReplayKit livre jusqu'à 60 trames/s,
/// un partage d'écran n'en a besoin que d'une quinzaine, et chaque trame
/// coûte un encodage JPEG dans une extension plafonnée à 50 Mo.
nonisolated struct ScreenShareFrameThrottle {
    let minimumIntervalNs: UInt64
    private var lastAcceptedNs: UInt64?

    init(maxFramesPerSecond: Int) {
        minimumIntervalNs = 1_000_000_000 / UInt64(max(1, maxFramesPerSecond))
    }

    mutating func shouldAccept(timestampNs: UInt64) -> Bool {
        if let last = lastAcceptedNs, timestampNs >= last, timestampNs - last < minimumIntervalNs {
            return false
        }
        lastAcceptedNs = timestampNs
        return true
    }
}

nonisolated enum ScreenShareScaling {
    /// Facteur (≤ 1) qui ramène le plus grand côté à `maxLongSide` : un écran
    /// d'iPhone fait 2 500 px de haut, l'encodeur vidéo n'en tire rien au-delà
    /// de 1 280, et la mémoire de l'extension paie chaque pixel.
    static func scale(width: Int, height: Int, maxLongSide: Int) -> Double {
        let longSide = max(width, height)
        guard longSide > maxLongSide, longSide > 0 else { return 1 }
        return Double(maxLongSide) / Double(longSide)
    }
}
