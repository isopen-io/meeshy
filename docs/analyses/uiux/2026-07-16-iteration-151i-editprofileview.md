# Itération 151i — Analyse UI/UX iOS : `EditProfileView`

**Date** : 2026-07-16
**Piste** : iOS (suffixe `i`).
**Surface** : `apps/ios/Meeshy/Features/Main/Views/EditProfileView.swift`
**Base** : `main` HEAD (`cd93248`)
**Branche** : `claude/laughing-thompson-xp2i27`
**Gate** : CI `iOS Tests`

## Contexte

`EditProfileView` est l'écran d'édition de profil (avatar via `PhotosPicker`, nom d'affichage, bio avec
compteur, section compte en lecture seule email/téléphone/username, bouton Sauvegarder + overlay de succès).
Surface **substantielle** (408 lignes) dont le **Dynamic Type est déjà soldé** (19 `MeeshyFont.relative`,
les 3 `.system(size:)` restants sont des gels documentés : badge caméra 12pt dans un cercle fixe 30×30,
héros checkmark 48pt de l'overlay de succès) — **mais la structure VoiceOver était quasi absente** : **1
seule** référence `accessibility` dans tout le fichier (le label du `PhotosPicker`). **Aucune PR ouverte ne
touche `EditProfileView`** (les 11 PR iOS ouvertes 140i–150i visent d'autres surfaces) → **0 contention**.
Numéro **151i** (150i = `DeleteAccountView`, PR #1986).

## Constat (avant 151i)

Écran lisible visuellement mais **fragmenté et bruité sous VoiceOver** :

1. **Titre d'écran** « Modifier le profil » — non marqué `.isHeader` → pas de navigation par rotor titres.
2. **En-têtes de section** (« INFORMATIONS », « COMPTE ») — icône décorative + libellé *tracké/majuscules*
   lus séparément, sans trait `.isHeader`. VoiceOver lisait le texte espacé lettre-à-lettre.
3. **Rangées lecture seule** (email, téléphone, username) — chaque rangée éclatée en **3 éléments** :
   icône décorative (« image »), titre, valeur → 3 arrêts de curseur au lieu d'un.
4. **Champs éditables** (nom d'affichage, bio) — l'icône décorative et le libellé de titre flottaient
   séparément du `TextField`, lequel n'avait **aucun label associé** → VoiceOver annonçait le champ sans
   dire quel champ (« champ de texte, Votre nom »).
5. **Overlay de succès** — checkmark décoratif 48pt exposé comme « image » ; contenu non regroupé.
6. **Rangée d'upload photo** — `ProgressView` + texte lus séparément.

## Corrections appliquées (1 fichier, 0 logique)

Passe VoiceOver **sans changement de logique, sans nouvelle clé i18n** (réutilise les libellés déjà
localisés via `children: .combine` et les paramètres `title`/`bio` existants) :

- **Titre d'écran → `.accessibilityAddTraits(.isHeader)`** : navigable au rotor.
- **`sectionHeader` → `.accessibilityElement(children: .combine)` + `.accessibilityLabel(title)` +
  `.isHeader`** : un seul élément, lu avec le titre **naturel** (pas la version majuscules/trackée), navigable.
- **`readOnlyRow` → `.accessibilityElement(children: .combine)` + `.accessibilityLabel("\(title), \(value)")`** :
  fusion « Email, nom@exemple.com » en un arrêt de curseur ; icône décorative absorbée.
- **`editableField` → icône `.accessibilityHidden(true)`, titre visuel `.accessibilityHidden(true)`,
  `TextField.accessibilityLabel(title)`** : le champ s'annonce désormais « Nom d'affichage » sans doublon.
- **`bioField`** : idem (icône + titre masqués, `TextField.accessibilityLabel(bioLabel)`) ; `bioLabel`
  extrait en constante locale pour partager la string localisée entre le libellé visuel et le label a11y.
- **Overlay de succès** : checkmark `.accessibilityHidden(true)` + `.accessibilityElement(children: .combine)`
  + `.isStaticText` → lu « Profil mis à jour » sans « image » parasite.
- **Rangée d'upload** → `.accessibilityElement(children: .combine)`.

Aucun gel touché : les 3 `.system(size:)` (badge caméra 30×30, checkmark héros 48pt) restent figés par
doctrine 82i/84i (déjà commentés). Le bouton Retour reste tel quel — un `Button` regroupe déjà son contenu
en un élément lu « Retour » (le chevron symbolique n'ajoute aucun texte).

## Périmètre / non-régression

- **1 seul fichier**, 0 logique, 0 mutation d'état, 0 test neuf, **0 clé i18n neuve** (réutilisation des
  strings localisées existantes). `import MeeshyUI` déjà présent. `EditProfileViewModel` non touché.
- Aucun test ne référence `EditProfileView` → aucune régression de test.
- Compteur `accessibility` : **1 → 17**.

## Statut

**TERMINÉE** — structure VoiceOver de `EditProfileView` posée (titre + en-têtes en headers, rangées
lecture seule et champs regroupés/labellisés, icônes décoratives masquées, overlay succès annoncé).
Dynamic Type déjà soldé (non retouché). Ne plus re-flagger cette surface pour a11y de base.

---

## Analyses corrigées & complètes (ne pas reproduire)

- `EditProfileView` — VoiceOver : titre + `sectionHeader` → `.isHeader` ; `readOnlyRow` + rangée upload →
  `children: .combine` ; `editableField`/`bioField` → icône+titre masqués, `TextField` labellisé ; overlay
  succès checkmark masqué + combiné. 0 clé i18n neuve, 0 logique. Dynamic Type déjà soldé (19 `relative`,
  3 gels 82i/84i). **SOLDÉ 151i.**
