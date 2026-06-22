# Plan — Itération 59w (web)

## Objectif
Solder le différé borné **focus-trap des dialogues hand-rolled** ouvert depuis
56wb/58w. L'itération 58w a posé Escape + `role="dialog"`/`aria-modal`/
`aria-labelledby` sur les deux modales maison `ConversationDrawer` et
`AgentTopicEditModal`, en différant explicitement le focus-trap complet (cycle
Tab + restauration du focus) à 59w+. On le livre ici.

## Contexte / état du métier
Pattern ARIA « dialog » (APG) : à l'ouverture, le focus entre dans la boîte de
dialogue et reste piégé (Tab/Shift+Tab cyclent à l'intérieur) ; à la fermeture,
le focus **revient sur l'élément déclencheur**. Sans ça, un utilisateur clavier
retombe en haut de page — rupture d'orientation (WCAG 2.4.3 Focus Order, 2.1.2
No Keyboard Trap satisfait par le cycle interne + Escape déjà présent).

## Découverte clé (épuration)
Un hook **`useFocusTrap(containerRef, isActive)` existe déjà** dans
`apps/web/hooks/use-accessibility.ts` (cycle Tab + focus initial) mais **n'a
AUCUN consommateur** (`grep` = 1 seule occurrence, la définition). On le
réutilise plutôt que de dupliquer la logique inline (le pattern frère
`components/v2/Dialog.tsx` la duplique ; on ne le retouche pas — déjà conforme).

## Changements

### 1. `hooks/use-accessibility.ts` — `useFocusTrap`
- **Générique** `<T extends HTMLElement>` + signature `RefObject<T | null>` :
  laisse passer un `useRef<HTMLDivElement>(null)` sans cast (variance React 19) ;
  capture `container` AVANT le garde pour la narrowing TS.
- **Restauration du focus** (nouveau) : mémorise `document.activeElement` à
  l'activation ; au cleanup (désactivation ou démontage), rend le focus au
  déclencheur s'il est toujours `isConnected`. Bénéficie à tous les futurs
  consommateurs. Zéro consommateur actuel → zéro régression.

### 2. `components/v2/ConversationDrawer.tsx`
- `useRef<HTMLDivElement>` + `ref` sur le `<div role="dialog">`.
- `useFocusTrap(drawerRef, isOpen && mounted)` — gate sur `mounted` car le nœud
  n'existe qu'une fois monté (le ref n'est pas attaché au render null initial) ;
  la restauration se déclenche quand `isOpen` repasse `false`.

### 3. `components/admin/agent/AgentTopicEditModal.tsx`
- `useRef<HTMLDivElement>` + `ref` sur le `<div role="dialog">`.
- `useFocusTrap(modalRef, true)` — la modale n'est montée par le parent que
  lorsqu'ouverte ; le ref est présent dès le 1er render → `isActive` constant.

## Hors périmètre (assumé)
- `ImageGallery`/`MediaImageCard` lightboxes (Escape+Arrow+scroll-lock mais sans
  trap) → candidats 60w+, périmètre distinct (visionneuse média, pas formulaire).
- `components/v2/Dialog.tsx` : trap déjà inline, conforme — ne pas retoucher.
- Pas de changement i18n / locale.

## Vérification
- node_modules absent dans le container routine → délégué au CI (typecheck/build).
- Validé localement par revue : typage React 19 (`RefObject<T|null>` accepté par
  `ref` ; narrowing OK), gate `mounted` corrige le piège du ref non attaché.

## Suite (différé restant)
- Focus-trap lightboxes média (`ImageGallery`, `MediaImageCard`).
- `Badge` success/warning/gold off-palette → arbitrage `theme.colors.*` vs `gp-*`.
- `app/settings/loading.tsx` i18n server-side ; `next-themes` orphelin ; logs FR.
