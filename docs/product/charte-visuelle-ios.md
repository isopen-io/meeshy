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

_À compléter par le lot #8878._

## 7. Cliquet

_À compléter par le lot #8877._
