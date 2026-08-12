# Analyse UI/UX — Itération 56wb (web only)

**Date** : 2026-06-22
**Périmètre** : application **web** exclusivement (`apps/web`)
**Thème** : cohérence design-system + **dark mode** — consolidation du rouge d'erreur dupliqué `#C1292E` vers le token sémantique `var(--gp-error)`

> Itération **56wb** : numérotée avec suffixe `b` car deux itérations `56w` parallèles
> (PR #770 + #771, i18n des dialogues `AttachmentDeleteDialog` / `PhoneExistsModal`)
> étaient en cours au moment du démarrage. Périmètres **disjoints** — convention
> 49w/49wb, 53w/53wb, 54w/54wb. Ce travail ne touche **aucun** des fichiers i18n
> en cours côté agents parallèles.

## Contexte
Le design-system v2 (`components/v2/`) définit une palette sémantique de tokens
CSS **dark-mode-aware** dans `app/globals.css`, déclinés en `:root` (light) et
`.dark` :

| Token | Light | Dark |
|-------|-------|------|
| `--gp-error` | `#EF4444` | `#F87171` |
| `--gp-success` | `#10B981` | `#34D399` |
| `--gp-warning` | `#F59E0B` | `#FBBF24` |
| `--gp-deep-teal` | `#4338CA` | `#6366F1` |

`var(--gp-error)` est la **source de vérité** du rouge d'erreur/danger : utilisé
directement par `Toast` (variant error), `PostCard` (action delete), `SwipeableRow`
(swipe delete), `MessageComposer`, `ConversationSidebar` (reconnecting).

## Problème identifié
**Un rouge d'erreur concurrent codé en dur `#C1292E`** (brick red, **différent** de
`--gp-error` et **non dark-mode-aware**) était dupliqué dans **6 composants v2** :

| Fichier | Ligne | Usage |
|---------|-------|-------|
| `components/v2/Button.tsx` | 53 | `bg-[#C1292E]` + `focus-visible:ring-[#C1292E]` (variant `destructive`) |
| `components/v2/Input.tsx` | 29 | `border-[#C1292E] focus:border-[#C1292E] focus:ring-[#C1292E]/20` (état error) |
| `components/v2/Textarea.tsx` | 21 | idem Input (état error) |
| `components/v2/Badge.tsx` | 32 | `bg-[#C1292E]/10 text-[#C1292E]` (variant `error`) |
| `components/v2/Label.tsx` | 23 | `text-[#C1292E]` (astérisque champ requis) |
| `components/v2/StatusComposer.tsx` | 128 | `text-[#C1292E]` (compteur de caractères dépassé) |

### Double défaut
1. **Dark mode cassé** : `#C1292E` reste brick-dark en thème sombre (aucun
   remappage), là où `--gp-error` passe à `#F87171` (plus clair) pour garantir le
   contraste sur fond sombre. Les bordures de validation, le bouton destructive,
   le badge error et l'astérisque requis étaient donc sous-contrastés en dark mode.
2. **Incohérence design** : deux rouges d'erreur coexistaient dans le même
   design-system (`#C1292E` côté formulaires, `var(--gp-error)` côté Toast/Swipe/
   feed) — rupture de la règle « Single Source of Truth ».

`Button.tsx` est le plus impactant : la variant `destructive` est consommée par
10+ surfaces (CallControls, CallNotification, MarkdownViewer, UserSecuritySection,
ForgotPasswordForm, PhoneResetFlow, ResetPasswordForm, ConversationHeader,
AgentOverviewTab, TriggerSchedulingModal…).

## Correction appliquée
Remplacement 1:1 de **tous** les `#C1292E` par `var(--gp-error)` dans les 6 fichiers.
Chaque remplacement **reflète un pattern frère déjà en production dans le même
fichier** — donc **zéro nouvelle syntaxe Tailwind** :
- `Input.tsx`/`Textarea.tsx` : la branche non-error utilise déjà
  `focus:ring-[var(--gp-deep-teal)]/20` → `focus:ring-[var(--gp-error)]/20` est
  strictement homologue (modificateur d'opacité `/20` sur token `var()`, pattern
  déjà éprouvé ligne sœur).
- `Badge.tsx` : les variants `teal` (`bg-[var(--gp-deep-teal)]/10`) prouvent déjà
  le `var()` + `/10` → `bg-[var(--gp-error)]/10` est homologue.
- `Button.tsx` : variants `primary`/`secondary`/`outline`/`ghost` utilisent toutes
  `var(--gp-*)` → la variant `destructive` rejoint la convention.

**Aucun fichier locale touché. Aucune chaîne i18n modifiée.** Diff total :
6 fichiers, 6 lignes (1:1).

## Hors périmètre (déféré — décrit pour 57w+)
- **`Badge.tsx` variants `success`/`warning`/`gold`** codent aussi des hexes
  off-palette (`#2A9D8F` success, `#F4A261`/`#D68A3A` warning, `#E9C46A`/`#B8860B`
  gold) non dark-mode-aware. Tokens équivalents existent (`--gp-success`,
  `--gp-warning`, `--gp-gold-accent`) **MAIS** `Toast` mappe success/warning vers
  `theme.colors.jadeGreen`/`goldAccent` (système `theme.colors.*`) et non vers
  `gp-*`. **Arbitrage requis** (`theme.colors.*` vs tokens `gp-*` comme source de
  vérité des sémantiques success/warning) avant de toucher — ne pas changer la
  teinte à l'aveugle. **NE PAS re-flagger sans trancher cet arbitrage.**
- `AgentTopicEditModal.tsx` (admin) : modale hand-rolled sans dismiss-Escape ni
  dismiss-backdrop, bouton de fermeture icon-only sans `aria-label` (`t` déjà
  dispo). Geste/a11y, bounded — candidat 57w+.
- `ConversationDrawer.tsx` (v2, user-facing) : backdrop-dismiss + `aria-label`
  présents mais **pas de handler Escape** ni `role="dialog"`/`aria-modal`. Geste/
  a11y, bounded — candidat 57w+.

## Faux positifs vérifiés (NE PLUS re-flagger)
- `UserConversationsSection.tsx:141-144` : la modale a **déjà** backdrop
  `onClick={onClose}`, `stopPropagation` sur la Card, et `aria-label="Close"` sur
  le bouton de fermeture. **Conforme.**
- `UserMediaSection.tsx` key composite `${source}-${id}` sur liste paginée :
  clé stable et unique, pas de régression de diff. **Conforme.**

---

## ✅ Statut : COMPLÈTE & CORRIGÉE
- [x] 6 occurrences `#C1292E` → `var(--gp-error)` (vérifié : `grep` = 0 restant)
- [x] Dark mode : rouge d'erreur désormais remappé `#EF4444`→`#F87171` partout
- [x] Cohérence : source de vérité unique du rouge d'erreur dans tout le v2
- [x] Zéro nouvelle syntaxe Tailwind (homologue des patterns frères en place)
- [x] Aucun fichier locale / i18n touché — orthogonal aux 56w parallèles

**NE PLUS re-flagger** : le rouge `#C1292E` dans `components/v2/` (éliminé). Le
reste des hexes off-palette de `Badge` (success/warning/gold) reste déféré sous
arbitrage `theme.colors.*` vs `gp-*` (voir « Hors périmètre »).
