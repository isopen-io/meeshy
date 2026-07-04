# U1 + U3 — Design system du reader (transition zoom + matériaux)

## U1 — Transition tray→viewer (iOS 18+ `.navigationTransition(.zoom)`)
Constat (it.39) : le viewer est présenté par `fullScreenCover(item:)` depuis RootView:502
(+ 4 autres sites : ConversationView ×2, StoryTrayView, iPadRootView ×2). La transition
zoom 18+ exige `matchedTransitionSource(id:in:)` sur la BULLE du tray et
`.navigationTransition(.zoom(sourceID:in:))` sur le contenu du cover — un `@Namespace`
PARTAGÉ entre le tray et le point de présentation (RootView coordonne via
`storyViewerCoordinator.pendingRequest` : le namespace doit voyager avec la request).

### Incréments
1. RootView + StoryTrayView seulement (le chemin principal) : namespace dans le
   coordinator, `matchedTransitionSource` sur `MeeshyAvatar` du tray (id = group.id),
   `.navigationTransition(.zoom)` gated `if #available(iOS 18, *)` sur le container.
   NE PAS toucher : appearScale/drag-dismiss (it.33), l'interstitiel (zIndex 30),
   le cube inter-groupes. Vérif simulateur OBLIGATOIRE (transition = pur visuel).
2. Sites secondaires (ConversationView, iPad) — même pattern, un par un.
3. Fallback 16-17 : comportement actuel inchangé (gating strict).

## U3 — Chrome du reader en matériaux natifs
Constat : header/footer/sidebar utilisent des fonds opacity custom (grep `.opacity(0.2)`
dans les contrôles). Cible : `.ultraThinMaterial` + teinte indigo (règle design system),
`colorScheme` .dark épinglé sur les surfaces verre (mémoire Light-sur-verre) ; iOS 26 :
adopter `glassEffect` SI l'API est dans le SDK cible — sinon différer (ne jamais casser 16-25).

### Incréments
1. Sidebar d'actions (like/répondre/partager/son) → capsules material.
2. Header (avatar/nom/expire) → bande material discrète.
3. Composer de commentaire du reader (déjà partiellement material ? vérifier).

## Pièges
- JAMAIS retirer d'effet visuel existant (règle user ferme).
- Toute étape = vérif simulateur avec screenshots avant commit.
- `.navigationTransition` sur fullScreenCover : vérifier le comportement avec
  l'interactive dismiss custom du viewer (drag vertical) — risque de conflit gestuel.
