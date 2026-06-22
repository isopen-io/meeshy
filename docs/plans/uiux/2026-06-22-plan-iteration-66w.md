# Plan de correction — Itération 66w (web)

**Cible** : `apps/web/app/links/tracked/[token]/page.tsx` (page deep-link stats lien suivi)
**Classe** : anti-pattern i18n `t('key') || 'fallback'` + clés manquantes (rupture Prisme)

## Contexte
Pivot après fermeture de #867 (ConversationSettingsModal, doublon de #864/iter-65w).
Itération **66w** (64w=magic-link #857, 65w=ConvSettingsModal #864 pris).

## Étapes
- [x] Réinitialiser la branche sur `main` HEAD `ab3c03e` (abandon du delta superseded)
- [x] Re-survey de l'anti-pattern sur le nouveau `main` ; choix d'une cible orthogonale obscure
- [x] Vérifier le wiring `useI18n('links')` + existence des clés sous `links.tracking.*`
- [x] Identifier 7 clés `errors.*` absentes des 4 locales + 1 chaîne FR codée en dur (l.234)
- [x] Ajouter 8 clés ×4 locales (`errors.*` ×7 + `details.unexpectedError`), parité stricte
- [x] Transformer les 15 `t(k) || 'FR'` → `t(k, 'EN')`
- [x] Grep résiduel = 0 ; parité JSON symdiff = 0
- [x] Test `page.test.tsx` vert (30 passed / 8 skipped)
- [ ] Commit + push ; PR ; CI verte
- [ ] Merge `main` ; MAJ `branch-tracking.md` ; suppression de branche

## Garde-fous
- Surface orthogonale aux PR en vol (#855–#860, #864, #857)
- `verify-phone` évité (cible contendue désignée comme « suivante »)
- Pas de nouvel import/namespace ; 1 composant + 4 locales
