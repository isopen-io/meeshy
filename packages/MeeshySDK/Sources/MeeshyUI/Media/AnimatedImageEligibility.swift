import Foundation

/// **Ces octets peuvent-ils seulement PORTER une animation ?** (#4925)
///
/// ## Pourquoi une porte AVANT le décodeur
///
/// `AnimatedImageDecoder.decode` rend `nil` pour une image fixe — c'est le
/// contrat. Mais pour le dire, il construit un `CGImageSource` et interroge son
/// nombre d'images. Sur un fil de conversation, la quasi-totalité des images
/// sont des JPEG et des PNG fixes : **payer une construction de source par
/// avatar et par vignette pour apprendre à chaque fois qu'ils ne sont pas
/// animés** est exactement la lenteur que la dimension 2 de la roadmap appelle
/// un bug.
///
/// Cette règle répond à la même question en lisant **au plus 40 octets**, sans
/// allouer, et sans jamais se tromper dans le sens qui coûte : elle peut dire
/// « peut-être » pour un fichier finalement fixe (le décodeur tranchera), elle
/// ne dit JAMAIS « non » pour un fichier animé.
///
/// > La direction de l'erreur est choisie, pas subie : un faux « peut-être »
/// > coûte un décodage inutile ; un faux « non » ferait un sticker
/// > définitivement figé, sans aucun site où le remarquer.
///
/// ## Les quatre conteneurs, et le seul qui demande plus que sa signature
///
/// Quatre formats seulement peuvent animer : GIF, PNG (APNG), WebP, HEIC
/// (HEICS). **JPEG ne le peut pas** — c'est ce qui rend la porte rentable,
/// puisque c'est le format le plus fréquent.
///
/// Le PNG est le cas qui mérite un pas de plus : un sticker fixe est très
/// souvent un PNG, et s'arrêter à la signature `\x89PNG` rendrait « peut-être »
/// pour chacun d'eux. Un APNG se distingue par son chunk **`acTL`**, qui — la
/// spécification l'impose — précède le premier `IDAT`. Le chercher dans le
/// premier kilo-octet suffit donc, et c'est borné.
nonisolated public enum AnimatedImageEligibility {

    /// **Le conteneur qui porte l'animation** (#3956).
    ///
    /// La porte lisait déjà ces signatures pour répondre « peut-être » ; les
    /// NOMMER ne coûte pas un octet de plus et répond à une seconde question
    /// que le lot du GIF collé pose : **sous quel mime ces octets repartent-ils
    /// au serveur ?** Un GIF téléversé en `image/png` arriverait mal étiqueté
    /// chez tous les lecteurs — l'animation survivrait au disque et mourrait à
    /// l'en-tête.
    ///
    /// > Le décodeur reste l'arbitre de « est-ce animé ». Ce type ne dit que
    /// > « de quel format il s'agit » : un HEIC FIXE se nomme `.heic` ici, et
    /// > c'est `AnimatedImageDecoder.decode` qui refusera de l'animer.
    public enum Container: String, Sendable, CaseIterable {
        case gif, apng, webp, heic

        /// Le type MIME à porter jusqu'au serveur.
        public var mimeType: String {
            switch self {
            case .gif: return "image/gif"
            // Un APNG EST un PNG : `image/apng` existe mais n'est pas servi
            // partout, et les octets se décodent de la même façon.
            case .apng: return "image/png"
            case .webp: return "image/webp"
            case .heic: return "image/heic"
            }
        }

        /// L'extension du fichier temporaire d'envoi — TUS et le serveur en
        /// dérivent leur propre typage quand le mime leur manque.
        public var filenameExtension: String {
            switch self {
            case .gif: return "gif"
            case .apng: return "png"
            case .webp: return "webp"
            case .heic: return "heic"
            }
        }
    }

    /// Le nombre d'octets à examiner. Assez pour toutes les signatures, et pour
    /// l'`acTL` d'un APNG, qui vit dans l'en-tête.
    public static let inspectedPrefix = 1024

    /// `false` ⇒ ces octets ne peuvent PAS être animés, garanti.
    /// `true` ⇒ ils le peuvent ; c'est au décodeur de trancher.
    public static func mayBeAnimated(_ data: Data) -> Bool {
        container(data) != nil
    }

    /// `nil` ⇒ ces octets ne peuvent PAS être animés, garanti — la MÊME
    /// réponse que `mayBeAnimated`, avec le nom du format en prime.
    public static func container(_ data: Data) -> Container? {
        let head = data.prefix(inspectedPrefix)
        guard head.count >= 12 else { return nil }
        let bytes = [UInt8](head)

        if matches(bytes, at: 0, "GIF87a") || matches(bytes, at: 0, "GIF89a") {
            return .gif
        }
        if bytes.starts(with: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]) {
            // **Seul un APNG anime**, et son chunk `acTL` précède le premier
            // `IDAT` par obligation de spec — donc il est dans l'en-tête ou il
            // n'existe pas.
            return contains(bytes, "acTL") ? .apng : nil
        }
        if matches(bytes, at: 0, "RIFF"), matches(bytes, at: 8, "WEBP") {
            // Un WebP ANIMÉ est nécessairement étendu (`VP8X`) et porte un
            // chunk `ANIM`. Un WebP simple (`VP8 ` / `VP8L`) ne peut pas animer.
            return contains(bytes, "ANIM") ? .webp : nil
        }
        // HEIC : la marque de conteneur vit dans la boîte `ftyp`, à l'offset 4.
        // On n'essaie PAS d'y distinguer la séquence du fixe — la structure est
        // dans les boîtes suivantes, hors de l'en-tête, et se tromper dans le
        // sens « non » est la seule erreur inacceptable.
        if matches(bytes, at: 4, "ftyp") {
            return .heic
        }
        return nil
    }

    private static func matches(_ bytes: [UInt8], at offset: Int, _ ascii: String) -> Bool {
        let needle = Array(ascii.utf8)
        guard bytes.count >= offset + needle.count else { return false }
        return Array(bytes[offset..<(offset + needle.count)]) == needle
    }

    private static func contains(_ bytes: [UInt8], _ ascii: String) -> Bool {
        let needle = Array(ascii.utf8)
        guard bytes.count >= needle.count else { return false }
        for start in 0...(bytes.count - needle.count) where Array(bytes[start..<(start + needle.count)]) == needle {
            return true
        }
        return false
    }
}
