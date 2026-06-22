# Refonte épurée de l'UI/UX des notifications — Web

**Date** : 2026-06-20
**Périmètre** : `apps/web` uniquement (frontend Next.js)
**Type** : Polish ciblé (visuel + UX) + réparation d'un trou de navigation
**Statut** : Design validé + revue critique + revue pro (fonctionnel/intégration/perf/SOTA) intégrées — implémentation sur `main`

## Contexte

Système déjà fonctionnellement riche :
- `NotificationDropdown` (Popover Radix, 5 items max) dans le header
- Page `/notifications` (recherche, filtres par type, groupage par date, scroll infini)
- `NotificationItem` **partagé** dropdown (`compact`) ↔ page → levier de cohérence
- Temps réel Socket.IO singleton + React Query (infinite query, mutations optimistes)
- 107+ types de notifications, i18n custom 4 langues (en/fr/es/pt)

Stack confirmée : React 19.2, Next 15.5, Framer Motion 11.18, Tailwind 3.4 (`darkMode: 'class'`, tokens HSL exposés), `@tanstack/react-virtual` 3.13 (utilisé pour les messages uniquement).

Problèmes ciblés :
1. **Charge visuelle** : chaque notif est une *card flottante* (`backdrop-blur-xl rounded-2xl shadow-lg`), fond bleu saturé si non-lue, `hover:scale-[1.02]`, point pulsant.
2. **Incohérence design system** : thème monochrome (tokens shadcn), mais `blue-500` / `from-blue-500 to-indigo-600` / `gray-*` codés en dur.
3. **Accessibilité** : lues en `opacity-75` (contraste dégradé) ; actions en `opacity-0 group-hover` (inaccessibles tactile/clavier).
4. **Navigation morte** (découverte au review pro) : ~12 types sociaux ne naviguent nulle part au clic.

## Objectifs (axes validés)

1. **Hiérarchie & lisibilité** — distinction lu/non-lu nette et calme.
2. **Actions rapides** — agir + **atteindre la cible** doit être immédiat et accessible (souris, clavier, tactile).
3. **Cohérence menu ↔ page** — même grammaire visuelle.

Direction : **épurée / sobre** (Linear/Vercel), micro-transitions douces conservées.

## Décisions de design (validées)

### D1 — Cards → liste de rangées
Rangées séparées par hairlines (`border-b border-border/60`). Plus de `backdrop-blur` / `shadow-lg` / `rounded-2xl` par item.

### D2 — Indicateur non-lu : rail d'accent seul
`border-l-2` accent si non-lu, `border-l-2 border-transparent` sinon (pas de décalage). Renforcé par le contraste typo (titre `font-semibold text-foreground`). **Pas de point, pas de pulse.**

### D3 — Actions : boutons persistants (desktop + tactile), pas de swipe
Boutons `✓` (si non-lu) + `🗑` toujours rendus, `text-muted-foreground` ~60 % au repos → nets au hover/focus. Cibles ≥ 40px, atteignables clavier. **Swipe abandonné** (valeur web incertaine vs app iOS native).

### D4 — Tokens sémantiques
`text-foreground`, `text-muted-foreground`, `bg-muted`, `border-border`, `bg-background`. Seule exception : l'accent « non-lu » (D5).

### D5 — Accent « non-lu » : classe bleue nommée, centralisée
> **Correction de revue** : `--accent` du thème vaut **gris** (= secondary) et le projet n'utilise **pas** d'arbitrary token couleur. Donc **pas** de `ring-[accent]`.

Accent = **classe Tailwind nommée bleue**, centralisée une fois dans un helper notifications :
```
NOTIFICATION_ACCENT = {
  rail:  'border-blue-600 dark:border-blue-400',
  badge: 'bg-blue-600 text-white dark:bg-blue-500',
  ring:  'ring-blue-500',
  text:  'text-blue-600 dark:text-blue-400',
}
```
Réutilisé partout (rail, badge cloche, action « marquer lu »). Source unique → zéro divergence.

### D6 — Animations allégées
Entrée : fade léger (`opacity` + `y: 4`), **sans** `y: 20` ni `delay: index*0.03`. Conserver `exit` (suppression). `prefers-reduced-motion` respecté (déjà neutralisé globalement en CSS, respecté aussi côté Framer).

### D7 — Repère de type : émojis conservés
`getNotificationIcon` conservé (mappé sur 107 types, zéro re-mapping).

## Réparation fonctionnelle — Navigation vers la cible (NOUVEAU, validé)

> **Découverte review pro** : `handleNotificationClick` (dropdown `:40-50`, page `:67-76`) ne `router.push` **que si `context.conversationId`**. Les notifs sociales portent `context.postId` (gateway `NotificationService`) **sans** `conversationId` → clic = rien. Routes cibles **toutes existantes** : `/post/[postId]`, `/story/[postId]`, `/mood/[postId]`, `/reel/[postId]`, `/contacts`, `/u/`.

### Résolveur unique `resolveNotificationTarget(notification): string | null`
À placer dans `utils/notification-helpers.ts`, **utilisé par les deux handlers** (DRY) :

1. `context.conversationId` présent → `/conversations/:id` (`?messageId=…#message-…` si `messageId`) — comportement existant.
2. Sinon, selon le **type** + `context.postId` :
   - `story_*` (story_reaction, story_new_comment, story_thread_reply, friend_new_story) → `/story/:postId`
   - mood / `friend_new_mood` / `status_reaction` → `/mood/:postId`
   - reel → `/reel/:postId`
   - `post_*` / `comment_*` / `friend_new_post` (post_like, post_comment, post_repost, comment_like, comment_reply…) → `/post/:postId` (ancre `#comment-:commentId` si `context.commentId`)
3. `friend_request` / `friend_accepted` / `contact_*` → `/contacts` (ou `/u/:username` via `actor` si dispo).
4. Sinon → `null` (pas de navigation, mais **marquage lu conservé**).

**Défensif** : URL best-effort selon les champs présents, `null` si insuffisant.
**À vérifier en implémentation** : si `context`/`metadata` porte un discriminant de cible (`postType`/`targetType`) pour lever l'ambiguïté post/reel/story/mood ; sinon défaut `/post/:postId`. Ne pas inventer de route.

## Corrections issues des revues (intégrées)

### B1 (révisé) — Pattern « stretched link » (a11y SOTA)
Plutôt qu'un `<div role="button">`, quand une cible existe la rangée utilise un **lien primaire étiré** :
- Conteneur `relative`. Un `<Link href={target}>` en **`absolute inset-0`** (cible réelle, navigable cmd/ctrl+click, annoncée « lien »). `onClick` du Link → `markAsRead` **sans** bloquer la navigation.
- Boutons d'action `✓`/`🗑` en **`relative z-10`** au-dessus du lien, avec `e.preventDefault()` + `e.stopPropagation()`.
- Si `target === null` : pas de lien → `<div role="button" tabIndex={0}>` + `onKeyDown` (Enter/Espace) qui ne fait que `markAsRead`.
- Élimine proprement le nested-interactive **et** rend la cible cliquable.

### B2 (résolu) — Sticky group headers : page only, `top-16`
- **Page** : header global `DashboardLayout` = `sticky top-0 h-16 z-50`, scroll sur `window`. → en-têtes de groupe en **`sticky top-16 z-20`** (sous le header), `bg-background/85 backdrop-blur-sm`. (PAS `top-0`, sinon masqués.)
- **Dropdown** : `ScrollArea` Radix isole le scroll + `PopoverContent` est un portal `fixed` → sticky inopérant ; **mais le dropdown n'a pas de groupage** → non concerné.

### T5 — Contraste : cibles WCAG explicites
Texte lu (`text-foreground/70` titre, `text-muted-foreground` corps) doit tenir **AA** : ≥ 4.5:1 (corps), ≥ 3:1 (titre gras), vérifié light **et** dark sur fond réel. Suppression d'`opacity-75` (gain réel seulement si ratios tenus).

### M1 — Cohérence des annexes de page
`PushPermissionBanner` + `ConnectionStatusIndicator` alignés sur l'épure (tokens, pas de verre lourd).

### M2 — Factorisations (réutilisation)
- `formatNotificationTimeAgo(date, { t, locale })` : dédupliquer la logique copiée dropdown+page.
- `resolveNotificationTarget` (ci-dessus) : un seul mapping pour les deux handlers.

### Badge cloche (T4)
Badge non-lu en **accent bleu + `ring-2 ring-background`** (au lieu de rouge `destructive`), via un sous-composant **`UnreadBadge` partagé** (le badge est dupliqué `NotificationBell.tsx` + trigger inline du dropdown). *Note : rouge reste une option si l'on privilégie la saillance ; choix assumé pour la cohérence.*

## Performance (revue pro)

- ✅ **Gain** : la refonte rangées **supprime `backdrop-blur-xl` par item** (coût GPU réel) + `hover:scale` + stagger.
- 🟢 **À ajouter** : `content-visibility:auto` est défini pour `.message-item` / `.conversation-preview-item` (`globals.css`, pattern Vercel) **mais pas** les notifs. → ajouter `.notification-item { content-visibility:auto; contain-intrinsic-size:0 84px }` et l'appliquer aux rangées.
- ⚖️ **Pas de virtualisation** : standard interne = virtualisation pour messages seulement ; notifications/conversations restent en IntersectionObserver + groupes. On reste **non-virtualisé** (cohérence + scope). Option future si volumétrie > ~100.
- ✅ `memo` de `NotificationItem` **valide** : callbacks du manager tous `useCallback` (`use-notifications-manager-rq.tsx:200-232`).

## Spécification par composant

### `components/notifications/NotificationItem.tsx`
- Rangée `relative flex items-start gap-3 px-4 py-3` (compact `gap-2.5 px-3 py-2.5`), `cursor-pointer transition-colors hover:bg-muted/50`, `focus-visible` ring, classe `.notification-item` (content-visibility).
- **Stretched link** (B1) : `<Link absolute inset-0>` si `resolveNotificationTarget` ≠ null ; sinon `div role="button"` + onKeyDown.
- Rail non-lu : `border-l-2` accent (D5) / `border-transparent` sinon.
- Avatar : tailles conservées, ring `ring-border`, **fallback `bg-muted text-muted-foreground`** ; émoji de type conservé.
- Titre `font-semibold text-sm` (non-lu `text-foreground`, lu `text-foreground/70` — AA). Heure `text-xs text-muted-foreground tabular-nums`. **Pas de point.**
- Corps `text-sm line-clamp-2` (non-lu `text-foreground/80`, lu `text-muted-foreground`). **Retirer `opacity-75`.**
- Contexte conversation (non-compact) `text-xs text-muted-foreground`.
- Actions `relative z-10`, `Check` (si non-lu) + `Trash2`, persistantes, ≥ 40px, `preventDefault`+`stopPropagation`.
- Animation D6 ; `memo` conservé.

### `components/notifications/NotificationDropdown.tsx`
- Header tokens, badge via `UnreadBadge`. Rangées contiguës `divide-y divide-border/60` (retirer `space-y-1` + `p-2` isolant). Footer « voir tout » discret. `handleNotificationClick` → `resolveNotificationTarget` + `formatNotificationTimeAgo`.

### `components/notifications/NotificationBell.tsx` + badge inline
- Extraire `UnreadBadge` (accent + ring d'offset, `> 9 → '9+'`, `aria-label`, focus ring) utilisé aux **deux** emplacements.

### `app/notifications/page.tsx`
- Header allégé (retirer card `backdrop-blur-xl … shadow-xl` + icône gradient) : titre `text-2xl font-bold text-foreground` + sous-titre `text-muted-foreground`. Search `bg-muted/50 border-border focus-visible:ring-blue-500`, sans blur lourd. « Tout marquer lu » `variant="outline"`. Largeur `max-w-2xl` (à confirmer visuellement, sinon 4xl). `handleNotificationClick` → `resolveNotificationTarget`. Bannières alignées (M1). `formatNotificationTimeAgo`.

### `components/notifications/NotificationList.tsx`
- `divide-y divide-border/60` (groupé + non-groupé). En-têtes de groupe **`sticky top-16 z-20`** (B2), `text-xs font-semibold uppercase tracking-wider text-muted-foreground`. Sentinel + skeletons inchangés.

### `components/notifications/NotificationSkeleton.tsx`
- Forme rangée (rail/avatar/2 lignes), pour éviter le flash cards→rows.

### `components/notifications/NotificationFilters.tsx`
- **Logique inchangée**. Aligner seulement les couleurs codées en dur (`bg-gradient-to-r from-blue-500 to-indigo-600` du filtre actif `:100`) sur les tokens / l'accent.

### `app/globals.css`
- Ajouter `.notification-item { content-visibility:auto; contain-intrinsic-size:0 84px }`.

### `utils/notification-helpers.ts`
- `formatNotificationTimeAgo`, `resolveNotificationTarget` (logique pure, testée).

## i18n
Pas de nouvelle clé fonctionnelle. Si un `aria-label` de rangée enrichi est ajouté → clé dans **les 4 langues** (édition byte-propre).

## Hors-scope (YAGNI)
- Archi data : Socket.IO, React Query, mutations, service API → **inchangés**.
- **Filtres incomplets** (~60 types non filtrables, `matchesFilter`) → **dette signalée**, non traitée (axe « filtres » non retenu). Seul l'habillage du composant filtres est aligné.
- Logique de groupage par date → inchangée.
- Sélection multiple / batch au-delà de « tout marquer lu ». Swipe. Préférences settings. Push/Firebase/sons/toasts. Virtualisation.

## Accessibilité (gains)
Contraste AA tenu (T5), navigation native via lien réel (B1 stretched), rangées/actions focusables clavier, cibles ≥ 40px, `prefers-reduced-motion`.

## Fichiers touchés

| Fichier | Nature |
|---|---|
| `components/notifications/NotificationItem.tsx` | Rangée + stretched link + actions (B1, D1-D7) |
| `components/notifications/NotificationDropdown.tsx` | Rows/header/badge + résolveur |
| `components/notifications/NotificationBell.tsx` | `UnreadBadge` partagé |
| `components/notifications/NotificationList.tsx` | `divide-y` + sticky `top-16` (B2) |
| `components/notifications/NotificationSkeleton.tsx` | Forme rangée |
| `components/notifications/NotificationFilters.tsx` | Couleurs → tokens/accent |
| `app/notifications/page.tsx` | Header/search/largeur + navigation + bannières |
| `utils/notification-helpers.ts` | `formatNotificationTimeAgo` + `resolveNotificationTarget` |
| `app/globals.css` | `.notification-item` content-visibility |
| `locales/{en,fr,es,pt}/notifications.json` | Seulement si nouvelle clé aria |

## Plan de vérification (TDD où il y a de la logique)
- **TDD strict** (pur) :
  - `resolveNotificationTarget` : conversationId→/conversations (+messageId) ; postId+story_*→/story ; +mood→/mood ; +reel→/reel ; +post_*/comment_*→/post (+#comment) ; friend_*/contact_*→/contacts ; sinon `null`.
  - `formatNotificationTimeAgo` : now/min/h/j/date, entrées nulles/invalides.
- **Comportement** : `NotificationItem` (rail si non-lu / absent si lu ; clic `✓`→`onMarkAsRead` ; `🗑`→`onDelete` ; clic rangée→navigation+markAsRead ; cible null→markAsRead seul) ; `UnreadBadge` (`>9→'9+'`, masqué si 0).
- CSS/tokens : vérif visuelle.
- `pnpm --filter @meeshy/web build` + lint/tsc strict + **jest web vert**.
- Manuel : dropdown + page, light/dark, lu/non-lu, hover, **focus clavier**, sticky `top-16` réel, navigation des types sociaux, `prefers-reduced-motion`.

## Risques & points d'attention
- **Ambiguïté de cible** post/reel/story/mood sur un même `postId` : vérifier un discriminant en `context`, défaut `/post/:postId` (ne pas inventer de route).
- **B1 stretched link** : boutons au-dessus du lien (`z-10` + `preventDefault`) sinon clic action → navigation.
- **B2 sticky** : `top-16` (hauteur header), z-index < 50.
- **Accent** : classe nommée bleue centralisée (pas `accent` gris, pas `ring-[…]`).
- **`memo`** : déjà valide (callbacks stables).
- **Préférence utilisateur** : épure demandée **spécifiquement** pour les notifications ; ne pas l'étendre ailleurs.
