import Foundation

/// **LE DÉCOR D'UNE CARTE** (#18673) — ce qu'une maquette ajoute à la mise en
/// page commune : l'alignement du texte, un cadre, un ornement. Chaque brique
/// est CONNUE du moteur et se règle par des valeurs : une maquette fournie par
/// une marque les combine, elle n'apporte jamais de code. `.none` rend
/// exactement la carte d'avant.
public struct MessageCardDecor: Equatable, Hashable, Sendable, Codable {
    public enum Alignment: String, CaseIterable, Sendable, Codable { case start, center }
    public enum Frame: String, CaseIterable, Sendable, Codable { case none, panel, border }
    public enum Ornament: String, CaseIterable, Sendable, Codable { case none, quoteMark, accentRule }

    public var alignment: Alignment
    public var frame: Frame
    public var ornament: Ornament

    public init(alignment: Alignment = .start, frame: Frame = .none, ornament: Ornament = .none) {
        self.alignment = alignment
        self.frame = frame
        self.ornament = ornament
    }

    public static let none = MessageCardDecor()
    public var isNone: Bool { self == .none }
}

/// **UNE MAQUETTE D'EXPORT** (#18673) — une FICHE DE DONNÉES, jamais du code :
/// une palette, une police et une liaison par défaut, la disposition (format,
/// en-tête, place des noms, inclinaison), le décor, et ce que l'utilisateur
/// peut y régler. La palette, la police et la liaison ne sont PAS des
/// maquettes : ce sont les réglages de chacune.
///
/// Les maquettes intégrées sont décrites en JSON (`MessageCardModels.builtInJSON`)
/// et lues par le même décodeur que celles d'une marque : une marque qui
/// propose la sienne fournit la même fiche.
public struct MessageCardModel: Equatable, Sendable, Codable, Identifiable {
    /// Stable — un format enregistré s'en souvient. Une marque le préfixe : `@marque/nom`.
    public let id: String
    /// Le nom de la maquette, par langue (`fr`, `en`…) ; `fr` sert de repli.
    public let names: [String: String]
    public let palette: MessageCardPaletteID
    public let typeface: MessageCardTypefaceID
    public let link: MessageCardLinkID
    /// Les liaisons qui vont à cette maquette — vide : toutes.
    public let links: [MessageCardLinkID]
    public let aspect: MessageCardAspect
    public let headerOrientation: MessageCardHeaderOrientation
    public let authorPlacement: MessageCardAuthorPlacement
    public let tilt: MessageCardTilt
    public let decor: MessageCardDecor

    public func name(language: String?) -> String {
        let code = language.map { String($0.prefix(2)).lowercased() }
        return code.flatMap { names[$0] } ?? names["fr"] ?? names.values.sorted().first ?? id
    }

    /// Les liaisons à proposer dans l'onglet « Liaison ».
    public var offeredLinks: [MessageCardLinkID] { links.isEmpty ? MessageCardLinkID.allCases : links }

    public var template: MessageCardTemplateID { MessageCardTemplateID(palette: palette, typeface: typeface, link: link) }

    /// Le format habillé par la maquette : ce que l'utilisateur a choisi de MONTRER
    /// (noms, anonymat, date, médias) reste ; la palette, la police, la liaison, la
    /// disposition et le décor viennent de la maquette.
    public func applied(to format: MessageCardFormat) -> MessageCardFormat {
        var next = format
        next.template = template
        next.model = id
        next.disposition.aspect = aspect
        next.disposition.headerOrientation = headerOrientation
        next.disposition.authorPlacement = authorPlacement
        next.disposition.tilt = tilt
        next.disposition.decor = decor
        return next
    }

    /// Le format reste-t-il dans cette maquette ? Une liaison qu'elle n'offre pas l'en sort.
    public func accepts(_ link: MessageCardLinkID) -> Bool { offeredLinks.contains(link) }

    private enum CodingKeys: String, CodingKey {
        case id, names, palette, typeface, link, links, aspect, headerOrientation, authorPlacement, tilt, decor
    }

    public init(id: String, names: [String: String], palette: MessageCardPaletteID, typeface: MessageCardTypefaceID,
                link: MessageCardLinkID, links: [MessageCardLinkID] = [], aspect: MessageCardAspect = .auto,
                headerOrientation: MessageCardHeaderOrientation = .horizontal, authorPlacement: MessageCardAuthorPlacement = .above,
                tilt: MessageCardTilt = .none, decor: MessageCardDecor = .none) {
        self.id = id
        self.names = names
        self.palette = palette
        self.typeface = typeface
        self.link = link
        self.links = links
        self.aspect = aspect
        self.headerOrientation = headerOrientation
        self.authorPlacement = authorPlacement
        self.tilt = tilt
        self.decor = decor
    }

    /// Une fiche se lit STRICTEMENT : une valeur inconnue (palette, police, liaison
    /// absentes du moteur) refuse la fiche entière, jamais une maquette à moitié lue.
    public init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        let id = try values.decode(String.self, forKey: .id)
        guard MessageCardModels.isValidID(id) else {
            throw DecodingError.dataCorruptedError(forKey: .id, in: values, debugDescription: "identifiant invalide")
        }
        let names = try values.decode([String: String].self, forKey: .names)
        guard !names.isEmpty else { throw DecodingError.dataCorruptedError(forKey: .names, in: values, debugDescription: "sans nom") }
        let links = try values.decodeIfPresent([MessageCardLinkID].self, forKey: .links) ?? []
        let link = try values.decode(MessageCardLinkID.self, forKey: .link)
        guard links.isEmpty || links.contains(link) else {
            throw DecodingError.dataCorruptedError(forKey: .link, in: values, debugDescription: "liaison hors de la maquette")
        }
        self.init(
            id: id, names: names,
            palette: try values.decode(MessageCardPaletteID.self, forKey: .palette),
            typeface: try values.decode(MessageCardTypefaceID.self, forKey: .typeface),
            link: link, links: links,
            aspect: try values.decodeIfPresent(MessageCardAspect.self, forKey: .aspect) ?? .auto,
            headerOrientation: try values.decodeIfPresent(MessageCardHeaderOrientation.self, forKey: .headerOrientation) ?? .horizontal,
            authorPlacement: try values.decodeIfPresent(MessageCardAuthorPlacement.self, forKey: .authorPlacement) ?? .above,
            tilt: try values.decodeIfPresent(MessageCardTilt.self, forKey: .tilt) ?? .none,
            decor: try values.decodeIfPresent(MessageCardDecor.self, forKey: .decor) ?? .none
        )
    }
}

extension MessageCardPaletteID: Codable {}
extension MessageCardTypefaceID: Codable {}
extension MessageCardLinkID: Codable {}
extension MessageCardAspect: Codable {}
extension MessageCardHeaderOrientation: Codable {}
extension MessageCardAuthorPlacement: Codable {}
extension MessageCardTilt: Codable {}

/// **LES MAQUETTES** — les huit intégrées, et le décodeur qui lit celles d'une marque.
public enum MessageCardModels {

    public static let builtIn: [MessageCardModel] = (try? decode(Data(builtInJSON.utf8))) ?? []

    public static let defaultID = "citation"

    public static func model(id: String?, in models: [MessageCardModel] = builtIn) -> MessageCardModel? {
        id.flatMap { id in models.first { $0.id == id } }
    }

    /// Lit une liste de fiches — une fiche invalide, ou deux fiches au même identifiant, refusent tout.
    public static func decode(_ data: Data) throws -> [MessageCardModel] {
        let models = try JSONDecoder().decode([MessageCardModel].self, from: data)
        guard Set(models.map(\.id)).count == models.count else {
            throw DecodingError.dataCorrupted(.init(codingPath: [], debugDescription: "identifiant en double"))
        }
        return models
    }

    /// `citation`, ou `@marque/nom` pour une marque : lettres minuscules, chiffres et tirets.
    public static func isValidID(_ id: String) -> Bool {
        let parts = id.hasPrefix("@") ? id.dropFirst().split(separator: "/", omittingEmptySubsequences: false).map(String.init) : [id]
        guard (1...2).contains(parts.count), id.hasPrefix("@") == (parts.count == 2) else { return false }
        return parts.allSatisfy { part in
            (1...40).contains(part.count) && part.allSatisfy { $0.isASCII && ($0.isLowercase || $0.isNumber || $0 == "-") }
        }
    }

    /// Les huit maquettes de Meeshy — la même fiche qu'une marque fournirait.
    public static let builtInJSON = """
    [
      {"id": "citation", "names": {"fr": "Citation", "en": "Quote", "es": "Cita", "de": "Zitat", "it": "Citazione", "pt": "Citação", "ar": "اقتباس"},
       "palette": "aurore", "typeface": "rond", "link": "orbite"},
      {"id": "bulles", "names": {"fr": "Bulles", "en": "Bubbles", "es": "Burbujas", "de": "Blasen", "it": "Bolle", "pt": "Balões", "ar": "فقاعات"},
       "palette": "neige", "typeface": "systeme", "link": "bulles", "links": ["bulles"]},
      {"id": "affiche", "names": {"fr": "Affiche", "en": "Poster", "es": "Cartel", "de": "Plakat", "it": "Manifesto", "pt": "Cartaz", "ar": "ملصق"},
       "palette": "minuit", "typeface": "affiche", "link": "silence", "links": ["silence", "orbite"], "aspect": "story",
       "decor": {"alignment": "center", "frame": "none", "ornament": "accentRule"}},
      {"id": "editorial", "names": {"fr": "Éditorial", "en": "Editorial", "es": "Editorial", "de": "Editorial", "it": "Editoriale", "pt": "Editorial", "ar": "افتتاحية"},
       "palette": "editorial", "typeface": "didone", "link": "guillemets", "aspect": "portrait",
       "decor": {"alignment": "start", "frame": "border", "ornament": "none"}},
      {"id": "carnet", "names": {"fr": "Carnet", "en": "Notebook", "es": "Cuaderno", "de": "Notizbuch", "it": "Taccuino", "pt": "Caderno", "ar": "دفتر"},
       "palette": "manuscrit", "typeface": "plume", "link": "fil", "authorPlacement": "after", "tilt": "left",
       "decor": {"alignment": "start", "frame": "panel", "ornament": "none"}},
      {"id": "bandeau", "names": {"fr": "Bandeau", "en": "Banner", "es": "Banda", "de": "Banner", "it": "Fascia", "pt": "Faixa", "ar": "شريط"},
       "palette": "lagon", "typeface": "futur", "link": "filet", "headerOrientation": "rotatedUp", "aspect": "portrait"},
      {"id": "manifeste", "names": {"fr": "Manifeste", "en": "Manifesto", "es": "Manifiesto", "de": "Manifest", "it": "Manifesto", "pt": "Manifesto", "ar": "بيان"},
       "palette": "braise", "typeface": "marqueur", "link": "fleche", "aspect": "square", "tilt": "right",
       "decor": {"alignment": "start", "frame": "none", "ornament": "quoteMark"}},
      {"id": "epure", "names": {"fr": "Épure", "en": "Minimal", "es": "Mínimo", "de": "Schlicht", "it": "Essenziale", "pt": "Mínimo", "ar": "بسيط"},
       "palette": "ardoise", "typeface": "systeme", "link": "silence", "links": ["silence", "orbite"], "aspect": "square",
       "decor": {"alignment": "center", "frame": "border", "ornament": "none"}}
    ]
    """
}
