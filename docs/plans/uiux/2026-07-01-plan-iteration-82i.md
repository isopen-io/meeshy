# Plan — Iteration 82i (2026-07-01) — iOS Dynamic Type `AudioFullscreenView`

## Objectif
Rendre le lecteur audio plein écran (`AudioFullscreenView`) compatible Dynamic Type : les
`.font(.system(size:))` figées des **textes et glyphes de contenu inline** deviennent
`MeeshyFont.relative(...)` (scaling a11y, weight/design préservés). Aucun changement de layout,
de couleur ni de comportement.

## Base de départ
`main` HEAD `7e6055ac` (resync avant démarrage ; branche `claude/upbeat-euler-kc2qx2`).
Dernière itération iOS mergée référencée = **77i** (i18n `SharePickerView`, PR #1162).
Surfaces en vol au moment de 82i (PRs ouvertes, à NE PAS toucher) : feed composer #1182,
PrivacySettingsView #1176, story-viewer #1174, MessageOverlayMenu #1172, Router titles #1171,
link preview #1168, tokenize colors #1166, ConversationDashboardView #1165, 2FA #1155,
voice profile #1150, ConversationLockSheet #1185, CountryPicker #1178. `AudioFullscreenView`
= surface **libre** (aucune PR ouverte), listée dans les différés prioritaires iOS (« AudioFullscreenView (26) »).

## Doctrine (identique 55i / 71i)
- **Texte + glyphes de contenu inline** (libres dans un HStack/VStack qui peut grandir) →
  `MeeshyFont.relative(size, weight:, design:)` (helper `MeeshyUI/Theme/Accessibility.swift`).
- **Glyphes de chrome/transport contraints par un `.frame(width:height:)` fixe** → **figés**
  (le scaling déborderait/clipperait le cadre circulaire du contrôle média).
- **Icône décorative héros d'empty-state (≥ 28 pt)** → figée (hiérarchie visuelle).

## Étapes
1. [x] Auditer les 26 `.font(.system(size:))` et classer texte-de-contenu vs contrôle-chrome.
2. [x] Convertir **19** call-sites texte/glyphe-inline → `MeeshyFont.relative(...)` :
   - Top bar : indicateur page (13 mono), durée (11 mono), codec (10 mono).
   - Author row : nom expéditeur (13), date (11), glyphe `waveform` (10), taille fichier (10).
   - Time row : temps courant + total (12 mono, ×2).
   - Speed row : label vitesse (12 mono).
   - Empty state : texte « Aucune transcription » (14), glyphe `waveform.and.mic` (13),
     label « Transcrire » (13).
   - Language pills : drapeau (12), label langue (10).
   - Language picker sheet : drapeau (20), nom langue (15), checkmark (16), speaker (14).
3. [x] Garder **7** figés : `xmark` (16/36), download (16/36), `gobackward.10` (28),
   play/pause (32/64), `goforward.10` (28), icône empty-state (28 light), `translate` (11/26).
4. [x] `MeeshyColors`/`MeeshyFont` en scope (fichier importe `MeeshyUI`).
5. [x] Grep de contrôle : les seules `.font(.system(size:))` restantes = les 7 figés voulus.
6. [ ] Commit + push branche ; gate = CI `ios-tests.yml` (compile Xcode 26.1 + tests 18.2).
7. [ ] Merge dans `main` après CI verte ; supprimer la branche ; mettre à jour branch-tracking.

## Risques / points d'attention
- Swap mécanique littéral→helper identique à celui déjà mergé (`TwoFactorSetupView`, 71i) → compile OK.
- **Zéro** conversion de couleur (orthogonal à la tokenization en vol #1166) ni de layout.
- Aucun snapshot baseline ne couvre `AudioFullscreenView` (infra snapshot limitée à Timeline) —
  vérifié : `grep -r AudioFullscreen apps/ios/MeeshyTests packages/MeeshySDK/Tests` = vide.
- Contrôles média chrome/transport figés = choix HIG (les transports ne scalent pas ; frames fixes
  éviteraient le clipping du glyphe agrandi).

## Vérification finale
- [x] 19 `.font(.system(size:))` → `MeeshyFont.relative(...)` ; 7 figés justifiés.
- [x] `MeeshyFont` accessible (import `MeeshyUI` présent ligne 4).
- [ ] CI `ios-tests.yml` verte.
- [ ] Merge `main` + suppression branche + tracking mis à jour.
