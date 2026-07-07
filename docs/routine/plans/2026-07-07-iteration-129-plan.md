# Iteration 129 — Plan d'implémentation (2026-07-07)

## Objectives
Rendre la déduplication des traductions par langue **ordre-indépendante** et **pilotée par la qualité du
modèle** dans `apps/web/hooks/use-message-translations.ts` : garantir que le Prisme affiche toujours la
meilleure traduction disponible (premium > medium > basic), la récence ne départageant que les ex æquo.

## Affected modules
- `apps/web/hooks/use-message-translations.ts` — prédicat de remplacement du dedup (`processMessageWithTranslations`).
- `apps/web/__tests__/hooks/use-message-translations.test.tsx` — cas de régression.

## Implementation phases
1. **RED** — ajouter deux tests :
   - premium ancien + basic récent (même langue) → contenu affiché = premium, 1 seule traduction `fr`.
   - medium ancien + basic récent → contenu = medium (rang intermédiaire respecté).
   Confirmer l'échec avec le prédicat actuel.
2. **GREEN** — remplacer la disjonction plate par un tri lexicographique `(rang qualité, timestamp)` via
   un helper local `rankOf(model)`. Supprimer le proxy `confidence < 0.95`.
3. **REFACTOR** — aucun (fix minimal, helper local pur).

## Dependencies
Aucune. Fonction pure ; `TranslationModel` déjà importé dans le fichier.

## Estimated risks
Minimal. Prédicat localisé. Cas existants préservés :
- dedup intra-tier (récence) inchangé (rang égal → timestamp).
- upgrade basic→premium inchangé (rang supérieur → remplace).

## Rollback strategy
Revert du commit (2 fichiers, aucun état persistant, aucune migration).

## Validation criteria
- [x] RED→GREEN prouvé (cas premium-ancien/basic-récent : `basic` avant fix, `premium` après ;
      medium-ancien/basic-récent : `basic` avant, `medium` après).
- [x] `use-message-translations.test.tsx` intégralement vert (45/45).
- [x] Zéro régression sur les cas dedup existants (`deduplicate by language`, `prefer premium over basic`).
- [x] `tsc --noEmit` : 0 erreur introduite sur `hooks/use-message-translations.ts`.

## Completion status
**COMPLET** — F89 (variante web) fermé.

## Progress tracking
- [x] Analyse rédigée (`analyses/2026-07-07-iteration-129-analyse.md`).
- [x] Plan rédigé (ce fichier).
- [x] Implémentation + tests (45/45 verts).
- [ ] Commit + push + PR.

## Future improvements
- **F90** (backlog) : `routes/conversations/messages.ts` — pagination translation-body sur préfixe fixe
  `take: 200` peut omettre des matches anciens ; pousser le filtre en DB / keyset.
