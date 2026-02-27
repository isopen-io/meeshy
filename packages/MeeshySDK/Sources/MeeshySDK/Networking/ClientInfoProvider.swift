import Foundation
import CoreLocation

public actor ClientInfoProvider {
    public static let shared = ClientInfoProvider()

    private var cachedCity: String?
    private var cachedRegion: String?
    private var geoCacheExpiry: Date = .distantPast

    private init() {}

    // MARK: - Public API

    public func buildHeaders() async -> [String: String] {
        var headers: [String: String] = [:]

        // App identity
        headers["X-Meeshy-Version"] = appVersion()
        headers["X-Meeshy-Build"]   = appBuild()
        headers["X-Meeshy-Platform"] = "ios"

        // Device & OS
        headers["X-Meeshy-Device"] = deviceModel()
        headers["X-Meeshy-OS"]     = osVersion()

        // Locale & time
        headers["X-Meeshy-Locale"]   = Locale.current.identifier.replacingOccurrences(of: "_", with: "-")
        headers["X-Meeshy-Timezone"] = TimeZone.current.identifier
        if let country = Locale.current.region?.identifier {
            headers["X-Meeshy-Country"] = country
        }

        // User-Agent
        let version = appVersion()
        let build   = appBuild()
        let os      = osVersion()
        let model   = deviceModel()
        headers["User-Agent"] = "Meeshy-iOS/\(version) (\(build)) iOS/\(os) \(model)"

        // Geo (only if permission already granted — never request)
        await enrichWithLocation(&headers)

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
            return id + String(UnicodeScalar(UInt8(value)))
        }
        return identifier.isEmpty ? "unknown" : identifier
    }

    private func enrichWithLocation(_ headers: inout [String: String]) async {
        // Check permission passively — never trigger a request dialog
        let status = CLLocationManager.authorizationStatus()
        guard status == .authorizedWhenInUse || status == .authorizedAlways else { return }

        // Return cached result if still fresh (1h TTL)
        if Date() < geoCacheExpiry, let city = cachedCity {
            headers["X-Meeshy-City"] = city
            if let region = cachedRegion { headers["X-Meeshy-Region"] = region }
            return
        }

        guard let location = CLLocationManager().location else { return }

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
