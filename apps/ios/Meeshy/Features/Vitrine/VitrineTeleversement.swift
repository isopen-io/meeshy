#if DEBUG
import Foundation

/// Le serveur TUS de la vitrine (#9820) : le VRAI téléverseur (`TusUploadManager`) lui parle comme à la passerelle
/// — création, envoi des tronçons, fin — par une session dont chaque requête est servie ici, sans réseau. Le
/// téléverseur range lui-même le fichier envoyé dans le cache média sous l'URL rendue : le fil le relit depuis le disque.
///
/// Le serveur ne garde AUCUN état : ce que la fin doit rendre (nom, type, taille) voyage dans l'adresse que la création
/// remet. Une reprise d'une prise précédente (point de reprise du téléverseur) se termine donc comme un envoi neuf.
nonisolated enum VitrineTus {
    /// Là où vivent les fichiers téléversés en vitrine : une URL RELATIVE, la clé sous laquelle le téléverseur range le
    /// fichier envoyé dans le cache média.
    static let racine = "/api/v1/attachments/file/vitrine/televerses"

    struct Reponse: Sendable, Equatable {
        let statut: Int
        let entetes: [String: String]
        let corps: Data
    }

    /// La session que le téléverseur reçoit : `VitrineTusProtocol` y sert chaque requête, aucune ne part.
    static func session() -> URLSession {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [VitrineTusProtocol.self]
        return URLSession(configuration: configuration)
    }

    static func repondre(a requete: URLRequest) -> Reponse {
        switch requete.httpMethod {
        case "POST": return creer(requete)
        case "PATCH": return terminer(requete)
        case "HEAD": return Reponse(statut: 200, entetes: ["Upload-Offset": "0", "Tus-Resumable": "1.0.0"], corps: Data())
        default: return Reponse(statut: 405, entetes: [:], corps: Data())
        }
    }

    /// `Upload-Metadata` : des paires `clé base64(valeur)` séparées par des virgules.
    static func metadonnees(_ entete: String) -> [String: String] {
        Dictionary(entete.split(separator: ",").compactMap { paire -> (String, String)? in
            let morceaux = paire.trimmingCharacters(in: .whitespaces).split(separator: " ", maxSplits: 1)
            guard morceaux.count == 2, let octets = Data(base64Encoded: String(morceaux[1])),
                  let valeur = String(data: octets, encoding: .utf8) else { return nil }
            return (String(morceaux[0]), valeur)
        }, uniquingKeysWith: { premiere, _ in premiere })
    }

    private static func creer(_ requete: URLRequest) -> Reponse {
        let meta = metadonnees(requete.value(forHTTPHeaderField: "Upload-Metadata") ?? "")
        var lieu = URLComponents()
        lieu.path = "/api/v1/uploads/\(identifiant())"
        lieu.queryItems = [
            URLQueryItem(name: "nom", value: meta["filename"] ?? "media"),
            URLQueryItem(name: "type", value: meta["filetype"] ?? "application/octet-stream"),
            URLQueryItem(name: "taille", value: requete.value(forHTTPHeaderField: "Upload-Length") ?? "0"),
        ]
        return Reponse(statut: 201, entetes: ["Location": lieu.string ?? "", "Tus-Resumable": "1.0.0"], corps: Data())
    }

    /// Le dernier tronçon reçu, la pièce est créée : sa description, au format de `onUploadFinish`.
    private static func terminer(_ requete: URLRequest) -> Reponse {
        guard let url = requete.url, let composants = URLComponents(url: url, resolvingAgainstBaseURL: true) else {
            return Reponse(statut: 404, entetes: [:], corps: Data())
        }
        let valeur = { (nom: String) in composants.queryItems?.first { $0.name == nom }?.value }
        let id = url.lastPathComponent
        let nom = valeur("nom") ?? "media"
        let suffixe = (nom as NSString).pathExtension
        let fichier = suffixe.isEmpty ? id : "\(id).\(suffixe)"
        let taille = Int(valeur("taille") ?? "") ?? 0
        let piece: [String: Any] = [
            "id": id,
            "fileName": fichier,
            "originalName": nom,
            "mimeType": valeur("type") ?? "application/octet-stream",
            "fileSize": taille,
            "fileUrl": "\(racine)/\(fichier)",
        ]
        let corps = (try? JSONSerialization.data(withJSONObject: ["success": true, "data": ["attachment": piece]])) ?? Data()
        return Reponse(
            statut: 200,
            entetes: ["Upload-Offset": "\(taille)", "Tus-Resumable": "1.0.0", "Content-Type": "application/json"],
            corps: corps
        )
    }

    /// Un ObjectId plausible : 24 caractères hexadécimaux.
    private static func identifiant() -> String {
        String(UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased().prefix(24))
    }
}

/// Sert les requêtes TUS de la session de la vitrine, dans le fil qui les a lancées.
nonisolated final class VitrineTusProtocol: URLProtocol {
    override class func canInit(with request: URLRequest) -> Bool { true }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        let reponse = VitrineTus.repondre(a: request)
        guard let url = request.url,
              let http = HTTPURLResponse(url: url, statusCode: reponse.statut, httpVersion: "HTTP/1.1", headerFields: reponse.entetes) else {
            client?.urlProtocol(self, didFailWithError: URLError(.badURL))
            return
        }
        client?.urlProtocol(self, didReceive: http, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: reponse.corps)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}
#endif
