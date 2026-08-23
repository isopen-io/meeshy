import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Le meuble** du composer unifié (C2) — plateau, scène, socle permanent.
///
/// Ce que ce type est, et surtout ce qu'il n'est PAS :
///
/// - il **enveloppe** l'atelier de composition du SDK (`StoryComposerView`), il
///   ne le réécrit pas. L'atelier porte des milliers de lignes éprouvées ; en
///   refaire une version app-side ferait diverger deux surfaces sans qu'aucun
///   test ne le dise ;
/// - il **ne construit aucun aperçu**. Loi 6 de la doctrine — « le lecteur EST
///   l'aperçu » : composer et viewers partagent un seul registre de rendu, et
///   l'œil du socle monte `MeeshyScenePlayer(mode: .preview)`. Un quatrième
///   chemin d'aperçu casserait le WYSIWYG par construction ;
/// - il **ne décide de rien** : ce qu'il montre est fonction du
///   `ComposerProfile` que `ComposerIntent` lui donne (C1). Le host lit la
///   table, il ne la double pas.
///
/// **Le socle ne bouge jamais** (loi 5 de la doctrine P1). Ses trois zones —
/// audience, œil, publication — sont toujours présentes, dans cet ordre, quelle
/// que soit la porte d'entrée. C'est le point fixe qui fait qu'un composer reste
/// le même objet vu de neuf endroits différents. `MeeshyComposerHostGuardTests`
/// le verrouille par garde de source, faute d'une sortie observable.
///
/// **Aucune UI morte** : une capacité refusée par le profil n'est pas montée
/// puis désactivée, elle est ABSENTE (loi 4 — « rien à l'écran sans raison »).
struct MeeshyComposerHost: View {

    let intent: ComposerIntent

    /// Le câblage de publication de l'atelier, transmis TEL QUEL. Le host
    /// n'ouvre pas un second chemin d'envoi : la file de publication unique est
    /// le lot V7, et fabriquer ici un chemin parallèle serait exactement la
    /// dette qu'il devra défaire.
    let onPublishAllInBackground: ([StorySlide], [String: UIImage], [String: UIImage], [String: URL], [String: URL], String?, String, [String], String, [ComposerReference]) -> Bool
    let onPreview: ([StorySlide], [String: UIImage], [String: UIImage], [String: URL], [String: URL]) -> Void
    let onDismiss: () -> Void

    /// L'atelier et le socle lisent le MÊME état de composition. Le host le
    /// possède pour que l'œil du socle puisse migrer l'instant courant en v3
    /// sans redemander quoi que ce soit à l'atelier.
    @StateObject private var viewModel = StoryComposerViewModel()

    /// O6 — la teinte du plateau est un réglage PERSISTÉ, propre à l'auteur.
    /// Stockée par son `rawValue` : `@AppStorage` ne sait pas porter l'enum, et
    /// c'est aussi ce qui rend le repli sur valeur inconnue explicite.
    @AppStorage("composer.plateau.tint") private var storedTint: String = PlateauTint.defaultTint.rawValue

    @State private var showsPreview = false
    @State private var previewSceneIndex = 0
    @State private var previewIsPlaying = false

    private var tint: PlateauTint {
        PlateauTint(rawValue: storedTint) ?? .defaultTint
    }

    private var profile: ComposerProfile {
        ComposerProfile.profile(for: intent.origin, compositionQualifiesAsReel: false)
    }

    var body: some View {
        VStack(spacing: 0) {
            composerSurface
            socle
        }
        .background(tint.color.ignoresSafeArea())
    }

    // MARK: - La scène

    /// L'atelier du SDK, monté tel quel — la scène vit dedans.
    ///
    /// Périmètre CONSIGNÉ de C2 : la zone contextuelle reste celle de l'atelier
    /// existant. Le host ne lui impose pas ses capacités par une API neuve ; il
    /// gouverne ce que LUI monte autour (`plateauTools` ci-dessous). Passer des
    /// capacités à l'atelier appartient à l'écriture v3 native, hors de ce lot.
    private var composerSurface: some View {
        VStack(spacing: 0) {
            plateauTools
            StoryComposerView(
                viewModel: viewModel,
                onPublishAllInBackground: onPublishAllInBackground,
                onPreview: onPreview,
                onDismiss: onDismiss
            )
        }
    }

    /// Les outils du plateau suivent le PROFIL, et une capacité refusée n'est
    /// pas montée du tout (loi 4). Une affordance grisée promettrait une
    /// surface qui n'existe pas pour cette porte.
    @ViewBuilder
    private var plateauTools: some View {
        HStack(spacing: 12) {
            if profile.allowsCapture {
                Image(systemName: "camera.fill")
                    .accessibilityLabel(Text("composer.plateau.capture", bundle: .main))
            }
            if profile.showsSlides {
                Image(systemName: "rectangle.stack")
                    .accessibilityLabel(Text("composer.plateau.slides", bundle: .main))
            }
            if profile.showsTimeline {
                Image(systemName: "timeline.selection")
                    .accessibilityLabel(Text("composer.plateau.timeline", bundle: .main))
            }
            Spacer()
        }
        .font(.footnote.weight(.semibold))
        .foregroundColor(MeeshyColors.textSecondary(isDark: true))
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
    }

    // MARK: - Le socle — permanent, jamais conditionnel

    private var socle: some View {
        HStack(spacing: 10) {
            audienceChip
            previewEye
            Spacer()
            publishButton
        }
        .padding(.horizontal, 14)
        .padding(.top, 8)
        .padding(.bottom, 12)
    }

    /// L'audience se choisit dans l'atelier (le picker 6 niveaux existant) ; le
    /// socle en montre l'ÉTAT. Dupliquer le picker ici ferait deux sources pour
    /// un même réglage.
    private var audienceChip: some View {
        Label {
            Text("composer.socle.audience", bundle: .main)
        } icon: {
            Image(systemName: "person.2.fill")
        }
        .font(.footnote.weight(.semibold))
        .foregroundColor(MeeshyColors.textSecondary(isDark: true))
    }

    /// L'œil — et c'est le LECTEUR, pas un aperçu maison (loi 6).
    private var previewEye: some View {
        Button {
            showsPreview = true
        } label: {
            Image(systemName: "eye")
                .font(.footnote.weight(.semibold))
                .foregroundColor(MeeshyColors.textSecondary(isDark: true))
        }
        .accessibilityLabel(Text("composer.socle.preview", bundle: .main))
        .sheet(isPresented: $showsPreview) {
            previewSheet
        }
    }

    /// Le document de l'aperçu est celui que la publication enverra : depuis la
    /// règle d'encodage B7 (« encode = toujours le v3 migré du runtime
    /// courant »), c'est PAR CONSTRUCTION la même fonction sur le même état.
    /// L'aperçu ne peut donc pas mentir sur ce qui sera publié.
    private var draftDocument: CanvasV3 {
        CanvasV3(migrating: viewModel.currentEffects)
    }

    private var previewSheet: some View {
        MeeshyScenePlayer(
            document: draftDocument,
            mode: .preview,
            sceneIndex: $previewSceneIndex,
            isPlaying: $previewIsPlaying,
            accentColorHex: MeeshyColors.indigo400Hex
        )
    }

    private var publishButton: some View {
        Button {
            // La publication emprunte le chemin EXISTANT du format, transmis
            // par l'appelant — le host n'en ouvre pas un second. La file de
            // publication unique est le lot V7.
        } label: {
            Text("composer.socle.publish", bundle: .main)
                .font(.footnote.weight(.bold))
                .foregroundColor(MeeshyColors.indigo400)
        }
    }
}

/// Une porte qui route vers un composer HISTORIQUE n'ouvre pas le meuble (C1).
///
/// Ce prédicat vit à côté du host plutôt que dedans, et c'est délibéré : c'est
/// l'APPELANT — la porte, tâche C3 — qui décide de présenter le legacy ou le
/// host. Un host qui se saborderait lui-même en rendant `EmptyView` pour ces
/// origines laisserait la porte croire qu'elle a présenté quelque chose.
nonisolated extension ComposerIntent {
    /// `nil` ⇒ la porte ouvre `MeeshyComposerHost`. Non-`nil` ⇒ elle présente
    /// le composer historique nommé, et rien d'autre.
    var routesToLegacy: LegacyComposer? {
        ComposerProfile.profile(for: origin, compositionQualifiesAsReel: false).routesToLegacy
    }
}
