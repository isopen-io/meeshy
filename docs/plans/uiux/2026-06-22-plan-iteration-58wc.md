# Plan — Itération 58wc (web only)

**Objectif** : i18n du chrome admin agent (Prisme) — surface non couverte par les PRs 58w parallèles.

## Périmètre
- `apps/web/components/admin/agent/AgentConversationsTab.tsx`
- `apps/web/components/admin/agent/AgentRolesSection.tsx`
- `apps/web/locales/{en,fr,es,pt}/admin.json` (additif)

## Étapes
1. [x] Détecter les chaînes FR/anglaises dures (visible + `title` + `aria-label` + `confirm`).
2. [x] Câbler chaque chaîne sur `t('agent.{roles,conversations}.*')` (hook `useI18n('admin')` déjà présent).
3. [x] Supprimer `TYPE_LABELS` module-level → résolution dynamique avec fallback type brut.
4. [x] Ajouter blocs locale `admin.agent.roles` + `admin.agent.conversations` ×4 (parité stricte, fallbacks EN, interpolation native).
5. [x] Vérifier : 0 résidu, 0 référence orpheline, parité locale, JSON valide.
6. [ ] `tsc` web vert (après `bun install`).
7. [ ] Commit + push sur branche assignée ; PR ; CI vert ; merge dans `main`.
8. [ ] Mettre à jour `branch-tracking.md` (base, history, carry-over).

## Hors périmètre (différé 58wc+)
- `AgentOverviewTab.tsx` placeholders `ID conversation/utilisateur (24 hex)`.
- Audit i18n du reste de `components/admin/agent/` (par petits lots).

## Risques
- Faible : swaps de chaînes sur une fonction `t` déjà importée et utilisée dans les mêmes fichiers.
- Diffs locale additifs (round-trip byte-identique vérifié) → pas de régression sur les clés existantes.
