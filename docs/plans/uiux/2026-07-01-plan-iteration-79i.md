# Plan — Iteration 79i (2026-07-01) — iOS i18n + Dynamic Type `CrashReportSheet`

## Objectif
Localiser le chrome français/anglais figé du parcours « rapport de crash » (feuille
`CrashReportSheet` + toast one-shot dans `MeeshyApp`), rendre les polices figées scalables
(Dynamic Type), et unifier les libellés de type de crash sur une **source unique**
(`CrashDiagnostic.Kind.localizedLabel`).

## Base de départ
`main` HEAD `9efc7c6a` (resync avant démarrage ; branche `claude/upbeat-euler-6y1up3`).
Dernière itération iOS mergée = **78i** (épuration palette rouges → `MeeshyColors.error`,
commit `04007bfc`) ; **77i** (i18n `SharePickerView`, PR #1162).

## Constat
Le parcours crash (visible en prod — configs `Staging`/`Production` avec crash reporting)
affichait du **texte figé non traduit** et **dupliqué** entre deux sites :
- `CrashReportSheet.swift` : `navigationTitle("Crash Reports")` (anglais même en FR),
  `Button("Fermer")`, badge `("Exception"/"Crash"/"Blocage"/"CPU"/"Disque")`, +
  polices figées `.system(size: 10/11/14)` (pas de Dynamic Type).
- `MeeshyApp.swift` (toast) : switch dupliqué `("Exception"/"Crash"/"Blocage"/"Pic CPU"/
  "Ecriture disque")` + gabarit `"\(kind) precedent\(extra) : \(summary)"` (français ASCII).

Les deux switchs de libellés **divergeaient déjà** (« CPU » vs « Pic CPU », « Disque » vs
« Ecriture disque ») → dette de duplication à résorber.

## Étapes
1. [x] Ajouter 7 clés à `Localizable.xcstrings` ×5 langues (fr/en/es/de/pt-BR),
   ordre du catalogue préservé (append, 0 réordonnancement) :
   `crash.kind.{exception,crash,hang,cpu,disk}`, `crash.reports.title`,
   `crash.toast.previous` (format positionnel `%1$@`/`%2$@`/`%3$@`).
2. [x] SSOT : `extension CrashDiagnostic.Kind { var localizedLabel: String }` dans
   `CrashDiagnosticsManager.swift` → un seul jeu de libellés pour toast + badge.
3. [x] `CrashReportSheet` : `navigationTitle` → `crash.reports.title` ; `Button` → `common.close` ;
   badge label → `kind.localizedLabel` (couleur regroupée par sévérité, mapping inchangé) ;
   polices → `.caption2` / `.subheadline.weight(.medium)` / `.caption2.monospaced()` /
   `.caption2.weight(.bold)` (Dynamic Type).
4. [x] `MeeshyApp` : suppression du switch dupliqué → `mostRecent.kind.localizedLabel` +
   `String(format: String(localized: "crash.toast.previous", …), kind, extra, summary)`.
5. [x] Vérifier absence de résidu français hors `String(localized:)` (grep).
6. [ ] Commit + push branche + PR ; gate = CI `ios-tests.yml` (compile Xcode 26.1 + tests 18.2).
7. [ ] Merge dans `main` après CI verte ; mettre à jour branch-tracking.

## Risques / points d'attention
- **Unification toast** : le toast dit désormais « CPU »/« Disque » au lieu de « Pic CPU »/
  « Ecriture disque » → léger raccourcissement, mais cohérence badge↔toast et SSOT. Acceptable.
- **Couleur badge** : regroupement `nsException,crash→error` / `hang,cpuException→warning` /
  `diskWriteException→info` — identique au mapping d'origine (aucun changement de couleur).
- **`localizedLabel` sur type `nonisolated`** : `String(localized:)` est non-isolé/Sendable-safe,
  lu uniquement depuis des contextes MainActor (View + toast) → aucun souci de concurrence.
- Pas de test neuf : swap mécanique + extraction SSOT, aucune logique métier modifiée ;
  aucun test n'assertait sur ces libellés (grep vérifié). Couverture = compile CI.

## Vérification finale
- [x] `grep` : 0 littéral français/chrome figé hors `defaultValue` d'un `String(localized:)`.
- [x] JSON `Localizable.xcstrings` valide (roundtrip Python) ; diff = +238 lignes, 0 suppression.
- [ ] CI `ios-tests.yml` verte.
- [ ] Merge `main` + tracking mis à jour.
