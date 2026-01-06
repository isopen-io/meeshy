//
//  PerformanceMonitor.swift
//  Meeshy
//
//  Created on 2025-11-22.
//  Firebase Performance Monitoring for Trace Operations
//

import Foundation
// TODO: Install Firebase via CocoaPods or SPM to enable performance monitoring
// import FirebasePerformance
import UIKit

// MARK: - Firebase Performance Stubs (Remove when Firebase is properly installed)
#if !canImport(FirebasePerformance)
class Performance {
    static func startTrace(name: String) -> Trace? { return Trace(name: name) }
    static func sharedInstance() -> Performance { return Performance() }

    fileprivate let logger = performanceMonitorLogger

    func isDataCollectionEnabled() -> Bool { return false }
    func setDataCollectionEnabled(_ enabled: Bool) {}
}

class Trace {
    let name: String

    init(name: String) {
        self.name = name
    }

    func start() {}
    func stop() {}
    func incrementMetric(_ metricName: String, by value: Int64) {}
    func setValue(_ value: Int64, forMetric metricName: String) {}
    func setValue(_ value: String, forAttribute attribute: String) {}
    func getAttribute(_ attribute: String) -> String? { return nil }
    func setAttribute(_ attribute: String, value: String) {}
}

class HTTPMetric {
    init?(url: URL, httpMethod: HTTPMethod) {}

    var responseCode: Int = 0
    var requestPayloadSize: Int64 = 0
    var responsePayloadSize: Int64 = 0
    var responseContentType: String?

    func start() {}
    func stop() {}
    func setCustomAttribute(_ value: String, forName name: String) {}
}
#endif

// MARK: - Performance Monitor

actor PerformanceMonitor {

    // MARK: - Singleton

    static let shared = PerformanceMonitor()

    // MARK: - Properties

    private var isEnabled: Bool = true
    private var activeTraces: [String: Trace] = [:]

    private var performanceCollectionEnabled: Bool {
        get { UserDefaults.standard.bool(forKey: "performance_enabled") }
        set { UserDefaults.standard.set(newValue, forKey: "performance_enabled") }
    }

    // App launch tracking
    private var appLaunchStartTime: CFAbsoluteTime?
    private var isColdStart = true

    // MARK: - Initialization

    // MARK: - Initialization

    private init() {
        // Inline setupPerformanceMonitoring
        #if DEBUG
        Performance.sharedInstance().setDataCollectionEnabled(false)
        print("[Performance] Disabled in Debug mode")
        #else
        let enabled = UserDefaults.standard.bool(forKey: "performance_enabled")
        Performance.sharedInstance().setDataCollectionEnabled(enabled)
        print("[Performance] Enabled: \(enabled)")
        #endif
        
        // Inline trackAppLaunchStart
        appLaunchStartTime = CFAbsoluteTimeGetCurrent()
    }

    // MARK: - Setup

    // Removed setupPerformanceMonitoring as it is inlined

    // MARK: - Privacy Controls

    func enablePerformanceMonitoring() {
        performanceCollectionEnabled = true
        Performance.sharedInstance().setDataCollectionEnabled(true)
        isEnabled = true
        logger.info("Performance monitoring enabled")
    }

    func disablePerformanceMonitoring() {
        performanceCollectionEnabled = false
        Performance.sharedInstance().setDataCollectionEnabled(false)
        isEnabled = false
        logger.info("Performance monitoring disabled")
    }

    // MARK: - App Launch Monitoring

    // Removed trackAppLaunchStart as it is inlined

    func trackAppLaunchComplete() {
        guard let startTime = appLaunchStartTime else { return }

        let duration = CFAbsoluteTimeGetCurrent() - startTime
        let traceName = isColdStart ? "app_cold_start" : "app_warm_start"

        let trace = Performance.startTrace(name: traceName)
        trace?.setValue(Int64(duration * 1000), forMetric: "duration_ms")
        trace?.setValue(1, forMetric: "launch_count")
        trace?.stop()

        let coldStart = isColdStart
        Task { @MainActor in
            AnalyticsManager.shared.trackAppLaunched(coldStart: coldStart, duration: duration)
        }

        logger.info("App launch completed: \(traceName) in \(String(format: "%.2f", duration))s")

        isColdStart = false
        appLaunchStartTime = nil
    }

    // MARK: - Custom Traces

    func startTrace(name: String, attributes: [String: String] = [:]) -> String {
        guard isEnabled else { return "" }
        
        let traceID = UUID().uuidString
        
        guard let trace = Performance.startTrace(name: name) else {
            logger.error("Failed to start trace: \(name)")
            return traceID
        }

        // Set attributes
        for (key, value) in attributes {
            trace.setValue(value, forAttribute: key)
        }

        self.activeTraces[traceID] = trace

        logger.debug("Performance trace started: \(name) [\(traceID)]")

        return traceID
    }

    func stopTrace(
        _ traceID: String,
        metrics: [String: Int64] = [:],
        attributes: [String: String] = [:]
    ) {
        guard isEnabled, !traceID.isEmpty else { return }

        guard let trace = self.activeTraces[traceID] else {
            logger.warn("Trace not found: \(traceID)")
            return
        }

        // Set metrics
        for (key, value) in metrics {
            trace.setValue(value, forMetric: key)
        }

        // Set additional attributes
        for (key, value) in attributes {
            trace.setValue(value, forAttribute: key)
        }

        trace.stop()
        self.activeTraces.removeValue(forKey: traceID)

        logger.debug("Performance trace stopped: \(traceID)")
    }

    func incrementMetric(traceID: String, metric: String, by value: Int64 = 1) {
        guard isEnabled else { return }

        guard let trace = self.activeTraces[traceID] else { return }
        trace.incrementMetric(metric, by: value)
    }

    // MARK: - Convenience Trace Methods

    func measureOperation<T>(
        name: String,
        attributes: [String: String] = [:],
        operation: () throws -> T
    ) rethrows -> T {
        let traceID = startTrace(name: name, attributes: attributes)
        defer { stopTrace(traceID) }
        return try operation()
    }

    func measureAsyncOperation<T>(
        name: String,
        attributes: [String: String] = [:],
        operation: () async throws -> T
    ) async rethrows -> T {
        let traceID = startTrace(name: name, attributes: attributes)
        defer { stopTrace(traceID) }
        return try await operation()
    }

    // MARK: - Screen Performance

    func trackScreenLoad(screenName: String, loadTime: TimeInterval) {
        guard isEnabled else { return }

        let trace = Performance.startTrace(name: "screen_load")
        trace?.setValue(screenName, forAttribute: "screen_name")
        trace?.setValue(Int64(loadTime * 1000), forMetric: "load_time_ms")
        trace?.stop()

        Task { @MainActor in
            AnalyticsManager.shared.trackScreenLoaded(screen: screenName, duration: loadTime)
        }

        logger.debug("Screen loaded: \(screenName) in \(String(format: "%.2f", loadTime))s")
    }

    // MARK: - Network Performance

    func trackNetworkRequest(
        url: String,
        httpMethod: HTTPMethod,
        responseCode: Int,
        requestPayloadSize: Int64? = nil,
        responsePayloadSize: Int64? = nil,
        duration: TimeInterval
    ) {
        guard isEnabled else { return }

        guard let urlObj = URL(string: url),
              let metric = HTTPMetric(url: urlObj, httpMethod: httpMethod) else {
            logger.error("Failed to create HTTP metric for: \(url)")
            return
        }

        metric.responseCode = responseCode

        if let requestSize = requestPayloadSize {
            metric.requestPayloadSize = requestSize
        }

        if let responseSize = responsePayloadSize {
            metric.responsePayloadSize = responseSize
        }

        // Start and stop immediately (we already have the duration)
        metric.start()
        DispatchQueue.main.asyncAfter(deadline: .now() + duration) {
            metric.stop()
        }

        logger.debug("Network request tracked: \(httpMethod) \(url) [\(responseCode)]")
    }

    func createHTTPMetric(url: URL, httpMethod: HTTPMethod) -> HTTPMetric? {
        guard isEnabled else { return nil }

        guard let metric = HTTPMetric(url: url, httpMethod: httpMethod) else {
            logger.error("Failed to create HTTP metric")
            return nil
        }

        return metric
    }

    // MARK: - API Performance

    func trackAPICall(
        endpoint: String,
        method: String,
        duration: TimeInterval,
        success: Bool,
        responseSize: Int64? = nil
    ) {
        guard isEnabled else { return }

        let trace = Performance.startTrace(name: "api_call")
        trace?.setValue(endpoint, forAttribute: "endpoint")
        trace?.setValue(method, forAttribute: "method")
        trace?.setValue(success ? "true" : "false", forAttribute: "success")
        trace?.setValue(Int64(duration * 1000), forMetric: "duration_ms")

        if let size = responseSize {
            trace?.setValue(size, forMetric: "response_size_bytes")
        }

        trace?.stop()

        Task { @MainActor in
            AnalyticsManager.shared.trackAPICall(endpoint: endpoint, duration: duration, success: success)
        }

        logger.debug("API call tracked: \(method) \(endpoint) [\(success ? "success" : "failed")]")
    }

    // MARK: - Database Performance

    func trackDatabaseQuery(
        queryType: String,
        duration: TimeInterval,
        resultCount: Int
    ) {
        guard isEnabled else { return }

        let trace = Performance.startTrace(name: "database_query")
        trace?.setValue(queryType, forAttribute: "query_type")
        trace?.setValue(Int64(duration * 1000), forMetric: "duration_ms")
        trace?.setValue(Int64(resultCount), forMetric: "result_count")
        trace?.stop()

        logger.debug("Database query tracked: \(queryType) - \(resultCount) results in \(String(format: "%.3f", duration))s")
    }

    // MARK: - Media Performance

    func trackImageLoad(
        url: String,
        size: Int64,
        duration: TimeInterval,
        fromCache: Bool
    ) {
        guard isEnabled else { return }

        let trace = Performance.startTrace(name: "image_load")
        trace?.setValue(fromCache ? "cache" : "network", forAttribute: "source")
        trace?.setValue(Int64(duration * 1000), forMetric: "duration_ms")
        trace?.setValue(size, forMetric: "size_bytes")
        trace?.stop()

        logger.debug("Image load tracked: \(url) [\(fromCache ? "cache" : "network")] in \(String(format: "%.2f", duration))s")
    }

    func trackVideoLoad(
        url: String,
        size: Int64,
        duration: TimeInterval
    ) {
        guard isEnabled else { return }

        let trace = Performance.startTrace(name: "video_load")
        trace?.setValue(Int64(duration * 1000), forMetric: "duration_ms")
        trace?.setValue(size, forMetric: "size_bytes")
        trace?.stop()

        logger.debug("Video load tracked: \(url) in \(String(format: "%.2f", duration))s")
    }

    func trackMediaUpload(
        mediaType: String,
        size: Int64,
        duration: TimeInterval,
        success: Bool
    ) {
        guard isEnabled else { return }

        let trace = Performance.startTrace(name: "media_upload")
        trace?.setValue(mediaType, forAttribute: "media_type")
        trace?.setValue(success ? "true" : "false", forAttribute: "success")
        trace?.setValue(Int64(duration * 1000), forMetric: "duration_ms")
        trace?.setValue(size, forMetric: "size_bytes")

        // Calculate upload speed (bytes per second)
        if duration > 0 {
            let speedBps = Int64(Double(size) / duration)
            trace?.setValue(speedBps, forMetric: "upload_speed_bps")
        }

        trace?.stop()

        logger.debug("Media upload tracked: \(mediaType) - \(size) bytes in \(String(format: "%.2f", duration))s")
    }

    // MARK: - Message Performance

    func trackMessageSend(duration: TimeInterval, success: Bool) {
        guard isEnabled else { return }

        let trace = Performance.startTrace(name: "message_send")
        trace?.setValue(success ? "true" : "false", forAttribute: "success")
        trace?.setValue(Int64(duration * 1000), forMetric: "duration_ms")
        trace?.stop()
    }

    func trackMessageSync(
        messageCount: Int,
        duration: TimeInterval,
        success: Bool
    ) {
        guard isEnabled else { return }

        let trace = Performance.startTrace(name: "message_sync")
        trace?.setValue(success ? "true" : "false", forAttribute: "success")
        trace?.setValue(Int64(duration * 1000), forMetric: "duration_ms")
        trace?.setValue(Int64(messageCount), forMetric: "message_count")
        trace?.stop()

        logger.debug("Message sync tracked: \(messageCount) messages in \(String(format: "%.2f", duration))s")
    }

    // MARK: - Authentication Performance

    func trackAuthentication(
        method: String,
        duration: TimeInterval,
        success: Bool
    ) {
        guard isEnabled else { return }

        let trace = Performance.startTrace(name: "authentication")
        trace?.setValue(method, forAttribute: "method")
        trace?.setValue(success ? "true" : "false", forAttribute: "success")
        trace?.setValue(Int64(duration * 1000), forMetric: "duration_ms")
        trace?.stop()

        logger.debug("Authentication tracked: \(method) in \(String(format: "%.2f", duration))s")
    }

    // MARK: - System Performance

    func trackMemoryUsage() {
        guard isEnabled else { return }

        var info = mach_task_basic_info()
        var count = mach_msg_type_number_t(MemoryLayout<mach_task_basic_info>.size) / 4

        let kerr: kern_return_t = withUnsafeMutablePointer(to: &info) {
            $0.withMemoryRebound(to: integer_t.self, capacity: 1) {
                task_info(
                    mach_task_self_,
                    task_flavor_t(MACH_TASK_BASIC_INFO),
                    $0,
                    &count
                )
            }
        }

        if kerr == KERN_SUCCESS {
            let memoryUsageMB = Int64(info.resident_size) / 1024 / 1024

            let trace = Performance.startTrace(name: "memory_usage")
            trace?.setValue(memoryUsageMB, forMetric: "memory_mb")
            trace?.stop()

            // Check for high memory usage
            if memoryUsageMB > 200 {
                Task { @MainActor in
                    AnalyticsManager.shared.trackMemoryWarning(level: "high")
                    CrashReporter.shared.setCustomValue("\(memoryUsageMB)", forKey: "memory_usage_mb")
                }
            }

            logger.debug("Memory usage: \(memoryUsageMB) MB")
        }
    }

    func trackBatteryLevel() {
        Task { @MainActor in
            UIDevice.current.isBatteryMonitoringEnabled = true
            let batteryLevel = UIDevice.current.batteryLevel

            if batteryLevel >= 0 {
                let percentage = Int(batteryLevel * 100)

                if percentage < 20 {
                    AnalyticsManager.shared.trackLowBattery(percentage: percentage)
                }

                CrashReporter.shared.setCustomValue("\(percentage)", forKey: "battery_level")
            }
        }
    }

    // MARK: - Performance Issues Detection

    func detectPerformanceIssues(
        operation: String,
        duration: TimeInterval,
        threshold: TimeInterval
    ) {
        if duration > threshold {
            Task { @MainActor in
                CrashReporter.shared.recordPerformanceIssue(
                    operation: operation,
                    duration: duration,
                    threshold: threshold
                )
            }

            logger.warn("""
                Performance issue detected:
                Operation: \(operation)
                Duration: \(String(format: "%.2f", duration))s
                Threshold: \(String(format: "%.2f", threshold))s
                Exceeded by: \(String(format: "%.2f", duration - threshold))s
                """)
        }
    }

    // MARK: - Custom Metrics

    func recordCustomMetric(
        name: String,
        value: Int64,
        attributes: [String: String] = [:]
    ) {
        guard isEnabled else { return }

        let trace = Performance.startTrace(name: name)
        trace?.setValue(value, forMetric: "value")

        for (key, attributeValue) in attributes {
            trace?.setValue(attributeValue, forAttribute: key)
        }

        trace?.stop()
    }
}

// MARK: - Performance Timer

class PerformanceTimer {
    private let startTime: CFAbsoluteTime
    private let operation: String

    init(operation: String) {
        self.operation = operation
        self.startTime = CFAbsoluteTimeGetCurrent()
    }

    func stop(threshold: TimeInterval? = nil) -> TimeInterval {
        let duration = CFAbsoluteTimeGetCurrent() - startTime

        if let threshold = threshold {
            let op = operation
            let dur = duration
            let thresh = threshold
            Task {
                await PerformanceMonitor.shared.detectPerformanceIssues(
                    operation: op,
                    duration: dur,
                    threshold: thresh
                )
            }
        }

        return duration
    }
}
