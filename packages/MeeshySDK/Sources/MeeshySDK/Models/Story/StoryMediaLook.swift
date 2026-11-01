import Foundation

// MARK: - Le look d'un média, réglage de l'objet jusqu'à la publication (#13840)

/// **Le cadrage choisi dans la source**, en fractions (centre 0…1, repère y vers le
/// haut) et en échelle (1 ⇒ remplissage exact). Identique au cadrage du viseur de
/// l'app, qui le peint ; le SDK ne fait que le porter.
public struct StoryMediaFraming: Codable, Hashable, Sendable {
    public var centerX: Double
    public var centerY: Double
    public var scale: Double

    public static let identity = StoryMediaFraming(centerX: 0.5, centerY: 0.5, scale: 1)

    public init(centerX: Double, centerY: Double, scale: Double) {
        self.centerX = centerX
        self.centerY = centerY
        self.scale = scale
    }

    public var isIdentity: Bool {
        abs(centerX - 0.5) < 0.0005 && abs(centerY - 0.5) < 0.0005 && abs(scale - 1) < 0.0005
    }
}

/// **Ce que la retouche de l'app pose sur un média sans le cuire** (#13840, règle
/// porteur 2026-10-30 : « tant qu'on n'a pas envoyé, on peut toujours bouger les
/// textes, filtres, cadres »).
///
/// Des identifiants OPAQUES — le SDK ne connaît ni les filtres, ni les cadres, ni
/// les effets de l'appel : l'app les nomme et les peint (`StoryMediaLookPainting`).
/// Format v1, champs tous optionnels, absence ⇒ neutre :
///
/// | champ | valeur | défaut |
/// |---|---|---|
/// | `filterPreset` | identifiant du filtre de l'appel (`warm`, `cool`, `vivid`…) | `nil` = aucun |
/// | `frameId` | `classic:<style>` ou `frame:<id du catalogue>` | `nil` = aucun cadre |
/// | `faceEffect` | identifiant de l'effet de visage (`smoothing`, `angel`…) | `nil` = aucun |
/// | `framing` | `{centerX, centerY, scale}` | `nil` = identité |
///
/// Le look vit au BROUILLON et dans l'historique ; il ne part JAMAIS au fil :
/// la publication le cuit dans les octets téléversés et le retire de la charge
/// (`StoryEffects.withoutMediaLooks`), pour que tout lecteur déjà publié voie ce
/// que l'auteur a composé.
public struct StoryMediaLook: Codable, Hashable, Sendable {
    public var filterPreset: String?
    public var frameId: String?
    public var faceEffect: String?
    public var framing: StoryMediaFraming?

    public init(filterPreset: String? = nil, frameId: String? = nil,
                faceEffect: String? = nil, framing: StoryMediaFraming? = nil) {
        self.filterPreset = filterPreset
        self.frameId = frameId
        self.faceEffect = faceEffect
        self.framing = framing
    }

    /// Rien à peindre : la source telle quelle.
    public var isNeutral: Bool {
        filterPreset == nil && frameId == nil && faceEffect == nil && (framing?.isIdentity ?? true)
    }

    /// Le look, ou `nil` s'il ne peint rien — la forme qu'un objet stocke.
    public var normalized: StoryMediaLook? { isNeutral ? nil : self }

    /// Une clé DÉTERMINISTE pour les caches de rendu.
    public var signature: String {
        let cadrage = framing.map { String(format: "%.3f,%.3f,%.3f", $0.centerX, $0.centerY, $0.scale) } ?? "-"
        return [filterPreset ?? "-", frameId ?? "-", faceEffect ?? "-", cadrage].joined(separator: "|")
    }

    private enum CodingKeys: String, CodingKey {
        case filterPreset, frameId, faceEffect, framing
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        filterPreset = try? c.decodeIfPresent(String.self, forKey: .filterPreset)
        frameId = try? c.decodeIfPresent(String.self, forKey: .frameId)
        faceEffect = try? c.decodeIfPresent(String.self, forKey: .faceEffect)
        framing = try? c.decodeIfPresent(StoryMediaFraming.self, forKey: .framing)
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encodeIfPresent(filterPreset, forKey: .filterPreset)
        try c.encodeIfPresent(frameId, forKey: .frameId)
        try c.encodeIfPresent(faceEffect, forKey: .faceEffect)
        if let framing, !framing.isIdentity { try c.encode(framing, forKey: .framing) }
    }
}

extension StoryEffects {

    /// **La charge qui part** : la même, sans aucun look — une copie dérivée,
    /// l'original (le brouillon) garde ses réglages.
    /// Les scènes SUIVANTES d'une publication à plusieurs scènes vivent dans le
    /// document gardé (`canvasV3`) : elles perdent leur look aussi.
    public var withoutMediaLooks: StoryEffects {
        var copie = self
        if mediaObjects?.contains(where: { $0.look != nil }) == true {
            copie.mediaObjects = mediaObjects?.map { media in
                var nu = media
                nu.look = nil
                return nu
            }
        }
        copie.canvasV3 = canvasV3?.withoutMediaLooks
        return copie
    }
}

// MARK: - Le look dans le canvas v3 (#13840)

extension StoryMediaLook {

    /// **Le look voyage dans le document v3 de l'AUTEUR** — brouillon, historique
    /// d'annulation —, qui s'encode par le canvas v3. Il ne part jamais au fil :
    /// la publication encode `StoryEffects.withoutMediaLooks`. `nil` pour un look
    /// neutre.
    var canvasPayload: CanvasJSONValue? {
        guard !isNeutral else { return nil }
        var entrees: [String: CanvasJSONValue] = [:]
        if let filterPreset { entrees["filterPreset"] = .string(filterPreset) }
        if let frameId { entrees["frameId"] = .string(frameId) }
        if let faceEffect { entrees["faceEffect"] = .string(faceEffect) }
        if let framing, !framing.isIdentity {
            entrees["framing"] = .object(["centerX": .number(framing.centerX), "centerY": .number(framing.centerY),
                                          "scale": .number(framing.scale)])
        }
        return .object(entrees)
    }

    /// Le look relu d'un document v3 ; `nil` pour une charge absente, illisible ou neutre.
    init?(canvasPayload: CanvasJSONValue?) {
        guard case .object(let entrees)? = canvasPayload else { return nil }
        func chaine(_ cle: String) -> String? {
            if case .string(let valeur)? = entrees[cle], !valeur.isEmpty { return valeur }
            return nil
        }
        var cadrage: StoryMediaFraming?
        if case .object(let c)? = entrees["framing"], case .number(let x)? = c["centerX"],
           case .number(let y)? = c["centerY"], case .number(let s)? = c["scale"] {
            cadrage = StoryMediaFraming(centerX: x, centerY: y, scale: s)
        }
        let look = StoryMediaLook(filterPreset: chaine("filterPreset"), frameId: chaine("frameId"),
                                  faceEffect: chaine("faceEffect"), framing: cadrage)
        guard !look.isNeutral else { return nil }
        self = look
    }
}

// MARK: - Régler le look d'UN média de la slide (#13840)

extension StoryEffects {

    /// Le look posé sur ce média, neutre s'il n'en porte aucun ou si l'id ne
    /// désigne aucun média de la slide.
    public func mediaLook(id: String) -> StoryMediaLook {
        mediaObjects?.first { $0.id == id }?.look ?? StoryMediaLook()
    }

    /// **Les effets avec ce look posé sur CET objet** — même id, même fichier ;
    /// un look revenu au neutre s'efface. `nil` pour un id inconnu ou un look
    /// inchangé : l'appelant n'écrit rien, l'historique ne reçoit rien.
    public func applyingMediaLook(_ look: StoryMediaLook, toMedia id: String) -> StoryEffects? {
        guard let index = mediaObjects?.firstIndex(where: { $0.id == id }) else { return nil }
        let retenu = look.normalized
        guard mediaObjects?[index].look != retenu else { return nil }
        var copie = self
        copie.mediaObjects?[index].look = retenu
        return copie
    }
}

// MARK: - Le look des scènes SUIVANTES, dans le document gardé (#13840)

extension CanvasV3 {

    /// Le look de chaque média des scènes du document, par identifiant d'objet.
    public var mediaLooks: [String: StoryMediaLook] {
        let paires = scenes.flatMap(\.objects).compactMap { objet in
            StoryMediaLook(canvasPayload: objet.payload["look"]).map { (objet.id, $0) }
        }
        return Dictionary(paires, uniquingKeysWith: { premier, _ in premier })
    }

    /// Le document sans aucun look — une copie dérivée.
    public var withoutMediaLooks: CanvasV3 {
        guard scenes.contains(where: { $0.objects.contains { $0.payload["look"] != nil } }) else { return self }
        return CanvasV3(v: v, scenes: scenes.map(\.withoutMediaLooks), sound: sound, layout: layout)
    }
}

extension SceneV3 {

    var withoutMediaLooks: SceneV3 {
        SceneV3(id: id, objects: objects.map(\.withoutMediaLook), opening: opening, closing: closing,
                clipTransitions: clipTransitions, timelineDuration: timelineDuration, thumbHash: thumbHash,
                carrierAspect: carrierAspect)
    }
}

extension ObjectV3 {

    var withoutMediaLook: ObjectV3 {
        guard payload["look"] != nil else { return self }
        return ObjectV3(id: id, kind: kind, anchor: anchor, plane: plane, z: z, transform: transform,
                        timing: timing, locale: locale, payload: payload.filter { $0.key != "look" })
    }
}

extension StoryEffects {

    /// **Le look de chaque média de la publication** : la scène courante par le
    /// runtime — qui fait foi, même revenu au neutre —, les suivantes par le
    /// document gardé.
    public var allMediaLooks: [String: StoryMediaLook] {
        let courants = Set((mediaObjects ?? []).map(\.id))
        let suivants = (canvasV3?.mediaLooks ?? [:]).filter { !courants.contains($0.key) }
        let runtime = (mediaObjects ?? []).compactMap { media in media.look.map { (media.id, $0) } }
        return suivants.merging(runtime, uniquingKeysWith: { _, courant in courant })
    }
}
