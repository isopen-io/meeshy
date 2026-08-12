# Plan de correction — Itération 71w (Web)

> Cible : `apps/web` uniquement. Branche : `claude/practical-fermat-q6pzw2`.
> Thème : a11y clavier des badges-bascule de la config agent admin (WCAG 2.1.1 / 4.1.2 / 2.4.7 + 1.4.1).

## Problème
Deux grappes de `<Badge onClick>` (un `<span>` stylé `cursor-pointer`) servent de **bascules multi-sélection** dans la configuration d'agent admin, sans aucun support clavier ni état accessible :
1. `AgentConfigDialog.tsx` — rôles exclus (`USER`/`ADMIN`/`MODO`/`AUDIT`/`ANALYST`/`BIGBOSS`).
2. `AgentGlobalConfigTab.tsx` — types de conversation éligibles (`group`/`channel`/`public`/`global`/`broadcast`).
Manques : `role`, `tabIndex`, `onKeyDown` (Enter/Space), `aria-pressed`. L'état n'est porté que par la couleur (échec WCAG 1.4.1).

## Correction (minimale, motif établi 67w–69w)
Pour chaque badge-bascule :
- `role="button"` (un `<span>` n'a aucun rôle implicite) ;
- `tabIndex={0}` (entre dans la séquence de tabulation → **active l'anneau `focus-visible` déjà présent** dans la base CVA de `ui/badge.tsx`) ;
- `aria-pressed={<état actif>}` (expose l'état exclu/éligible au lecteur d'écran) ;
- `onKeyDown` : Enter / Space → `preventDefault()` puis bascule ;
- `focus-visible:outline-none` (laisse l'anneau thématique remplacer l'outline navigateur) ;
- `AgentConfigDialog` : extraire la bascule en `toggleRole()` partagée clic/clavier (DRY).

**Zéro nouvelle clé i18n** : nom accessible = texte visible (`fTypeLabel` existant ×4 locales / identifiant de rôle verbatim). `aria-pressed` porte l'état.

## Fichiers touchés
- `apps/web/components/admin/agent/AgentConfigDialog.tsx` (badges rôles exclus)
- `apps/web/components/admin/agent/AgentGlobalConfigTab.tsx` (badges types éligibles)
- `apps/web/__tests__/components/admin/agent/AgentConfigDialog.test.tsx` (mock Badge `...rest` + 3 cas clavier)
- `apps/web/__tests__/components/admin/agent/AgentGlobalConfigTab.test.tsx` (mock Badge `...rest` + 4 cas clavier)
- `docs/analyses/uiux/2026-06-30-iteration-71w.md`, ce plan, `branch-tracking.md`

## Tests
- Exposition `role=button` / `tabindex=0` / `aria-pressed` (actif vs inactif).
- Bascule via **Enter** et via **Space** (vérifie `data-variant` + `aria-pressed`).
- No-op sur touche neutre (`Tab`).
- Parité **clic** souris : cas existants conservés verts.
- Exécution déléguée CI (`Test web` + `Quality (bun)`) — `node_modules` absent localement (idem 67w–70w).

## Orthogonalité (anti-collision agents parallèles)
Surface `components/admin/agent/` **non touchée** par les PR web en vol : #1084 (create-link sections), #1091 (timeline audio), #1092 (`GroupCard`), #1088 (`PhoneResetFlow`). Aucune collision de fichier ni de clé i18n.

## Gate de merge
- `Quality (bun)` vert (lint + typecheck) **obligatoire**.
- Suites spécifiques `AgentConfigDialog` + `AgentGlobalConfigTab` vertes dans `Test web`.
- `Test web`/`Test shared` globaux : si rouge, vérifier que l'échec est **pré-existant** (hors `admin/agent/`) avant merge — cf. notes `branch-tracking.md`.
