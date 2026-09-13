import SwiftUI
import MeeshySDK
import MeeshyUI

/// **La trace du son de fond, EN TÊTE de la scène lue — et elle AGIT** (#5602).
///
/// > Directive porteur 2026-09-07 : « L'entête ne contient pas le sinusoïde du
/// > son ou la référence crédit du son alors que ça devrait, avec même action
/// > stop play quand on touche ! »
///
/// ## La panne que cette vue ferme
///
/// Quatre surfaces LISENT une publication ; trois disaient ce qu'elles jouent :
/// la carte du fil (`FeedPostCard+Header`), le viewer story
/// (`StoryViewerView+Header`) et le réel (`ReelPageView+Info`) montent toutes
/// `BackgroundSoundBadge`. La fiche détail n'en appelait que les helpers
/// STATIQUES — `announcement(for:)`, `showsMuteButton`, `muteIconName` — pour
/// décider d'un bouton muet, et ne montait jamais la vue. Elle était donc la
/// seule à JOUER un son sans jamais dire lequel.
///
/// > **Utiliser le résolveur d'une vue sans monter la vue ne se voit nulle
/// > part.** Le prédicat était bon, l'annonce juste, le bouton correctement
/// > gardé — et l'utilisateur n'apprenait ni le titre, ni l'auteur, ni la durée
/// > de ce qu'il entendait.
///
/// ## Ce qu'elle montre, et pourquoi c'est la MÊME rangée
///
/// `ComposerSoundTraceRow` — note · onde · crédit · durée — est le vocabulaire
/// des traces sonores du dépôt (#5011 : « deux traces, deux coques, un seul
/// vocabulaire »). Cette vue en est la TROISIÈME coque, la première du côté
/// LECTURE. En écrire une quatrième forme ici aurait donné deux façons de dire
/// le même son, et la divergence se serait vue au premier libellé ajouté.
///
/// Son préfixe `Composer` cesse d'être vrai le jour où une surface de lecture
/// la monte ; le renommage est un suivi de #5602, tenu à part parce qu'il
/// touche quatre gardes de source d'un territoire aujourd'hui rouge (#5599).
///
/// Le SPECTRE que le porteur demande est celui de la rangée : le relevé
/// (`waveformSamples`) quand on l'a, **une sinusoïde sinon** — un son emprunté
/// et un brouillon restauré arrivent avec un tableau vide, et une bande plate
/// s'y lirait comme un silence.
///
/// ## Pourquoi elle est un BOUTON, et pas une étiquette
///
/// Une trace qui montrerait sans agir serait le contrôle inerte que
/// `MuteButtonExistenceGuardTests` a déjà rejeté deux fois. Le toucher arrête
/// et reprend la lecture — la scène ENTIÈRE, conformément à la directive du
/// 2026-09-06 (« le bouton stop et play permet d'arrêter tout ou de poursuivre
/// tout »), par le troisième terme de `StoryDetailPlaybackPolicy`.
///
/// ## Où elle vit
///
/// Dans le COULOIR, au-dessus de la carte — jamais dessus. Un son de fond ne
/// produit aucun pixel au rendu (loi 6) : l'y poser ferait mentir ce que
/// l'écran montre sur ce que la publication est.
struct PostSceneSoundHeader: View {

    /// La trace résolue par l'appelant — `nil` ⇒ cette vue ne rend RIEN, et la
    /// scène reprend toute la hauteur. Même prédicat d'existence que le badge
    /// (`BackgroundSoundBadge.backgroundTrace(of:)`), jamais une seconde
    /// condition recopiée qui pourrait diverger.
    let trace: StoryAudioPlayerObject?
    /// La lecture est-elle ARRÊTÉE par le viewer ? Elle vit chez l'hôte : c'est
    /// lui qui la sert aux trois chemins de rendu, et une commande qui n'en
    /// atteindrait qu'un laisserait jouer le canvas d'à côté.
    let isPaused: Bool
    let accentHex: String
    let onTogglePlayback: () -> Void

    /// `Color(hex:)` n'est PAS faillible : sur une chaîne illisible, son
    /// `Scanner` laisse `rgb = 0` et rend du NOIR. Le `??` qui suivait ne
    /// pouvait donc jamais s'appliquer — l'indigo de repli était mort, et un
    /// accent absent peignait un en-tête noir au lieu de la couleur voulue.
    ///
    /// La garde porte donc sur la SEULE défaillance réaliste, la chaîne vide
    /// (accent non servi), ce qui rend au repli l'effet que son auteur lui
    /// prêtait.
    private var tint: Color {
        accentHex.isEmpty ? MeeshyColors.indigo400 : Color(hex: accentHex)
    }

    var body: some View {
        if let trace {
            Button(action: {
                HapticFeedback.light()
                onTogglePlayback()
            }) {
                HStack(spacing: 8) {
                    ComposerSoundTraceRow(
                        sound: trace,
                        tint: tint,
                        // La ligne occupe toute la largeur du couloir : l'onde
                        // ET le crédit y tiennent, aucun ne chasse l'autre.
                        // C'est la troisième voie de #5011, et la raison qui
                        // retire l'onde d'un son emprunté dans une CAPSULE
                        // (manque de place, #4669) ne s'applique pas ici.
                        showsWaveformEvenWhenBorrowed: true,
                        creditMaxWidth: nil
                    )
                    Spacer(minLength: 4)
                    Image(systemName: isPaused ? "play.fill" : "pause.fill")
                        .font(MeeshyFont.relative(12, weight: .bold))
                        .foregroundStyle(tint)
                        .frame(width: 28, height: 28)
                        .background(Circle().fill(tint.opacity(0.12)))
                }
                // La cible tactile couvre la rangée ENTIÈRE, pas le seul
                // glyphe : le porteur demande « quand on touche », et un
                // toucher qui ne prend que 28 pt sur une ligne pleine largeur
                // se solde par des touchers qui ne font rien.
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .frame(minHeight: 44)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(Text(accessibilityLabel(for: trace)))
            .accessibilityHint(Text(isPaused
                ? String(localized: "feed.detail.sound.resume.hint",
                         defaultValue: "Reprend la lecture de la scène", bundle: .main)
                : String(localized: "feed.detail.sound.pause.hint",
                         defaultValue: "Arrête la lecture de la scène", bundle: .main)))
            .accessibilityAddTraits(.isButton)
        }
    }

    /// **L'œil et VoiceOver reçoivent la MÊME information.** L'onde est une
    /// image (`accessibilityHidden` dans la rangée) : sans cette composition,
    /// un lecteur d'écran n'apprendrait ni le titre ni la durée que l'écran
    /// affiche — l'asymétrie que la leçon « une chaîne œil+VoiceOver sert un
    /// seul » nomme.
    func accessibilityLabel(for trace: StoryAudioPlayerObject) -> String {
        let piste = String(localized: "feed.detail.sound.track",
                           defaultValue: "Son de fond", bundle: .main)
        let credit = StoryAudioIdentity.attribution(of: trace)
        let duree = ComposerSoundCredit.durationLabel(for: trace)
        return [piste, credit.isEmpty ? nil : credit, duree]
            .compactMap { $0 }
            .joined(separator: " · ")
    }
}
