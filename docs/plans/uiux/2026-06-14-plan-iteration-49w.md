# Plan — Iteration 49w (2026-06-14) — Web : i18n + dark mode du flux d'appel vidéo

## Objectif
Compléter la localisation et le dark mode de la **feature appel vidéo** côté web, en
priorisant la surface la plus visible : la **notification d'appel entrant** (`CallNotification`,
plein écran, `role="alertdialog"`), restée 100 % en anglais dur alors que le namespace
`calls.json` est déjà riche.

## Base
- Branche de travail : `claude/eager-keller-e6eq78`
- Base : `main` post-merge #628 (`2c65d379`)

## Étapes
1. **Locales** — ajouter `calls.incoming.*` (videoCall/subtitle/accept/decline/acceptLabel/
   declineLabel) et `calls.waiting.*` (forParticipant/noVideo) dans les 4 fichiers
   `locales/{en,fr,es,pt}/calls.json`. ✅
2. **CallNotification.tsx** — `import { useI18n }` + `const { t } = useI18n('calls')` ;
   remplacer les 6 chaînes dures (texte + aria-labels) par `t('calls.incoming.*')` ;
   ajouter les variantes `dark:` aux boutons accepter/refuser. ✅
3. **VideoCallInterface.tsx** — remplacer les 3 fallbacks durs (`Waiting for participant...`,
   `Connecting...`, `No video`) par `t('calls.waiting.forParticipant')`,
   `t('calls.status.connecting')` (clé existante), `t('calls.waiting.noVideo')`. ✅
4. **Validation** — JSON parse OK ×4 ; cohérence du pattern `useI18n('calls')` +
   `t('calls.…')` avec l'existant ; CallNotification confirmé vivant (rendu par CallManager). ✅
5. **Docs** — analyse `2026-06-14-iteration-49w.md`, ce plan, mise à jour `branch-tracking.md`. ✅
6. **CI + merge** — pousser, attendre CI verte (lint/type-check/tests web), merger dans `main`.

## Vérification
- `node -e JSON.parse` sur les 4 calls.json → OK.
- Aucune nouvelle dépendance ; aucune signature de type modifiée (`useI18n` renvoie `{ t }`).
- Risque : minimal (chaînes + classes Tailwind + clés i18n additives).

## Fichiers touchés
- `apps/web/locales/{en,fr,es,pt}/calls.json`
- `apps/web/components/video-call/CallNotification.tsx`
- `apps/web/components/video-calls/VideoCallInterface.tsx`
- `docs/analyses/uiux/2026-06-14-iteration-49w.md`
- `docs/plans/uiux/2026-06-14-plan-iteration-49w.md`
- `docs/plans/uiux/branch-tracking.md`
