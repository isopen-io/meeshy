//
//  RequestLogger.swift
//  Meeshy
//
//  Comprehensive request/response logging for debugging
//

import Foundation
import os.log

class RequestLogger {

    // MARK: - Singleton

    @MainActor static let shared = RequestLogger()

    // MARK: - Properties

    private let logger: os.Logger
    private var isEnabled: Bool

    // MARK: - Initialization

    private init() {
        self.logger = os.Logger(subsystem: Bundle.main.bundleIdentifier ?? "com.meeshy", category: "API")
        #if DEBUG
        self.isEnabled = true
        #else
        self.isEnabled = false
        #endif
    }

    // MARK: - Public Methods

    func enableLogging(_ enabled: Bool) {
        self.isEnabled = enabled
    }

    func log(request: URLRequest, endpoint: APIEndpoint) {
        guard isEnabled else { return }

        var logMessage = """

        ╔═══════════════════════════════════════════════════════
        ║ REQUEST
        ╠═══════════════════════════════════════════════════════
        ║ Method: \(request.httpMethod ?? "UNKNOWN")
        ║ URL: \(request.url?.absoluteString ?? "UNKNOWN")
        ║ Endpoint: \(endpoint.path)
        """

        // Log headers
        if let headers = request.allHTTPHeaderFields, !headers.isEmpty {
            logMessage += "\n║ Headers:"
            headers.forEach { key, value in
                // Redact authorization header
                if key.lowercased() == "authorization" {
                    logMessage += "\n║   \(key): [REDACTED]"
                } else {
                    logMessage += "\n║   \(key): \(value)"
                }
            }
        }

        // Log body
        if let body = request.httpBody,
           let bodyString = String(data: body, encoding: .utf8) {
            logMessage += "\n║ Body:"
            logMessage += "\n║   \(bodyString)"
        }

        logMessage += "\n╚═══════════════════════════════════════════════════════"

        logger.debug("\(logMessage)")
    }

    func log(response: HTTPURLResponse, data: Data) {
        guard isEnabled else { return }

        var logMessage = """

        ╔═══════════════════════════════════════════════════════
        ║ RESPONSE
        ╠═══════════════════════════════════════════════════════
        ║ Status Code: \(response.statusCode)
        ║ URL: \(response.url?.absoluteString ?? "UNKNOWN")
        """

        // Log headers
        if !response.allHeaderFields.isEmpty {
            logMessage += "\n║ Headers:"
            response.allHeaderFields.forEach { key, value in
                logMessage += "\n║   \(key): \(value)"
            }
        }

        // Log body
        if let bodyString = String(data: data, encoding: .utf8) {
            logMessage += "\n║ Body:"
            let preview = bodyString.prefix(1000) // Limit preview to 1000 chars
            logMessage += "\n║   \(preview)"
            if bodyString.count > 1000 {
                logMessage += "\n║   ... (\(bodyString.count - 1000) more characters)"
            }
        }

        logMessage += "\n╚═══════════════════════════════════════════════════════"

        if response.statusCode >= 200 && response.statusCode < 300 {
            logger.debug("\(logMessage)")
        } else {
            logger.error("\(logMessage)")
        }
    }

    func log(error message: String) {
        guard isEnabled else { return }
        logger.error("❌ ERROR: \(message)")
    }

    func log(info message: String) {
        guard isEnabled else { return }
        logger.info("ℹ️ INFO: \(message)")
    }

    func log(warning message: String) {
        guard isEnabled else { return }
        logger.warning("⚠️ WARNING: \(message)")
    }
}
