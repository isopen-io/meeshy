import Foundation
import CoreLocation

public actor ClientInfoProvider {
    public static let shared = ClientInfoProvider()

    private var cachedStaticHeaders: [String: String]?
    private var cachedCity: String?
    private var cachedRegion: String?
    private var geoCacheExpiry: Date = .distantPast

    private init() {}

    // MARK: - Public API

    public func buildHeaders() async -> [String: String] {
        var headers = staticHeaders()

        headers["X-Meeshy-Locale"]   = Locale.current.identifier.replacingOccurrences(of: "_", with: "-")
        headers["X-Meeshy-Timezone"] = TimeZone.current.identifier
        if let country = Locale.current.region?.identifier {
            headers["X-Meeshy-Country"] = country
        }

        await enrichWithLocation(&headers)

        return headers
    }

    // MARK: - Static Headers (cached for session lifetime)

    private func staticHeaders() -> [String: String] {
        if let cached = cachedStaticHeaders {
            return cached
        }

        let headers: [String: String] = [
            "X-Meeshy-Version": appVersion(),
            "X-Meeshy-Build": appBuild(),
            "X-Meeshy-Platform": "ios",
            "X-Meeshy-Device": deviceModel(),
            "X-Meeshy-OS": osVersion()
        ]
        cachedStaticHeaders = headers
        return headers
    }

    // MARK: - Private helpers

    private func appVersion() -> String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0.0.0"
    }

    private func appBuild() -> String {
        Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "0"
    }

    private func osVersion() -> String {
        let v = ProcessInfo.processInfo.operatingSystemVersion
        return "\(v.majorVersion).\(v.minorVersion).\(v.patchVersion)"
    }

    private func deviceModel() -> String {
        var systemInfo = utsname()
        uname(&systemInfo)
        let machineMirror = Mirror(reflecting: systemInfo.machine)
        let identifier = machineMirror.children.reduce("") { id, element in
            guard let value = element.value as? Int8, value != 0 else { return id }
            return id + String(UnicodeScalar(UInt8(bitPattern: value)))
        }
        return identifier.isEmpty ? "unknown" : identifier
    }

    private func enrichWithLocation(_ headers: inout [String: String]) async {
        // Return cached result if still fresh (1h TTL) — avant tout accès CoreLocation
        if Date() < geoCacheExpiry, let city = cachedCity {
            headers["X-Meeshy-City"] = city
            if let region = cachedRegion { headers["X-Meeshy-Region"] = region }
            return
        }

        // Check permission passively via instance property (iOS 14+) — never request
        let locationResult: CLLocation? = await MainActor.run {
            let manager = CLLocationManager()
            let status = manager.authorizationStatus
            guard status == .authorizedWhenInUse || status == .authorizedAlways else { return nil }
            return manager.location
        }
        guard let location = locationResult else { return }

        do {
            let placemarks = try await CLGeocoder().reverseGeocodeLocation(location)
            if let placemark = placemarks.first {
                cachedCity   = placemark.locality
                cachedRegion = placemark.administrativeArea
                geoCacheExpiry = Date().addingTimeInterval(3600) // 1h

                if let city = cachedCity { headers["X-Meeshy-City"] = city }
                if let region = cachedRegion { headers["X-Meeshy-Region"] = region }
            }
        } catch {
            // Silently ignore geocoding errors — geo headers are optional
        }
    }
}
