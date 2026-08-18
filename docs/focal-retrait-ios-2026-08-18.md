# Retrait du mode Focal iOS — 2026-08-18

**Décision produit** (arbitrage utilisateur, session du 2026-08-18) : « On
abandonne le mode Focal pour le moment, on garde le mode Script avec une
fluidité parfaite de défilement ultra optimisée. Le code du mode Focal est
supprimé de la compilation et documenté correctement, car ça bogue trop. »

## Pourquoi

Le mode Focal (perspective au défilement : élection d'une rangée « élue »,
échelle/alpha par courbe gelée, atterrissage sur bande de focus) a accumulé
des bogues de défilement jamais complètement éteints malgré trois passes de
fond (ré-ancrage spec, plafond de compensations, reconfigure ciblé) :

- crashs SIGTRAP récurrents sur fling violent (récursion
  `_updateVisibleCellsNow` — garde de ré-entrance UIKit) ;
- micro-sauts de scène au repos et à l'arrêt de geste ;
- coût par frame du pass de compositing incompatible avec le budget < 1 ms.

Script rend la MÊME rangée plate (`FocalRow`), sans perspective, et sert
désormais de mode de lecture nominal.

## Ce qui est supprimé (plus compilé)

Code app (`apps/ios/Meeshy/Features/Main/Focal/`) :

| Fichier | Rôle |
|---|---|
| `Scroll/FocalScrollPass.swift` | Le pass de perspective par frame |
| `Scroll/FocalPerspectiveGeometry.swift` | Géométrie échelle/alpha |
| `Scroll/FocalPassConstants.swift` | Cotes hors-token du pass |
| `Scroll/FocalPerspectiveCell.swift` | Cellule porteuse du transform |
| `Scroll/FocalFocusDecoration.swift` | Carte de focus (CALayer) |
| `Row/FocalFocusControlBar.swift` | Barre de contrôles de l'élue |
| `Agent/FocalBridgeRow.swift` | Rangée pont agent (jamais montée) |

Tests supprimés : `FocalScrollPassGeometryTests`,
`FocalScrollPassSourceGuardTests`, `FocalPerspectiveCellTests`,
`FocalFocusDecorationTests`, `FocalSpecCurveTests`,
`FocalHostCallSiteMountGuardTests`, `FocalHostSourceGuardTests`,
`FocalHostInsetCompositionTests`, `FocalConversationStartMountTests`,
`FocalScrollPassPerfTests`, `NullAssistProviderTests`,
`FocalBetaPreviewMenuItemSourceGuardTests`.

Machinerie hôte retirée de `MessageListViewController` : les six sites
d'appel du pass, `primeFocalCell`, les atterrissages « bande de focus »
(`landOnFocusBand` — remplacés par `scrollToItem(.centeredVertically)`
partagé recherche/citation), la typographie de focus à l'arrêt
(`reconfigureFocusTypographyAtScrollStop`), l'inset de tête
(`headInset`/`computeHeadInset`), `usesPerspective`, l'append de
`.conversationStart` (registration conservée inerte). Champs de focus
retirés de `FocalRowInput` (`isFocused`, `sentAt`), de
`FocalIdentityHeader` et `FocalMetaRow` (magnification de l'élue).

## Ce qui reste (délibérément)

- **`FocalRow` et toute sa famille** (`Row/`, `Chrome/`) : c'est la rangée
  plate du mode Script — identité, blocs média/audio/citation, effets,
  réactions, accessibilité. `FocalAudioBlock.flatChrome = .flatFocused`
  (tenue plate complète pour toutes les rangées).
- **`FocalFocusCurve` (`Core/`)** : miroir de la loi PARTAGÉE
  `packages/shared/utils/focus-curve.ts` — la Lentille consomme la variante
  `.list` (`electFocusRow`, `focusBandOffset`). Les constantes `thread`
  restent comme miroir de la loi ; le web garde son Focal.
- **`ReadingModeOrchestrator`** : loi gelée intacte (vecteurs TS↔Swift).
  Elle peut rendre `.focal` (branche par défaut, préférences collantes
  historiques) — le clamp de CONSOMMATION iOS
  (`ReadingModeController.clampRetiredModes`) le rabat sur `.script`.
- **`MessageListLayout`** : la loi de stabilité du champ visuel sert le
  défilement Script (compensation d'offset + entonnoir anti-récursion, cf.
  ci-dessous).
- **`FocalMetrics`** : cotes de la rangée plate ; `Focus.avatarSize`/
  `Focus.textIndent` restent la règle CONSTANTE de gabarit (hauteur
  d'en-tête et retrait ne varient jamais — la liste ne saute pas).

Surfaces de mode : `ReadingModeLensCatalog.displayOrder = [.script,
.summary, .river]` ; items « Focal (bêta) » retirés des menus de liste.

## Stabilité du défilement Script (chantier du même jour)

Quatre itérations sur le SIGTRAP `_updateVisibleCellsNow` ×7 ont établi que
le self-sizing des cellules `UIHostingConfiguration` (iOS 16+) invalide le
layout SANS passer par `shouldInvalidateLayout(forPreferredLayoutAttributes:)`
ni par les compensations d'offset — les plafonds posés là ne suffisaient
jamais. Le verrou définitif est l'ENTONNOIR :
`MessageListLayout.invalidateLayout(with:)` avale les invalidations
PARTIELLES au-delà de `maxPartialInvalidationsPerTransaction` (4) et se
rattrape au tour suivant par une invalidation complète (jamais avalée).
Vérifié : 2 × 100 flings violents + 90 s de repos sans crash
(`MessageListLayoutOffsetTests`).

Réactivité (retours user du même jour) :
- boutons d'action/chrome de retour dès la LEVÉE du doigt
  (`setChromeHiddenForScroll`, piloté par `isDragging` seul), le flush des
  reconfigures différés attendant toujours le vrai arrêt ;
- pagination vers le haut cache-FIRST : la fenêtre GRDB se sert AVANT
  l'appel REST (`ConversationViewModel.loadOlderMessages`) — un gateway
  lent/mort ne retarde plus des rangées déjà sur disque.

## Restaurer le mode Focal

Le code complet (pass, géométrie, cellule, décoration, tests, câblage hôte)
vit au commit **`bce87148c`** — dernier état fonctionnel avec reconfigure
ciblé. Pour restaurer :

1. `git show bce87148c -- 'apps/ios/Meeshy/Features/Main/Focal/Scroll/*'`
   (et les autres fichiers listés ci-dessus) pour récupérer les sources ;
2. retirer `ReadingModeController.clampRetiredModes` et remettre `.focal`
   dans `ReadingModeLensCatalog.displayOrder` ;
3. re-câbler les six sites du pass dans `MessageListViewController`
   (diff inverse du commit de retrait) ;
4. reprendre les crashs de défilement là où ce document les laisse — le
   retrait n'a PAS résolu la dette du pass, il l'a retirée de la route.
