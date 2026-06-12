# Iteration 34 — Analyse d'optimisation (2026-06-12)

## Contexte
Suite iter 33 (cap participants détail + pagination unifiée — mergé via PR #577/#578). Le plan
iter 33 désignait pour iter 34 : **lot web F3–F5** (commencer par F5, le moins risqué). Audit mené
sur les stores Zustand, les imports statiques de libs lourdes, et les pollings admin.

## Constats retenus pour iter 34

### 1. Stores Zustand consommés sans selector → re-renders globaux (F3, CRITIQUE)
9 call sites consomment `useConversationPreferencesStore()` / `useUserStore()` **sans selector** :
l'abonnement porte alors sur l'objet state entier, dont l'identité change à CHAQUE `set()` du
store. Conséquences mesurées sur les chemins chauds :

- `hooks/conversations/use-participants.ts:105` — consommé par **`ConversationLayout`** (racine de
  l'écran conversation). Chaque event de présence Socket.IO (`user-status`, tick) re-rend tout le
  layout. Pire : `loadParticipants` a `[userStore]` en dépendance → le callback change d'identité à
  chaque event de statut et invalide en cascade l'effet de chargement de `ConversationLayout`
  (`ConversationLayout.tsx:437-444`), seul un garde par ref évite le re-fetch réseau en boucle.
- `conversation-item/ConversationItem.tsx:59,69` — rendu **× N conversations** dans la liste.
  Abonné au store de préférences entier : pin/mute/archive/réaction sur UNE conversation,
  chargement des catégories, flips `isLoading` → re-render de TOUS les items. État de l'art
  (pattern déjà documenté dans `apps/web/CLAUDE.md` : « ALWAYS use useShallow for multi-field
  selectors ») : un item ne doit se re-rendre que quand SES données changent.
- `conversation-participants.tsx:55`, `ConversationSettingsModal.tsx:139-140`,
  `header/use-header-preferences.ts:16`, `header/use-participant-info.ts:21`,
  `components/conversations/hooks/useConversationPreferences.ts:22` — même anti-pattern.

Fait aggravant : le store de préférences expose **déjà** les selector hooks adaptés
(`useConversationPreference(id)`, `useConversationCategories()` —
`conversation-preferences-store.ts:298-306`) et ses mutations sont immutables par entrée
(nouvel objet uniquement pour la conversation touchée) — les selectors seraient donc pleinement
efficaces. Ils ne sont simplement utilisés nulle part. Les actions Zustand étant stables par
construction, un hook `use...Actions()` (pattern `useAppActions()` existant, `app-store.ts:136`)
supprime les abonnements aux données pour les composants qui ne font que muter.

Note de périmètre : `useUserStore` bumpe `_lastStatusUpdate` à chaque mutation (décroissance des
statuts relatifs). Les composants qui affichent la présence doivent conserver cette fréquence de
re-render — la migration vers `s => s._lastStatusUpdate` + `getUserById` (stable) est iso-fréquence
mais isole des autres champs et rend l'intention explicite. Le gain massif vient du store de
préférences et de la stabilisation des callbacks.

### 2. `recharts` importé statiquement en contournant le wrapper dynamic existant (F5, ÉLEVÉ)
Le pattern de référence existe : `components/admin/Charts.tsx` exporte `TimeSeriesChart` /
`DonutChart` via `next/dynamic` (ssr:false, skeleton) au-dessus de `ChartsImpl.tsx` (~300 KB
différés, commentaire dans le fichier). Deux call sites le contournent :

- `app/admin/analytics/page.tsx:23` — importe `BarChart, Bar, XAxis, …` **directement depuis
  `recharts`** pour UN bar chart inline (lignes 271-285), alors que la même page utilise déjà
  `TimeSeriesChart`/`DonutChart` du wrapper. Résultat : recharts entre dans le chunk synchrone de
  la route et le différé du wrapper est annulé sur cette page.
- `components/admin/ranking/RankingStats.tsx:4` — importe recharts statiquement et est importé
  **statiquement** par `app/admin/ranking/page.tsx:14` (aucune indirection dynamic). recharts est
  chargé/parsé avant le premier render de la route ranking.
- `app/links/tracked/[token]/page.tsx:39` — route **user-facing** (stats de lien tracké) qui
  importe `ComposedChart, Bar, Line, …` statiquement pour un seul graphique (manqué par l'audit
  initial, détecté par le garde-fou grep).

Cas sains vérifiés : `AgentOverviewTab` importe recharts mais n'est chargé que via `dynamic()`
(`app/admin/agent/page.tsx:10`) → déjà différé ; `ScanHistoryChart` → déjà derrière `dynamic()`
dans ses deux consommateurs. `MermaidDiagram` : wrapper dynamic déjà en place.
Aucune autre lib lourde candidate (audit : qrcode/emoji-mart/katex/wavesurfer absents ;
framer-motion ×41 est sur le chemin critique des animations — statique assumé).

### 3. Pollings admin (F4) — AUCUNE ACTION
Audit complet de `components/admin/agent/` : 8 `setInterval` (5 s–30 s), tous scopés aux
onglets/modals admin montés, tous nettoyés au unmount. Aucun polling global. Le remplacement par
des events Socket.IO serveur reste souhaitable mais exige des events gateway nouveaux — reporté
(admin-only, charge faible).

## Constats consignés pour itérations futures (non traités ici)

| # | Constat | Localisation | Impact | Raison du report |
|---|---------|--------------|--------|------------------|
| F2 | `SOCKET_LANG_FILTER` OFF par défaut | `MessageHandler.ts:580` | HAUT (~75 % BP multilingue) | Validation staging requise |
| F4 | Pollings admin → events Socket.IO | `components/admin/agent/*` | MOYEN (admin only) | Events gateway à créer |
| F7 | Notifications non-lues : findMany complet puis filtre JSON client-side | `core.ts` détail conversation | MOYEN | Dénormalisation `conversationId` sur Notification |
| F8 | Champs participant du détail non trimés | `core.ts` include détail | MOYEN | Vérifier champs lus par les vues détail |
| F9 | Extraction de l'indicateur de présence de `ConversationItem` en composant feuille abonné par userId (stoppe le re-render des items de groupe sur tick) | `ConversationItem.tsx:231-247` | MOYEN | Changement de comportement de décroissance à valider |

## Décision iter 34
Traiter 1+2 (web uniquement, zéro changement de comportement visible) :
- **A1** : selector hooks manquants (`useUserById`, tick, actions) + migration des 9 call sites
  vers selectors étroits ; stabilisation de `loadParticipants` (`mergeParticipants` stable en dep).
- **A2** : `RankingStats` → wrapper `next/dynamic` + impl séparée (pattern Charts.tsx), garde
  `null` hoistée dans le wrapper pour éviter un skeleton fantôme.
- **A3** : `SimpleBarChart` ajouté à `ChartsImpl`/`Charts` ; la page analytics ne touche plus
  recharts directement.

**Gain estimé** : liste de conversations — re-render de 1 item au lieu de N sur toute mutation de
préférence ; `ConversationLayout` n'est plus re-rendu par les events de présence via
`useParticipants` ; header/modal/settings isolés des mutations des autres conversations.

**Gain mesuré (First Load JS, `next build` avant → après)** :
| Route | Avant | Après | Δ |
|-------|-------|-------|---|
| `/admin/analytics` | 517 kB | 414 kB | −103 kB |
| `/admin/ranking` | 529 kB | 421 kB | −108 kB |
| `/links/tracked/[token]` | 417 kB | 304 kB | −113 kB |
