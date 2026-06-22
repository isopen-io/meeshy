# Plan — Itération 58w (web only)

**Objectif** : doter les deux modales hand-rolled restantes (différé 56wb) des
gestes de fermeture standard (Escape + backdrop) et de la sémantique a11y de
dialogue, en miroir du composant canonique `v2/Dialog.tsx`.

## Fichiers touchés
1. `apps/web/components/v2/ConversationDrawer.tsx` (user-facing)
2. `apps/web/components/admin/agent/AgentTopicEditModal.tsx` (admin)
3. `apps/web/locales/{en,fr,es,pt}/admin.json` (+1 clé `closeAriaLabel`)

## Étapes
1. [x] Lire le pattern canonique `v2/Dialog.tsx` (Escape + role/aria-modal + backdrop)
2. [x] `ConversationDrawer` : `useEffect` Escape (gardé `isOpen`) ;
       `role="dialog"`/`aria-modal`/`aria-labelledby`/`aria-hidden` ; id sur `<h2>`
3. [x] `AgentTopicEditModal` : `useEffect` Escape (gardé `!saving`) ;
       backdrop click (`e.target === e.currentTarget` + `!saving`) ;
       `role="dialog"`/`aria-modal`/`aria-labelledby` ; id sur `<h3>` ;
       `aria-label` sur bouton close
4. [x] Clé i18n `admin.agent.topicEditModal.closeAriaLabel` ×4 locales
5. [x] `tsc --noEmit` 0 erreur sur les 2 fichiers ; JSON valides ×4
6. [ ] Commit + push branche ; PR ; CI vert → merge dans `main`
7. [ ] Mettre à jour `branch-tracking.md` (base = main HEAD post-58w)

## Contraintes
- Ne PAS fermer pendant `saving` (modale admin) — éviter d'interrompre un
  enregistrement réseau en cours
- Préserver le comportement backdrop préexistant de `ConversationDrawer`
- i18n : pas de FR figé, fallback natif du `t()` ; parité 4 locales
