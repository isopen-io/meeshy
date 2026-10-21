import SwiftUI
import PhotosUI
import AVFoundation
import MeeshySDK
import MeeshyUI

/// LE DÉROULÉ DE LA PHOTO (#9382) — la vue de `GamePhotoSession` : proposition,
/// caméra avant avec le cadre en surimpression, frappe en place, résultat. Plein
/// écran, jamais une feuille qui se glisse : on y fait un geste, pas une lecture.
///
/// Le refus de la caméra n'est pas une impasse : sa raison est dite, et la
/// galerie (`PhotosPicker`, hors processus — aucune permission) comme la carte
/// seule restent possibles depuis tous les états. « Aucune image n'est envoyée au
/// serveur » : tout se passe sur l'appareil.
struct GamePhotoFlowView: View {
    @ObservedObject var session: GamePhotoSession
    let onClose: () -> Void

    @State private var pickerItem: PhotosPickerItem?
    @State private var showsShare = false
    private var squareFormat: Bool { session.squareFormat }

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            content
        }
        .overlay(alignment: .topTrailing) { closeButton }
        // Le lien d'un jeton EXISTANT se lit pendant que l'utilisateur choisit : la carte est prête quand il
        // déclenche. Aucun jeton ne se crée ici — seul « Partager » en crée un (`prepareShare`).
        .task { await session.prepareReferral() }
        .adaptiveOnChange(of: pickerItem) { _, item in
            guard let item else { return }
            Task {
                if let data = try? await item.loadTransferable(type: Data.self) {
                    await session.useGalleryPhoto(data)
                }
                pickerItem = nil
            }
        }
        .adaptiveOnChange(of: session.state) { _, state in
            if case .done = state { onClose() }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(String(
            localized: "game.photo.a11y",
            defaultValue: "Photo : \(session.moment.title)",
            bundle: .main
        ))
        .accessibilityAddTraits(.isModal)
        // Plein écran noir : les contrôles système (sélecteur de format, interrupteurs, feuilles) suivent le
        // schéma SOMBRE quelle que soit l'apparence de l'appareil, sinon leur texte se perd sur le noir (#10294).
        .environment(\.colorScheme, .dark)
        // Une prise en cours ne se perd pas : l'écran RETIENT, la conversation s'ouvre à sa fermeture (#10543).
        .retainsAgainstConversationOpening(.game)
    }

    private var closeButton: some View {
        Button {
            HapticFeedback.light()
            session.close()
        } label: {
            Image(systemName: "xmark")
                .font(MeeshyFont.relative(16, weight: .semibold))
                .foregroundColor(.white)
                .frame(width: 44, height: 44)
                .background(Circle().fill(Color.white.opacity(0.18)))
        }
        .padding(MeeshySpacing.md)
        .accessibilityLabel(String(localized: "game.photo.close", defaultValue: "Fermer", bundle: .main))
        .accessibilityIdentifier("game.photo.close")
    }

    @ViewBuilder
    private var content: some View {
        switch session.state {
        case .offer:
            offer
        case .camera(let phase):
            camera(phase)
        case .striking:
            striking
        case .result(_, let kept):
            result(kept: kept)
        case .failed:
            message(String(localized: "game.photo.failed", defaultValue: "La photo n’a pas pu être composée.", bundle: .main))
        case .done:
            Color.clear
        }
    }

    // MARK: - 1. La proposition

    /// La plaque d'auteur du moment (#10816) : présente, la proposition pose la carte qui nomme l'auteur.
    private var plate: AuthorPlate? { GamePhotoAuthorPlate.plate(for: session.moment.emblem, author: session.author) }

    private var offer: some View {
        VStack(spacing: MeeshySpacing.lg) {
            Spacer()
            if let plate {
                GameAuthorCardView(moment: session.moment, plate: plate, dateLabel: GamePhotoComposer.dateLabel(Date()))
            } else {
                MeeStickerFilmView(filmID: "duo-mee-selfie", animated: true, side: 120, animates: true, pixelCap: 240)
                    .frame(width: 120, height: 120)
                    .accessibilityHidden(true)
            }
            Text(String(localized: "game.photo.offer.title", defaultValue: "On immortalise ?", bundle: .main))
                .font(MeeshyFont.relative(26, weight: .bold, design: .rounded))
                .foregroundColor(.white)
            // La carte posée dit déjà le moment : le titre ne se répète pas sous elle.
            if plate == nil {
                Text(session.moment.title)
                    .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .medium))
                    .foregroundColor(MeeshyColors.indigo200)
            }
            VStack(spacing: MeeshySpacing.sm) {
                bigButton(String(localized: "game.photo.selfie", defaultValue: "Selfie avec nous", bundle: .main), "camera.fill", primary: true, id: "game.photo.selfie") {
                    Task { await session.chooseSelfie() }
                }
                bigButton(String(localized: "game.photo.card_only", defaultValue: "Carte seule", bundle: .main), "rectangle.portrait", primary: false, id: "game.photo.card") {
                    Task { await session.chooseCard() }
                }
                bigButton(String(localized: "game.photo.later", defaultValue: "Plus tard", bundle: .main), "clock", primary: false, id: "game.photo.later") {
                    Task { await session.later() }
                }
            }
            .padding(.horizontal, MeeshySpacing.xl)
            Spacer()
        }
    }

    private func bigButton(_ title: String, _ symbol: String, primary: Bool, id: String, action: @escaping () -> Void) -> some View {
        Button {
            HapticFeedback.light()
            action()
        } label: {
            Label(title, systemImage: symbol)
                .font(MeeshyFont.relative(MeeshyFont.calloutSize, weight: .semibold))
                .foregroundColor(primary ? MeeshyColors.indigo950 : .white)
                .frame(maxWidth: .infinity, minHeight: 50)
                .background(Capsule().fill(primary ? Color.white : Color.white.opacity(0.16)))
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier(id)
    }

    // MARK: - 2. La caméra

    /// LE CADRE EST LE DÉCLENCHEUR (#10284, directive porteur 2026-10-12) — aucun cercle d'enregistrement à
    /// côté du cadre. La disposition est celle de la caméra du composer (`ComposerLookStrip`, bande repliée) :
    /// la case du cadre choisi photographie d'un toucher, part dans Photos puis ouvre le résultat ; la scène,
    /// touchée deux fois, prend hors cadre et la photo reste dans l'app. La table des gestes du composer
    /// décide (`ComposerCaptureGesture`), la session exécute.
    private func camera(_ phase: PhotoCameraPhase) -> some View {
        VStack(spacing: MeeshySpacing.md) {
            Spacer(minLength: MeeshySpacing.xl)
            framed { size in
                ZStack {
                    switch phase {
                    case .live:
                        CameraPreviewLayer(session: session.camera.session)
                    case .opening:
                        Color(white: 0.12)
                        ProgressView().tint(.white)
                    case .failed:
                        Color(white: 0.12)
                    }
                    overlay(size: size, background: .clear)
                }
                .contentShape(Rectangle())
                .onTapGesture(count: 2) {
                    Task { await session.gesture(.doubleTap, on: .scene) }
                }
                .accessibilityElement(children: .contain)
                .accessibilityLabel(String(localized: "game.photo.scene.a11y", defaultValue: "Aperçu de la caméra : touche deux fois pour prendre sans enregistrer dans Photos", bundle: .main))
                .accessibilityIdentifier("game.photo.scene")
                .composerCaptureAccessibilityActions(zone: .scene, context: session.captureContext) { action in
                    Task { await session.perform(action) }
                }
            }
            // Hors du cadre : posée sur l'aperçu, la note recouvrait le titre et la date du moment (#10295).
            if case .failed(let failure) = phase {
                failureNote(failure)
            }
            HStack(alignment: .top, spacing: MeeshySpacing.xl) {
                PhotosPicker(selection: $pickerItem, matching: .images) {
                    Image(systemName: "photo.on.rectangle")
                        .font(MeeshyFont.relative(20, weight: .semibold))
                        .foregroundColor(.white)
                        .frame(width: 52, height: 52)
                        .background(Circle().fill(Color.white.opacity(0.16)))
                }
                .frame(height: ComposerLookStripRule.cellSize.height)
                .accessibilityLabel(String(localized: "game.photo.gallery", defaultValue: "Choisir une photo dans la galerie", bundle: .main))
                .accessibilityIdentifier("game.photo.gallery")

                frameTrigger(live: phase == .live)

                Button {
                    HapticFeedback.light()
                    Task { await session.chooseCard() }
                } label: {
                    sideGlyph("rectangle.portrait")
                }
                .accessibilityLabel(String(localized: "game.photo.card_only", defaultValue: "Carte seule", bundle: .main))
                .accessibilityIdentifier("game.photo.card_only")
            }
            .padding(.bottom, MeeshySpacing.lg)
        }
    }

    private func sideGlyph(_ symbol: String) -> some View {
        Image(systemName: symbol)
            .font(MeeshyFont.relative(20, weight: .semibold))
            .foregroundColor(.white)
            .frame(width: 52, height: 52)
            .background(Circle().fill(Color.white.opacity(0.16)))
            .frame(height: ComposerLookStripRule.cellSize.height)
    }

    /// La case du cadre choisi — celui du moment —, au gabarit de la miniature choisie du composer : le cadre en
    /// réduction, l'anneau blanc, son nom dessous. C'est elle qui déclenche.
    private func frameTrigger(live: Bool) -> some View {
        let cell = ComposerLookStripRule.cellSize
        let scale = cell.width / PhotoFormat.story.size.width
        return VStack(spacing: MeeshySpacing.xxs) {
            GamePhotoCanvasView(
                moment: session.moment,
                dateLabel: GamePhotoComposer.dateLabel(Date()),
                format: .story, background: .card, referral: nil, author: session.author
            )
            .frame(width: PhotoFormat.story.size.width, height: PhotoFormat.story.size.height)
            .scaleEffect(scale, anchor: .topLeading)
            .frame(width: cell.width, height: cell.height, alignment: .topLeading)
            .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.sm, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: MeeshyRadius.sm, style: .continuous)
                .strokeBorder(Color.white, lineWidth: 3))
            .opacity(live ? 1 : 0.4)
            .shadow(color: .black.opacity(0.35), radius: 4, y: 1)
            Text(session.moment.title)
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .bold))
                .foregroundColor(.white)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .frame(maxWidth: cell.width + MeeshySpacing.xxl)
        }
        .contentShape(Rectangle())
        .onTapGesture {
            HapticFeedback.medium()
            Task { await session.gesture(.tap, on: .chosenThumbnail) }
        }
        .accessibilityElement()
        .accessibilityLabel(String(localized: "game.photo.frame_trigger.a11y", defaultValue: "Prendre la photo dans le cadre « \(session.moment.title) »", bundle: .main))
        .accessibilityHint(String(localized: "game.photo.frame_trigger.hint", defaultValue: "Enregistrée dans Photos, puis le résultat s’ouvre.", bundle: .main))
        .accessibilityAddTraits(.isButton)
        .accessibilityIdentifier("game.photo.frame_trigger")
        .composerCaptureAccessibilityActions(zone: .chosenThumbnail, context: session.captureContext) { action in
            Task { await session.perform(action) }
        }
        .allowsHitTesting(live)
    }

    private func failureNote(_ failure: CameraFailure) -> some View {
        let text: String
        switch failure {
        case .denied:
            text = String(localized: "game.photo.camera.denied", defaultValue: "La caméra est refusée. Autorise-la dans les réglages de ton appareil, ou choisis une photo dans ta galerie.", bundle: .main)
        case .unsupported:
            text = String(localized: "game.photo.camera.unsupported", defaultValue: "Cet appareil ne permet pas la caméra ici. Choisis une photo dans ta galerie, ou garde la carte seule.", bundle: .main)
        case .unavailable:
            text = String(localized: "game.photo.camera.unavailable", defaultValue: "La caméra n’est pas disponible (une autre application l’utilise ?). Choisis une photo dans ta galerie, ou garde la carte seule.", bundle: .main)
        }
        return Text(text)
            .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .medium))
            .foregroundColor(.white)
            .multilineTextAlignment(.center)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, MeeshySpacing.xl)
            .accessibilityIdentifier("game.photo.camera.failure")
    }

    // MARK: - 3. La frappe en place

    private var striking: some View {
        VStack {
            Spacer(minLength: MeeshySpacing.xl)
            framed { size in
                ZStack {
                    overlay(size: size, background: strikeBackground, strike: session.strike)
                        .animation(.spring(response: 0.45, dampingFraction: 0.55), value: session.strike)
                    Text(String(localized: "game.mint.tchak", defaultValue: "Tchak !", bundle: .main))
                        .font(MeeshyFont.relative(34, weight: .heavy, design: .rounded))
                        .foregroundColor(MeeshyColors.warning)
                        .opacity(session.strike)
                        .offset(y: size.height * 0.12)
                }
            }
            Spacer(minLength: MeeshySpacing.xl)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(String(localized: "game.photo.striking", defaultValue: "Mee et Meo frappent le moment dans la photo", bundle: .main))
    }

    private var strikeBackground: GamePhotoCanvasView.Background {
        guard let frozen = session.frozen else { return .card }
        return .photo(frozen, mirrored: session.state == .striking(.selfie))
    }

    // MARK: - 4. Le résultat

    private func result(kept: Bool?) -> some View {
        VStack(spacing: MeeshySpacing.md) {
            Spacer(minLength: MeeshySpacing.xl)
            if let composed = session.composed {
                Image(uiImage: squareFormat ? composed.square : composed.story)
                    .resizable()
                    .scaledToFit()
                    .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.lg, style: .continuous))
                    .accessibilityLabel(String(localized: "game.photo.preview", defaultValue: "Aperçu : \(session.moment.title)", bundle: .main))
                    .overlay { referralQRMark(squareFormat ? .square : .story) }
                    .padding(.horizontal, MeeshySpacing.lg)
                Picker("", selection: Binding(get: { session.squareFormat }, set: { session.chooseFormat(square: $0) })) {
                    Text(String(localized: "game.photo.format.story", defaultValue: "9:16 · story", bundle: .main)).tag(false)
                    Text(String(localized: "game.photo.format.square", defaultValue: "1:1 · profil", bundle: .main)).tag(true)
                }
                .pickerStyle(.segmented)
                .padding(.horizontal, MeeshySpacing.xl)
                // Le lien d'invitation et la Flamme se retirent chacun d'un geste (conformité H-2) : l'utilisateur
                // voit la carte telle qu'elle partira. Sans jeton, l'aperçu montre l'emplacement du lien en pointillé :
                // « Partager » le crée, et la carte part avec le vrai lien. Sans rien de lisible, rien à régler.
                if session.offersLinkChoice {
                    Toggle(isOn: Binding(get: { session.linkOnCard }, set: { session.setLinkOnCard($0) })) {
                        Text(String(localized: "game.referral.link_toggle", defaultValue: "Mon lien d'invitation sur la carte", bundle: .main))
                            .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .medium))
                            .foregroundColor(.white)
                    }
                    .tint(MeeshyColors.brandPrimary)
                    .padding(.horizontal, MeeshySpacing.xl)
                    .accessibilityIdentifier("game.photo.link_toggle")
                }
                if session.hasFlame, session.referral != nil {
                    Toggle(isOn: Binding(get: { session.flameOnCard }, set: { session.setFlameOnCard($0) })) {
                        Text(String(localized: "game.referral.flame_toggle", defaultValue: "Ma Flamme sur la carte", bundle: .main))
                            .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .medium))
                            .foregroundColor(.white)
                    }
                    .tint(MeeshyColors.warning)
                    .padding(.horizontal, MeeshySpacing.xl)
                    .accessibilityIdentifier("game.photo.flame_toggle")
                }
            }
            if let notice = session.notice {
                Text(notice.text)
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .medium))
                    .foregroundColor(notice.tone == .good ? MeeshyColors.success : MeeshyColors.errorSoft)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, MeeshySpacing.xl)
                    .accessibilityIdentifier("game.photo.notice")
                if notice.action == .saveToLibrary, session.showsSave {
                    Button {
                        HapticFeedback.light()
                        Task { await session.save() }
                    } label: {
                        Text(String(localized: "game.photo.notice.no_space_save", defaultValue: "L’enregistrer dans Photos", bundle: .main))
                            .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
                            .foregroundColor(.white)
                            .frame(minHeight: 44)
                            .padding(.horizontal, MeeshySpacing.lg)
                            .background(Capsule().fill(MeeshyColors.brandPrimary))
                    }
                    .accessibilityIdentifier("game.photo.no_space_save")
                }
            }
            HStack(spacing: MeeshySpacing.sm) {
                // « Enregistrer » n'existe que s'il sert : une prise déjà dans Photos avec ce cadre ne le montre pas (#10284).
                if session.showsSave {
                    resultButton(String(localized: "game.photo.save", defaultValue: "Enregistrer", bundle: .main), "square.and.arrow.down", id: "game.photo.save") {
                        Task { await session.save() }
                    }
                }
                resultButton(String(localized: "game.photo.share", defaultValue: "Partager", bundle: .main), "square.and.arrow.up", id: "game.photo.share") {
                    // Le jeton se crée AU TOUCHER, la carte est recomposée avec le vrai lien, puis la feuille s'ouvre.
                    Task {
                        await session.prepareShare()
                        showsShare = true
                    }
                }
                resultButton(kept == true
                    ? String(localized: "game.photo.kept", defaultValue: "Gardée", bundle: .main)
                    : String(localized: "game.photo.keep", defaultValue: "Garder", bundle: .main),
                    kept == true ? "checkmark.circle.fill" : "book.closed", id: "game.photo.keep") {
                    Task { await session.keep() }
                }
            }
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.bottom, MeeshySpacing.lg)
        }
        .sheet(isPresented: $showsShare) {
            if session.composed != nil {
                // L'image, puis le lien de parrainage en texte (#7742) : le même partage, un item de plus.
                ShareSheet(activityItems: session.shareItems(square: squareFormat)) { completed in
                    session.shared(completed: completed)
                }
            }
        }
    }

    private func resultButton(_ title: String, _ symbol: String, id: String, action: @escaping () -> Void) -> some View {
        Button {
            HapticFeedback.light()
            action()
        } label: {
            VStack(spacing: 4) {
                Image(systemName: symbol).font(MeeshyFont.relative(18, weight: .semibold))
                Text(title).font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
            }
            .foregroundColor(.white)
            .frame(maxWidth: .infinity, minHeight: 56)
            .background(RoundedRectangle(cornerRadius: MeeshyRadius.md).fill(Color.white.opacity(0.16)))
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier(id)
    }

    // MARK: - Briques

    private func message(_ text: String) -> some View {
        Text(text)
            .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .medium))
            .foregroundColor(.white)
            .multilineTextAlignment(.center)
            .padding(MeeshySpacing.xl)
    }

    /// Un cadre 9:16 qui tient dans l'écran, l'aperçu comme la frappe.
    private func framed<Inner: View>(@ViewBuilder _ inner: @escaping (CGSize) -> Inner) -> some View {
        GeometryReader { proxy in
            let ratio = PhotoFormat.story.size.width / PhotoFormat.story.size.height
            let height = min(proxy.size.height, proxy.size.width / ratio)
            let size = CGSize(width: height * ratio, height: height)
            inner(size)
                .frame(width: size.width, height: size.height)
                .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.lg, style: .continuous))
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    /// Le carré QR de la carte s'annonce À PART (#9554) : l'image n'est qu'un bloc de pixels pour le lecteur
    /// d'écran, donc un élément est posé SUR le carré, là où le doigt le trouve. Rien sans lien : un
    /// emplacement en pointillé n'est pas un QR code.
    @ViewBuilder
    private func referralQRMark(_ format: PhotoFormat) -> some View {
        if session.referral?.qrLink != nil,
           let qr = GamePhotoLayout.layout(format, referral: true, rightToLeft: GamePhotoLayout.readsRightToLeft()).qr {
            GeometryReader { proxy in
                let scale = proxy.size.width / format.size.width
                Color.clear
                    .frame(width: qr.width * scale, height: qr.height * scale)
                    .contentShape(Rectangle())
                    .accessibilityElement()
                    .accessibilityLabel(String(localized: "game.photo.referral.qr_label", defaultValue: "QR code de ton lien d’invitation", bundle: .main))
                    .accessibilityAddTraits(.isImage)
                    .accessibilityIdentifier("game.photo.referral.qr")
                    .position(x: qr.midX * scale, y: qr.midY * scale)
            }
            .environment(\.layoutDirection, .leftToRight)
        }
    }

    /// Le cadre du moment, dessiné dans l'espace de l'image finale puis mis à l'échelle.
    private func overlay(size: CGSize, background: GamePhotoCanvasView.Background, strike: Double = 1) -> some View {
        let format = PhotoFormat.story
        let scale = size.width / format.size.width
        return GamePhotoCanvasView(
            moment: session.moment,
            dateLabel: GamePhotoComposer.dateLabel(Date()),
            format: format, background: background, strike: strike, referral: session.referral, author: session.author
        )
        .frame(width: format.size.width, height: format.size.height)
        .scaleEffect(scale, anchor: .topLeading)
        .frame(width: size.width, height: size.height, alignment: .topLeading)
        .allowsHitTesting(false)
    }
}
