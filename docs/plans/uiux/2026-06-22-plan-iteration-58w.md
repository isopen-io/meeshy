# Plan — Itération 58w (web)

**Objectif** : solder le cluster déféré « gestes/a11y modales hand-rolled » (56wb)
en ajoutant le geste standard de dismiss clavier (Escape) et les rôles ARIA
dialog aux deux surfaces bornées restantes.

## Base
- Branche : `claude/practical-fermat-6hb69o` (depuis `main` HEAD post-#780/#778)
- Suffixe `w` = itération web.

## Étapes
1. [x] `ConversationDrawer.tsx` : handler Escape (keyé `isOpen`, idem `v2/Dialog`)
       + `role="dialog"`/`aria-modal`/`aria-hidden={!isOpen}`/`aria-label`
       (réutilise `conversations.drawer.title`, pas de clé neuve).
2. [x] `AgentTopicEditModal.tsx` : import `useEffect` + handler Escape (garde
       `!saving`) + `role="dialog"`/`aria-modal`/`aria-label` overlay
       + `aria-label` sur le bouton X.
3. [x] Clé i18n `admin.agent.topicEditModal.closeAriaLabel` ×4 locales.
4. [x] `tsc --noEmit` (apps/web) : 0 erreur sur les fichiers touchés.
5. [x] JSON locales valides + parité de clé.
6. [x] Annoter 56wb (déféré soldé) + analyse 58w.
7. [ ] Commit, push, PR, CI vert, merge dans `main`.
8. [ ] Mettre à jour `branch-tracking.md` (base suivante = main post-58w).

## Hors périmètre (déféré 59w+)
- Focus trap uniforme sur les modales hand-rolled.
- `PostsFeedScreen.tsx` i18n (large).
- Arbitrage `Badge` hexes off-palette.
