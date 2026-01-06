//
//  PinoLogger.swift
//  Meeshy
//
//  Comprehensive logging system inspired by Pino
//  Features: Structured logging, log levels, child loggers, file rotation, pretty printing
//

import Foundation
import OSLog

// MARK: - Log Level

public enum PinoLogLevel: Int, Comparable, Codable, Sendable {
    case trace = 10
    case debug = 20
    case info = 30
    case warn = 40
    case error = 50
    case fatal = 60

    public static func < (lhs: PinoLogLevel, rhs: PinoLogLevel) -> Bool {
        lhs.rawValue < rhs.rawValue
    }

    var emoji: String {
        switch self {
        case .trace: return "🔍"
        case .debug: return "🐛"
        case .info: return "ℹ️"
        case .warn: return "⚠️"
        case .error: return "❌"
        case .fatal: return "💀"
        }
    }

    var name: String {
        switch self {
        case .trace: return "TRACE"
        case .debug: return "DEBUG"
        case .info: return "INFO"
        case .warn: return "WARN"
        case .error: return "ERROR"
        case .fatal: return "FATAL"
        }
    }

    var osLogType: OSLogType {
        switch self {
        case .trace, .debug: return .debug
        case .info: return .info
        case .warn: return .default
        case .error: return .error
        case .fatal: return .fault
        }
    }
}

// MARK: - Log Context

public struct LogContext: Codable, @unchecked Sendable {
    private var data: [String: AnyCodable]

    public init(_ data: [String: Any] = [:]) {
        self.data = data.mapValues { AnyCodable($0) }
    }

    public subscript(key: String) -> Any? {
        get { data[key]?.value }
        set { data[key] = newValue.map { AnyCodable($0) } }
    }

    public func merging(_ other: LogContext) -> LogContext {
        var merged = self.data
        merged.merge(other.data) { _, new in new }
        return LogContext(merged.mapValues { $0.value })
    }
}

// MARK: - AnyCodable
// Note: AnyCodable is defined in Meeshy/Core/Models/MessageAttachment.swift

// MARK: - Log Entry

struct LogEntry: Codable {
    let level: Int
    let time: TimeInterval
    let pid: Int
    let hostname: String
    let name: String
    let msg: String
    var v: Int = 1 // Pino log format version

    // Additional context fields
    var context: [String: AnyCodable]?
    var err: ErrorInfo?

    struct ErrorInfo: Codable {
        let type: String
        let message: String
        let stack: String?
    }
}

// MARK: - Pino Logger

public final class PinoLogger: @unchecked Sendable {

    // MARK: - Singleton

    public static let shared = PinoLogger()

    // MARK: - Properties

    private let name: String
    private let context: LogContext
    private var minimumLevel: PinoLogLevel
    private let prettyPrint: Bool
    private let osLog: OSLog
    
    private let lock = NSLock()

    // File logging
    private let fileLogger: FileLogger?
    private let logQueue = DispatchQueue(label: "me.meeshy.logger", qos: .utility)

    // Configuration
    public struct Configuration: Sendable {
        public var minimumLevel: PinoLogLevel = .debug
        public var prettyPrint: Bool = true
        public var enableFileLogging: Bool = true
        public var enableOSLog: Bool = true
        // Disabled by default - Firebase Crashlytics not fully configured
        // Enable when Firebase is properly set up
        public var enableCrashlytics: Bool = false
        public var maxFileSize: Int64 = 5 * 1024 * 1024  // MEMORY FIX: Reduced from 10MB to 5MB
        public var maxFiles: Int = 3                       // MEMORY FIX: Reduced from 5 to 3 (total: 15MB max)

        public init() {}
    }

    nonisolated(unsafe) private static var configuration = Configuration()

    // MARK: - Initialization

    public init(
        name: String = "Meeshy",
        context: LogContext = LogContext(),
        minimumLevel: PinoLogLevel? = nil,
        prettyPrint: Bool? = nil
    ) {
        self.name = name
        self.context = context
        self.minimumLevel = minimumLevel ?? Self.configuration.minimumLevel
        self.prettyPrint = prettyPrint ?? Self.configuration.prettyPrint
        self.osLog = OSLog(subsystem: "me.meeshy.app", category: name)

        if Self.configuration.enableFileLogging {
            self.fileLogger = FileLogger(
                maxFileSize: Self.configuration.maxFileSize,
                maxFiles: Self.configuration.maxFiles
            )
        } else {
            self.fileLogger = nil
        }
    }

    // MARK: - Configuration

    public static func configure(_ config: Configuration) {
        configuration = config
    }

    // MARK: - Child Logger

    public func child(name: String? = nil, context: [String: Any] = [:]) -> PinoLogger {
        let childName = name ?? self.name
        let childContext = self.context.merging(LogContext(context))

        return PinoLogger(
            name: childName,
            context: childContext,
            minimumLevel: self.minimumLevel,
            prettyPrint: self.prettyPrint
        )
    }

    // MARK: - Log Methods

    public func trace(_ message: String, _ context: [String: Any] = [:], file: String = #file, function: String = #function, line: Int = #line) {
        log(level: .trace, message: message, context: context, file: file, function: function, line: line)
    }

    public func debug(_ message: String, _ context: [String: Any] = [:], file: String = #file, function: String = #function, line: Int = #line) {
        log(level: .debug, message: message, context: context, file: file, function: function, line: line)
    }

    public func info(_ message: String, _ context: [String: Any] = [:], file: String = #file, function: String = #function, line: Int = #line) {
        log(level: .info, message: message, context: context, file: file, function: function, line: line)
    }

    public func warn(_ message: String, _ context: [String: Any] = [:], file: String = #file, function: String = #function, line: Int = #line) {
        log(level: .warn, message: message, context: context, file: file, function: function, line: line)
    }

    public func error(_ message: String, error: Error? = nil, _ context: [String: Any] = [:], file: String = #file, function: String = #function, line: Int = #line) {
        var errorContext = context
        if let error = error {
            errorContext["error"] = error.localizedDescription
        }
        log(level: .error, message: message, context: errorContext, error: error, file: file, function: function, line: line)
    }

    public func fatal(_ message: String, error: Error? = nil, _ context: [String: Any] = [:], file: String = #file, function: String = #function, line: Int = #line) {
        var errorContext = context
        if let error = error {
            errorContext["error"] = error.localizedDescription
        }
        log(level: .fatal, message: message, context: errorContext, error: error, file: file, function: function, line: line)
    }

    // MARK: - Core Log Function

    private func log(
        level: PinoLogLevel,
        message: String,
        context: [String: Any] = [:],
        error: Error? = nil,
        file: String,
        function: String,
        line: Int
    ) {
        lock.lock()
        let minLevel = minimumLevel
        lock.unlock()
        
        guard level >= minLevel else { return }

        logQueue.async { [weak self] in
            guard let self = self else { return }

            // Create log entry
            var entry = LogEntry(
                level: level.rawValue,
                time: Date().timeIntervalSince1970,
                pid: Int(ProcessInfo.processInfo.processIdentifier),
                hostname: ProcessInfo.processInfo.hostName,
                name: self.name,
                msg: message
            )

            // Merge contexts
            var allContext = self.context.merging(LogContext(context))
            allContext["file"] = (file as NSString).lastPathComponent
            allContext["function"] = function
            allContext["line"] = line

            entry.context = allContext.contextData.mapValues { AnyCodable($0.value) }

            // Add error info if present
            if let error = error {
                entry.err = LogEntry.ErrorInfo(
                    type: String(describing: type(of: error)),
                    message: error.localizedDescription,
                    stack: Thread.callStackSymbols.joined(separator: "\n")
                )
            }

            // Output
            self.output(entry: entry, level: level, message: message)
        }
    }

    private func output(entry: LogEntry, level: PinoLogLevel, message: String) {
        // Console output
        if prettyPrint {
            printPretty(entry: entry, level: level)
        } else {
            printJSON(entry: entry)
        }

        // OSLog
        if Self.configuration.enableOSLog {
            os_log("%{public}@", log: osLog, type: level.osLogType, message)
        }

        // File logging
        if let fileLogger = fileLogger {
            if let jsonData = try? JSONEncoder().encode(entry),
               let jsonString = String(data: jsonData, encoding: .utf8) {
                fileLogger.write(jsonString + "\n")
            }
        }

        // Crashlytics logging
        if Self.configuration.enableCrashlytics && level >= .warn {
            Task { @MainActor in
                CrashReporter.shared.log(message)

                // For errors and fatal, also leave breadcrumb
                if level >= .error {
                    CrashReporter.shared.leaveBreadcrumb(
                        message: message,
                        category: name,
                        level: level.breadcrumbLevel
                    )
                }
            }
        }
    }

    private func printPretty(entry: LogEntry, level: PinoLogLevel) {
        let timestamp = formatTimestamp(entry.time)
        let fileName = entry.context?["file"]?.value as? String ?? ""
        let function = entry.context?["function"]?.value as? String ?? ""
        let line = entry.context?["line"]?.value as? Int ?? 0

        var output = "\(level.emoji) [\(timestamp)] [\(level.name)] [\(entry.name)] \(entry.msg)"

        // Add location
        output += " (\(fileName):\(line) \(function))"

        // Add context
        if let context = entry.context {
            let filteredContext = context.filter { !["file", "function", "line"].contains($0.key) }
            if !filteredContext.isEmpty {
                let contextStr = filteredContext.map { "\($0.key)=\($0.value.value)" }.joined(separator: ", ")
                output += " { \(contextStr) }"
            }
        }

        // Add error
        if let err = entry.err {
            output += "\n  Error: \(err.type) - \(err.message)"
            if let stack = err.stack {
                output += "\n  Stack:\n\(stack.split(separator: "\n").prefix(5).map { "    \($0)" }.joined(separator: "\n"))"
            }
        }

        print(output)
    }

    private func printJSON(entry: LogEntry) {
        if let jsonData = try? JSONEncoder().encode(entry),
           let jsonString = String(data: jsonData, encoding: .utf8) {
            print(jsonString)
        }
    }

    private func formatTimestamp(_ timestamp: TimeInterval) -> String {
        let date = Date(timeIntervalSince1970: timestamp)
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm:ss.SSS"
        return formatter.string(from: date)
    }
}

// MARK: - File Logger

private final class FileLogger {
    private let logDirectory: URL
    private let maxFileSize: Int64
    private let maxFiles: Int
    private var currentFileHandle: FileHandle?
    private let fileQueue = DispatchQueue(label: "me.meeshy.filelogger", qos: .utility)

    init(maxFileSize: Int64, maxFiles: Int) {
        self.maxFileSize = maxFileSize
        self.maxFiles = maxFiles

        // Create logs directory
        let fileManager = FileManager.default
        let cacheDir = fileManager.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        self.logDirectory = cacheDir.appendingPathComponent("Logs", isDirectory: true)

        try? fileManager.createDirectory(at: logDirectory, withIntermediateDirectories: true)

        // Open current log file
        openCurrentLogFile()
    }

    func write(_ message: String) {
        fileQueue.async { [weak self] in
            guard let self = self else { return }

            // Check file size and rotate if needed
            if self.shouldRotate() {
                self.rotateLogFiles()
            }

            // Write to file
            if let data = message.data(using: .utf8) {
                self.currentFileHandle?.write(data)
            }
        }
    }

    private func openCurrentLogFile() {
        let logFile = logDirectory.appendingPathComponent("meeshy.log")

        let fileManager = FileManager.default
        if !fileManager.fileExists(atPath: logFile.path) {
            fileManager.createFile(atPath: logFile.path, contents: nil)
        }

        currentFileHandle = try? FileHandle(forWritingTo: logFile)
        currentFileHandle?.seekToEndOfFile()
    }

    private func shouldRotate() -> Bool {
        guard let handle = currentFileHandle else { return false }

        do {
            let offset = try handle.offset()
            return offset >= maxFileSize
        } catch {
            return false
        }
    }

    private func rotateLogFiles() {
        currentFileHandle?.closeFile()
        currentFileHandle = nil

        let fileManager = FileManager.default
        let currentLog = logDirectory.appendingPathComponent("meeshy.log")

        // Rotate existing files
        for i in stride(from: maxFiles - 1, through: 1, by: -1) {
            let oldFile = logDirectory.appendingPathComponent("meeshy.\(i).log")
            let newFile = logDirectory.appendingPathComponent("meeshy.\(i + 1).log")

            if fileManager.fileExists(atPath: oldFile.path) {
                try? fileManager.removeItem(at: newFile)
                try? fileManager.moveItem(at: oldFile, to: newFile)
            }
        }

        // Move current to .1
        let firstRotated = logDirectory.appendingPathComponent("meeshy.1.log")
        try? fileManager.removeItem(at: firstRotated)
        try? fileManager.moveItem(at: currentLog, to: firstRotated)

        // Create new log file
        openCurrentLogFile()
    }

    deinit {
        currentFileHandle?.closeFile()
    }
}

// MARK: - Log Context Extension

private extension LogContext {
    var contextData: [String: AnyCodable] {
        var result: [String: AnyCodable] = [:]
        let mirror = Mirror(reflecting: self)
        for child in mirror.children {
            if let key = child.label, key == "data" {
                return child.value as? [String: AnyCodable] ?? [:]
            }
        }
        return result
    }
}

// MARK: - Convenience Extensions

extension PinoLogger {
    /// Log a performance metric
    public func metric(_ name: String, value: Double, unit: String, _ context: [String: Any] = [:]) {
        var metricContext = context
        metricContext["metric"] = name
        metricContext["value"] = value
        metricContext["unit"] = unit
        info("📊 Performance metric: \(name)", metricContext)
    }

    /// Log API request
    public func apiRequest(method: String, url: String, statusCode: Int? = nil, duration: TimeInterval? = nil) {
        var context: [String: Any] = [
            "method": method,
            "url": url
        ]
        if let statusCode = statusCode {
            context["statusCode"] = statusCode
        }
        if let duration = duration {
            context["duration"] = String(format: "%.2fms", duration * 1000)
        }

        let level: PinoLogLevel = (statusCode ?? 200) >= 400 ? .error : .info
        log(level: level, message: "\(method) \(url)", context: context, file: #file, function: #function, line: #line)
    }

    /// Log WebSocket event
    public func websocket(event: String, data: [String: Any] = [:]) {
        var context = data
        context["event"] = event
        debug("🔌 WebSocket: \(event)", context)
    }

    /// Measure execution time
    public func measure<T>(_ name: String, block: () throws -> T) rethrows -> T {
        let start = Date()
        defer {
            let duration = Date().timeIntervalSince(start)
            metric(name, value: duration, unit: "seconds")
        }
        return try block()
    }

    /// Measure async execution time
    public func measureAsync<T>(_ name: String, block: () async throws -> T) async rethrows -> T {
        let start = Date()
        defer {
            let duration = Date().timeIntervalSince(start)
            metric(name, value: duration, unit: "seconds")
        }
        return try await block()
    }
}

// MARK: - PinoLogLevel Extensions

extension PinoLogLevel {
    var breadcrumbLevel: BreadcrumbLevel {
        switch self {
        case .trace, .debug: return .debug
        case .info: return .info
        case .warn: return .warning
        case .error: return .error
        case .fatal: return .critical
        }
    }
}
