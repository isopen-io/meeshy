import CoreGraphics
import Foundation

/// **Ce que devient un HEIC entre la prise et l'envoi** (#11291).
///
/// `native` : les octets de l'iPhone partent tels quels, `image/heic` — la
/// passerelle les convertit pour les lecteurs qui ne les décodent pas (S8,
/// #11263). `jpegCompatibility` : UN JPEG q 0,92, pour un serveur qui ne les
/// convertit pas.
public enum HEICDelivery: String, Sendable, Equatable {
    case native
    case jpegCompatibility
}

/// Ce que le serveur a dit d'un HEIC reçu.
public enum HEICServerVerdict: String, Sendable, Equatable {
    /// Il l'a converti : la réponse annonce autre chose que du HEIC.
    case converts
    /// Il l'a refusé (415) ou rangé tel quel comme un fichier, sans le convertir.
    case refuses
}

/// **La loi du HEIC natif, sans singleton** (SDK Purity : l'hôte décide QUAND).
///
/// La passerelle ne sert aucune capacité « je convertis le HEIC » : la réponse
/// d'un envoi en est une. `tus-handler.ts` rend le `mimeType` SERVI de la
/// pièce (`rendered.storedMimeType`) — `image/jpeg` pour un HEIC converti,
/// `image/heic` pour un ancien serveur qui l'a rangé comme un fichier — et
/// répond 415 à un HEIC qu'il ne sait pas décoder.
public enum HEICDeliveryLaw {
    /// La qualité du JPEG de compatibilité, plus haute que la qualité
    /// perceptuelle (0,85) : c'est la SEULE génération que le destinataire verra.
    public static let compatibilityQuality: CGFloat = 0.92

    public static func isHEIC(mimeType: String) -> Bool {
        servedType(mimeType) == "image/heic" || servedType(mimeType) == "image/heif"
    }

    public static func verdict(servedMimeType: String) -> HEICServerVerdict {
        isHEIC(mimeType: servedMimeType) ? .refuses : .converts
    }

    private static func servedType(_ mimeType: String) -> String {
        mimeType.split(separator: ";").first.map { $0.trimmingCharacters(in: .whitespaces).lowercased() } ?? ""
    }
}

extension OutgoingImagePolicy {
    /// La politique du repli : HD, un JPEG à la qualité de compatibilité.
    public static func jpegCompatibility(keepsLocation: Bool) -> OutgoingImagePolicy {
        OutgoingImagePolicy(maxPixelDimension: defaultHDPixelCeiling, compresses: false,
                            quality: HEICDeliveryLaw.compatibilityQuality, keepsLocation: keepsLocation,
                            heicDelivery: .jpegCompatibility)
    }

    /// La politique d'une conversion HEIC→JPEG : jamais sous la qualité de
    /// compatibilité, sauf compression forte — l'utilisateur a choisi d'économiser.
    var forHEICConversion: OutgoingImagePolicy {
        guard !compresses, quality < HEICDeliveryLaw.compatibilityQuality else { return self }
        return OutgoingImagePolicy(maxPixelDimension: maxPixelDimension, compresses: compresses,
                                   quality: HEICDeliveryLaw.compatibilityQuality, keepsLocation: keepsLocation,
                                   hdPixelCeiling: hdPixelCeiling, byteCeiling: byteCeiling, heicDelivery: heicDelivery)
    }
}

/// **Un refus se retient 24 h** : au-delà, le serveur a pu être mis à jour, on
/// réessaie le HEIC natif. Préférence de l'appareil, lue par l'hôte.
public enum HEICDeliveryMemo {
    public static let key = "media.outgoing.heicRefusedAt"
    public static let refusalLifetime: TimeInterval = 24 * 60 * 60

    public static func delivery(in defaults: UserDefaults = .standard, now: Date = Date()) -> HEICDelivery {
        guard let refusedAt = defaults.object(forKey: key) as? Double else { return .native }
        return now.timeIntervalSince1970 - refusedAt < refusalLifetime ? .jpegCompatibility : .native
    }

    public static func record(_ verdict: HEICServerVerdict, in defaults: UserDefaults = .standard, now: Date = Date()) {
        switch verdict {
        case .refuses: defaults.set(now.timeIntervalSince1970, forKey: key)
        case .converts: defaults.removeObject(forKey: key)
        }
    }
}

/// **Envoyer un HEIC, et repartir en JPEG q 0,92 si le serveur n'en veut pas.**
///
/// Le HEIC part tel quel. Si le serveur le refuse (415) ou le rend encore
/// `image/heic`, UNE variante JPEG est préparée depuis le fichier et envoyée à
/// sa place ; le refus est retenu (`HEICDeliveryMemo`) pour que les photos
/// suivantes partent directement en JPEG. Un HEIC resté sur un ancien serveur
/// n'est pas effaçable par le client : il y reste orphelin.
public enum HEICUploadFallback {
    public static func upload<Uploaded: Sendable>(
        fileURL: URL, mimeType: String, keepsLocation: Bool,
        defaults: UserDefaults = .standard, now: Date = Date(),
        preparer: any OutgoingImagePreparing = OutgoingImagePreparer(),
        servedMimeType: @Sendable (Uploaded) -> String,
        send: @Sendable (_ fileURL: URL, _ mimeType: String) async throws -> Uploaded
    ) async throws -> Uploaded {
        guard HEICDeliveryLaw.isHEIC(mimeType: mimeType) else { return try await send(fileURL, mimeType) }
        let first: Result<Uploaded, UnsupportedImageFormatRefusal>
        do {
            first = .success(try await send(fileURL, mimeType))
        } catch let refusal as UnsupportedImageFormatRefusal {
            first = .failure(refusal)
        }
        let verdict: HEICServerVerdict
        switch first {
        case .success(let uploaded): verdict = HEICDeliveryLaw.verdict(servedMimeType: servedMimeType(uploaded))
        case .failure: verdict = .refuses
        }
        HEICDeliveryMemo.record(verdict, in: defaults, now: now)
        guard verdict == .refuses,
              let variant = JPEGVariant(of: fileURL, keepsLocation: keepsLocation, preparer: preparer) else {
            return try first.get()
        }
        defer { variant.remove() }
        return try await send(variant.url, "image/jpeg")
    }
}

/// Le JPEG de compatibilité d'un fichier HEIC, écrit dans un dossier à lui.
private struct JPEGVariant {
    let url: URL
    private let directory: URL

    init?(of source: URL, keepsLocation: Bool, preparer: any OutgoingImagePreparing) {
        guard let data = try? Data(contentsOf: source),
              let prepared = preparer.prepare(data, policy: .jpegCompatibility(keepsLocation: keepsLocation)),
              prepared.format == .jpeg else { return nil }
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("heic-fallback-\(UUID().uuidString)")
        let url = directory.appendingPathComponent(source.deletingPathExtension().lastPathComponent + ".jpg")
        guard (try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)) != nil,
              (try? prepared.data.write(to: url)) != nil else { return nil }
        self.url = url
        self.directory = directory
    }

    func remove() {
        try? FileManager.default.removeItem(at: directory)
    }
}
