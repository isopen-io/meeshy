import Foundation

nonisolated enum ShareTusError: Error, Equatable {
    case createRefused(status: Int)
    case missingLocation
    case patchRefused(status: Int, offset: Int)
    case missingAttachmentId
}

/// Client TUS minimal, taillé pour une extension de partage.
///
/// `TusUploadManager` du SDK est inutilisable ici : il traîne un checkpoint
/// GRDB et un seed `CacheCoordinator` (`:170-200`), sous un plafond mémoire de
/// ~120 Mo et sans droit à `beginBackgroundTask`. Ce client n'a **aucune
/// reprise, aucun checkpoint, aucun `HEAD` de récupération d'offset** : il
/// réussit vite ou il échoue, et l'échec est déjà couvert — la fiche de reprise
/// part sur disque avant lui, l'app rejouera.
///
/// Il n'est appelé que sous le seuil de
/// `ShareLimits.isOpportunisticUploadEligible` : chaque fichier tient dans une
/// seule tranche.
///
/// Deux moments d'échec, distincts et TOUS DEUX à traiter — le contrat serveur
/// (`services/gateway/src/routes/uploads/tus-handler.ts`, commits `56d86d32e`
/// + `40a27d29d`) les sépare explicitement :
/// 1. **Identité, à la création** (`onUploadCreate`) — le POST initial peut
///    être refusé (401 jeton invalide/expiré, 413 taille) avant qu'aucun octet
///    ne parte. Surface ici par `.createRefused(status:)`.
/// 2. **Autorisation/contenu, à la fin** (`onUploadFinish`) — une fois TOUS
///    les octets sur disque. Le serveur répond alors sur la réponse de la
///    tranche qui complète l'upload (la dernière `PATCH`) : un refus à ce
///    stade (403 lien de partage, contenu réel non conforme au type déclaré)
///    arrive donc comme un statut non-2xx sur ce PATCH, capturé par
///    `.patchRefused(status:offset:)` exactement comme un conflit d'offset —
///    dans les deux cas l'upload s'arrête là, sans id fantôme.
/// Un client qui ne lirait que le statut du POST de création laisserait
/// l'utilisateur croire à un succès si le rejet arrive à la fin.
nonisolated enum ShareTusClient {

    /// 10 Mio — parité EXACTE avec `TusUploadManager.chunkSize` du SDK. Deux
    /// clients qui découperaient différemment produiraient des offsets
    /// incompatibles sur un même upload.
    static let chunkSize = 10 * 1024 * 1024
    static let resumableVersion = "1.0.0"

    /// Contrat TUS : `clé <valeur base64>`, paires séparées par des virgules.
    static func metadataValue(fileName: String, mime: String) -> String {
        let encodedName = Data(fileName.utf8).base64EncodedString()
        let encodedType = Data(mime.utf8).base64EncodedString()
        return "filename \(encodedName),filetype \(encodedType)"
    }

    /// `Authorization: Bearer` porte le JWT applicatif de `ShareSession` — la
    /// même identité vérifiée par `jwt.verify` que toute requête REST de
    /// l'app. L'extension n'a et n'utilise jamais de `X-Session-Token`
    /// anonyme : la voie de résolution anonyme du serveur (jeton non
    /// résolvable en participant actif ⇒ 401) ne concerne donc pas ce client.
    static func createRequest(
        baseURL: String, bytes: Int, fileName: String, mime: String, session: ShareSession
    ) -> URLRequest? {
        guard let url = URL(string: "\(baseURL)/api/v1/uploads") else { return nil }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(session.token)", forHTTPHeaderField: "Authorization")
        request.setValue(resumableVersion, forHTTPHeaderField: "Tus-Resumable")
        request.setValue("\(bytes)", forHTTPHeaderField: "Upload-Length")
        request.setValue(metadataValue(fileName: fileName, mime: mime),
                         forHTTPHeaderField: "Upload-Metadata")
        return request
    }

    /// Le serveur peut répondre une `Location` absolue OU relative. Traiter la
    /// seconde comme absolue produirait une URL nulle et un upload
    /// silencieusement mort.
    static func resolveLocation(_ raw: String, baseURL: String) -> URL? {
        if let absolute = URL(string: raw), absolute.scheme != nil { return absolute }
        guard let base = URL(string: baseURL) else { return nil }
        return URL(string: raw, relativeTo: base)?.absoluteURL
    }

    static func patchRequest(location: URL, offset: Int, session: ShareSession) -> URLRequest {
        var request = URLRequest(url: location)
        request.httpMethod = "PATCH"
        request.setValue("Bearer \(session.token)", forHTTPHeaderField: "Authorization")
        request.setValue(resumableVersion, forHTTPHeaderField: "Tus-Resumable")
        request.setValue("application/offset+octet-stream", forHTTPHeaderField: "Content-Type")
        request.setValue("\(offset)", forHTTPHeaderField: "Upload-Offset")
        return request
    }

    /// Le hook `onUploadFinish` du gateway renvoie l'attachment créé dans le
    /// corps de la DERNIÈRE tranche.
    static func attachmentId(fromFinalBody data: Data) -> String? {
        guard let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let payload = root["data"] as? [String: Any],
              let attachment = payload["attachment"] as? [String: Any] else { return nil }
        return attachment["id"] as? String
    }

    /// Téléverse UN fichier et renvoie l'identifiant de la pièce jointe créée.
    ///
    /// Lecture par tranches via `FileHandle` : le fichier n'est jamais chargé
    /// entier en mémoire, même sous le seuil.
    static func upload(
        file: URL,
        media: ShareStagedMedia,
        session: ShareSession,
        urlSession: URLSession = .shared
    ) async throws -> String {
        guard let create = createRequest(
            baseURL: session.apiBaseURL, bytes: media.bytes,
            fileName: URL(fileURLWithPath: media.relPath).lastPathComponent,
            mime: media.mime, session: session
        ) else { throw ShareTusError.missingLocation }

        let (_, createResponse) = try await urlSession.data(for: create)
        guard let http = createResponse as? HTTPURLResponse else {
            throw ShareTusError.createRefused(status: -1)
        }
        guard http.statusCode == 201 else {
            throw ShareTusError.createRefused(status: http.statusCode)
        }
        guard let rawLocation = http.value(forHTTPHeaderField: "Location"),
              let location = resolveLocation(rawLocation, baseURL: session.apiBaseURL) else {
            throw ShareTusError.missingLocation
        }

        let handle = try FileHandle(forReadingFrom: file)
        defer { try? handle.close() }

        var offset = 0
        var lastBody = Data()
        while offset < media.bytes {
            let chunk = try autoreleasepool { () -> Data? in
                try handle.read(upToCount: chunkSize)
            }
            guard let chunk, !chunk.isEmpty else { break }

            var request = patchRequest(location: location, offset: offset, session: session)
            request.httpBody = chunk

            let (body, response) = try await urlSession.data(for: request)
            guard let patchHTTP = response as? HTTPURLResponse,
                  patchHTTP.statusCode == 200 || patchHTTP.statusCode == 204 else {
                // Aucune reprise ici : le lot B-1 a déjà écrit la fiche, l'app
                // rejouera avec le vrai `TusUploadManager` et son checkpoint.
                // Ce statut couvre AUSSI le refus tardif du serveur — un 403
                // d'autorisation ou de contenu non conforme arrive sur CETTE
                // même réponse quand la tranche complète l'upload
                // (`onUploadFinish` lève depuis la dernière `PATCH`).
                throw ShareTusError.patchRefused(
                    status: (response as? HTTPURLResponse)?.statusCode ?? -1, offset: offset)
            }
            offset += chunk.count
            lastBody = body
        }

        guard let id = attachmentId(fromFinalBody: lastBody) else {
            throw ShareTusError.missingAttachmentId
        }
        return id
    }
}
