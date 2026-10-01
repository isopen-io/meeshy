import Foundation

/// **LA DISPOSITION D'UNE CARTE « IMAGINE »** (#8692) — ce que l'exportateur
/// choisit, en plus du template, pour POSER ce qui existe : le format de
/// l'image, l'orientation de l'en-tête, la place des noms, l'inclinaison du
/// message, la disposition des médias et la représentation d'un son.
///
/// Chaque dimension a une valeur NEUTRE (`.standard`) qui rend exactement la
/// carte d'avant : un format enregistré avant #8692 se relit à l'identique.

/// Le FORMAT de l'image. `auto` garde la carte adaptative (1080 de large, de
/// 1080 à 1920 de haut selon le texte) ; les quatre autres FIXENT la toile.
public enum MessageCardAspect: String, CaseIterable, Sendable {
    case auto, story, portrait, square, landscape

    public var width: Double { self == .landscape ? 1920 : 1080 }

    /// `nil` : la hauteur suit le texte.
    public var fixedHeight: Double? {
        switch self {
        case .auto: return nil
        case .story: return 1920
        case .portrait: return 1350
        case .square, .landscape: return 1080
        }
    }

    /// Le rapport tel qu'on le lit sous la vignette — `nil` pour l'adaptatif.
    public var ratio: String? {
        switch self {
        case .auto: return nil
        case .story: return "9:16"
        case .portrait: return "4:5"
        case .square: return "1:1"
        case .landscape: return "16:9"
        }
    }
}

/// Comment l'en-tête (titre de la conversation, date) s'écrit : en ligne,
/// lettre à lettre en colonne, ou couché — il se lit alors en montant ou en
/// descendant, le long du bord de la carte.
public enum MessageCardHeaderOrientation: String, CaseIterable, Sendable {
    case horizontal, stacked, rotatedUp, rotatedDown

    /// L'en-tête quitte le haut de la carte pour une colonne sur le côté.
    public var isVertical: Bool { self != .horizontal }
}

/// Où se lit le nom de l'auteur : au-dessus de son texte, ou en signature à la fin.
public enum MessageCardAuthorPlacement: String, CaseIterable, Sendable {
    case above, after
}

/// L'inclinaison du message sur la carte — l'en-tête et le filigrane restent droits.
public enum MessageCardTilt: String, CaseIterable, Sendable {
    case none, left, right

    public var degrees: Double {
        switch self {
        case .none: return 0
        case .left: return -4
        case .right: return 4
        }
    }

    public var radians: Double { degrees * .pi / 180 }
}

/// Comment les médias d'un message se posent sur la carte.
public enum MessageCardMediaLayout: String, CaseIterable, Sendable {
    /// Le premier média, en grand, au-dessus du texte.
    case above
    /// Le premier média, en grand, sous le texte.
    case below
    /// Jusqu'à quatre médias en mosaïque, au-dessus du texte.
    case mosaic
    /// La première image (ou la première image de la vidéo) EN FOND, sous un voile.
    case backdrop
}

/// Comment un son se représente sur une image — au même titre que les liaisons.
/// L'onde et le spectre se DISTINGUENT au premier regard (#8979) : l'une est une
/// enveloppe, l'autre un égaliseur.
public enum MessageCardAudioStyle: String, CaseIterable, Sendable {
    /// Une onde : une enveloppe fine et dense, en miroir autour d'une ligne ; la partie jouée en couleur.
    case wave
    /// Une pastille : le bouton de lecture, une onde fine et la durée.
    case pill
    /// Un spectre : un égaliseur — une vingtaine de barres posées sur une ligne
    /// de base, chacune sous son repère de crête ; animé, il danse avec le son.
    case spectrum
    /// Une fiche : le nom du fichier et sa durée, sous une icône de note.
    case ticket
}

/// La durée d'une vidéo tirée d'un son (#8979) — 15 s, 30 s ou une minute,
/// toujours bornée par le son lui-même.
public enum MessageCardClipLength: Int, CaseIterable, Sendable {
    case fifteenSeconds = 15
    case thirtySeconds = 30
    case oneMinute = 60

    public var seconds: Double { Double(rawValue) }

    /// La durée qu'elle donne à un son de `soundDuration` secondes — `nil` : son de durée inconnue.
    public func bounded(by soundDuration: Double?) -> Double {
        guard let soundDuration, soundDuration.isFinite, soundDuration > 0 else { return seconds }
        return min(seconds, soundDuration)
    }

    /// Les durées qu'un son OFFRE — loi 4, un choix n'existe que s'il change la
    /// vidéo : celles qui coupent le son, puis la première qui le prend en
    /// entier. Un son plus court que 15 s n'offre rien : il part en entier.
    public static func offered(forSoundDuration soundDuration: Double?) -> [MessageCardClipLength] {
        guard let soundDuration, soundDuration.isFinite, soundDuration > 0 else { return allCases }
        let cutting = allCases.filter { $0.seconds < soundDuration }
        let whole = allCases.first { $0.seconds >= soundDuration }
        let offered = cutting + (whole.map { [$0] } ?? [])
        return offered.count > 1 ? offered : []
    }

    /// La durée qu'un choix désigne PARMI celles offertes — un choix enregistré
    /// plus long que le son se lit sur celle qui le prend en entier.
    public func selected(among offered: [MessageCardClipLength], soundDuration: Double?) -> MessageCardClipLength? {
        let effective = bounded(by: soundDuration)
        return offered.first { $0.bounded(by: soundDuration) == effective }
    }
}

/// **L'ÉCHELLE DE CHAQUE PARTIE** (#8979) — un pincement sur l'aperçu agrandit
/// ou réduit la partie qu'il touche : l'en-tête, la citation, la réponse (et la
/// ligne de son nom), les médias, la transcription. Bornée de moitié au double ;
/// tout près de 100 %, elle s'y AIMANTE — revenir à la taille d'origine ne
/// demande pas un doigt d'horloger.
public struct MessageCardScales: Equatable, Sendable {
    public static let range: ClosedRange<Double> = 0.5...2
    /// L'aimant autour de 100 %.
    public static let snap: Double = 0.04
    /// Les parties qu'un pincement règle — la liaison et le fond n'ont pas de taille à eux.
    public static let parts: [MessageCardPartID] = [.header, .quote, .reply, .media, .transcript]

    private var values: [MessageCardPartID: Double]

    public init(_ values: [MessageCardPartID: Double] = [:]) {
        self.values = [:]
        for (part, value) in values { self[part] = value }
    }

    public static let identity = MessageCardScales()

    public subscript(part: MessageCardPartID) -> Double {
        get { values[part] ?? 1 }
        set {
            guard Self.parts.contains(part), newValue.isFinite else { return }
            let clamped = min(Self.range.upperBound, max(Self.range.lowerBound, newValue))
            values[part] = abs(clamped - 1) <= Self.snap ? nil : clamped
        }
    }

    public var isIdentity: Bool { values.isEmpty }

    /// La forme enregistrée : `partie → échelle`, sans les parties à 100 %.
    var stored: [String: Double] {
        Dictionary(uniqueKeysWithValues: values.map { ($0.key.rawValue, $0.value) })
    }

    /// Relit la forme enregistrée — une partie inconnue ou une valeur abîmée est ignorée.
    init(stored: [String: Double]?) {
        var scales = MessageCardScales()
        for (key, value) in stored ?? [:] {
            guard let part = MessageCardPartID(rawValue: key) else { continue }
            scales[part] = value
        }
        self = scales
    }
}

/// Les choix de disposition, portés ensemble par le format et par l'entrée de la mise en page.
public struct MessageCardDisposition: Equatable, Sendable {
    public var aspect: MessageCardAspect
    public var headerOrientation: MessageCardHeaderOrientation
    public var authorPlacement: MessageCardAuthorPlacement
    public var tilt: MessageCardTilt
    public var mediaLayout: MessageCardMediaLayout
    public var audioStyle: MessageCardAudioStyle
    /// La transcription d'un vocal, sous sa représentation (#8979) — montrée par défaut.
    public var showsTranscript: Bool
    /// Le minuteur d'un vocal — « 0:12 / 0:45 » en vidéo, sa durée sur une image (#8979).
    public var showsTimer: Bool
    /// La police de la transcription — `nil` : celle du template.
    public var transcriptTypeface: MessageCardTypefaceID?
    /// La durée d'une vidéo tirée d'un son (#8979).
    public var clipLength: MessageCardClipLength
    /// L'échelle de chaque partie, réglée au pincement (#8979).
    public var scales: MessageCardScales

    public init(
        aspect: MessageCardAspect = .auto,
        headerOrientation: MessageCardHeaderOrientation = .horizontal,
        authorPlacement: MessageCardAuthorPlacement = .above,
        tilt: MessageCardTilt = .none,
        mediaLayout: MessageCardMediaLayout = .above,
        audioStyle: MessageCardAudioStyle = .wave,
        showsTranscript: Bool = true,
        showsTimer: Bool = true,
        transcriptTypeface: MessageCardTypefaceID? = nil,
        clipLength: MessageCardClipLength = .oneMinute,
        scales: MessageCardScales = .identity
    ) {
        self.aspect = aspect
        self.headerOrientation = headerOrientation
        self.authorPlacement = authorPlacement
        self.tilt = tilt
        self.mediaLayout = mediaLayout
        self.audioStyle = audioStyle
        self.showsTranscript = showsTranscript
        self.showsTimer = showsTimer
        self.transcriptTypeface = transcriptTypeface
        self.clipLength = clipLength
        self.scales = scales
    }

    /// La carte d'avant #8692 : adaptative, en-tête en ligne, noms au-dessus, droite.
    public static let standard = MessageCardDisposition()
}
