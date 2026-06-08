# Audit UI/UX Web — 2026-06-08

**Périmètre :** `apps/web/` — components, styles, locales  
**Basé sur :** main @ d3330ca (post-merge PR #336 Bandwidth Sprint D1–D4)  
**Prochaine itération :** voir `docs/plans/uiux/2026-06-08-iteration-01.md`

---

## Résumé Exécutif

| Priorité | Catégorie | Nb |
|----------|-----------|-----|
| P0 | Alt text manquant (WCAG) | ~32 images |
| P1 | Dark mode CSS hardcodé | 25+ fichiers |
| P1 | aria-label manquant (boutons icônes) | 20+ |
| P1 | Couleurs hardcodées | 85+ instances |
| P1 | Mobile CSS fond blanc hardcodé | 5 règles |
| P2 | Police mobile trop réduite (doublon CSS) | 2 blocs |
| P2 | Breadcrumbs manquants (admin) | 10+ pages |
| P2 | Toast masqués sur mobile | 1 règle |

---

## P0 — WCAG Critique

### P0-1 : Images sans attribut alt (WCAG 2.1 AA violation)
- **Fichiers :** `components/v2/PostCard.tsx` l.239, `components/v2/ImageGallery.tsx`, `components/v2/StoryViewer.tsx`, `components/v2/MediaVideoCard.tsx`, `components/v2/CommunityCarousel.tsx`, `components/conversations/ConversationSettingsModal.tsx`, `components/admin/ranking/ConversationRankCard.tsx`, `components/settings/TwoFactorSettings.tsx`
- **Problème :** ~32 `<img>` avec `alt=""` ou sans attribut `alt`
- **Fix :** Texte descriptif depuis les métadonnées disponibles, ou `role="presentation"` si décoration pure

---

## P1 — Friction Significative

### P1-1 : Dark Mode — AudioEffectsPanel et audio-effects/ (25+ instances)
- **Fichier :** `components/video-calls/AudioEffectsPanel.tsx`, `components/video-calls/audio-effects/BackSoundDetails.tsx`, `VoiceCoderDetails.tsx`, `EffectCard.tsx`
- **Problème :** `text-gray-300`, `text-gray-400`, `bg-gray-800`, `bg-gray-700` hardcodés → présupposent un fond sombre, s'écrasent en light mode
- **Fix :** 
  - `text-gray-300` → `text-gray-700 dark:text-gray-300`
  - `bg-gray-800` → `bg-gray-100 dark:bg-gray-800`
  - `bg-gray-700` → `bg-gray-200 dark:bg-gray-700`

### P1-2 : Dark Mode — MessageReadStatusDetails
- **Fichier :** `components/common/bubble-message/MessageReadStatusDetails.tsx` lignes ~70-75
- **Problème :** `text-gray-400`, `text-gray-300` sans variantes `dark:`
- **Fix :** Ajouter `dark:text-gray-600` / `dark:text-gray-500`

### P1-3 : Dark Mode — bubble-stream.css (CSS)
- **Fichier :** `styles/bubble-stream.css`
- **Problèmes :**
  - `.feed-gradient` (l.164-173) : dégradé fond blanc — invisible en dark mode
  - `.message-skeleton` (l.212-215) : `#f0f0f0` → invisible sur fond sombre
  - `.glass-effect` (l.218-222) : `rgba(255,255,255,0.25)` → fond blanc
  - `.bubble-toast` (l.225-230) : `rgba(255,255,255,0.95)` → fond blanc

### P1-4 : Dark Mode — mobile-improvements.css (fond blanc forcé)
- **Fichier :** `styles/mobile-improvements.css`
- **Lignes :** 265, 287, 294
- **Problème :** `background: white !important;` sur `.messages-container` et `.fixed.bottom-0`
- **Fix :** Remplacer par `background: hsl(var(--background)) !important;`

### P1-5 : Boutons icône sans aria-label (20+ instances)
- **Fichier :** `components/video-calls/AudioEffectsPanel.tsx` l.~98, `components/video-calls/audio-effects/CarouselNavigation.tsx`, multiples composants admin
- **Problème :** Boutons icône sans `aria-label` ni `title`
- **Fix :** Ajouter `aria-label` ou `<span className="sr-only">` dans chaque bouton

### P1-6 : Couleurs hardcodées dans les charts/composants admin
- **Fichiers :** `components/admin/ranking/RankingStats.tsx`, `components/admin/agent/AgentOverviewTab.tsx`, `components/markdown/MermaidDiagramImpl.tsx`
- **Problème :** `stroke="#d97706"`, `backgroundColor: '#fffbeb'`, `{ color: '#10b981' }` — pas de tokens design system, pas de dark mode
- **Fix :** Créer un helper `getChartColors(isDark)` qui retourne les couleurs du design system

---

## P2 — Polish / Améliorations

### P2-1 : mobile-improvements.css — doublon de réduction de taille de police
- **Fichier :** `styles/mobile-improvements.css`
- **Lignes :** 20-25 ET 378-432 — deux blocs `!important` qui réduisent `.text-base` à 0.75rem
- **Fix :** Dédupliquer, garder un seul bloc

### P2-2 : mobile-improvements.css — Toast masqués sur mobile
- **Fichier :** `styles/mobile-improvements.css`
- **Problème :** `.sonner-toaster { display: none !important; }` → toutes les notifications supprimées sur mobile
- **Impact :** Les utilisateurs mobiles ne reçoivent aucun feedback visuel (erreurs, confirmations)
- **Fix :** Repositionner le toast (bas d'écran, compact) plutôt que de le masquer complètement

### P2-3 : mobile-improvements.css — Truncation nom conversation trop agressive
- **Fichier :** `styles/mobile-improvements.css` ligne ~195
- **Problème :** `max-width: 14ch` coupe "Design System" (15 chars)
- **Fix :** `max-width: 20ch` ou `22ch`

### P2-4 : Breadcrumbs manquants / libellés hardcodés en français
- **Fichier :** `components/common/Breadcrumb.tsx`
- **Problème :** `DEFAULT_LABEL_MAP` contient 'Utilisateurs', 'Journaux d\'audit' hardcodés
- **Fix :** Déplacer dans les fichiers de traduction locales/

### P2-5 : Focus management — modals sans focus trap
- **Fichiers :** `components/common/bubble-message/ReactionSelectionMessageView.tsx`, `components/settings/`
- **Problème :** Les modals ne trappent pas le focus, ce qui permet la navigation en dehors avec Tab

### P2-6 : Emoji reactions — `select-none` bloque la sélection
- **Fichier :** `components/common/bubble-message/ReactionSelectionMessageView.tsx`
- **Problème :** `<span className="leading-none select-none">{emoji}</span>` empêche la copie

### P2-7 : Scrollbar dark mode
- **Fichier :** `styles/bubble-stream.css` lignes 80-91
- **Problème :** `background: rgba(0,0,0,0.05)` pour la scrollbar assume un fond clair

### P2-8 : Header masqué sur mobile en vue conversation
- **Fichier :** `styles/mobile-improvements.css`
- **Problème :** `.conversation-open-mobile header { display: none; }` — bouton retour et breadcrumbs inaccessibles

---

## Éléments Bien Implémentés (à préserver)

- `darkMode: ["class"]` correctement configuré dans `tailwind.config.ts` ✓
- Tokens CSS complets dans `app/globals.css` (CSS variables --background, --foreground etc.) ✓
- Skip link implémenté (globals.css) ✓
- Focus rings définis (`ring-2 ring-blue-600`) ✓
- Touch targets ≥ 44×44px sur mobile (globals.css) ✓
- `prefers-reduced-motion` respecté (globals.css l.619-640) ✓
- 4 locales complètes (EN/FR/ES/PT) avec parité de clés ✓
- Breadcrumb sémantique avec `aria-label` + `aria-current="page"` ✓
