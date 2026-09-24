import Foundation
import MeeshySDK

/// **La seule fabrique de requêtes API de la NSE** (#7804).
///
/// Ce que la NSE précharge est ce que l'app PEINT au tap de la notification :
/// sa requête doit donc se présenter exactement comme celle de l'app. Les
/// requêtes écrites à la main ne portaient que `Authorization` et `Accept` —
/// sans `X-Canvas-Caps`, la passerelle servait la sentinelle v1 « Mets à jour
/// Meeshy » à la place du canvas d'une story, et le viewer l'affichait alors
/// que la même story s'ouvrait bien depuis la tray.
///
/// L'identité vient de `ClientInfoProvider.identityHeaders()`, la même que
/// l'`APIClient` envoie : aucune seconde orthographe à laisser diverger.
nonisolated enum NSEAPIRequest {

    static func make(
        url: URL,
        token: String,
        method: String = "GET",
        timeout: TimeInterval = 15
    ) -> URLRequest {
        var request = URLRequest(url: url, timeoutInterval: timeout)
        request.httpMethod = method
        ClientInfoProvider.identityHeaders().forEach { key, value in
            request.setValue(value, forHTTPHeaderField: key)
        }
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if method != "GET" {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        return request
    }
}
