# Plan — Iteration 83i (2026-07-01) — iOS écrans légaux : Dynamic Type + parité i18n

## Objectif
Rendre les deux écrans légaux plein-texte (`TermsOfServiceView`, `PrivacyPolicyView`) accessibles
au Dynamic Type et combler l'asymétrie i18n de la date « dernière mise à jour » de Privacy, sans
changement de comportement ni de layout.

## Base de départ
`main` HEAD `efb33ca2` (resync avant démarrage ; branche `claude/upbeat-euler-qhgd0i`).
Dernière itération iOS mergée notable = **77i** (i18n `SharePickerView`, PR #1162) ; **78i**
(palette rouges) en vol. Contention forte (~24 PRs iOS ouvertes) → surface légale choisie car
disjointe de toutes.

## Étapes
1. [x] Explorer une surface iOS disjointe des ~24 PRs en vol (agent Explore) → écrans légaux
   `TermsOfServiceView` / `PrivacyPolicyView` non pris.
2. [x] Vérifier `MeeshyFont.relative` en scope (les 2 fichiers importent `MeeshyUI`).
3. [x] `TermsOfServiceView` : 7 `.font(.system(size:))` → `MeeshyFont.relative(...)` (chevron,
   libellé retour, titre, date, numéro section, titre section, corps).
4. [x] `PrivacyPolicyView` : idem 7 conversions + localiser la date codée en dur ligne 132 →
   `String(localized: "legal.privacy.lastUpdated.fr"/".en", …)` (miroir `legal.terms.lastUpdated.*`).
5. [x] Vérifier pattern defaultValue-only (aucune entrée `.xcstrings` pour `legal.terms.lastUpdated`
   → parité stricte, aucun catalogue à éditer).
6. [x] Grep de contrôle : 0 `.system(size:` restant dans les 2 fichiers ; 7+7 `MeeshyFont.relative` ;
   0 date littérale ; aucun test/snapshot ne référence ces vues.
7. [ ] Commit + push branche ; gate = CI **iOS Tests** (compile Xcode 26.1.1 + tests simu 18.2).
8. [ ] Merge dans `main` après CI verte ; supprimer la branche ; mettre à jour branch-tracking.

## Risques / points d'attention
- **`MeeshyFont.relative` préserve weight/design** → rendu identique à taille Dynamic Type par défaut
  (`.large`), scale au-delà. Zéro risque pixel à réglage standard.
- **`accentColor` hex non tokenisé** : décoratif per-écran passé en `tint:` hex-string aux API thème →
  conversion invasive et hors doctrine 78i, laissé volontairement.
- Pas de test neuf : sweep mécanique + swap i18n, couverture = compile CI.
- `PrivacySettingsView` (PR #1176) ≠ `PrivacyPolicyView` (ici) → pas de collision.

## Vérification finale
- [x] `grep` : 0 `.system(size:` ; 7/7 `MeeshyFont.relative` par fichier ; date Privacy localisée.
- [x] Aucun snapshot/test ne couvre Terms/Privacy.
- [ ] CI **iOS Tests** verte.
- [ ] Merge `main` + suppression branche + tracking mis à jour.
