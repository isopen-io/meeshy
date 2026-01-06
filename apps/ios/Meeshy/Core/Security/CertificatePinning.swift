//
//  CertificatePinning.swift
//  Meeshy
//
//  Certificate pinning for secure API communication
//  iOS 16+
//

import Foundation
import Security

final class CertificatePinningDelegate: NSObject, URLSessionDelegate {
    // MARK: - Properties

    private let pinnedCertificates: [SecCertificate]

    // MARK: - Initialization

    override init() {
        var certificates: [SecCertificate] = []

        // Load pinned certificates from bundle
        if let certPath = Bundle.main.path(forResource: "meeshy-cert", ofType: "cer"),
           let certData = try? Data(contentsOf: URL(fileURLWithPath: certPath)),
           let certificate = SecCertificateCreateWithData(nil, certData as CFData) {
            certificates.append(certificate)
        }

        self.pinnedCertificates = certificates
        super.init()
    }

    // MARK: - URLSessionDelegate

    func urlSession(
        _ session: URLSession,
        didReceive challenge: URLAuthenticationChallenge,
        completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
    ) {
        // Only handle server trust challenges
        guard challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
              let serverTrust = challenge.protectionSpace.serverTrust else {
            completionHandler(.performDefaultHandling, nil)
            return
        }

        // Validate server trust
        var secresult = SecTrustResultType.invalid
        let status = SecTrustEvaluate(serverTrust, &secresult)

        guard status == errSecSuccess else {
            authLogger.error("Certificate trust evaluation failed")
            completionHandler(.cancelAuthenticationChallenge, nil)
            return
        }

        // Get server certificate
        guard let serverCertificate = SecTrustGetCertificateAtIndex(serverTrust, 0) else {
            authLogger.error("Failed to get server certificate")
            completionHandler(.cancelAuthenticationChallenge, nil)
            return
        }

        // Compare with pinned certificates
        let serverCertificateData = SecCertificateCopyData(serverCertificate) as Data

        for pinnedCertificate in pinnedCertificates {
            let pinnedCertificateData = SecCertificateCopyData(pinnedCertificate) as Data

            if serverCertificateData == pinnedCertificateData {
                // Certificate matches - allow connection
                authLogger.info("Certificate pinning validation succeeded")
                let credential = URLCredential(trust: serverTrust)
                completionHandler(.useCredential, credential)
                return
            }
        }

        // No match found - reject connection
        authLogger.error("Certificate pinning validation failed - certificate mismatch")
        completionHandler(.cancelAuthenticationChallenge, nil)
    }
}

// MARK: - Network Configuration

struct NetworkConfiguration {
    /// Configure secure network settings
    /// SECURITY: Enables TLS 1.3 with Forward Secrecy
    static func configure() -> URLSessionConfiguration {
        let config = URLSessionConfiguration.default

        // SECURITY: Minimum TLS 1.3 for Forward Secrecy
        config.tlsMinimumSupportedProtocolVersion = .TLSv13
        config.tlsMaximumSupportedProtocolVersion = .TLSv13

        // SECURITY: Timeout configuration
        config.timeoutIntervalForRequest = 10
        config.timeoutIntervalForResource = 30

        // SECURITY: Disable caching of sensitive data
        config.urlCache = nil
        config.requestCachePolicy = .reloadIgnoringLocalCacheData

        // SECURITY: Disable cookies for API requests (use token-based auth)
        config.httpShouldSetCookies = false
        config.httpCookieAcceptPolicy = .never

        authLogger.info("Network configuration completed with TLS 1.3 and Forward Secrecy")

        return config
    }

    /// Create a secure URLSession with certificate pinning
    static func createSecureSession() -> URLSession {
        let config = configure()
        let delegate = CertificatePinningDelegate()

        return URLSession(
            configuration: config,
            delegate: delegate,
            delegateQueue: nil
        )
    }
}

// MARK: - TLS Configuration Extension

extension URLSessionConfiguration {
    /// Configured for maximum security with Forward Secrecy
    static var secure: URLSessionConfiguration {
        return NetworkConfiguration.configure()
    }
}
