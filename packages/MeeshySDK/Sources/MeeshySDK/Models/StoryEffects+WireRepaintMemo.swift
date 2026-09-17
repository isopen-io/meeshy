import Foundation

/// **Les mémos de réémission vivent sur le tas, pas dans la valeur.**
///
/// `StoryEffects` est une VALEUR que chaque vue qui la porte copie sur la
/// pile à chaque rendu ; `StoryViewerView` en embarque trois. Poser deux
/// champs de plus en ligne (un tableau optionnel, une chaîne optionnelle :
/// 24 octets) a fait déborder son budget de 8 192 octets de 72 octets
/// exactement (`ConversationViewValueSizeGuardTests`, suite iOS de #6920).
/// Une enum `indirect` range son cas dans une boîte : le champ ne pèse plus
/// que la référence, et la sémantique de valeur tient — une écriture reboxe.
/// `wireUnpaintableKinds`, qui pesait déjà huit octets en ligne, rejoint la
/// boîte : `StoryEffects` retrouve exactement sa taille d'avant le lot.
struct WireRepaintMemo: Sendable {
    var unpaintableKinds: [String]?
    var unpaintableObjects: [ObjectV3]?
    var backgroundTransformCarrierId: String?

    indirect enum Box: Sendable {
        case some(WireRepaintMemo)

        var value: WireRepaintMemo {
            switch self { case .some(let memo): return memo }
        }
    }

    var isEmpty: Bool {
        unpaintableKinds == nil && unpaintableObjects == nil && backgroundTransformCarrierId == nil
    }
}

extension StoryEffects {
    var wireUnpaintableKinds: [String]? {
        get { wireRepaintMemo?.value.unpaintableKinds }
        set { mutateWireRepaintMemo { $0.unpaintableKinds = newValue } }
    }

    /// **Les OBJETS eux-mêmes**, pas seulement le nom de leur kind — pour que
    /// `CanvasV3.migratedScene` puisse les RÉÉMETTRE verbatim au lieu de se
    /// contenter d'en dire l'absence au lecteur (revue 2026-09-17, suivi
    /// #6893). Un kind réservé (document plus récent que ce build) et une
    /// mention n'ont AUCUNE affordance de retrait côté composer — ce build ne
    /// les édite pas — donc leur disparition à l'aller-retour ne peut jamais
    /// dire un `deleteElement` de l'auteur : seulement l'incapacité du
    /// runtime v1 à les loger. Les restituer par identité ne risque donc
    /// jamais de ressusciter un objet supprimé, contrairement aux familles
    /// éditables (texte, média, sticker, lieu, audio, dessin).
    var wireUnpaintableObjects: [ObjectV3]? {
        get { wireRepaintMemo?.value.unpaintableObjects }
        set { mutateWireRepaintMemo { $0.unpaintableObjects = newValue } }
    }

    /// Wire-only : id de l'objet qui portait, sur SON PROPRE payload, à la
    /// fois une référence média (`mediaId`/`postMediaId`) et le cadrage de
    /// fond (`transform`/`background`) — un objet `plane: bg` servi par la
    /// passerelle sous cette forme (revue 2026-09-17). Le réencodage replace
    /// ces deux clés sur ce MÊME objet plutôt que sur un second objet
    /// synthétique : les scinder en deux les dédouble (deux objets pour un),
    /// ou perd le cadrage (quand l'id du synthétique collisionne avec le
    /// porteur réservé `"bg"`) — les deux défauts que ce mémo évite.
    var wireBackgroundTransformCarrierId: String? {
        get { wireRepaintMemo?.value.backgroundTransformCarrierId }
        set { mutateWireRepaintMemo { $0.backgroundTransformCarrierId = newValue } }
    }

    private mutating func mutateWireRepaintMemo(_ change: (inout WireRepaintMemo) -> Void) {
        var memo = wireRepaintMemo?.value ?? WireRepaintMemo()
        change(&memo)
        wireRepaintMemo = memo.isEmpty ? nil : .some(memo)
    }
}
