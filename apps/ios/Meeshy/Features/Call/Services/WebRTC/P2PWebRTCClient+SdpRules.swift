import Foundation
import os

#if canImport(WebRTC)

/// Règles pures sur les SDP et les candidats ICE reçus ou émis : validation des entrées
/// du pair et injections d'attributs (transport-cc, indices de débit vidéo).
enum WebRTCSdpRules {
    /// Validates a remote SDP string before passing it to libwebrtc. A hostile peer
    /// could send an arbitrarily large or malformed SDP that triggers parsing errors
    /// or memory pressure inside libwebrtc. We guard against the most obvious attacks:
    /// excessive length and missing mandatory first line.
    static func validateRemoteSDP(_ sdp: String) throws {
        guard sdp.count <= 1_000_000 else {
            Logger.webrtc.error("Remote SDP too large (\(sdp.count) bytes) — rejecting")
            throw WebRTCError.failedToCreateSDP
        }
        guard sdp.hasPrefix("v=0") else {
            Logger.webrtc.error("Remote SDP missing required v=0 line — rejecting")
            throw WebRTCError.failedToCreateSDP
        }
    }

    static func addTransportCC(_ sdp: String) -> String {
        let transportCCURI = "http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01"
        guard !sdp.contains(transportCCURI) else { return sdp }

        var lines = sdp.components(separatedBy: "\r\n")
        var usedExtmapIDs = Set<Int>()
        for line in lines where line.hasPrefix("a=extmap:") {
            let idStr = line.dropFirst("a=extmap:".count).split(separator: " ", maxSplits: 1).first ?? ""
            let cleanID = idStr.split(separator: "/").first ?? idStr
            if let id = Int(cleanID) { usedExtmapIDs.insert(id) }
        }

        var extID = QualityThresholds.extmapStartId
        while usedExtmapIDs.contains(extID) { extID += 1 }
        guard extID <= QualityThresholds.extmapMaxId else {
            // All 1-byte IDs exhausted — IDs ≥15 require the 2-byte extmap
            // form (RFC 5285 §4.2) which not all peers handle. Do not inject
            // rather than risk an invalid SDP.
            Logger.webrtc.fault("[WEBRTC] extmap ID exhausted (IDs \(QualityThresholds.extmapStartId)–\(QualityThresholds.extmapMaxId) all taken) — Transport-CC not injected into SDP")
            return sdp
        }
        let extmapLine = "a=extmap:\(extID) \(transportCCURI)"

        // Snapshot m-line indices before mutating `lines`, then insert from the
        // last section backward — inserting at index i shifts every subsequent
        // line by +1, which would desync a forward-walking loop's remaining
        // (stale) indices once more than one m-section exists (e.g. audio+video).
        // Walking in reverse means every remaining index still points at its
        // original line, since only later positions have shifted.
        let mLineIndices = lines.indices.filter { lines[$0].hasPrefix("m=audio ") || lines[$0].hasPrefix("m=video ") }
        for i in mLineIndices.reversed() {
            var insertIdx = i + 1
            while insertIdx < lines.count && !lines[insertIdx].hasPrefix("m=") {
                if lines[insertIdx].hasPrefix("a=extmap:") {
                    insertIdx += 1
                    continue
                }
                if lines[insertIdx].hasPrefix("a=") && !lines[insertIdx].hasPrefix("a=extmap:") { break }
                insertIdx += 1
            }
            lines.insert(extmapLine, at: insertIdx)
        }

        return lines.joined(separator: "\r\n")
    }

    static func addVideoBitrateHints(_ sdp: String) -> String {
        var lines = sdp.components(separatedBy: "\r\n")
        var inVideoSection = false

        for i in 0..<lines.count {
            if lines[i].hasPrefix("m=video ") {
                inVideoSection = true
                continue
            }
            if lines[i].hasPrefix("m=") { inVideoSection = false }
            guard inVideoSection && lines[i].hasPrefix("a=fmtp:") else { continue }
            guard !lines[i].contains("x-google-max-bitrate") else { continue }
            lines[i] += ";x-google-max-bitrate=\(QualityThresholds.sdpVideoMaxBitrateKbps);x-google-min-bitrate=\(QualityThresholds.sdpVideoMinBitrateKbps)"
        }

        return lines.joined(separator: "\r\n")
    }

    /// Admission d'un candidat ICE reçu du pair : refuse les index, `sdpMid` et lignes hors bornes.
    static func admits(_ candidate: IceCandidate) -> Bool {
        // Input validation: reject candidates with out-of-range indices, oversized
        // sdpMid strings, or oversized candidate lines. libwebrtc processes these
        // strings without bounds checks; malformed input from a hostile peer could
        // cause parsing errors or memory pressure inside the library.
        guard candidate.sdpMLineIndex >= 0, candidate.sdpMLineIndex <= 255 else {
            Logger.webrtc.error("Ignoring ICE candidate — sdpMLineIndex out of range: \(candidate.sdpMLineIndex)")
            return false
        }
        if let mid = candidate.sdpMid {
            guard mid.count <= QualityThresholds.iceCandidateSdpMidMaxLength else {
                Logger.webrtc.error("Ignoring ICE candidate — sdpMid too long (\(mid.count) chars)")
                return false
            }
        }
        guard candidate.candidate.count <= QualityThresholds.iceCandidateLineMaxBytes else {
            Logger.webrtc.error("Ignoring ICE candidate — candidate line too long (\(candidate.candidate.count) chars)")
            return false
        }
        return true
    }
}

#endif
