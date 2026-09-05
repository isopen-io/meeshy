import SwiftUI
import MeeshySDK
import MeeshyUI

/// **La pastille du son de fond, à côté de l'avatar** (#4657).
///
/// Directive porteur du 2026-09-01 : « lorsqu'un son de fond est ajouté dans
/// cette vue de post il faut mettre la note musicale et le son ou vague
/// sinusoïde et la durée juste à côté de l'avatar et faire descendre la zone de
/// texte ».
///
/// ## Pourquoi à côté de l'avatar, et pas ailleurs
///
/// L'avatar dit QUI publie. Le son de fond dit AVEC QUOI. Ce sont les deux
/// choses qui existent avant le premier caractère tapé — les poser sur la même
/// ligne les donne à lire d'un coup d'œil, et fait descendre le texte de ce
/// qu'ils occupent plutôt que de le recouvrir.
///
/// **Le son de fond appartient à la SLIDE, pas à la publication** (arbitrage
/// porteur 2026-09-01, #4673 : « clairement à un Slide ! »). Ce doc-comment
/// affirmait le contraire, et le modèle disait déjà vrai — `currentEffects` EST
/// la slide courante, donc la pastille SUIT la slide sans qu'aucune ligne
/// change. Ce qui mentait était le mot, et un mot qui désigne le mauvais
/// propriétaire laisse la question ouverte : chaque relecteur y lit la réponse
/// qu'il a en tête. Sur une publication à une seule slide — le cas de la surface
/// document — les deux lectures rendent le même écran, ce qui est exactement ce
/// qui a permis à l'ambiguïté de durer.
///
/// ## Elle OUVRE, depuis #4668
///
/// > Directive porteur 2026-09-01 : « lorsque le son est utilisé en fond, on a
/// > la pill au niveau de l'avatar, le toucher devrait ouvrir la vue d'édition
/// > du son là ».
///
/// Elle était une lecture pure pendant que le son de CONTENU s'ouvrait déjà
/// d'un doigt (`MeeshyAudioTranscriptPlayer.onEdit`). Deux moitiés de la même
/// idée qui se comportaient différemment dans un seul écran — la loi 6 prise en
/// défaut sans quitter la vue.
///
/// ## Et elle porte le CRÉDIT, depuis #4669
///
/// La pastille du socle disparaissant, elle était le seul endroit du composer
/// qui montrait `soundAuthorUsername`. Le titre et l'auteur ont suivi ici : un
/// son emprunté doit dire à qui on le doit, où qu'on le lise.
///
/// ## Ce qu'elle MONTRE se décide au SDK, depuis la fusion du 2026-09-01
///
/// La composition qui les rendait (`ComposerSoundCredit.attribution`) lisait
/// `name` et `soundAuthorUsername` en direct : un vocal NOMMÉ s'annonçait donc
/// « Mémo du mardi », comme un morceau de l'étagère, et son onde se peignait à
/// côté — les deux moitiés de la directive contredites d'un coup, par une règle
/// qui ne consultait jamais `soundId`.
///
/// `StoryAudioIdentity` tranche désormais seul : l'onde pour un enregistrement,
/// le titre et le crédit pour un emprunt. Ce que la pastille garde en propre
/// est la mise en forme de la DURÉE, qui dépend de la locale du lecteur — et
/// que le SDK, qui ne la connaît pas, ne peut pas écrire.
struct ComposerAvatarSoundBadge: View {

    let sound: StoryAudioPlayerObject
    var tint: Color = MeeshyColors.indigo400
    /// **Ce que le doigt ouvre.** `nil` ⇒ la pastille reste une lecture, et ne
    /// s'annonce alors ni comme bouton ni comme activable — la loi 4 : un
    /// contrôle existe s'il a un effet.
    var onTap: (() -> Void)?

    @ViewBuilder
    var body: some View {
        if let onTap {
            Button {
                onTap()
                HapticFeedback.light()
            } label: {
                capsule
            }
            .buttonStyle(.plain)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(Self.spokenLabel(sound))
            .accessibilityAddTraits(.isButton)
            .accessibilityHint(Self.editHint)
        } else {
            capsule
                // Une seule annonce pour les trois éléments : « Son de fond,
                // Nom, 12 secondes ». Trois éléments séparés feraient trois
                // arrêts de VoiceOver pour une seule information.
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(Self.spokenLabel(sound))
        }
    }

    /// **Le CONTENU est partagé depuis #5011, l'ENCLOS reste ici.**
    ///
    /// La directive du 2026-09-03 retire la capsule à la trace de SCÈNE sans
    /// rien retirer à ce qu'elle montre. Les deux traces disent donc le même
    /// son par la même rangée (`ComposerSoundTraceRow`) et se distinguent par
    /// leur seule coque — ici l'enclos, qui a un sens à côté d'un avatar.
    ///
    /// `creditMaxWidth: 150` reste la règle de CETTE coque : sans borne, un
    /// titre long pousserait la capsule sur le nom de l'auteur.
    private var capsule: some View {
        ComposerSoundTraceRow(sound: sound, tint: tint, creditMaxWidth: 150)
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        // **44 pt est un PLANCHER dès qu'elle s'ouvre.** La pastille mesurait
        // 28 pt de haut tant qu'elle ne faisait que se lire ; devenue bouton,
        // elle doit la cible que la dimension 5 exige.
        .frame(minHeight: 44)
        .background(Capsule().fill(tint.opacity(0.16)))
        .overlay(Capsule().stroke(tint.opacity(0.30), lineWidth: 1))
    }

    static var editHint: String {
        String(localized: "composer.sound.background.edit.hint",
               defaultValue: "Modifier le son de fond", bundle: .main)
    }

    /// **La durée se DIT.** « 0:12 » s'annonce « zéro deux-points douze » : la
    /// pastille montre une horloge et en annonce une phrase.
    static func spokenLabel(_ sound: StoryAudioPlayerObject, locale: Locale = .current) -> String {
        let role = String(localized: "composer.sound.background.a11y",
                          defaultValue: "Son de fond", bundle: .main)
        // **La composition est un site UNIQUE** — celle-là même que la pastille
        // MONTRE. Recomposer ici titre, auteur et durée aurait donné deux
        // phrases pour une capsule, et l'auteur emprunté aurait manqué à celle
        // qui se dit à voix haute : c'est exactement l'écart que
        // `ComposerSoundCredit` existe pour interdire.
        let credit = ComposerSoundCredit.spokenLabel(for: sound, locale: locale)
        return credit.isEmpty ? role : "\(role), \(credit)"
    }
}
