# Plan — Iteration-230i : `ForwardPickerSheet`, nom prononcé = nom affiché

**Analyse** : `docs/analyses/uiux/2026-08-20-iteration-230i-forwardpicker-spoken-name.md`
**Base** : `main` HEAD `3ccd8a72` · **Branche** : `claude/intelligent-noether-kana7q`

## Objectif

Rendre impossible la divergence entre le nom **affiché** d'une cible de
transfert et le nom **prononcé** par VoiceOver / Voice Control sur ses boutons
d'action.

## Étapes

- [x] Resync sur `origin/main` HEAD `3ccd8a72` ; numéro 230i choisi strictement
      au-dessus du plus haut mergé (229i) ; collision essaim vérifiée
      (`list_pull_requests` → PR iOS #3217, 0 fichier commun)
- [x] Retirer le paramètre `a11yName` de `ForwardPickerRow` (propriété, terme
      de `==`, argument du site d'appel)
- [x] Composer les deux libellés depuis `name` via deux helpers purs statiques
      (`sendAccessibilityLabel(name:)`, `retrySendAccessibilityLabel(name:)`)
- [x] Supprimer la clé morte `forward.this-conversation` du catalogue app
      (47 lignes, suppression chirurgicale, JSON revalidé)
- [x] Mettre à jour `ForwardPickerRowEquatableTests` (l'argument y valait déjà
      `name`)
- [x] Ajouter `ForwardPickerSpokenNameTests` — 5 tests de comportement sur les
      helpers + 1 test de câblage du site d'appel
- [x] Contrôles déterministes hors Xcode (équilibre syntaxique, clés catalogue,
      absence de référence résiduelle)
- [x] Documenter analyse + plan + pointeur de tracking
- [ ] Gate réel : CI `iOS Tests`

## Non-fait, et pourquoi

- **Exposition VoiceOver du tap de ligne** (multi-sélection) : demande un
  simulateur et un arbitrage — l'avatar de la rangée porte son propre
  `onMoodTap`, qu'un `Button` englobant supprimerait. Reporté en 231i+.
- **Pluralisation de `forward.members-count`** : défaut i18n réel mais d'une
  autre famille (conversion catalogue en `variations.plural`), qui mérite son
  itération. Reporté en 231i+.

## Empreinte

| | |
|---|---|
| Fichiers production | 1 (`ForwardPickerSheet.swift`) |
| Fichiers test | 1 modifié, 1 neuf |
| Catalogue | −1 clé (`forward.this-conversation`) |
| Clés i18n neuves | 0 |
| Changement visuel | 0 |
| Logique / réseau / SDK | 0 |
