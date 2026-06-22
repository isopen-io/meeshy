# Plan — Itération 60wc (web only) : i18n du cluster admin/agent

## Base
- Repartir de `main` HEAD `9857819` (post-#799/#796/#779). Resynchronisée ensuite sur
  `7f4f093` (post-#806 config-modal 60w + #808 auth anti-pattern 60wb — double
  collision absorbée).
- Branche de travail : `claude/practical-fermat-iuu5e3`.

## Contexte
- Routine déclenchée par fermeture (merge) de **PR #799** (iter-59w ImageLightbox).
- **Double collision** : #806 (60w config-modal) puis #808 (60wb auth anti-pattern)
  mergés en parallèle. Surfaces disjointes de la mienne → renumérotée **60wc**.
- Revue analyses + plans : clusters feed/reels (53w), modales (58w/#792/#796/#779),
  rouge erreur (56wb), ImageLightbox (59w), OTP (59w), config-modal (60w/#806),
  anti-pattern auth (60wb/#808) **tous soldés**. Pas de doublon web détecté.
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
3. [x] `ConversationPicker.tsx` : `t` ajouté au destructuring + 6 swaps (noResults `{term}`).
4. [x] `AgentRolesSection.tsx` : 9 swaps (origin ×3, count `{count}`, …).
5. [x] Vérif : grep FR = 0 ; JSON valide ×4 ; parité 40 clés ; aucun test impacté.
6. [x] Annoter analyse `2026-06-22-iteration-60wc.md` + `branch-tracking.md`.
7. [x] Commit + push ; PR #811 ; **CI verte** (Test web ✅, Build bun ✅, toutes suites).
8. [ ] Résoudre double collision (60w→60wb→60wc, merge des entrées tracking) ; merger
   `main` ; supprimer la branche.

## Contraintes / décisions
- Fallbacks EN 2e arg pour chaînes simples (leçon 50w — même signature native que le
  fix 60wb/#808) ; interpolation via params object (exclusif du fallback string).
- Namespace `admin` réutilisé (les 3 composants font déjà `useI18n('admin')`).
- `ConversationPicker` défaut prop EN `placeholder` surchargé par appelants — laissé tel quel.
- Aucune autre frontend (iOS/Android hors périmètre).

## Leçon collision (renforcée — DOUBLE collision ce run)
Deux agents parallèles ont pris le même numéro (60w puis 60wb) sur des surfaces
disjointes pendant ce run. Règle : `git fetch origin main` + check PR ouvertes AVANT
de coder ; surface orthogonale ; au merge, si le numéro est déjà pris → renuméroter au
suffixe lettre suivant (60w→60wb→60wc), conserver les analyses disjointes, résoudre les
`add/add` doc en **renommant le sien** (jamais écraser l'autre).

## Suite (61w+)
- Anti-pattern `t()||fallback` restant (~270 occ hors auth) → lots bornés.
- `Badge` v2 variants off-palette → arbitrage `theme.colors.*` vs `gp-*`.
- `PhoneResetFlow.tsx:490`, `AttachmentPreviewReply.tsx:205-206` (FR résiduels).
- Épuration `_archived/` ; console.error FR ; `next-themes` orphelin ;
  `app/settings/loading.tsx` (i18n server-side).

## Merge
PR #811 vers `main` ; après merge : mettre à jour `branch-tracking.md` (60wc mergée,
base suivante = `main` HEAD) + supprimer la branche.
