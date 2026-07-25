# Plan Iteration-194i — `ConversationInfoSheet` tab selector VoiceOver

**Objectif** : exposer l'onglet actif du `tabSelector` de `ConversationInfoSheet` à VoiceOver (WCAG 1.4.1), sans changement visuel ni logique.

## Étapes

1. [x] Sync `main` HEAD (`dd0bc4b`), branche de travail depuis main.
2. [x] Vérifier collision essaim via `list_pull_requests` → aucune PR sur `ConversationInfoSheet`.
3. [x] Choisir numéro **194i** (strictement > 192i en vol ; 193i mergé).
4. [x] Ajouter `.accessibilityAddTraits(isSelected ? [.isSelected] : [])` sur le `Button` de l'onglet (dans `ForEach`).
5. [x] Documenter analyse + plan.
6. [x] Mettre à jour `branch-tracking.md`.
7. [ ] Commit + push branche `claude/laughing-thompson-lcomtr`.
8. [ ] Ouvrir PR (gate CI `iOS Tests`).

## Contraintes respectées

- 1 fichier, 0 clé i18n neuve, 0 logique, 0 visuel, 0 test neuf.
- Pas de `.combine` (préserve `.isButton` natif).
- Glyphe compteur `.system(size: 10)` gelé (doctrine 53i) — non touché.
- Doctrine parité : 144i / 149i / 155i / 163i / 176i.

## Review

Correctif additif d'un seul modificateur, booléen `isSelected` déjà en portée → aucun risque de compile. Le `tabSelector` est le seul sélecteur segmenté du fichier ; les 2 boutons de chrome (réglages, fermer) et le bouton « Gérer les membres » ont déjà leurs `.accessibilityLabel`. Aucune autre lacune couleur-seule dans le fichier. Statut : ✅ résolu.
