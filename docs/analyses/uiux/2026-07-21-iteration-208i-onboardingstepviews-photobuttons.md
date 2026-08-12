# Iteration-208i — OnboardingStepViews : VoiceOver des boutons photo

**Date** : 2026-07-21
**Piste** : iOS (suffixe `i`)
**Fichier** : `apps/ios/Meeshy/Features/Auth/Onboarding/OnboardingStepViews.swift`
**Type** : Accessibilité (VoiceOver — nom/rôle, **WCAG 4.1.2**, P0) + i18n (2 clés inline)

## Contexte

L'étape « photo de profil » de l'onboarding (`profilePreviewCard`) présente un
aperçu de carte de profil avec **deux boutons appareil-photo** superposés :
- le bouton **bannière** (coin bas-droit de la bannière, l.1089),
- le bouton **photo de profil** (coin bas-droit de l'avatar, l.1121).

Chacun est un `Button` **icône-seule** dont le label est uniquement
`Image(systemName: "camera.fill")` — **sans `.accessibilityLabel`**, sans
`.accessibilityElement`/action de conteneur, et sans `Text` frère combiné.

### Problème identifié (P0)

VoiceOver annonçait ces deux commandes comme un **« bouton » anonyme** : ce sont
pourtant les **seules affordances** pour ajouter une photo de profil / une
bannière à l'étape d'onboarding. Un utilisateur VoiceOver ne pouvait pas savoir
à quoi servent ces boutons → tâche cœur (compléter son profil) inaccessible.
C'est un défaut **P0** (WCAG 4.1.2 « Name, Role, Value »).

Preuve d'absence de couverture (grep exhaustif `accessibility*` sur la
sous-vue) : le seul modifier a11y voisin est `.accessibilityHidden(true)` (l.1116)
sur le **glyphe placeholder décoratif** `person.fill` — une *autre* vue. Aucun
`.accessibilityElement(children:)`, aucun `.accessibilityLabel`, aucune action
nommée ne couvre ces deux `Button`. Le `Text` du nom (l.1137) est un frère
séparé, pas un conteneur combiné.

## Correctif appliqué

Un `.accessibilityLabel` par bouton, **0 changement visuel** :

- Bouton bannière → `onboarding.photo.banner.a11y` « Ajouter une photo de
  bannière ».
- Bouton profil → `onboarding.photo.profile.a11y` « Ajouter une photo de
  profil ».

VoiceOver annonce désormais « Ajouter une photo de profil, bouton » /
« Ajouter une photo de bannière, bouton ».

### Choix i18n

Aucune clé « ajouter une photo » n'existait. `profile.avatar.edit`
(« Modifier la photo de profil ») porte la sémantique **edit** (photo
existante) alors qu'en onboarding la photo est **absente** → « Ajouter » est
correct. Deux **clés inline** (`defaultValue`), extraites au build comme les
autres clés `onboarding.*` du flux — **aucune édition de
`Localizable.xcstrings`** (évite tout conflit de catalogue avec #2202 qui
touche le fichier de strings).

## Portée

- **1 fichier**, +4 lignes (2 de commentaire).
- **0** logique / **0** réseau / **0** visuel / **0** test neuf / **0** SDK.
- **2** clés i18n inline (`onboarding.photo.profile.a11y`,
  `onboarding.photo.banner.a11y`) ; aucune édition `.xcstrings`.
- `photoTarget` / `showPhotoPicker` / `viewModel` déjà en scope → 0 risque de
  compile ; `.accessibilityLabel` dispo iOS 14+ (plancher app 16.0, pas de garde).

## Vérification

- Les deux seules occurrences de `camera.fill` du fichier sont ces boutons ;
  après correctif, chacun porte sa clé (`grep` confirmé).
- Build iOS non exécutable sous Linux (pas de toolchain Xcode/Swift) →
  **gate = CI `iOS Tests`**. Aucun test ne référence `OnboardingStepViews`.

## Collision

`OnboardingStepViews.swift` **absent** de toutes les PR ouvertes (vérifié via
`list_pull_requests`, 9 PR ouvertes). Aucune analyse UI/UX antérieure ne cible
ce fichier.

## Hors périmètre / Suites (209i+)

- Glyphe placeholder `person.fill` déjà `.accessibilityHidden` (l.1116) —
  inchangé.
- **Différé 209i** (surface fraîche vérifiée cette itération, non traitée pour
  garder 1 fichier/itération) : `OnboardingFlowView.swift` — le compteur de
  progression `Text("2/5")` (top-bar) est une fraction nue sans
  `.accessibilityLabel` ; VoiceOver perd le rôle « étape N sur M ». Fix candidat :
  `.accessibilityLabel("Étape \(current) sur \(total)")` (idiome interpolé 186i).
