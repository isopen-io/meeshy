import XCTest
@testable import Meeshy

/// Source-analysis guards for CallView layout integrity.
///
/// Regression 2026-07-03 (repro simulateur) : le backdrop « bannière du
/// contact » (`CachedAsyncImage` + `.scaledToFill()`) posé directement dans
/// le ZStack racine RÉPONDAIT sa largeur débordante (~1 400 pt pour une
/// bannière paysage). Le ZStack racine adoptait cette largeur : tout l'écran
/// d'appel se décalait de +30 pt vers la droite et le chevron minimize était
/// expulsé hors écran (x ≈ −475). L'image doit vivre dans un `.overlay` d'un
/// `Color.clear` (layout-neutre) et être `.clipped()`.
@MainActor
final class CallViewLayoutGuardTests: XCTestCase {

    private func callViewSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views/CallView.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// Le backdrop plein écran doit être confiné dans un overlay layout-neutre.
    func test_remoteBackdrop_isLayoutNeutral_overlayOnColorClear() throws {
        let source = try callViewSource()
        guard let backdropRange = source.range(of: "let backdrop = remoteBackdropURL") else {
            XCTFail("CallView must render the remote-profile backdrop (remoteBackdropURL)")
            return
        }
        let end = source.index(backdropRange.lowerBound, offsetBy: 1600, limitedBy: source.endIndex) ?? source.endIndex
        let block = String(source[backdropRange.lowerBound ..< end])
        XCTAssertTrue(
            block.contains("Color.clear") && block.contains(".overlay"),
            "The full-page profile backdrop must be hosted as `.overlay` of a " +
            "`Color.clear` so its oversized fill NEVER inflates the root ZStack " +
            "layout (a landscape banner shifted the whole call screen +30 pt " +
            "and pushed the minimize chevron off-screen)."
        )
        XCTAssertTrue(
            block.contains(".clipped()"),
            "The backdrop overlay must stay .clipped() to the screen bounds."
        )
    }

    /// Interdit le retour du pattern fautif : `.scaledToFill()` appliqué au
    /// `CachedAsyncImage` du backdrop AVANT tout confinement en overlay.
    func test_remoteBackdrop_neverScaledToFillAsDirectZStackChild() throws {
        let source = try callViewSource()
        guard let backdropRange = source.range(of: "let backdrop = remoteBackdropURL") else {
            XCTFail("CallView must render the remote-profile backdrop (remoteBackdropURL)")
            return
        }
        let end = source.index(backdropRange.lowerBound, offsetBy: 1600, limitedBy: source.endIndex) ?? source.endIndex
        let block = String(source[backdropRange.lowerBound ..< end])
        if let overlayPos = block.range(of: ".overlay"),
           let fillPos = block.range(of: ".scaledToFill()") {
            XCTAssertTrue(
                overlayPos.lowerBound < fillPos.lowerBound,
                "`.scaledToFill()` must only appear INSIDE the layout-neutral " +
                "overlay — as a direct ZStack child it reports its overflowing " +
                "width and re-introduces the +30 pt call-screen shift."
            )
        }
    }

    /// Regression 2026-07-05: the call screen pins `.environment(\.colorScheme,
    /// .dark)` (white-on-dark chrome, see the comment right above it) so its
    /// glass materials always render their dark variant. `ThemeManager`'s
    /// `textPrimary`/`textMuted` are NOT environment-driven — they read the
    /// user's in-app Light/Dark/System preference directly — so any call site
    /// using them renders dark-on-near-black text whenever the app theme is
    /// Light, independently of the environment override. Every text label on
    /// this screen must use a static `.white`-based color instead.
    func test_neverUsesThemeManagerTextColors_wouldBeInvisibleInLightAppTheme() throws {
        let source = try callViewSource()
        XCTAssertFalse(
            source.contains("theme.textPrimary") || source.contains("theme.textMuted"),
            "CallView text must never read ThemeManager.textPrimary/textMuted — " +
            "the screen's colorScheme is pinned to .dark for its glass chrome, " +
            "but those colors follow the user's app-level theme preference " +
            "regardless, so a Light-theme user would see near-invisible " +
            "dark-on-near-black text (remote name, call-ended reason, control " +
            "captions). Use `.white.opacity(...)` like every other label here."
        )
    }

    /// Retour user 2026-08-18 (capture) : « lors d'un appel audio, vidéo la vue
    /// doit prendre tout l'écran, ici on voit des bandes blanches ».
    ///
    /// La cause n'est pas un fond manquant — le gradient, le self-preview et les
    /// flux vidéo posent chacun leur `.ignoresSafeArea()`. C'est le `clipShape`
    /// du morph PiP : il rogne à la BOÎTE du ZStack racine, et tant que cette
    /// boîte excluait la safe area haute, tout ce que ces `.ignoresSafeArea()`
    /// avaient étendu jusqu'au bord était coupé net — laissant paraître le fond
    /// du `fullScreenCover`, blanc en thème clair.
    ///
    /// La racine doit donc ignorer la safe area sur les QUATRE côtés, et le
    /// chrome haut la retrouver lui-même.
    func test_rootIgnoresEveryEdge_soThePiPClipNeverCutsTheFullBleedLayers() throws {
        let source = try callViewSource()
        XCTAssertFalse(
            source.contains(".ignoresSafeArea(edges: .bottom)\n        // Morph PiP"),
            "La racine ne peut pas n'ignorer que le bas : le `clipShape` du " +
            "morph rogne alors le fond au ras de la safe area haute, et le " +
            "blanc du cover apparaît en bandeau sous la Dynamic Island."
        )
        let clip = try XCTUnwrap(
            source.range(of: ".clipShape(RoundedRectangle(cornerRadius: pipMorphProgress"),
            "Le morph PiP doit toujours clipper ses coins arrondis."
        )
        let before = String(source[source.startIndex ..< clip.lowerBound])
        let ignore = try XCTUnwrap(
            before.range(of: ".ignoresSafeArea()", options: .backwards),
            "Un `.ignoresSafeArea()` sans arête doit précéder le clip du morph."
        )
        XCTAssertTrue(
            before.distance(from: ignore.upperBound, to: before.endIndex) < 700,
            "…et il doit porter sur la RACINE, juste avant la chaîne du morph — " +
            "posé plus haut il n'étendrait qu'une sous-vue."
        )
    }

    /// Corollaire : une racine bord à bord ne descend plus la safe area jusqu'au
    /// chrome flottant. Posé à 8 pt nus, le chevron minimize et le badge durée
    /// se rendraient SOUS la Dynamic Island — le défaut que l'ancien `.padding(
    /// .top, 50)` compensait à la main avant que le conteneur ne s'en charge.
    /// L'encart est PARTAGÉ : deux rangées le lisent, et deux constantes les
    /// auraient désalignées.
    func test_topChromeReInsetsTheSafeAreaItself_fromTheWindow() throws {
        let source = try callViewSource()
        XCTAssertTrue(
            source.contains("private static var chromeTopInset: CGFloat { DeviceLayout.safeAreaTop + 8 }"),
            "L'encart doit venir de la FENÊTRE : `GeometryProxy.safeAreaInsets` " +
            "répond 0 dans un sous-arbre qui ignore la safe area."
        )
        XCTAssertEqual(
            source.components(separatedBy: ".padding(.top, Self.chromeTopInset)").count - 1, 2,
            "Les deux rangées de chrome haut (chevron/conversation, badge durée " +
            "vidéo) doivent partager le MÊME encart — sinon elles se désalignent."
        )
    }

    /// Regression 2026-07-09: with `swapStreams == true` (user tapped the PiP
    /// to make their own camera the full-screen primary), if the survival
    /// controller then drops the outbound track (`hasLocalVideoTrack` flips to
    /// false — weak network / thermal downgrade), the primary stream call site
    /// rendered `videoStream(local: swapStreams, …)` unconditionally with a nil
    /// `localVideoTrack`. `CallVideoView` has no dedicated fallback for `local:
    /// true` (unlike `local: false`, which degrades to a camera-off/connecting
    /// placeholder), so it fell into its generic "unexpected track" branch: a
    /// full-screen black "Video non disponible" placeholder — even though the
    /// peer's video was perfectly healthy. Worse, the PiP (the only element
    /// with the tap-to-swap gesture) was replaced by `localVideoSuspendedTile`,
    /// which has no gesture, so the user was stuck on the broken full-screen
    /// view until their own network recovered. Fix: gate the swap on local
    /// track availability so the primary self-heals back to the peer's video.
    func test_primaryStream_neverShowsUnavailableLocalTrack_whenLocalVideoSuspendedMidSwap() throws {
        let source = try callViewSource()
        XCTAssertTrue(
            source.contains("swapStreams && callManager.hasLocalVideoTrack"),
            "CallView must gate which stream is primary on local-track " +
            "availability (`effectiveSwapStreams`), so losing the outbound " +
            "track while swapped auto-reverts the primary to the peer's video " +
            "instead of rendering CallVideoView's generic nil-track fallback " +
            "full-screen."
        )
        XCTAssertFalse(
            source.contains("videoStream(local: swapStreams,"),
            "The primary stream call site must use `effectiveSwapStreams`, " +
            "not the raw `swapStreams` binding — the raw binding stays true " +
            "even after the local track disappears, showing a broken " +
            "full-screen placeholder over a healthy peer feed."
        )
        XCTAssertFalse(
            source.contains("videoStream(local: !swapStreams,"),
            "The PiP stream call site must mirror the primary via " +
            "`!effectiveSwapStreams`, not the raw `!swapStreams` binding, or " +
            "the two surfaces fall out of sync when the local track drops."
        )
    }

    // MARK: - Bord a bord du fullScreenCover

    /// Les lignes de code, commentaires retires.
    ///
    /// Les commentaires de ce fichier CITENT les motifs surveilles (« le
    /// clipShape rogne a la BOITE »), donc une garde qui lirait la source brute
    /// se validerait sur sa propre documentation.
    private func callViewCode() throws -> String {
        try callViewSource()
            .split(separator: "\n", omittingEmptySubsequences: false)
            .map { line -> String in
                let trimmed = line.trimmingCharacters(in: .whitespaces)
                return trimmed.hasPrefix("//") ? "" : String(line)
            }
            .joined(separator: "\n")
    }

    /// Le fond du `fullScreenCover` est BLANC en theme clair. Constat
    /// simulateur 2026-08-19 (theme clair, iPhone 16 Pro, appel audio) : deux
    /// bandes blanches, de exactement les deux insets — 59 pt sous la Dynamic
    /// Island, 34 pt au-dessus du home indicator.
    ///
    /// Cause : `.ignoresSafeArea()` autorise le contenu a DEBORDER, mais ne
    /// change pas la taille que la vue rapporte a son parent. Le `.clipShape`
    /// du morph PiP rogne a cette boite-la. Un premier correctif (2026-08-18)
    /// avait deplace `.ignoresSafeArea()` avant le clip en croyant elargir la
    /// boite — les bandes sont restees.
    ///
    /// Le remede n'est pas un socle opaque derriere la surface : le fond du
    /// contact doit couvrir les quatre bords LUI-MEME (« la bande noire ne
    /// doit pas exister »). C'est le PARENT qui propose le plein ecran, et la
    /// surface le prend.
    func test_body_proposesFullScreenToTheSurface_soTheMorphClipCannotCropIt() throws {
        let code = try callViewCode()
        guard let bodyStart = code.range(of: "var body: some View {"),
              let surfaceStart = code.range(of: "private var callSurface: some View {")
        else {
            XCTFail("CallView doit separer `body` (conteneur) de `callSurface` (contenu clippe)")
            return
        }
        let bodyBlock = String(code[bodyStart.upperBound ..< surfaceStart.lowerBound])

        XCTAssertTrue(
            bodyBlock.contains("callSurface"),
            "`body` doit se limiter a proposer le plein ecran a `callSurface`."
        )
        XCTAssertTrue(
            bodyBlock.contains("maxWidth: .infinity") && bodyBlock.contains("maxHeight: .infinity"),
            "La surface doit PRENDRE toute la proposition. Sans cela sa boite " +
            "reste celle du fullScreenCover, safe area deduite, et le clip du " +
            "morph la rogne jusqu'a laisser voir le blanc du cover."
        )
        XCTAssertTrue(
            bodyBlock.contains("ignoresSafeArea"),
            "Le conteneur doit ignorer la safe area : c'est LUI qui transforme " +
            "la proposition en plein ecran. Pose seulement plus bas, sur la " +
            "surface, il etend le rendu sans elargir la boite que le clip suit."
        )
        XCTAssertFalse(
            bodyBlock.contains("clipShape") || bodyBlock.contains("scaleEffect"),
            "Le clip et le scale du morph appartiennent a `callSurface` : poses " +
            "sur le conteneur, ils rogneraient a nouveau une boite trop petite."
        )
    }

    /// Aucun aplat opaque ne doit s'intercaler derriere la surface pour masquer
    /// un defaut de geometrie : ce serait une bande noire la ou l'utilisateur
    /// attend l'image du contact.
    func test_body_hasNoOpaqueBackdropStandingInForTheContactImage() throws {
        let code = try callViewCode()
        guard let bodyStart = code.range(of: "var body: some View {"),
              let surfaceStart = code.range(of: "private var callSurface: some View {")
        else {
            XCTFail("CallView doit separer `body` de `callSurface`")
            return
        }
        let bodyBlock = String(code[bodyStart.upperBound ..< surfaceStart.lowerBound])
        XCTAssertFalse(
            bodyBlock.contains("Color.black") || bodyBlock.contains("Color.white"),
            "Un aplat pose derriere la surface masque le symptome et remplace " +
            "le fond du contact par une bande unie sur les bords que la " +
            "geometrie laisse decouverts. C'est la BOITE qui doit etre pleine."
        )
    }

    /// La taille ne doit jamais venir de l'ecran PHYSIQUE : en Split View /
    /// Stage Manager l'app n'occupe qu'une part de l'ecran.
    func test_callSurface_neverSizesItselfFromTheDisplay() throws {
        let code = try callViewCode()
        XCTAssertFalse(
            code.contains("UIScreen.main.bounds"),
            "La geometrie doit venir de la proposition du conteneur (ou de la " +
            "fenetre active via DeviceLayout), jamais de l'ecran physique."
        )
    }
}
