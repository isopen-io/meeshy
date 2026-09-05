import SwiftUI

/// **Le son du contenu, écouté et LU** (#4657).
///
/// Quand un son est placé en *contenu de publication*, il n'est pas une
/// bande-son : il EST le propos. Il se joue donc là où le propos se lit —
/// juste sous la zone de texte — et sa transcription défile au-dessus de la
/// bande, ligne par ligne, au rythme de la voix.
///
/// ## Ce que ce composant est, et ce qu'il n'est pas
///
/// Un ATOME : un fichier, une durée, des lignes, une teinte, deux sorties. Il
/// ne lit aucun singleton Meeshy, ne résout aucune URL, ne décide pas quand un
/// son mérite d'être là — c'est ce qui l'autorise à vivre dans le SDK, aux
/// côtés de `MeeshyAudioTrimmer` dont il partage la bande et l'échelle
/// d'affichage (`AudioWaveform.displayHeight`).
///
/// ## Les trois règles de sa forme
///
/// - **Aucune transcription ⇒ aucune zone de transcription.** Une bande vide
///   au-dessus de la bande d'onde serait un cadre qui promet un texte qui
///   n'arrivera pas (loi 4).
/// - **La lecture et l'édition sont DEUX cibles.** Le bouton joue ; tout le
///   reste de la carte ouvre l'éditeur. Confondre les deux ferait qu'écouter
///   quitterait l'écran — et l'écoute est le geste qu'on répète.
/// - **Ce qui défile suit ce qui SONNE.** La ligne active est élue par
///   `AudioTranscriptCue.activeIndex(in:at:)` depuis la tête de lecture, jamais
///   par un minuteur parallèle : deux horloges pour une position dérivent.
public struct MeeshyAudioTranscriptPlayer: View {

    private let url: URL
    private let duration: TimeInterval
    private let cues: [AudioTranscriptCue]
    private let fallbackText: String
    private let tint: Color
    /// **Le fond sur lequel la carte se pose, dit par l'HÔTE.**
    ///
    /// `.primary` / `.secondary` suivent le thème de l'APPAREIL. Le plateau du
    /// composer, lui, est sombre PAR CONSTRUCTION quel que soit ce thème : y
    /// laisser les couleurs sémantiques aurait peint la transcription en NOIR
    /// sur violet profond dès que l'appareil est en mode clair — illisible,
    /// et invisible à toute relecture faite en mode sombre.
    private let isDark: Bool
    private let onEdit: (() -> Void)?

    @StateObject private var player = AudioTrimPreviewPlayer()
    @State private var samples: [Float] = []
    @State private var chargee: TimeInterval?

    /// 512 buckets : la bande fait ici moins du tiers de la largeur du
    /// rogneur et ne zoome pas. Demander ses 2 048 échantillons ferait une
    /// seconde entrée de cache pour un tracé qu'aucun œil ne distingue.
    private static let resolution = 512
    private static let stripHeight: CGFloat = 40
    /// Trois lignes de corps environ — assez pour lire le contexte de la ligne
    /// en cours sans que la carte pousse le texte de la publication hors écran.
    private static let transcriptHeight: CGFloat = 74

    public init(
        url: URL,
        duration: TimeInterval,
        cues: [AudioTranscriptCue] = [],
        fallbackText: String = "",
        tint: Color = MeeshyColors.indigo400,
        isDark: Bool = true,
        onEdit: (() -> Void)? = nil
    ) {
        self.url = url
        self.duration = duration
        self.cues = cues
        self.fallbackText = fallbackText
        self.tint = tint
        self.isDark = isDark
        self.onEdit = onEdit
    }

    private var dureeEffective: TimeInterval { max(chargee ?? duration, 0.001) }

    /// Les LIGNES rendues — des phrases, pas les segments bruts.
    ///
    /// La reconnaissance sur appareil segmente par MOT ; une ligne par segment
    /// donne une colonne d'un mot de large. Le regroupement est calculé UNE
    /// fois pour la durée de vie de la vue, pas à chaque battement de l'horloge
    /// de lecture : il ne dépend que de `cues`.
    @State private var lignes: [AudioTranscriptCue] = []

    private var indexActif: Int? {
        AudioTranscriptCue.activeIndex(in: lignes, at: player.playhead)
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            transcript
            barre
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(tint.opacity(0.10))
                .overlay(
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .stroke(tint.opacity(0.28), lineWidth: 1)
                )
        )
        .task(id: url) { await charger() }
        // Les phrases suivent les SEGMENTS, pas le fichier. Rouvrir la feuille
        // pour re-transcrire sans rogner rend le MÊME fichier avec une autre
        // transcription : accrocher le regroupement à `url` seul l'aurait laissé
        // afficher l'ancienne, sur un son que l'auteur vient de corriger.
        .adaptiveOnChange(of: cues) { _, nouvelles in
            lignes = AudioTranscriptCue.phrases(from: nouvelles)
        }
        .onDisappear { player.stop() }
    }

    // MARK: - La transcription qui défile

    @ViewBuilder
    private var transcript: some View {
        if !lignes.isEmpty {
            // L'index actif est calculé UNE fois par image, pas une fois par
            // ligne : la tête de lecture bat à 60 Hz, et le refaire dans chaque
            // `ligne` rendrait le coût quadratique en nombre de lignes — sur le
            // geste le plus continu de l'écran (dimension 4).
            let actif = indexActif
            ScrollViewReader { proxy in
                ScrollView(.vertical, showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 6) {
                        ForEach(Array(lignes.enumerated()), id: \.element.id) { index, cue in
                            ligne(cue, actif: index == actif)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .frame(height: Self.transcriptHeight)
                .adaptiveOnChange(of: indexActif) { _, nouvel in
                    guard let nouvel, lignes.indices.contains(nouvel) else { return }
                    withAnimation(.easeOut(duration: 0.25)) {
                        proxy.scrollTo(lignes[nouvel].id, anchor: .center)
                    }
                }
            }
        } else if !fallbackText.isEmpty {
            // Une transcription sans minutage — saisie à la main, ou rendue sans
            // segments. Elle se lit, elle ne s'allume pas : prétendre suivre la
            // voix sans savoir où elle en est serait une surbrillance qui ment.
            ScrollView(.vertical, showsIndicators: false) {
                Text(fallbackText)
                    .font(.callout)
                    .foregroundStyle(MeeshyColors.textPrimary(isDark: isDark))
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .frame(height: Self.transcriptHeight)
        }
    }

    private func ligne(_ cue: AudioTranscriptCue, actif: Bool) -> some View {
        Text(cue.text)
            .font(.callout)
            .fontWeight(actif ? .semibold : .regular)
            .foregroundStyle(actif ? tint : MeeshyColors.textSecondary(isDark: isDark))
            .frame(maxWidth: .infinity, alignment: .leading)
            .id(cue.id)
    }

    // MARK: - La bande et ses deux cibles

    private var barre: some View {
        HStack(spacing: 12) {
            boutonLecture
            zoneEdition
        }
    }

    private var boutonLecture: some View {
        Button {
            if player.isPlaying {
                player.pause()
            } else {
                player.play(from: 0, to: dureeEffective)
            }
            HapticFeedback.light()
        } label: {
            Image(systemName: player.isPlaying ? "pause.fill" : "play.fill")
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(.white)
                .frame(width: 40, height: 40)
                .background(Circle().fill(tint))
                // La pastille mesure 40 pt ; sa CIBLE en mesure 44, le plancher
                // de la HIG. Peindre 44 aurait épaissi un rond que la carte ne
                // demande pas — la cible et le dessin sont deux tailles.
                .frame(width: 44, height: 44)
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(player.isPlaying
            ? String(localized: "audio.content.pause", defaultValue: "Mettre en pause", bundle: .module)
            : String(localized: "audio.content.play", defaultValue: "Écouter le son", bundle: .module))
    }

    /// La bande + l'horloge — et, quand l'hôte sert l'édition, sa CIBLE.
    ///
    /// **Sans `onEdit`, ni geste ni trait de bouton.** Un `onTapGesture` qui
    /// appelle un `nil` et une étiquette « Modifier le son » posée dessus
    /// feraient un contrôle qui s'annonce et ne fait rien — la loi 4 dans sa
    /// forme la plus coûteuse, parce qu'elle ne se voit qu'à l'usage. La bande
    /// reste alors ce qu'elle est : le dessin d'un son, avec sa durée.
    @ViewBuilder
    private var zoneEdition: some View {
        let contenu = HStack(spacing: 10) {
            bande
            Text(Self.horloge(player.playhead) + " / " + Self.horloge(dureeEffective))
                .font(.caption2.monospacedDigit())
                .foregroundStyle(MeeshyColors.textSecondary(isDark: isDark))
            if onEdit != nil {
                Image(systemName: "slider.horizontal.below.rectangle")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(tint)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityValue(MeeshyAudioTrimmer.spokenDuration(dureeEffective))

        if let onEdit {
            contenu
                .contentShape(Rectangle())
                .onTapGesture { onEdit() }
                .accessibilityLabel(String(localized: "audio.content.edit",
                                           defaultValue: "Modifier le son",
                                           bundle: .module))
                .accessibilityAddTraits(.isButton)
        } else {
            contenu
                .accessibilityLabel(String(localized: "audio.content.waveform",
                                           defaultValue: "Onde du son",
                                           bundle: .module))
        }
    }

    private var bande: some View {
        Canvas { context, size in
            dessiner(context: context, size: size)
        }
        .frame(height: Self.stripHeight)
        .frame(maxWidth: .infinity)
    }

    private func dessiner(context: GraphicsContext, size: CGSize) {
        guard !samples.isEmpty, size.width > 0 else { return }
        let largeurBarre: CGFloat = 2
        let ecart: CGFloat = 2
        let nombre = max(1, Int(size.width / (largeurBarre + ecart)))
        let milieu = size.height / 2
        let avancement = min(1, max(0, player.playhead / dureeEffective))
        for index in 0..<nombre {
            let echantillon = samples[min(samples.count - 1, index * samples.count / nombre)]
            let hauteur = CGFloat(AudioWaveform.displayHeight(rms: echantillon)) * (size.height - 6)
            let x = CGFloat(index) * (largeurBarre + ecart)
            let joue = CGFloat(index) / CGFloat(nombre) <= avancement
            let rect = CGRect(x: x, y: milieu - hauteur / 2,
                              width: largeurBarre, height: max(2, hauteur))
            context.fill(
                Path(roundedRect: rect, cornerRadius: largeurBarre / 2),
                with: .color(joue ? tint : tint.opacity(0.26))
            )
        }
    }

    // MARK: - Chargement

    private func charger() async {
        lignes = AudioTranscriptCue.phrases(from: cues)
        samples = await AudioWaveform.samples(url: url, count: Self.resolution)
        chargee = player.load(url: url)
    }

    /// L'horloge MONTRÉE. `Duration.formatted` porte les chiffres de la locale —
    /// un `String(format:)` graverait les chiffres latins, illisibles pour un
    /// lecteur arabe. Ce que VoiceOver DIT est une autre chaîne
    /// (`spokenDuration`), et c'est volontaire : « 0:12 » s'entend « zéro
    /// deux-points douze ».
    nonisolated static func horloge(_ seconds: TimeInterval) -> String {
        let entier = seconds.isFinite && seconds > 0 ? Int(seconds.rounded(.towardZero)) : 0
        return Duration.seconds(entier).formatted(.time(pattern: .minuteSecond))
    }
}
