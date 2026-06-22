# Plan — Itération 60wb (web only) : i18n du cluster admin/agent

## Base
- Repartir de `main` HEAD `9857819` (post-merge #799 iter-59w + #796 focus-trap +
  #779 inert ConversationDrawer). Resynchronisée ensuite sur `09b7a84` (post-#806
  iter-60w config-modal — collision absorbée).
- Branche de travail : `claude/practical-fermat-iuu5e3`.

## Contexte
- Routine déclenchée par fermeture (merge) de **PR #799** (iter-59w ImageLightbox).
- **Collision** : un agent parallèle a mergé `60w` (#806, config-modal i18n) en cours
  de run. Surface disjointe → renumérotée **60wb**, les deux conservées.
- Revue analyses + plans : clusters feed/reels (53w), modales hand-rolled
  (58w/#792/#796/#779), rouge erreur (56wb), ImageLightbox (59w), OTP (59w),
  config-modal (60w/#806) **tous soldés**. Pas de doublon web détecté.
- Audit surfaces live → cluster **admin / agent** non internationalisé (3 composants,
  22 chaînes FR figées, rupture Prisme rendue en TOUTES langues).

## Objectif
i18n des 3 composants `components/admin/agent/{AgentConversationsTab,
ConversationPicker,AgentRolesSection}.tsx` sous le namespace existant `admin`.

## Étapes
1. [x] Injecter **40 clés ×4 locales** sous `agent` dans `locales/{en,fr,es,pt}/admin.json`
   (`conversationsTab.*` 8 + `columns.*` 8 ; `conversationPicker.*` 5 ;
   `rolesSection.*` 7 + `origin.*` 3). Diff strictement additif (parité 268 ×4).
2. [x] `AgentConversationsTab.tsx` : 15 swaps `t('agent.conversationsTab...')`.
3. [x] `ConversationPicker.tsx` : `t` ajouté au destructuring + 6 swaps
   (dont noResults interpolé `{term}`).
4. [x] `AgentRolesSection.tsx` : 9 swaps (origin ×3, count interpolé `{count}`, …).
5. [x] Vérif : grep FR = 0 ; JSON valide ×4 ; parité 40 clés ; aucun test impacté.
6. [x] Annoter analyse `2026-06-22-iteration-60wb.md` + `branch-tracking.md`.
7. [x] Commit + push ; PR #811 ; **CI verte** (Test web ✅, Build bun ✅, toutes suites).
8. [ ] Résoudre collision (renum 60w→60wb, merge des entrées tracking) ; merger `main` ;
   supprimer la branche.

## Contraintes / décisions
- Fallbacks EN en 2e arg pour chaînes simples (leçon 50w) ; interpolation via params
  object (exclusif du fallback string par la signature `t()`).
- Namespace `admin` réutilisé (les 3 composants font déjà `useI18n('admin')`).
- `ConversationPicker` défaut prop EN `placeholder` surchargé par appelants — laissé tel quel.
- Aucune autre frontend (iOS/Android hors périmètre).

## Leçon collision (renforcée ce run)
`git fetch origin main` + check PR ouvertes AVANT de coder ; surface orthogonale ;
en cas de PR jumelle déjà mergée sur le **même numéro** mais **surface disjointe** →
renuméroter au suffixe lettre (60w→60wb), conserver les deux, ne JAMAIS écraser le
fichier doc de l'autre (résoudre `add/add` en renommant le sien).

## Suite (61w+)
- `Badge` v2 variants off-palette → arbitrage `theme.colors.*` vs `gp-*`.
- `PhoneResetFlow.tsx:490`, `AttachmentPreviewReply.tsx:205-206` (FR résiduels).
- Épuration `_archived/` ; console.error FR ; `next-themes` orphelin ;
  `app/settings/loading.tsx` (i18n server-side).

## Merge
PR #811 vers `main` ; après merge : mettre à jour `branch-tracking.md` (60wb mergée,
base suivante = `main` HEAD) + supprimer la branche.
