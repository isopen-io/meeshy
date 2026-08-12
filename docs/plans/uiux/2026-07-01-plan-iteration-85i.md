# Plan — Iteration 85i (2026-07-01) — iOS Dynamic Type + VoiceOver « Messages favoris »

## Objectif
Rendre `StarredMessagesView` (écran favoris cross-conversation) accessible :
Dynamic Type sur toutes les polices (sauf héros décoratif) + navigation VoiceOver
de la ligne tappable + menu toolbar nommé, sans changer le layout ni la logique.

## Base de départ
`main` HEAD `deb81adf` (resync avant démarrage ; branche `claude/upbeat-euler-12c1yn`).
Dernière itération iOS mergée = **78i** (palette rouges → `MeeshyColors.error`, commit
`04007bfc`). PRs iOS en vol au démarrage : ~25 (78ib→84i) — surface `StarredMessagesView`
**libre** (vérifié `list_pull_requests`).

## Étapes
1. [x] Explorer les surfaces iOS non prises (agent Explore) → shortlist ;
   `StarredMessagesView` = pick #1 (fort engagement, orthogonal, 1 fichier).
2. [x] Lire la vue + `StarredMessageSnapshot` ; confirmer `MeeshyFont.relative` public
   dans `MeeshyUI` (importé) et absence de snapshot test couvrant la vue.
3. [x] Migrer 8 `.font(.system(size:))` → `MeeshyFont.relative(...)` (weight/design
   préservés) ; **garder figé** l'icône héros `star.circle` 56 pt + `accessibilityHidden`.
4. [x] Ligne `StarredRow` : `.accessibilityElement(children: .combine)` +
   `.accessibilityAddTraits(.isButton)` + `.accessibilityHint(row.hint)` +
   `.accessibilityAction { navigate }` (rend le double-tap VoiceOver fonctionnel).
5. [x] Menu toolbar `ellipsis.circle` : `.accessibilityLabel(more_options)`.
6. [x] Ajouter 2 clés au String Catalog `Localizable.xcstrings` ×5 langues
   (`starred.messages.row.hint`, `starred.messages.more_options`) ; JSON revalidé.
7. [x] Grep de contrôle : 1 seule `.system(size:)` restante (héros 56 pt volontaire).
8. [ ] Commit + push branche ; gate = CI `ios-tests.yml`.
9. [ ] Merge dans `main` après CI verte ; supprimer la branche ; mettre à jour tracking.

## Risques / points d'attention
- **`MeeshyFont.relative`** : mappe la taille legacy vers le `TextStyle` relatif le
  plus proche → léger réajustement de taille par défaut mais scaling correct. Aucun
  snapshot ne couvre la vue (infra limitée à Timeline) → pas de baseline à régénérer.
- **`.accessibilityElement(children: .combine)`** : regroupe les textes ; les glyphes
  SF sans label sont ignorés → lecture propre. L'`onTapGesture` sighted reste intact ;
  `.accessibilityAction` couvre le chemin VoiceOver.
- **Catalog** : insertion textuelle à l'ancre alphabétique (`splash.tagline` →
  `status.online`) pour un diff minimal (le re-dump Python réordonnerait les clés à
  caractères spéciaux — collation Xcode ≠ codepoint). JSON validé par `json.load`.
- Pas de test neuf : modifiers déclaratifs + swap de token ; couverture = compile CI.

## Vérification finale
- [x] `grep` : 8 `MeeshyFont.relative`, 1 `.system(size: 56)` (héros), 5 modifiers a11y.
- [x] `Localizable.xcstrings` valide (1006 clés) ; 2 nouvelles clés ×5 langues.
- [ ] CI `ios-tests.yml` verte.
- [ ] Merge `main` + suppression branche + tracking mis à jour.
