# Itération 165i — Analyse UI/UX iOS : `EditProfileView`

**Date** : 2026-07-19
**Piste** : iOS (suffixe `i`).
**Surface** : `apps/ios/Meeshy/Features/Main/Views/EditProfileView.swift`
**Base** : `main` HEAD (`efedb69`)
**Branche** : `claude/laughing-thompson-j1xn2r`
**Gate** : CI `iOS Tests`

## Contexte

`EditProfileView` est l'écran d'édition du profil (avatar, nom d'affichage, bio, plus une section
lecture-seule Compte : email / téléphone / nom d'utilisateur). Surface **fraîche** (0 mention dans le
tracking et dans `docs/analyses/uiux/`). Numéro **165i** (le dernier lot iOS mergé était 164i
`InviteFriendsSheet` ; ce fichier n'entre en contention avec aucune PR ouverte — seule la branche de
travail existe côté remote).

La typographie est **déjà** assainie : les deux seuls `.font(.system(size:))` sont des glyphes décoratifs
légitimement figés (doctrine 74i/86i) et déjà annotés :
- `camera.fill` 12 bold dans le badge PhotosPicker (cercle fixe 30×30 → scaler déborderait) ;
- `checkmark.circle.fill` 48 (héros de confirmation, hiérarchie visuelle de l'overlay succès).

Tout le reste du texte est déjà en `MeeshyFont.relative`. **La traîne Dynamic Type de ce fichier est donc
soldée** — le gisement d'amélioration est **VoiceOver** (grouping + « ne jamais reposer sur la seule
couleur »).

## Constat (avant 165i)

Trois lacunes VoiceOver réelles :

1. **Section Compte (lecture-seule) — fragmentation VoiceOver.** Chaque `readOnlyRow` (Email, Téléphone,
   Nom d'utilisateur) exposait **trois** éléments distincts au rotor : l'icône décorative (`envelope.fill`
   etc., sans sémantique), le libellé (« Email »), puis la valeur (« foo@bar.com »). Un utilisateur
   VoiceOver devait balayer 3 fois par ligne, et l'icône lisait un nom d'asset SF sans intérêt.

2. **Compteur de caractères de la bio — fraction brute + signal couleur-seul.** Le compteur
   `Text("\(count)/\(max)")` était lu littéralement « 42 slash 280 » sans contexte, et l'état « limite
   atteinte » n'était signalé **que par la couleur** (`MeeshyColors.error` rouge) — le libellé lui-même ne
   changeait pas de forme pour VoiceOver.

3. **Overlay de succès — héros décoratif exposé.** Le glyphe `checkmark.circle.fill` (48pt) n'était **pas**
   masqué à VoiceOver (contrairement à la doctrine appliquée dans `OnboardingStepViews` : héros ≥40pt →
   `.accessibilityHidden(true)`, le texte adjacent porte le sens). L'overlail « Profil mis à jour »
   n'était pas non plus regroupé en un seul élément parlant.

## Corrections appliquées (1 fichier, 0 logique)

- **`readOnlyRow`** : icône décorative `.accessibilityHidden(true)` ; la rangée entière devient un seul
  élément (`.accessibilityElement(children: .combine)`) portant un `.accessibilityLabel` composé
  **« <titre> : <valeur> »** (clé i18n `profile.edit.readonly.a11y`, format `%1$@ : %2$@` — le séparateur
  et l'espacement restent localisables, y compris RTL). VoiceOver annonce désormais « Email : foo@bar.com »
  en un seul balayage.
- **Compteur bio** : `.accessibilityLabel` contextuel **« N caractères sur M »** (clé
  `profile.edit.bio.count.a11y`, format `%1$d caractères sur %2$d`) — la fraction n'est plus lue « slash »
  et le rapport N/M porte lui-même l'atteinte de limite (signal **textuel**, pas seulement la couleur
  rouge qui reste un renfort visuel redondant).
- **Overlay succès** : héros `checkmark.circle.fill` (48) `.accessibilityHidden(true)` ; l'overlay regroupé
  (`.accessibilityElement(children: .combine)` + trait `.isStaticText`) → le libellé parlé est
  « Profil mis à jour », sans le nom d'asset SF parasite.

Aucun gel touché : les deux `.font(.system(size:))` restent figés (décoratifs bornés) et déjà commentés ;
le commentaire du héros succès est enrichi (« le texte adjacent porte le sens pour VoiceOver »).

## Périmètre / non-régression

- **1 seul fichier**, 0 logique, 0 mutation d'état, 0 `@Published` touché. `import MeeshyUI` déjà présent.
  2 clés i18n neuves (`profile.edit.readonly.a11y`, `profile.edit.bio.count.a11y`) — auto-extraites au
  String Catalog comme les clés `profile.edit.*` / `feed.post.edit.remaining.a11y` existantes (aucune n'est
  stockée explicitement dans `Localizable.xcstrings` → extraction au build).
- `EditProfileViewModelTests` teste le **ViewModel** (logique save/hasChanges), pas la `View` → aucune
  assertion ne dépend du rendu ni des labels VoiceOver → aucune régression de test.
- La logique d'upload avatar, de troncature de bio (`bioMaxLength`), de save et le gating `hasChanges` ne
  sont **pas** touchés. Palette (indigo400 / `4338CA` / success) intacte.

## Statut

**TERMINÉE** — `EditProfileView` VoiceOver soldé (rangées Compte regroupées « titre : valeur » ; compteur
bio « N caractères sur M » ; héros succès masqué + overlay regroupé). Dynamic Type déjà soldé (2 glyphes
figés bornés). Ne plus re-flagger cette surface.

---

## Analyses corrigées & complètes (ne pas reproduire)

- `EditProfileView` — `readOnlyRow` : icône `.accessibilityHidden` + `accessibilityElement(children:
  .combine)` + label « <titre> : <valeur> » (`profile.edit.readonly.a11y`) ; compteur bio →
  `accessibilityLabel` « N caractères sur M » (`profile.edit.bio.count.a11y`, la fraction porte la limite,
  pas la seule couleur) ; overlay succès → héros 48pt `.accessibilityHidden(true)` + `combine` +
  `.isStaticText`. Les 2 `.font(.system(size:))` (badge caméra 30×30, héros 48pt) restent figés
  décoratifs. **SOLDÉ 165i.**
