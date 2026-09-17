import SwiftUI
import MeeshyUI

// =============================================================================
// Le BOUTON du rail d'actions du lecteur de story — sorti de
// `StoryViewerView+Content.swift` (#6704).
//
// La découpe précède l'ajout : l'hôte pesait 3 186 lignes, dans la dette héritée
// que le cliquet `FileSizeBudgetGuardTests` interdit de faire grossir, et #6704
// change ce que ce bouton peint — son glyphe et son libellé prennent la teinte
// que la luminance de la slide commande. Le bouton se tient seul : il ne lit
// rien du lecteur.
//
// Même motif que `ReelsPlayerView+ActionRail.swift` (#6693). Les gardes qui le
// cherchaient dans l'hôte par son NOM de fichier reçoivent ce fichier, dans le
// même commit.
// =============================================================================

/// Single circular action button used in the story viewer's right sidebar.
/// Extracted from `StoryViewerView.storyActionButton(...)` so the sidebar
/// no longer inlines this subtree ~9 times into one opaque type.
struct StoryActionButton: View {
    let icon: String
    let label: String
    var isActive: Bool = false
    var activeColor: Color = .white
    var activeGlow: Color? = nil
    /// Marqueur de participation : non-nil ⇒ le FAB actif dessine son contour
    /// accent dans `accentOutlineColor` (ex : couleur d'avatar pour le cœur déjà
    /// réagi) plutôt que dans son `activeGlow`/`activeColor` par défaut. La
    /// valeur du symbole n'est plus rendue en overlay — seule sa présence
    /// (non-nil) sélectionne la couleur du contour (cf. `body`).
    var accentOutline: String? = nil
    var accentOutlineColor: Color = .clear
    /// Sites porteurs d'un geste séquencé longpress→drag (scrub) : le tap
    /// interne d'un `Button` consomme le touch et la séquence posée en
    /// `.highPriorityGesture` ne s'active JAMAIS — un maintien de 0,9 s
    /// partait en ❤️ direct au relâchement au lieu d'ouvrir le strip
    /// (reproduit au stream HID simulateur, 2026-08-11). `true` = vue plate
    /// + `TapGesture` : le tap court reste servi (la séquence échoue sous
    /// 0,25 s), le maintien laisse la séquence de l'appelant gagner.
    /// VoiceOver est servi par une `accessibilityAction` explicite — VO ne
    /// synthétise pas de TapGesture (leçon du bouton Sound, +Sidebar).
    var handlesTapViaGesture: Bool = false
    let action: () -> Void

    var body: some View {
        Group {
            if handlesTapViaGesture {
                buttonLabel
                    .onTapGesture { action() }
                    .accessibilityAddTraits(.isButton)
                    .accessibilityAction { action() }
            } else {
                Button(action: action) { buttonLabel }
                    .buttonStyle(.plain)
            }
        }
        .accessibilityLabel(label)
        .accessibilityHint(isActive ? "\(label) actif, toucher pour desactiver" : "Toucher pour \(label.lowercased())")
        .accessibilityAddTraits(isActive ? .isSelected : [])
    }

    private var buttonLabel: some View {
        Group {
            // Densité resserrée 2026-07-10 : spacing glyph→label 4→2 et padding
            // vertical 8→3 — le rail complet gagne ~30 % de compacité (parité
            // TikTok/IG) tout en gardant ≥ 44pt de hauteur tappable par bouton
            // (glyph 46 + label ~12 + 2×3 de padding).
            VStack(spacing: 2) {
                ZStack {
                    // Plus de cartouche circulaire : style « glyph flottant »
                    // TikTok/Instagram (spec user 2026-06-25 « supprimer les
                    // cercles autour des FABs, juste le glyph + ombre »).
                    //
                    // FAB ACTIF (l'utilisateur a participé : réaction posée, son
                    // actif, overlay commentaires/traductions ouvert…) → contour
                    // accent PRONONCÉ. Le liseré est dessiné en rendant le même
                    // symbole agrandi en couleur accent JUSTE DERRIÈRE le glyph
                    // blanc : un contour net qui ressort sur n'importe quel fond
                    // de story (clair comme foncé), là où l'ancien anneau du chip
                    // disparaissait. Couleur du contour = couleur de participation
                    // du bouton (`accentOutlineColor`, ex : couleur d'avatar pour
                    // le cœur) sinon le glow/accent du bouton.
                    if isActive {
                        Image(systemName: icon)
                            // Doctrine 82i : glyphe du rail d'action dans un cadre
                            // fixe 46×46 → taille figée (le Dynamic Type déborderait
                            // du rail vertical compact style TikTok/IG). Bouton
                            // labellisé par `Text(label)` ci-dessous → VoiceOver OK.
                            .font(.system(size: 20, weight: .semibold))
                            .foregroundStyle(accentOutline != nil ? accentOutlineColor : (activeGlow ?? activeColor))
                            .scaleEffect(1.22)
                    }

                    Image(systemName: icon)
                        .font(.system(size: 20, weight: .semibold))
                        .glassControlForeground()
                        .adaptiveSymbolBounce(value: isActive)
                }
                .frame(width: 46, height: 46)
                // Le glyphe prend la teinte que la slide commande (#6704) : blanc sous
                // un halo noir sur une slide sombre, indigo sous un halo blanc sur une
                // slide claire. Il était blanc d'office, mesuré à 1,14:1 sur une story
                // crème. Actif, le glow coloré renforce en plus le contour accent.
                .shadow(color: isActive ? (activeGlow ?? activeColor).opacity(0.55) : .clear,
                        radius: isActive ? 7 : 0)
                .mediaChromeHalo()

                Text(label)
                    // Doctrine 82i : libellé du rail sous un glyphe figé, dans une
                    // colonne de largeur fixe 56pt (`minimumScaleFactor(0.7)` +
                    // `lineLimit(1)`) → taille figée pour préserver la géométrie du
                    // rail vertical compact.
                    .font(.system(size: 10, weight: .semibold))
                    .glassControlForeground()
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    .mediaChromeHalo()
            }
            .frame(width: 56)
            // Élargit la zone sensible de quelques pixels AUTOUR du glyph + label.
            // Sans cartouche/cercle de fond (style « glyph flottant »), seul le
            // glyph rendu était tappable : un tap qui manquait le glyph de
            // quelques pixels traversait jusqu'à l'overlay de navigation (Layer 6
            // de StoryViewerView+Canvas — gesture prev/next) et faisait passer la
            // story à la suivante (bug user 2026-06-28 « je touche un bouton, ça
            // passe à la story suivante »). Le `padding` agrandit le rectangle et
            // comble les gaps entre FABs ; `contentShape(Rectangle())` rend TOUT
            // ce rectangle (padding inclus) sensible, transparent compris.
            // (3pt vertical + spacing 8/6 du rail : ≤ 2pt de jour entre deux
            // zones tappables — la protection anti-tap-traversant reste réelle.)
            .padding(.vertical, 3)
            .padding(.horizontal, 6)
            .contentShape(Rectangle())
            .mediaChromeGlyph()
        }
    }
}
