import Foundation

/// Les raccourcis de la fiche (planche iPad-Split, #19515), donnés UNE fois : la commande les reconnaît et K55 les
/// dessine depuis cette même valeur, sur la fiche comme sur la carte.
public nonisolated enum ProfileKeyShortcuts {
    /// « Carte » : ⌘M ouvre la carte depuis la fiche, et la referme depuis la carte.
    public static let map: MeeshyKeyCombo = [.primary, .character("M")]
    /// « Écrire » : ⌘↵ ouvre la conversation.
    public static let write: MeeshyKeyCombo = [.primary, .enter]
}
