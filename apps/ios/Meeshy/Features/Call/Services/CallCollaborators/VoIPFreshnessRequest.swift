import Foundation

/// **La requête de la vérification de fraîcheur d'un appel VoIP** (#7817).
///
/// `GET /calls/:callId` part hors `APIClient`, au réveil d'un push VoIP. Écrite
/// à la main, elle ne portait que `Authorization` et `Accept` : ni la porte de
/// version (`X-App-*`), ni la locale, ni `X-Canvas-Caps`. Elle reçoit désormais
/// l'identité cliente de `ClientInfoProvider`, la même que l'`APIClient`
/// envoie, et le jeton de la session passe en dernier : aucun en-tête fourni
/// ne le remplace.
nonisolated enum VoIPFreshnessRequest {

    static func make(
        callId: String,
        token: String,
        baseURL: String,
        clientHeaders: [String: String],
        timeout: TimeInterval
    ) -> URLRequest? {
        guard let url = URL(string: "\(baseURL)/calls/\(callId)") else { return nil }
        var request = URLRequest(url: url, timeoutInterval: timeout)
        request.httpMethod = "GET"
        clientHeaders.forEach { key, value in
            request.setValue(value, forHTTPHeaderField: key)
        }
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        return request
    }
}
