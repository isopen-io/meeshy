import Foundation

nonisolated struct CallAnalyticsContext: Sendable {
    let callDuration: TimeInterval
    let codec: String
    let filtersEnabledNow: Bool
    let transcriptionUsed: Bool
    let deviceModel: String
    let isVideo: Bool
    let endReason: String
}

nonisolated struct CallAnalyticsRecorder: Equatable, Sendable {
    var callInitiatedDate: Date?
    var negotiationStartDate: Date?
    var connectedDate: Date?
    var networkTransitions = 0
    var qualitySeconds: [VideoQualityLevel: Double] = [:]
    var lastQualityDate: Date?
    var currentLevel: VideoQualityLevel?
    var rttSum: Double = 0
    var sampleCount = 0
    var maxPacketLoss: Double = 0
    var packetLossSum: Double = 0
    var effectsUsed: Set<String> = []
    var videoFiltersUsed = false
    var totalReconnects = 0

    mutating func recordSample(
        level: VideoQualityLevel,
        roundTripTimeMs: Double,
        packetLossPercent: Double,
        at now: Date
    ) {
        if let previousDate = lastQualityDate, let previousLevel = currentLevel {
            qualitySeconds[previousLevel, default: 0] += now.timeIntervalSince(previousDate)
        }
        lastQualityDate = now
        currentLevel = level
        rttSum += roundTripTimeMs
        sampleCount += 1
        packetLossSum += packetLossPercent
        maxPacketLoss = max(maxPacketLoss, packetLossPercent)
    }

    mutating func recordFilterUsage(
        faceEffectName: String?,
        colorFilter: Bool,
        backgroundBlur: Bool,
        skinSmoothing: Bool
    ) {
        if let faceEffectName { effectsUsed.insert(faceEffectName) }
        if colorFilter {
            videoFiltersUsed = true
            effectsUsed.insert("colorFilter")
        }
        if backgroundBlur { effectsUsed.insert("backgroundBlur") }
        if skinSmoothing { effectsUsed.insert("skinSmoothing") }
    }

    mutating func resetAccumulators() {
        let reconnects = totalReconnects
        self = CallAnalyticsRecorder()
        totalReconnects = reconnects
    }

    mutating func reset() {
        self = CallAnalyticsRecorder()
    }

    func payload(now: Date, context: CallAnalyticsContext) -> [String: Any] {
        let setupMetrics = CallReliabilityPolicy.callSetupMetrics(
            initiatedAt: callInitiatedDate,
            negotiationStartAt: negotiationStartDate,
            connectedAt: connectedDate
        )
        let qualityDistribution = CallReliabilityPolicy.qualityDistribution(
            accumulatedSeconds: qualitySeconds,
            openWindowLevel: currentLevel,
            openWindowSince: lastQualityDate,
            now: now
        )
        let averageRtt = sampleCount > 0 ? rttSum / Double(sampleCount) : 0
        let averagePacketLoss = sampleCount > 0 ? packetLossSum / Double(sampleCount) : 0
        return [
            "setupTimeMs":         setupMetrics.setupTimeMs,
            "negotiationTimeMs":   setupMetrics.negotiationTimeMs,
            "durationSeconds":     context.callDuration,
            "reconnectionCount":   totalReconnects,
            "networkTransitions":  networkTransitions,
            "averageRtt":          averageRtt,
            "averagePacketLoss":   averagePacketLoss,
            "maxPacketLoss":       maxPacketLoss,
            "codec":               context.codec,
            "effectsUsed":         Array(effectsUsed),
            "filtersUsed":         videoFiltersUsed || context.filtersEnabledNow,
            "transcriptionUsed":   context.transcriptionUsed,
            "qualityDistribution": qualityDistribution,
            "platform":            "ios",
            "deviceModel":         context.deviceModel,
            "isVideo":             context.isVideo,
            "endReason":           context.endReason
        ]
    }
}
