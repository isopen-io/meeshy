# Plan — Iteration 221i · LinksHubView : les cartes retrouvent une surface en mode clair

**Date** : 2026-07-26
**Branche** : `claude/quirky-curie-v9zcp4` (220i rebasée sur `origin/main` HEAD `16f8197`, 221i par-dessus)
**Analyse** : `docs/analyses/uiux/2026-07-26-iteration-221i-linkshubview-darkmode.md`

## Contexte de branche

220i (`StatusComposerView` → `NavigationStack` + a11y du bouton Publier) est **poussée mais
non mergée** — aucune PR n'a pu être ouverte, les outils GitHub restant indisponibles dans
la session. La branche portait donc 1 commit non mergé : conformément à la règle
« garder les commits non mergés, les rebaser sur la nouvelle base », 220i a été **rebasée**
sur `main` HEAD `16f8197` (rebase propre, 0 conflit) et 221i est empilée dessus.

## Objectif

Solder le seul survivant de la classe de défaut Dark Mode ouverte par 219i.

## Étapes

- [x] Fetch `main` (`ffef133` → `16f8197`), constater que 220i n'est pas mergée
- [x] Rebaser 220i sur `16f8197` (propre), vérifier que ses 6 assertions tiennent toujours
- [x] **Balayage Dark Mode** passe 1 — jetons de marque clairs sans lecture du mode → **0 résultat**
      (classe 219i épuisée : les 2 candidats reçoivent `isDark` en paramètre)
- [x] **Balayage Dark Mode** passe 2 — surfaces neutres translucides inconditionnelles :
      24 sites, 22 légitimes (substrats forcés sombres, bulles accentuées, zone de silence
      du QR code 2FA), **2 défauts** dans `LinksHubView`
- [x] Mesurer le défaut : contraste `1,00000:1` au haut du dégradé (no-op exact),
      delta **0/255 sur 3 canaux aux 3 arrêts** après quantification
- [x] Mesurer les liserés (1,15–1,36:1 contre 3:1 exigés par WCAG 1.4.11) — **constaté et
      documenté, pas corrigé** : c'est une décision de design → piste 222i
- [x] **RED** : vérifier que la garde de source échoue sur `main` et que `LinksHubPalette`
      y est absent
- [x] Extraire `LinksHubPalette.cardFill(isDark:)` (idiome `StoryExportSheetPalette`, 219i)
- [x] Brancher les 2 sites (l.103 bannière, l.226 carte ×4) ; `isDark` redevient vivante
- [x] Suite neuve `LinksHubPaletteTests` — 8 tests **mesurant le contraste réel**
      (défaut ×2, correctif ×2, parité sombre canal par canal, lift sombre ×2, divergence,
      garde de source)
- [x] **GREEN** : 8/8 assertions numériques recalculées indépendamment hors Xcode
- [x] Tokenizer accolades / parenthèses / crochets sur les 2 fichiers → 0/0/0
- [x] Vérifier la classification de phase (`LinksHubPaletteTests` → phase 1, correct)
- [x] Documenter analyse + plan, mettre à jour `branch-tracking.md`
- [x] Commit + push
- [ ] PR : **toujours impossible depuis cette session** (ni MCP GitHub ni `gh`) — la branche
      porte désormais **2 itérations** (220i + 221i), l'ouverture revient au mainteneur ou
      à l'automation

## Contraintes respectées

- **0 changement en mode sombre** — branche sombre = expression d'origine mot pour mot,
  verrouillée canal par canal (tolérance 1/255).
- **0 valeur inventée** — convergence sur le jeton déjà posé sur 15 sites, dont les
  3 écrans de destination des cartes.
- **0 clé i18n** (aucune chaîne touchée), 0 logique, 0 réseau, 0 layout.
- **0 édition de `project.pbxproj`** — test neuf capté par `xcodegen generate`.

## Gate

CI `iOS Tests` (environnement Linux sans toolchain Xcode ; fourchette normale 22–35 min).
