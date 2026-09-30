# Charte visuelle iOS — une seule source : les jetons de `MeeshyUI`

> Issues : #8877 (jetons partout), #8878 (plein écran). Demande porteur du 2026-09-30.
> Cette charte dit QUEL jeton sert QUEL rôle. L'état des tâches vit dans les issues.

## 1. Portée

Toutes les vues de `apps/ios/Meeshy`, des extensions (`MeeshyWidgets`, `MeeshyShareExtension`,
`MeeshyNotificationExtension`, `MeeshyBroadcastExtension`) et de `packages/MeeshySDK/Sources/MeeshyUI`.

## 2. Ce qui reste libre — le cadre des tiers

Les couleurs, polices et fonds que l'UTILISATEUR (ou un tiers) choisit ne se ramènent jamais aux jetons.
Ces fichiers sont hors codemod (liste `exemptPaths` de la table du lot) ; dans les autres, un site de ce genre reste littéral.

| Cadre libre | Fichiers / dossiers | Ce qui y reste libre |
|---|---|---|
| Studio de story (texte, fond, effets, filtres, scène) | `MeeshyUI/Story/Canvas/**`, `Story/StoryComposerSupportTypes.swift`, `Story/StoryTextEditorView.swift`, `Story/StoryTextEffectStyle.swift`, `Story/StoryBackgroundStyle.swift`, `Story/StoryFilterGridView.swift`, `Story/StorySlideRenderer.swift`, `Story/SlideMiniPreview.swift`, `Story/TextEditToolOptions*.swift`, `Story/TextStyleSpecimenBand.swift`, `Theme/StoryBackdrop+Color.swift` | palettes de texte et de fond, `StoryFont`, fonds de scène, rendu d'une slide |
| Dessin | `Story/Drawing/**`, `Story/DrawingEditToolOptions.swift`, `Story/DrawingStrokeList.swift`, `Story/StoryDrawingToolbar.swift` | palette et épaisseurs de trait |
| Stickers et cadres à mots | `Story/Sticker*.swift`, `Components/ComposerTextStickerSheet.swift`, `Views/Bubble/MessageStickerArtwork.swift`, `Lentille/Chrome/LentilleSticker.swift` | gabarits, couleurs de gabarit |
| Palettes proposées à l'utilisateur | `Components/BackgroundColorPalette.swift`, `MeeshyUI/Community/CommunitySettingsView.swift` | nuanciers de fond et de communauté |
| Cadres d'appel | `Features/Main/Services/CallFrames/**`, `Features/Main/Models/CallFrames/**` | dégradés et ornements choisis |
| Cartes de message exportées | `MeeshyUI/MessageCard/**`, `Export/MessageCardThumbnails.swift`, `Export/MessageCardExportGallery.swift` | thèmes de carte |
| Filtres et effets | `Views/VideoFiltersPanel.swift`, `Views/VideoFilterControlView.swift`, `Media/VideoEditor/VideoFilterPreviewer.swift`, `Views/ReelAudioBackdrop.swift`, `Components/MessageEffectModifiers.swift` | teintes d'effet, fond audio d'un réel |
| Couleur CALCULÉE d'une entité | `accentColor`, `colorPalette`, `DynamicColorGenerator` (cœur `Theme/ColorGeneration.swift`), `Primitives/TagInputView.swift` (couleur hachée d'un tag) | tout site qui reçoit `accentColor` / une couleur d'expéditeur la garde |
| Drapeaux de langue | `Components/LanguageFlagChip.swift` | couleurs de drapeau |
| Code | `Media/SyntaxHighlighter.swift`, `Media/CodeViewerView.swift` | thèmes de coloration |
| Marques tierces | tout logo tiers (Apple, Google, WhatsApp…) | sa couleur de marque (aucun hex de marque mesuré au 2026-09-30 ; seul le SF Symbol `apple.logo`) |
| Extensions sans `MeeshyUI` | `MeeshyWidgets`, `MeeshyShareExtension`, `MeeshyNotificationExtension`, `MeeshyBroadcastExtension` | `project.yml` ne leur donne que `MeeshySDK` : un jeton n'y compile pas |
| Définitions | `MeeshyUI/Theme/**`, cible cœur `packages/MeeshySDK/Sources/MeeshySDK/**` | les jetons eux-mêmes ; le cœur ne voit pas `MeeshyUI` |

Littéraux INTRINSÈQUES, laissés partout : `.clear` ; `.black` / `.white` purs en fond de média plein écran ;
filets de 1 pt ; espacement 0 ; rayon 2–3 d'une barre fine (moitié de sa hauteur) ; durées d'animation ;
un glyphe figé dans un cadre fixe (doctrine `FixedFontSizeGuardTests`, en général commentée sur place).

## 3. Jetons

Vocabulaire tiré d'une mesure de fréquence sur 626 fichiers (app, extensions, `MeeshyUI`) le 2026-09-30 : un jeton nommé par rôle récurrent, aucun pour une valeur isolée. Tous les jetons vivent dans
`packages/MeeshySDK/Sources/MeeshyUI/Theme/` ; les échelles CGFloat sont `nonisolated` (utilisables hors `MainActor`).
Épinglés par `MeeshyUITests/Theme/DesignTokenVocabularyTests.swift` ; dérivés vers `packages/design-tokens/ios.css`.

### Couleurs — `MeeshyColors` (`Color`, jumeau `…Hex` en `String` pour les paramètres `color:` / `tint:`)

| Rôle | Jeton | Valeur |
|---|---|---|
| Marque | `indigo50` … `indigo950`, `brandPrimary` (= indigo500), `brandDeep` (= indigo700), `brandGradient` | rampe Tailwind indigo |
| Accent violet | `purple500/600/700`, `violet950` | `A855F7` `8B5CF6` `B24BF3` `2E1065` |
| Sémantique | `success` `error` `warning` `info` (+ `errorSoft` `errorStrong` `errorDark` `successDeep`) | `34D399` `F87171` `FBBF24` `60A5FA` |
| Neutres | `neutral400/500/600` | `9CA3AF` `6B7280` `4B5563` |
| **Teintes franches** (nouveau) | `blue500`, `orange500`, `amber500` (+ `Hex`) | `3B82F6` `F97316` `F59E0B` |
| **Tuiles** (nouveau) — icône de rangée de réglage, carte de stat, catégorie | `tileCoral` `tileSaffron` `tileBlue` `tileAmethyst` `tileSky` `tileEmerald` `tileTeal` `tileCyan` `tileRose` (+ `Hex`) | `FF6B6B` `F8B500` `3498DB` `9B59B6` `45B7D1` `2ECC71` `4ECDC4` `08D9D6` `FF2E63` |
| **Plans nommés** (nouveau) | `surfaceDarkBase` `surfaceDarkDeep` `surfaceDarkRaised` `surfaceDarkInput` / `surfaceLightRaised` `surfaceLightMist` `surfaceLightInput` | `09090B` `0F0D19` `13111C` `16142A` / `F8F7FF` `FAFAFF` `F5F3FF` |
| Plans thématisés | `backgroundPrimary(isDark:)`, `backgroundSecondary(isDark:)`, `ThemeManager.backgroundTertiary`, `mainBackgroundGradient(isDark:)` | — |
| Encres | `textPrimary(isDark:)`, `textSecondary(isDark:)`, `textMuted(isDark:)` (AA mesuré) | — |
| **Voiles adaptatifs** (nouveau) | `surfaceFill(isDark:)` fond de carte/puce · `controlFill(isDark:)` disque de bouton-icône · `hairline(isDark:)` filet | blanc 6 % / noir 4 % · blanc 10 % / noir 5 % · blanc 8 % / noir 5 % |
| Verre | `glassFill`, `glassBorderGradient(isDark:)`, `.adaptiveGlass(in:)`, `.glassControlForeground()` | — |
| **Chrome sur média** (nouveau, #8878) | `mediaChromeForeground` · `mediaChromeSecondary` · `mediaChromeTertiary` · `mediaChromeFill` · `mediaScrim` · `mediaScrimTop` / `mediaScrimBottom` | blanc · blanc 85 % · blanc 70 % · noir 35 % · noir 50 % · dégradé noir 55 % → 0 |
| États d'un message | `stateViewOnce` `stateOpened` `stateEphemeral` `stateConcealed` `stateFailed` | rôle unique, ne pas réemployer |

### Échelles — `DesignTokens.swift` (CGFloat sauf opacités)

| Échelle | Pas (nouveaux en **gras**) |
|---|---|
| `MeeshySpacing` | **xxs 2** · xs 4 · **xsPlus 6** · sm 8 · **smPlus 10** · md 12 · **mdPlus 14** · lg 16 · xl 20 · xxl 24 · xxxl 32 |
| `MeeshyRadius` | **xxs 4** · **xs 8** · sm 10 · **smPlus 12** · md 14 · lg 16 · **lgPlus 18** · xl 20 · **xlPlus 22** · xxl 24 · full ∞ |
| `MeeshyFont` (tailles) | **micro 9** · caption 10 · footnote 11 · **small 12** · subhead 13 · **label 14** · body 15 · **callout 16** · headline 17 · **subtitle 18** · **title3 20** · title 22 · **display 28** · largeTitle 34 — via `MeeshyFont.relative(_:weight:)` (Dynamic Type) ; `.system(size:)` reste réservé au glyphe borné par un cadre fixe |
| **`MeeshyIconSize`** (SF Symbols) | xxs 10 · xs 12 · sm 14 · md 16 · lg 18 · xl 20 · xxl 22 · xxxl 28 · hero 48 |
| **`MeeshyControlSize`** | small 28 · compact 32 · regular 36 · large 40 · tapTarget 44 · buttonHeight 52 |
| **`MeeshyBorder`** | hairline 0.5 · regular 1 · emphasis 1.5 · strong 2 |
| **`MeeshyOpacity`** (Double) | faint 0.04 · subtle 0.08 · light 0.15 · medium 0.3 · strong 0.5 · heavy 0.7 · intense 0.85 |
| `MeeshyShadow` / `MeeshyAnimation` | subtle · medium · strong / springFast · springDefault · springBouncy (inchangés) |

## 4. Correspondances littéral → jeton

### 4.1 Échanges à valeur ÉGALE (codemod, aucun pixel ne bouge)

Table complète et codemod : outils de session du lot #8877 (`mapping.json → exact`, `codemod.py --dry-run` compte par sorte) — ils n'échangent qu'à valeur égale.

| Sorte | Motif remplacé (argument ENTIER, suivi de `,` ou `)`) | Jeton |
|---|---|---|
| hex | `Color(hex: "RRGGBB")` d'une valeur de la table § 3 | `MeeshyColors.<nom>` (jamais `000000` / `FFFFFF`) |
| hexstr | `"RRGGBB"` après `(` ou `: ` | `MeeshyColors.<nom>Hex` |
| police | `.font(.system(size: N…))` sur `Text`/`Label` · `MeeshyFont.relative(N…)` | `MeeshyFont.<x>Size` |
| glyphe | `.font(.system(size: N…))` / `relative(N…)` sur `Image(systemName:)` | `MeeshyIconSize.<x>` |
| rayon | `RoundedRectangle(cornerRadius: N` · `.rect(cornerRadius: N` · `.cornerRadius(N` · `.glassCard(cornerRadius: N` | `MeeshyRadius.<x>` |
| marge | `.padding(N)` · `.padding(.bord, N)` · `.padding([bords], N)` | `MeeshySpacing.<x>` |
| espacement | `VStack` / `HStack` / `Lazy*Stack` / `Lazy*Grid` / `GridItem` `(… spacing: N` | `MeeshySpacing.<x>` |
| cible | `.frame(minWidth: 44, minHeight: 44` · `.meeshyTapTarget(44)` | `MeeshyControlSize.tapTarget` |
| bordure | `lineWidth: 0.5 / 1.5 / 2` sur une ligne `.stroke(` / `.strokeBorder(` | `MeeshyBorder.hairline / emphasis / strong` |

Jamais dans une expression (`14 * scale` reste), jamais là où le type attendu est `Double`, `Int`, `UIColor`, `CGColor`.
Un fichier `apps/ios` reçoit `import MeeshyUI` ; s'il est dans `legacyOverBudget`, atteindrait 1 201 lignes ou a ses
imports sous `#if`, il est écarté entier. Un site qu'un test cite (motif, ligne, jeton, ou chaîne littérale qui
disparaîtrait) est rétabli.

### 4.2 Tolérances d'harmonisation (à la main, vue par vue — changent une valeur, jamais visiblement)

Table complète : `mapping.json → snap` (lot #8877). Règle générale : **au plus proche ; à égalité, le jeton INFÉRIEUR** (on ne
gonfle pas une vue dense). Jamais sur une vue à instantané (`MeeshyUITests/**/__Snapshots__` : Timeline,
`LocationMessageView`, canvas de story), jamais dans un cadre libre (§ 2).

| Dimension | Tolérance | Exemples |
|---|---|---|
| Rayon | ± 2 pt vers `MeeshyRadius` ; ≥ 27 pt sur un cadre ≤ 2 × rayon → `Capsule()` / `Circle()` | 6 → xxs 4 · 13 → smPlus 12 · 26 → xxl 24 |
| Marge / espacement | ± 2 pt vers `MeeshySpacing` ; 1 et ≥ 28 restent (sauf 30 → xxxl 32) | 3 → xxs · 5 → xs · 18 → lg |
| Police | ± 0,5 pt (tailles demi) vers l'entier inférieur ; ± 2 pt vers `MeeshyFont` | 10.5 → 10 · 19 → subtitle 18 · 24 → title 22 · 30 → display 28 |
| Glyphe | ± 1 pt vers `MeeshyIconSize` ; 24–26 → le plus proche de xxl 22 / xxxl 28 ; 44–52 → hero | 13 → xs 12 · 15 → sm 14 · 24 → xxl 22 · 26 → xxxl 28 |
| Contrôle | ± 2 pt vers `MeeshyControlSize` ; bouton plein 50–54 → buttonHeight 52 | 30 → small 28 · 34 → compact 32 |
| Bordure | 0.7–0.8 → hairline ; 1.2–1.6 → emphasis ; 2.2–2.5 → strong | |
| Opacité | ± 0,03 sous 0,2 ; ± 0,05 au-dessus, vers `MeeshyOpacity` | 0.06 → subtle 0.08 · 0.35 → medium 0.3 · 0.9 → intense 0.85 |
| Voile `isDark ? blanc : noir` | fond → `surfaceFill` ; disque de bouton → `controlFill` ; `.stroke` → `hairline` | `white 0.05 : black 0.03` → `surfaceFill(isDark:)` |
| Couleur | ΔE2000 ≤ 3 d'un jeton de MÊME rôle → ce jeton ; au-delà, garder et demander un jeton | `2D2D40`, `24243E`, `1A1A2E` : mesurer avant de rapprocher de `surfaceDarkRaised` / `indigo950` |
| Texte gris ad hoc | `.white.opacity(0.4–0.6)` / `.black.opacity(0.3–0.5)` en méta → `textMuted(isDark:)` / `textSecondary(isDark:)` | ces jetons tiennent AA, les gris ad hoc non |

## 5. Boutons, icônes, fonds, bordures

| Composant | Forme | Remplissage / encre | Taille | Police |
|---|---|---|---|---|
| Bouton **principal** | `Capsule()` | `MeeshyColors.brandGradient`, encre `.white` ; désactivé : `indigo200` clair / `indigo900` sombre, opaque | `minHeight: MeeshyControlSize.buttonHeight`, `maxWidth: .infinity`, marge horizontale `MeeshySpacing.lg` | `MeeshyFont.relative(MeeshyFont.headlineSize, weight: .semibold)` ; `.bounceOnTap(scale: 0.96)` |
| Bouton **secondaire** | texte nu ou `Capsule()` + `.adaptiveGlass(in: Capsule())` | encre `textSecondary(isDark:)` ou `.glassControlForeground()` | `minHeight: MeeshyControlSize.tapTarget` | `relative(bodySize, weight: .semibold)` |
| Bouton **destructif** | comme le principal | `errorStrong` (plein) ou encre `error` (texte) — jamais `Color.red` | idem | idem |
| Bouton-**icône** (plan) | `Circle()` | `controlFill(isDark:)` ou `.adaptiveGlass()` ; glyphe `.glassControlForeground()` | disque `MeeshyControlSize.regular` (compact 32 en barre dense), cible `.meeshyTapTarget()` | glyphe `MeeshyIconSize.md`, `.semibold` |
| Bouton-icône **sur média** | `Circle()` | `mediaChromeFill` (ou `.adaptiveGlass()`), glyphe `mediaChromeForeground` | disque `MeeshyControlSize.regular`, cible 44 | `MeeshyIconSize.lg`, `.semibold` |
| En-tête de feuille qui valide / annule | `MeeshySheetHeader(title:onCancel:onDone:)` | — | actions 44 pt | — (ne pas recomposer à la main) |
| Titre de section | `SettingsSectionHeader` ou `Text` en `relative(smallSize, weight: .semibold)`, `textMuted(isDark:)`, majuscules du système | — | marge `.leading, MeeshySpacing.sm` | — |
| Carte / bloc | `RoundedRectangle(…, style: .continuous)` : carte `MeeshyRadius.md`, bloc imbriqué (citation, vignette) `smPlus`, carte de réglage et feuille flottante `xxl` | `backgroundSecondary(isDark:)` ou `surfaceFill(isDark:)` ; verre : `.glassCard()` | marge interne `MeeshySpacing.lg` | — |
| Bordure | `.strokeBorder` | `hairline(isDark:)` ou `glassBorderGradient(isDark:)` | `MeeshyBorder.hairline` (filet) / `regular` (verre) | — |
| Fond d'écran | — | `backgroundPrimary(isDark:)` (plat) ou `ThemeManager.backgroundGradient` | — | — |
| Champ de saisie | `RoundedRectangle(cornerRadius: MeeshyRadius.smPlus)` (champ du composeur : `xlPlus`) | `ThemeManager.inputBackground`, bord `inputBorder` / `inputBorderFocused(tint:)` | `minHeight: MeeshyControlSize.tapTarget` | `relative(bodySize)` |
| Badge compteur | `Capsule()` | `unreadBadgeBackground(isDark:)`, encre `.white` | marge `.horizontal, xs` · `.vertical, xxs` | `relative(captionSize, weight: .bold)` |
| Puce / tag | `Capsule()` | teinte à 15 % (`MeeshyOpacity.light`) de sa couleur de rôle, encre la couleur pleine | marge `.horizontal, sm` · `.vertical, xs` | `relative(smallSize, weight: .semibold)` |
| Icône de rangée de réglage | `RoundedRectangle(cornerRadius: MeeshyRadius.sm)` | teinte `tile*` ou sémantique, glyphe blanc | `SettingsRowMetrics.iconSize` | `MeeshyIconSize.sm` |

Règles transverses : toute couleur de contexte conversation reste `accentColor` ; une teinte `tile*` sert
une CATÉGORIE, jamais un état (les états ont `success` / `error` / `warning` / `state*`) ; une cible tactile
fait 44 pt même quand le glyphe en fait 14 (`meeshyTapTarget()`).

## 6. Plein écran — répondre, réagir, piloter

Surfaces : galerie de pièces jointes (conversation, post, commentaire), plein écran audio, story, réel, visionneuses
`MeeshyUI` (vidéo, image, photo de profil, lieu). Briques : `packages/MeeshySDK/Sources/MeeshyUI/Fullscreen/`
(cotes `FullscreenChromeMetrics`, glyphes `FullscreenChromeSymbol`, loi d'affichage `FullscreenChromeState`).

### 6.1 Relevé du 2026-09-30

| Élément | Galerie | Audio | Story | Réel | Visionneuses SDK |
|---|---|---|---|---|---|
| Fermer | haut-gauche, `xmark` 16 gras, verre 40 | haut-gauche, `xmark` 16, disque blanc 20 % 36, cible 44 | haut-DROITE après ⋯, `xmark` 14, matière + noir 20 % + filet + ombre 36 | haut-gauche, `chevron.backward` 18, verre teinté noir 35 % 40, `padding(.top, max(safe, 50) + 28)` | vidéo : gauche, verre 36 · image : gauche, `xmark.circle.fill` 28 · profil : DROITE, `xmark.circle.fill` 28, `padding(.top, 50)` · lieu : gauche, disque noir 50 % 36 |
| Menu ⋯ | haut-droite, `ellipsis` VERTICAL 18, verre 40, cible 44 | — | haut-droite, `ellipsis` 15, matière 36 | bas du rail, `ellipsis` 26 nu | vidéo : partager + enregistrer en disques 36 · image : enregistrer, disque blanc 20 % 40 |
| Auteur | bas, sur la légende : avatar 32, nom 14, date dessous | pochette | haut-gauche : avatar 44, nom 15 gras, heure sur la ligne du nom | bas-gauche : avatar 44, nom `.subheadline` | nom du fichier (vidéo) |
| Réagir | colonne droite, `face.smiling` + « + », verre 40 → rangée en bas, pleine largeur | — | rail droit, `heart.fill` nu 20 + libellé → rangée à gauche du cœur | `heart` nu 26 + compteur : tap = J'aime, appui long = palette (capsule) | — |
| Répondre | colonne droite, `arrowshape.turn.up.left.fill` → barre de saisie en place | — | rail, même glyphe + libellé → `UniversalComposerBar` | `bubble.right.fill` + compteur → feuille des commentaires | — |
| Lecture | bande de transport au couloir bas | ±10 s, lecture, forme d'onde | barres segmentées, tap gauche/droite, appui long = pause | `ReelScrubBar` sans chiffres, tap = pause | `VideoTransportControls`, effacement 3 s (lecteur 1) / 4 s (lecteur 2) |
| Fermer au geste | bas ≥ 150 (`MediaStageGestures`) | bas > 120 ou prédiction > 300 | bas (fenêtre) | bord gauche > 70 | vidéo bas > 150 · image \|h\| > 200 · profil : revient toujours |
| Voile | `StoryReaderScrims` | — | `StoryReaderScrims` | idem (scène) | vidéo : noir 70 % sur 80 / 180 pt |

### 6.2 Ce qui CONVERGE

| Élément | Règle unique | Brique |
|---|---|---|
| Fermer | `xmark`, bord de DÉBUT de la barre haute (gauche ; droite en RTL), disque `MeeshyControlSize.regular`, cible 44, glyphe `MeeshyIconSize.lg` semibold, libellé `common.close` | `FullscreenCloseButton`, `FullscreenTopBar` |
| Barre haute | `[✕] [identité si la surface la place en haut] ··· [⋯]`, dans la zone sûre, marge latérale telle que le disque tombe sur `MeeshySpacing.lg` | `FullscreenTopBar` |
| Menu | `ellipsis` HORIZONTAL (vocabulaire du fil, du réel et de la story), bord de FIN de la barre haute, même disque que la croix ; le contenu reste à l'hôte | `FullscreenMoreMenu` |
| Disque | verre teinté `mediaChromeFill`, glyphe `mediaChromeForeground` (`.onMedia`) ; `.adaptive` (verre nu + `glassControlForeground()`) SEULEMENT sous un schéma mesuré sur le média (`mediaChromeTinted()`, #6693) | `FullscreenChromeDisc` |
| Identité | avatar fourni par l'hôte (`MeeshyAvatar`), nom `bodySize` semibold `mediaChromeForeground`, date SUR la ligne du nom en `smallSize` `mediaChromeTertiary` (vue `2f`), ombre `legibleOverCanvas` | `FullscreenIdentityRow` |
| Rail d'actions | bord de FIN, ancré en bas ; ordre : Réagir (ou J'aime), Répondre (ou Commentaires), puis la surface ; intervalle `MeeshySpacing.sm` | `FullscreenActionRail`, `FullscreenActionButton` |
| Réagir | `face.smiling` + badge `plus` ; le tap OUVRE la rangée, jamais un émoji à l'aveugle ; ouvert, teinte `indigo400` | `FullscreenActionButton.react` |
| Rangée d'émojis | `EmojiReactionPicker` à l'échelle par défaut, `MeeshyQuickReactions.standard`, défilante, `chrome: .none` ; « + » → sélecteur complet | `FullscreenReactionStrip` |
| Répondre | `arrowshape.turn.up.left.fill` ; ouvre une barre de saisie au bas de l'écran qui CITE le média, sans quitter le visualiseur ; la scène ignore le clavier (`ignoresSafeArea(.keyboard)`), la barre le suit | `FullscreenActionButton.reply` + composeur de l'app |
| Commentaires | `bubble.right.fill` + compteur (`CompactCountLabel`) | `FullscreenActionButton` |
| Affichage | tap sur le média : ferme l'ouverture, sinon bascule l'immersion ; une ouverture (réagir, répondre, panneau) VOILE le reste du chrome et son voile ; changer de page ferme l'ouverture ; une vidéo en lecture s'efface après 3 s ; un chrome qui s'efface ne se touche plus | `FullscreenChromeState`, `.fullscreenChromeVisibility(_:)` |
| Voile | dégradés du lecteur de story (haut noir 70 → 0 % sur zone sûre + 110 pt, bas 0 → 92 % sur 240 pt), pleine largeur, suit le chrome | `FullscreenScrims` |
| Fermer au geste | glisser vers le bas ≥ 150 pt quand l'axe vertical est libre ; vers le haut = plein cadre (`MediaStageGestures.resolveDrag`) | `FullscreenChromeMetrics.dismissDragThreshold` |
| Légende | `MediaCaptionOverlay` (règle 30 / 15 mots), rendu du texte à l'hôte (`MessageTextRenderer`), Prisme descendu par l'hôte | existant |
| Son | `BackgroundSoundBadge.muteIconName(isMuted:)` | existant |

### 6.3 Ce qui DIVERGE, et pourquoi

| Surface | Divergence | Raison |
|---|---|---|
| Galerie | actions en DISQUES (`.disc`), sans libellé ni compteur ; rangée d'émojis ancrée EN BAS, pleine largeur | colonne courte (≤ 3) posée à côté d'un média CADRÉ ; la rangée (~340 pt à l'échelle 1,5) déborderait à droite d'un cadre de 366 pt |
| Story, réel | actions FLOTTANTES (`.floating`) : glyphe nu + halo, libellé (story) ou compteur (réel) ; rangée jaillit à GAUCHE du bouton (`reactionStripLeadingOffset`) | rail social long (4 à 9 actions) sur un média plein cadre : une pile de disques pèserait sur l'image |
| Story | identité en HAUT sous les barres segmentées ; tap gauche/droite = précédente/suivante, appui long = pause et chrome effacé ; glisser horizontal = auteur suivant | lecture MINUTÉE en séquence ; son bas appartient au composeur |
| Réel | cœur = J'AIME (bascule comptée), appui long = rangée ; l'axe vertical PAGINE (fermeture par la croix et le bord de début) ; identité + légende en bas-gauche ; `ReelScrubBar` sans chiffres | un réel est un POST (compteur de J'aime, fil vertical) — décision produit du lecteur |
| Audio | pas de rail : ±10 s, lecture, forme d'onde, transcription | rien à regarder : le contrôle EST le contenu (réagir / répondre depuis ce plein écran = issue à ouvrir) |
| Lieu | pas de fermeture au geste | la carte prend le glisser |
| Photo de profil, image, vidéo | pas de rail d'actions | visionneuses d'un OBJET, pas d'un message : fermer, enregistrer, partager (dans le ⋯) suffisent |

Règles : une nouvelle surface plein écran monte `FullscreenTopBar` + `FullscreenScrims` + `FullscreenChromeState`
avant d'écrire un contrôle ; toute divergence nouvelle s'ajoute au § 6.3 avec sa raison, sinon elle converge.

## 7. Cliquet

_À compléter par le lot #8877._
