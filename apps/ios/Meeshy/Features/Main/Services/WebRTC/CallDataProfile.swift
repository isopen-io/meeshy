import Foundation

// MARK: - Network path

/// What the OS says about the path a call rides on (#8697): `isExpensive`
/// (cellular, personal hotspot) and `isConstrained` (Low Data Mode).
nonisolated struct CallNetworkPath: Equatable, Sendable {
    let isExpensive: Bool
    let isConstrained: Bool

    static let unrestricted = CallNetworkPath(isExpensive: false, isConstrained: false)
}

// MARK: - Budgets

struct CallVideoBudget: Equatable, Sendable {
    let maxBitrateBps: Int
    let maxFramerate: Int
    let scaleResolutionDownBy: Double
    let degradationPreference: VideoDegradationPreference

    /// The leaner of this ceiling and `target` on every axis. A target that
    /// already keeps resolution (the survival floor) keeps it.
    func capping(_ target: CallVideoBudget) -> CallVideoBudget {
        CallVideoBudget(
            maxBitrateBps: min(maxBitrateBps, target.maxBitrateBps),
            maxFramerate: min(maxFramerate, target.maxFramerate),
            scaleResolutionDownBy: max(scaleResolutionDownBy, target.scaleResolutionDownBy),
            degradationPreference: target.degradationPreference == .maintainResolution
                ? .maintainResolution
                : degradationPreference
        )
    }
}

/// Opus as a VOICE codec: mono, DTX (silence costs nothing) and in-band FEC
/// (a lost packet is rebuilt from the next one), bounded average bitrate.
struct CallAudioBudget: Equatable, Sendable {
    let maxAverageBitrateBps: Int

    func capping(_ bitrateBps: Int) -> Int {
        min(maxAverageBitrateBps, bitrateBps)
    }

    var fmtpParameters: [String] {
        [
            "maxaveragebitrate=\(maxAverageBitrateBps)",
            "stereo=0",
            "sprop-stereo=0",
            "useinbandfec=1",
            "usedtx=1",
            "maxplaybackrate=\(QualityThresholds.opusFmtpMaxPlaybackRate)"
        ]
    }
}

struct CallDataBudget: Equatable, Sendable {
    let video: CallVideoBudget
    let audio: CallAudioBudget
}

// MARK: - Profiles

/// How much data a call may spend (#8697). The path picks Wi-Fi, cellular or
/// data saver; a poor link overrides all three with `degraded`, and only a
/// good link lifts it again (a fair tick keeps the current tier, so the
/// encoder does not flap on the boundary).
enum CallDataProfile: String, CaseIterable, Sendable {
    case wifi
    case cellular
    case dataSaver
    case degraded

    static func resolve(path: CallNetworkPath, heuristic: VideoQualityLevel, current: CallDataProfile) -> CallDataProfile {
        if heuristic <= .poor { return .degraded }
        if current == .degraded && heuristic < .good { return .degraded }
        if path.isConstrained { return .dataSaver }
        if path.isExpensive { return .cellular }
        return .wifi
    }

    var budget: CallDataBudget {
        switch self {
        case .wifi:
            return CallDataBudget(
                video: CallVideoBudget(maxBitrateBps: 1_500_000, maxFramerate: 30, scaleResolutionDownBy: 1.0, degradationPreference: .maintainFramerate),
                audio: CallAudioBudget(maxAverageBitrateBps: QualityThresholds.opusFmtpMaxAverageBitrate)
            )
        case .cellular:
            return CallDataBudget(
                video: CallVideoBudget(maxBitrateBps: 600_000, maxFramerate: 24, scaleResolutionDownBy: 1.5, degradationPreference: .maintainFramerate),
                audio: CallAudioBudget(maxAverageBitrateBps: 24_000)
            )
        case .dataSaver:
            return CallDataBudget(
                video: CallVideoBudget(maxBitrateBps: 250_000, maxFramerate: 15, scaleResolutionDownBy: 2.0, degradationPreference: .maintainResolution),
                audio: CallAudioBudget(maxAverageBitrateBps: 20_000)
            )
        case .degraded:
            return CallDataBudget(
                video: CallVideoBudget(maxBitrateBps: 150_000, maxFramerate: 15, scaleResolutionDownBy: 2.0, degradationPreference: .maintainResolution),
                audio: CallAudioBudget(maxAverageBitrateBps: QualityThresholds.audioCodecFloorBitrateBps)
            )
        }
    }

    var label: String {
        switch self {
        case .wifi: return String(localized: "call.quality.profile.wifi", defaultValue: "Wi-Fi", bundle: .main)
        case .cellular: return String(localized: "call.quality.profile.cellular", defaultValue: "Données mobiles", bundle: .main)
        case .dataSaver: return String(localized: "call.quality.profile.dataSaver", defaultValue: "Économie de données", bundle: .main)
        case .degraded: return String(localized: "call.quality.profile.degraded", defaultValue: "Réseau dégradé", bundle: .main)
        }
    }
}

// MARK: - Client hook

/// A WebRTC client that shapes its SDP (Opus fmtp) from the active profile.
/// Separate from `WebRTCClientProviding` so the profile reaches the SDP munger
/// without widening the client contract every test double implements.
protocol CallDataProfileApplying: AnyObject {
    func applyDataProfile(_ profile: CallDataProfile)
}

// MARK: - Opus SDP munging

enum OpusFmtpMunger {
    static func munge(_ sdp: String, audio: CallAudioBudget) -> String {
        let opusParams = audio.fmtpParameters
        var lines = sdp.components(separatedBy: "\r\n")
        let payloadType = lines
            .first { $0.hasPrefix("a=rtpmap:") && $0.contains("opus/48000") }
            .flatMap { $0.dropFirst("a=rtpmap:".count).split(separator: " ", maxSplits: 1).first }
            .map { String($0) }
        guard let payloadType else { return sdp }

        let fmtpPrefix = "a=fmtp:\(payloadType) "
        let overriddenKeys = Set(opusParams.map(key(of:)))
        var found = false
        lines = lines.map { line in
            guard line.hasPrefix(fmtpPrefix) else { return line }
            found = true
            let kept = line.dropFirst(fmtpPrefix.count)
                .split(separator: ";")
                .map { $0.trimmingCharacters(in: .whitespaces) }
                .filter { !$0.isEmpty && !overriddenKeys.contains(key(of: $0)) }
            return fmtpPrefix + (kept + opusParams).joined(separator: ";")
        }

        if !found, let rtpmapIndex = lines.firstIndex(where: { $0.hasPrefix("a=rtpmap:\(payloadType) ") }) {
            lines.insert(fmtpPrefix + opusParams.joined(separator: ";"), at: rtpmapIndex + 1)
        }
        return lines.joined(separator: "\r\n")
    }

    private static func key(of param: String) -> String {
        param.split(separator: "=", maxSplits: 1).first.map { String($0) } ?? ""
    }
}
