# Refonte épurée de l'UI/UX des notifications — Web

**Date** : 2026-06-20
**Périmètre** : `apps/web` uniquement (frontend Next.js)
**Type** : Polish ciblé (visuel + UX), sans changement d'architecture data
**Statut** : Design validé + revue critique intégrée — en attente de revue finale du spec

## Contexte

Le système de notifications web est déjà fonctionnellement riche :
- `NotificationDropdown` (Popover Radix, 5 items max) dans le header
- Page `/notifications` (recherche, filtres par type, groupage par date, scroll infini)
- `NotificationItem` **partagé** entre dropdown (`compact`) et page → levier de cohérence gratuit
- Temps réel via Socket.IO singleton + React Query (infinite query, mutations optimistes)
- 107+ types de notifications, i18n custom 4 langues (en/fr/es/pt)

Le problème n'est pas fonctionnel mais **visuel et ergonomique** :
1. **Charge visuelle** : chaque notification est une *card flottante* (`backdrop-blur-xl rounded-2xl shadow-lg`) avec fond bleu saturé si non-lue, `hover:scale-[1.02]`, point pulsant. « Bruyant ».
2. **Incohérence design system** : thème monochrome/sobre (`--primary` quasi-noir, tokens shadcn HSL), mais les notifs codent en dur `blue-500`, `from-blue-500 to-indigo-600`, `gray-900`/`gray-400`.
3. **Accessibilité** : notifications lues en `opacity-75` (contraste dégradé) ; actions en `opacity-0 group-hover:opacity-100` (invisibles, inaccessibles au tactile/clavier).

## Objectifs (axes validés)

1. **Hiérarchie & lisibilité** — distinction lu/non-lu nette et calme, hiérarchie typographique forte.
2. **Actions rapides** — agir doit être immédiat et accessible (souris, clavier, tactile).
3. **Cohérence menu ↔ page** — dropdown et page partagent la même grammaire visuelle.

Direction : **épurée / sobre** (esprit Linear/Vercel : plus d'air, typo forte, peu d'effets), micro-transitions douces conservées.

## Décisions de design (validées, revue critique incluse)

### D1 — Cards → liste de rangées
Abandon des cards flottantes par item. Chaque notification = **rangée** dans une liste, séparées par des hairlines (`border-b border-border/60`). Plus de `backdrop-blur` / `shadow-lg` / `rounded-2xl` au niveau item.

### D2 — Indicateur non-lu : **rail d'accent seul** (un seul marqueur)
Non-lu signalé par un **rail d'accent** à gauche (`border-l-2` accent ; `border-l-2 border-transparent` si lu, pour éviter tout décalage de layout), renforcé par le **contraste typographique** (titre `font-semibold text-foreground`).
- **Pas de point, pas de `animate-pulse`** (décision de revue : un seul encodage suffit, plus épuré).

### D3 — Actions : **boutons persistants** (desktop + tactile), pas de swipe
- Boutons `✓` (marquer lu, si non-lu) et `🗑` (supprimer) **toujours rendus**, `text-muted-foreground` ~60 % au repos → nets au hover/focus. Cibles ≥ 40px, atteignables clavier.
- **Swipe abandonné** (décision de revue) : valeur incertaine sur web vu l'app iOS native, coût/risque (scroll, perf longue liste, a11y) disproportionné pour un « polish ciblé ». `useSwipeActions` retiré du scope.
- L'« ouvrir » reste implicite (clic/Entrée sur la rangée → navigation + marquage lu).

### D4 — Tokens sémantiques
Remplacer les `gray-*` / `blue-*` / `from-blue-500 to-indigo-600` décoratifs par : `text-foreground`, `text-muted-foreground`, `bg-muted`, `bg-accent`, `border-border`, `bg-background`. Seule exception assumée : l'accent « non-lu » (D5).

### D5 — Couleur d'accent « non-lu » : bleu sobre, centralisé
Un **bleu sobre unique** porte le sens « nouveau » (rail, badge cloche, action « marquer lu »). Défini **une seule fois** et réutilisé pour éviter toute divergence.
- Implémentation : constantes de classe partagées dans un module helper des notifications (ex. `NOTIFICATION_ACCENT = { text, bg, border }` ≈ `blue-600` / `dark:blue-400`), **ou** token CSS dédié `--notification-accent` dans `globals.css`. Choix d'implémentation tranché à l'étape plan ; l'exigence est : **une source unique**.

### D6 — Animations allégées
Entrée : fade léger (`opacity` + petit `y: 4`), **suppression** du `y: 20` et du `delay: index * 0.03`. Conserver l'`exit` (suppression). Respect `prefers-reduced-motion` (désactive l'entrée).

### D7 — Repère de type : émojis conservés
On garde les émojis de type (`getNotificationIcon`), déjà mappés sur 107 types — repère chaleureux, zéro re-mapping. Badge `-bottom-1 -right-1` sur l'avatar conservé.

## Corrections issues de la revue critique (intégrées)

### B1 — Sémantique a11y de la rangée (pas de boutons imbriqués)
La rangée cliquable **ne doit pas** être un `<button>` (elle contient les boutons d'action → imbrication interactive invalide). Implémentation : `<div role="button" tabIndex={0}>` avec handlers `onClick` + `onKeyDown` (Enter/Espace), `aria-label` décrivant la notification. Les actions restent des `<button>` frères avec `e.stopPropagation()`. Vérifier qu'aucun lecteur d'écran n'annonce de « bouton dans un bouton ».

### B2 — En-têtes de groupe `sticky` : conditionnés à la vérif du conteneur de défilement
Avant d'appliquer `sticky`, **identifier le conteneur de scroll réel** de la page (`DashboardLayout` a une top-bar potentiellement fixe). Si le scroll est sur `window`/un ancêtre attendu : `sticky top-[<hauteur top-bar>] z-10 bg-background/85 backdrop-blur-sm`. Si le contexte ne le permet pas proprement : **retirer le sticky** (non-régression > effet). Décision prise après inspection, pas a priori.

### T5 — Contraste : cibles WCAG explicites (pas des opacités au hasard)
- Texte lu (titre `text-foreground/70`, corps `text-muted-foreground`) doit viser **AA** : ≥ 4.5:1 (corps), ≥ 3:1 (titre large/gras). À vérifier en light **et** dark sur fond réel ; ajuster l'opacité/teinte si le ratio échoue. La suppression d'`opacity-75` n'est un gain que si ces cibles sont tenues.

### M1 — Cohérence des éléments annexes de la page
`PushPermissionBanner` et `ConnectionStatusIndicator` (rendus sur/autour de la page) doivent être **alignés** sur la nouvelle grammaire sobre (tokens, pas de verre lourd) pour ne pas détonner. Audit + ajustement minimal.

### M2 — Factoriser `formatTimeAgo` (réutilisation)
`formatTimeAgo` est **dupliqué** (NotificationDropdown + page, ~20 lignes quasi identiques). Extraire un helper unique (ex. `formatNotificationTimeAgo(date, { t, locale })` dans `utils/notification-helpers.ts`) et l'utiliser des deux côtés. Logique pure → testable.

### Badge cloche (T4, tranché)
Badge non-lu passé en **accent bleu sobre + ring d'offset** (`ring-2 ring-background`) pour le détacher de la cloche, cohérent avec D5 — au lieu du rouge `destructive` plein. *Note : le rouge reste une option si l'on privilégie la saillance fonctionnelle ; choix esthétique assumé en faveur de la cohérence.* Le badge est **dupliqué** (`NotificationBell.tsx` + trigger inline du dropdown) → factoriser en un sous-composant `UnreadBadge` partagé.

## Spécification par composant

### `components/notifications/NotificationItem.tsx` (refonte rendu)
- Conteneur **rangée** : `relative flex items-start gap-3 px-4 py-3` (compact : `gap-2.5 px-3 py-2.5`), `cursor-pointer transition-colors hover:bg-muted/50`, `focus-visible` ring. **`<div role="button" tabIndex={0}>` + onKeyDown** (B1).
- Rail non-lu : `border-l-2` accent si non-lu, `border-l-2 border-transparent` sinon (D2).
- Avatar : tailles conservées, ring `ring-border` ; **fallback `bg-muted text-muted-foreground`** (fin du gradient). Émoji de type conservé (D7).
- Titre : `font-semibold text-sm` ; non-lu `text-foreground`, lu `text-foreground/70` (cible AA — T5). **Pas de point.**
- Heure : `text-xs text-muted-foreground tabular-nums`.
- Corps : `text-sm line-clamp-2` ; non-lu `text-foreground/80`, lu `text-muted-foreground`. **Retirer `opacity-75` global.**
- Contexte conversation (non-compact) : `text-xs text-muted-foreground`.
- Actions : `Check` (si non-lu) + `Trash2`, persistantes, `text-muted-foreground` au repos → `hover:text-foreground` / `hover:text-destructive`, ≥ 40px, `stopPropagation` (D3, B1).
- Animation : fade léger, sans `scale`, sans stagger (D6) ; `prefers-reduced-motion`.
- `memo` conservé ; **vérifier la stabilité des callbacks** passés par les parents (`useCallback`) sinon `memo` est inopérant.

### `components/notifications/NotificationDropdown.tsx`
- Header tokens (titre + « tout marquer lu » + ⚙). Badge cloche via `UnreadBadge` (D5/T4).
- Liste : retirer `space-y-1` + conteneur `p-2` isolant chaque card → rangées contiguës `divide-y divide-border/60`, padding compact.
- Footer « voir tout » : conservé, `text-muted-foreground`.
- Utiliser `formatNotificationTimeAgo` (M2).

### `components/notifications/NotificationBell.tsx` + badge inline (D5/T4)
- Extraire `UnreadBadge` (accent + ring d'offset, logique `> 9 → '9+'`, `aria-label`, focus ring) et l'utiliser dans **les deux** emplacements.

### `app/notifications/page.tsx`
- **Header allégé** : retirer la card `backdrop-blur-xl … rounded-2xl shadow-xl` et l'icône `bg-gradient-to-br from-blue-500 to-indigo-600`. Titre `text-2xl font-bold text-foreground` + sous-titre compteur `text-muted-foreground`, cloche discrète optionnelle.
- **Search** : `bg-muted/50 border-border focus-visible:ring-2 focus-visible:ring-[accent]`, sans `backdrop-blur` lourd ; icône/clear `text-muted-foreground`.
- **« Tout marquer lu »** : `variant="outline"` sobre.
- **Largeur** : `max-w-2xl` proposé (lecture de liste), **à confirmer visuellement** — sinon conserver `max-w-4xl`.
- Filtres (`NotificationFilters`) : **logique inchangée** ; aligner seulement d'éventuelles couleurs codées en dur.
- `PushPermissionBanner` / `ConnectionStatusIndicator` alignés (M1).
- Utiliser `formatNotificationTimeAgo` (M2).

### `components/notifications/NotificationList.tsx`
- Remplacer `space-y-6`/`space-y-3` par rangées contiguës `divide-y divide-border/60` (groupé et non-groupé).
- En-têtes de groupe : **sticky conditionnel** (B2) ; style `text-xs font-semibold uppercase tracking-wider text-muted-foreground`.
- Sentinel scroll infini + skeletons : logique inchangée.

### `components/notifications/NotificationSkeleton.tsx`
Adapter le skeleton à la **forme rangée** (rail/avatar/2 lignes) pour éviter le flash cards→rows.

## i18n
Aucune nouvelle clé fonctionnelle (swipe abandonné → pas d'aria swipe). Clés existantes suffisent (`actions.*`, `markAllRead`, `viewAll`, `groups.*`, `timeAgo.*`). Si un `aria-label` de rangée enrichi est ajouté, créer la clé dans **les 4 langues** (édition byte-propre).

## Hors-scope (YAGNI)
- Architecture data : Socket.IO, React Query, mutations, service API → **inchangés**.
- Logique de groupage par date et de filtrage par type → **inchangée** (habillage visuel seulement).
- Sélection multiple / batch au-delà de « tout marquer lu ».
- **Swipe** (abandonné).
- Préférences (`/settings?tab=notifications`), push/Firebase, sons, toasts.

## Accessibilité (gains visés)
- Contraste : suppression d'`opacity-75`, **cibles WCAG AA tenues** (T5).
- Rangées focusables clavier (B1) + actions atteignables au focus (plus seulement hover).
- Cibles tactiles ≥ 40px.
- `prefers-reduced-motion` respecté.
- `UnreadBadge` : `aria-label` conservé.

## Fichiers touchés (prévision)

| Fichier | Nature |
|---|---|
| `components/notifications/NotificationItem.tsx` | Refonte rendu rangée + sémantique a11y (B1) |
| `components/notifications/NotificationDropdown.tsx` | Header/rows/badge tokens |
| `components/notifications/NotificationBell.tsx` | `UnreadBadge` partagé (D5/T4) |
| `components/notifications/NotificationList.tsx` | `divide-y` + sticky conditionnel (B2) |
| `components/notifications/NotificationSkeleton.tsx` | Forme rangée |
| `app/notifications/page.tsx` | Header/search/largeur sobres + bannières alignées (M1) |
| `utils/notification-helpers.ts` | `formatNotificationTimeAgo` factorisé (M2) |
| `locales/{en,fr,es,pt}/notifications.json` | Seulement si nouvelle clé aria |

*(Plus de `hooks/use-swipe-actions.ts` — swipe abandonné.)*

## Plan de vérification (TDD où il y a de la logique)
- **TDD strict** (logique pure) : `formatNotificationTimeAgo` (now/min/h/j/date, entrées nulles/invalides) — RED→GREEN.
- **Tests comportement** : `NotificationItem` (rail présent si non-lu / absent si lu ; clic `✓` → `onMarkAsRead(id)` ; clic `🗑` → `onDelete(id)` ; clic/Entrée rangée → `onClick`) ; `UnreadBadge` (`> 9 → '9+'`, masqué si 0).
- CSS/tokens : pas de TDD (vérif visuelle).
- `pnpm --filter @meeshy/web build` + lint/tsc strict + **jest web vert**.
- Contrôle manuel : dropdown + page, light/dark, lu/non-lu, hover, **focus clavier**, `prefers-reduced-motion`, sticky group headers réels.

## Risques & points d'attention
- **B1 imbrication interactive** : ne pas faire de la rangée un vrai `<button>`.
- **B2 sticky** : dépend du conteneur de scroll réel → vérifier avant, sinon retirer.
- **Accent dupliqué** : centraliser (D5) sinon divergence.
- **Skeleton désaligné** : inclus au scope (flash cards→rows).
- **`memo` inopérant** si callbacks instables : vérifier les `useCallback` parents.
- **Préférence utilisateur** : il tient normalement à conserver les effets visuels ; l'épure est **explicitement demandée pour les notifications** — ne pas l'étendre à d'autres surfaces.
