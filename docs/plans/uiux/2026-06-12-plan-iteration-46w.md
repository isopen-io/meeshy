# Plan — Iteration 46w (2026-06-12) — Web only

Analyse source : `docs/analyses/uiux/2026-06-12-iteration-46w.md`
Base : `main` post-#597/#604, branche `claude/elegant-noether-09t4x2`.

## 1. Hygiène documentaire
- [x] Purger le carry-over web des 3 items déjà corrigés (debug.tsx, AgentArchetypesTab,
      BackSoundDetails) — vérification code à l'appui
- [x] Footers de complétion : analyses 6, 8 (#XXX corrigé), 24, 40, 41, 43, 45 ;
      enrichissement 42/42b/44b/45i/45w avec PR mergées → 36/36 analyses annotées

## 2. i18n surface v2 (clés `components.json` ×4 locales en/fr/es/pt)
- [x] `commentComposer.*` (7 clés) → CommentComposer : replyingTo, cancelReply,
      reply/commentPlaceholder, reply/commentInput (aria), send
- [x] `statusBar.timeRemaining` (param `{time}`) → StatusPopover
- [x] `theme.*` (5 clés) → ThemeToggle : light/dark/system + switchToLight/switchToDark (aria)
- [x] `language.original` / `language.availableTranslations` / `language.captionLanguage`
      (extension du groupe existant) → TranslationToggle (×4 sites), MediaImageCard (×3 sites)

## 3. i18n admin (clés `admin.json` ×4 locales)
- [x] `agent.userPicker.*` (8 clés) → UserPicker : searchPlaceholder (défaut prop),
      noneSelected, remove, addUser, searching, added, noResults, minChars

## 4. Couleurs sémantiques & dark mode
- [x] MessageComposer : `#EF4444` ×3 → `var(--gp-error)` (token light/dark existant)
- [x] MessageComposer : `hover:bg-black/10` → `hover:bg-[var(--gp-hover)]`

## 5. a11y
- [x] Overlays click-outside `aria-hidden="true"` : MessageBubble, MediaImageCard

## 6. Vérification
- [x] tsc : 0 erreur sur les 8 fichiers touchés
- [x] JSON : 8 fichiers locales valides (python json.load)
- [x] Jest `__tests__/components/v2` : parité exacte avec main (2 suites passed / 9 tests,
      5 suites en échec préexistant d'infra — `encryption-service.js` resolution, identique
      sans les changements)
- [x] Grep : 0 string hardcodée résiduelle sur les composants touchés

## 7. Livraison
- [x] Commit + push `claude/elegant-noether-09t4x2`
- [ ] PR vers main, CI verte, merge, suppression de branche
- [ ] branch-tracking.md mis à jour (base 47, carry-over purgé/complété)

## Différé 47w+ (acté)
AgentConfigDialog ~58 strings + tooltips LlmTab/GlobalConfigTab (lot `agent.config.*` commun) ;
chart hex dark (RankingStatsImpl/MermaidDiagramImpl/AgentOverviewTab) ; console.error FR (logs
dev) ; deep links /v2/chats, swipe-back mobile, audit dark admin.
