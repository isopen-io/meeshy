import UIKit
import AVFoundation
import MeeshySDK

// MARK: - Identity & Routing

extension StoryBackgroundLayer {
    /// Identité visuelle du `Kind`, utilisée par le fast-path de `configure()`
    /// pour décider si on peut garder le `contentLayer` actuel (même contenu)
    /// ou s'il faut tout reconstruire (changement réel de slide bg).
    ///
    /// On ignore les paramètres dynamiques (mute) car leur changement n'impose
    /// pas de recréer le layer (mute = property AVPlayer). Pour les fonds
    /// COULEUR/GRADIENT, la valeur fait partie de l'identité (BUG-1 user
    /// 2026-07-04) : « color » constant faisait passer un changement de
    /// pastille par le no-op diff (`hasVisibleContent` satisfait par
    /// l'ANCIENNE couleur) → la nouvelle couleur n'atterrissait jamais sur le
    /// canvas (la mini-preview SwiftUI, elle, se mettait à jour). La
    /// reconstruction d'un fond couleur est SYNCHRONE — aucun risque de flash,
    /// le fast-path ne protège que les fetchs async image/vidéo.
    /// `internal` (pas private) : seam de test du contrat d'identité.
    nonisolated static func contentIdentity(for kind: Kind) -> String {
        switch kind {
        case .solidColor(let color):
            return "color:\(Self.colorKey(color))"
        case .gradient(let colors, let direction):
            let key = colors.map(Self.colorKey).joined(separator: "|")
            return "gradient:\(key):\(String(describing: direction))"
        case .image(let postMediaId, _):        return "image:\(postMediaId)"
        case .video(let postMediaId, let looping, _, _):
            return "video:\(postMediaId):\(looping)"
        }
    }

    nonisolated private static func colorKey(_ color: UIColor) -> String {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        if color.getRed(&r, green: &g, blue: &b, alpha: &a) {
            return String(format: "%.3f,%.3f,%.3f,%.3f", r, g, b, a)
        }
        return String(describing: color)
    }

    /// Helper de routage du `postMediaId` en édition composer.
    ///
    /// En édition, `StoryRenderer.renderBackground` peut pousser la `mediaURL`
    /// de l'élément (`file://…` pour un media fraîchement issu de PhotosPicker,
    /// ou une URL distante) dans le champ `postMediaId` de la `Kind`, parce que
    /// le `resolver`/`imageCache` ne sont jamais branchés en édition (ils sont
    /// fournis uniquement par le reader). Cette détection limite la confusion
    /// aux strings parsables en URL avec un scheme connu.
    /// **Cette identité de fond mène-t-elle quelque part ?**
    ///
    /// La question que `configure` doit poser AVANT de défaire un fond qui se
    /// peint : une nouvelle identité qu'on ne sait pas résoudre ne peut rien
    /// remplacer, donc elle n'a pas à détruire.
    ///
    /// Elle interroge exactement les deux sources que les branches `.image` et
    /// `.video` interrogeront ensuite — l'URL directe, puis le résolveur — pour
    /// qu'un `true` ici ne puisse pas devenir un `nil` là-bas. Un troisième
    /// chemin de résolution ajouté à l'une des branches sans l'être ici
    /// rouvrirait le défaut : les deux listes se tiennent ENSEMBLE.
    ///
    /// Les fonds COLORÉS sont toujours résolvables : ils ne dépendent d'aucune
    /// adresse, ils portent leur valeur.
    nonisolated static func canResolve(_ kind: Kind, resolver: ((String) -> URL?)?) -> Bool {
        switch kind {
        case .solidColor, .gradient:
            return true
        case .image(let postMediaId, _), .video(let postMediaId, _, _, _):
            if directURLIfAny(from: postMediaId) != nil { return true }
            return resolver?(postMediaId) != nil
        }
    }

    nonisolated static func directURLIfAny(from candidate: String) -> URL? {
        guard !candidate.isEmpty else { return nil }
        // Local composer asset — returned verbatim, never network-normalized.
        if candidate.hasPrefix("file://") { return URL(string: candidate) }
        // Absolute http(s) OR a server-relative media path (getAttachmentPath /
        // forward / repost emit `/api/v1/attachments/...`). Normalize both via
        // the SSRF-guarded resolver so a relative background URL still loads
        // instead of dropping to the solid-color fallback (black background on
        // another user's story).
        if Self.isAddressable(candidate) {
            return MeeshyConfig.resolveMediaURL(candidate)
        }
        return nil
    }

    /// **Cette chaîne est-elle une ADRESSE, ou un IDENTIFIANT ?** (#5419)
    ///
    /// La question se pose à deux endroits — ici et
    /// `StoryRenderer.backgroundRoutingKey` — et les deux y répondaient
    /// différemment, chacun avec sa propre liste de préfixes. Aucune des deux
    /// ne reconnaissait la forme que la passerelle sert RÉELLEMENT pour une
    /// story : la **clé de stockage**, `2026/09/<auteur>/<fichier>.mp4`, sans
    /// barre initiale.
    ///
    /// `MeeshyConfig.resolveMediaURL` sait pourtant la résoudre depuis #4324 —
    /// son commentaire la nomme mot pour mot (« une chaîne sans barre initiale
    /// n'est pas un chemin : c'est la CLÉ DE STOCKAGE du média »).
    ///
    /// > **La capacité existait au bas de la chaîne ; deux filtres au-dessus
    /// > l'empêchaient d'être atteinte.** Le défaut n'était donc pas une
    /// > fonction manquante mais une garde trop étroite, écrite deux fois — et
    /// > le symptôme était `resolved=nil`, définitif, sur toute vidéo de fond
    /// > d'une story publiée.
    ///
    /// Le discriminant est la BARRE : un `postMediaId` est un ObjectId (24
    /// caractères hexadécimaux, sans séparateur), une adresse en porte toujours
    /// au moins une. Le tester est plus sûr qu'énumérer des préfixes — c'est
    /// l'énumération qui a laissé passer la forme de production.
    nonisolated static func isAddressable(_ candidate: String) -> Bool {
        guard !candidate.isEmpty else { return false }
        return candidate.hasPrefix("http://")
            || candidate.hasPrefix("https://")
            || candidate.hasPrefix("file://")
            || candidate.contains("/")
    }
}

// MARK: - ThumbHash Placeholder

/// Decoder seam wired to `UIImage.fromThumbHash(_:)` (Wolt spec, MeeshySDK/Utils).
/// Returns a small `UIImage` (≤ 32 px on the long edge) ready to be assigned as
/// `CALayer.contents`. The hash MUST be base64-encoded; the underlying decoder
/// guards against short/invalid inputs and returns `nil` in that case.
///
/// `nonisolated` so it can be called from `configure(...)` (`@MainActor`) and
/// from background `Task` resolution without crossing actor boundaries — the
/// decoder is pure CPU work over a fresh `[UInt8]` and produces an immutable
/// `UIImage` value. No target size is needed: resampling to the canvas size
/// happens implicitly when the layer assigns `contents` and respects
/// `contentsGravity`. Pre-scaling here would waste CPU and degrade quality on
/// retina displays.
public enum ThumbHashDecoder {
    public nonisolated static func decodeIfAvailable(_ hash: String) -> UIImage? {
        guard !hash.isEmpty else { return nil }
        return UIImage.fromThumbHash(hash)
    }
}

// MARK: - Gravity Resolution

extension StoryBackgroundLayer {
    /// Resolves the AVLayerVideoGravity for a video background.
    /// `nil` override = auto by orientation: landscape→letterbox, portrait→fill.
    public nonisolated static func resolveVideoGravity(
        naturalSize: CGSize,
        canvasSize: CGSize,
        override: String?
    ) -> AVLayerVideoGravity {
        if let o = override {
            return o == "fit" ? .resizeAspect : .resizeAspectFill
        }
        // Mode libre (override == nil) : TOUJOURS `.resizeAspectFill` — pas
        // d'auto-pick basé sur les ratios. L'auto-pick (mediaRatio > canvasRatio
        // → fit, sinon fill) sautait visuellement quand le bitmap arrivait async :
        // la gravity initiale `.resizeAspectFill` (posée à l.381) basculait sur
        // `.resizeAspect` (letterbox) pour les images paysage → le BG "se
        // cachait" derrière sa propre letterbox (user feedback 2026-05-29).
        // Fit/Fill sont maintenant exclusivement déclenchés par le double-tap.
        return .resizeAspectFill
    }

    /// Resolves the contentsGravity for an image background. Same logic as video.
    public nonisolated static func resolveImageGravity(
        naturalSize: CGSize,
        canvasSize: CGSize,
        override: String?
    ) -> CALayerContentsGravity {
        if let o = override {
            return o == "fit" ? .resizeAspect : .resizeAspectFill
        }
        // Mode libre — voir `resolveVideoGravity` pour la justification.
        return .resizeAspectFill
    }
}
