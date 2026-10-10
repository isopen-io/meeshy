import Foundation
import MetricKit
import os

extension MeeshyMetricsSubscriber {

    public struct BackgroundExitCounts: Sendable, Equatable {
        public let normal: Int
        public let abnormal: Int
        public let memoryResourceLimit: Int
        public let cpuResourceLimit: Int
        public let memoryPressure: Int
        public let watchdog: Int
        public let suspendedWithLockedFile: Int
        public let backgroundTaskAssertionTimeout: Int
        public let badAccess: Int
        public let illegalInstruction: Int

        public init(
            normal: Int,
            abnormal: Int,
            memoryResourceLimit: Int,
            cpuResourceLimit: Int,
            memoryPressure: Int,
            watchdog: Int,
            suspendedWithLockedFile: Int,
            backgroundTaskAssertionTimeout: Int,
            badAccess: Int,
            illegalInstruction: Int
        ) {
            self.normal = normal
            self.abnormal = abnormal
            self.memoryResourceLimit = memoryResourceLimit
            self.cpuResourceLimit = cpuResourceLimit
            self.memoryPressure = memoryPressure
            self.watchdog = watchdog
            self.suspendedWithLockedFile = suspendedWithLockedFile
            self.backgroundTaskAssertionTimeout = backgroundTaskAssertionTimeout
            self.badAccess = badAccess
            self.illegalInstruction = illegalInstruction
        }

        public static let none = BackgroundExitCounts(
            normal: 0, abnormal: 0, memoryResourceLimit: 0, cpuResourceLimit: 0, memoryPressure: 0,
            watchdog: 0, suspendedWithLockedFile: 0, backgroundTaskAssertionTimeout: 0, badAccess: 0,
            illegalInstruction: 0
        )

        public var terminations: Int {
            abnormal + memoryResourceLimit + cpuResourceLimit + memoryPressure + watchdog
                + suspendedWithLockedFile + backgroundTaskAssertionTimeout + badAccess + illegalInstruction
        }
    }

    public struct PayloadSummary: Sendable, Equatable {
        public let periodEnd: Date
        public let scrollHitchTimeRatio: Double?
        public let cumulativeCPUTimeSeconds: Double?
        public let cumulativeGPUTimeSeconds: Double?
        public let peakMemoryBytes: Double?
        public let cumulativeBackgroundAudioSeconds: Double?
        public let backgroundExits: BackgroundExitCounts

        public init(
            periodEnd: Date,
            scrollHitchTimeRatio: Double?,
            cumulativeCPUTimeSeconds: Double?,
            cumulativeGPUTimeSeconds: Double?,
            peakMemoryBytes: Double?,
            cumulativeBackgroundAudioSeconds: Double?,
            backgroundExits: BackgroundExitCounts
        ) {
            self.periodEnd = periodEnd
            self.scrollHitchTimeRatio = scrollHitchTimeRatio
            self.cumulativeCPUTimeSeconds = cumulativeCPUTimeSeconds
            self.cumulativeGPUTimeSeconds = cumulativeGPUTimeSeconds
            self.peakMemoryBytes = peakMemoryBytes
            self.cumulativeBackgroundAudioSeconds = cumulativeBackgroundAudioSeconds
            self.backgroundExits = backgroundExits
        }
    }

    @discardableResult
    public func consume(payloadSummaries: [PayloadSummary]) -> Int {
        guard !payloadSummaries.isEmpty else { return 0 }
        let limit = Self.maxRetainedPayloads
        payloadsLock.withLock { store in
            store = Array((store + payloadSummaries).suffix(limit))
        }
        let terminations = payloadSummaries.reduce(0) { $0 + $1.backgroundExits.terminations }
        let hitch = payloadSummaries.last?.scrollHitchTimeRatio.map { String(format: "%.4f", $0) } ?? "n/a"
        Logger(subsystem: "me.meeshy.app", category: "metrics-subscriber")
            .info("Stored \(payloadSummaries.count, privacy: .public) metric payload(s) — scrollHitch=\(hitch, privacy: .public) backgroundTerminations=\(terminations, privacy: .public)")
        return payloadSummaries.count
    }
}

extension MeeshyMetricsSubscriber.BackgroundExitCounts {
    init(_ data: MXBackgroundExitData?) {
        guard let data else {
            self = .none
            return
        }
        self.init(
            normal: data.cumulativeNormalAppExitCount,
            abnormal: data.cumulativeAbnormalExitCount,
            memoryResourceLimit: data.cumulativeMemoryResourceLimitExitCount,
            cpuResourceLimit: data.cumulativeCPUResourceLimitExitCount,
            memoryPressure: data.cumulativeMemoryPressureExitCount,
            watchdog: data.cumulativeAppWatchdogExitCount,
            suspendedWithLockedFile: data.cumulativeSuspendedWithLockedFileExitCount,
            backgroundTaskAssertionTimeout: data.cumulativeBackgroundTaskAssertionTimeoutExitCount,
            badAccess: data.cumulativeBadAccessExitCount,
            illegalInstruction: data.cumulativeIllegalInstructionExitCount
        )
    }
}

extension MeeshyMetricsSubscriber.PayloadSummary {
    init(payload: MXMetricPayload) {
        self.init(
            periodEnd: payload.timeStampEnd,
            scrollHitchTimeRatio: payload.animationMetrics?.scrollHitchTimeRatio.value,
            cumulativeCPUTimeSeconds: payload.cpuMetrics?.cumulativeCPUTime.converted(to: .seconds).value,
            cumulativeGPUTimeSeconds: payload.gpuMetrics?.cumulativeGPUTime.converted(to: .seconds).value,
            peakMemoryBytes: payload.memoryMetrics?.peakMemoryUsage.converted(to: .bytes).value,
            cumulativeBackgroundAudioSeconds: payload.applicationTimeMetrics?
                .cumulativeBackgroundAudioTime.converted(to: .seconds).value,
            backgroundExits: .init(payload.applicationExitMetrics?.backgroundExitData)
        )
    }
}
