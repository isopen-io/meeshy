## 2026-08-18 : Retrait du mode Focal (perspective) — Script devient le mode de lecture nominal

**Statut**: Accepté (arbitrage utilisateur explicite)

**Contexte**: Le mode Focal (perspective au défilement : élection, échelle/alpha par courbe gelée, bande de focus, magnification de l'élue) a traversé trois passes de stabilisation (ré-ancrage spec §5, plafond de compensations d'offset, reconfigure ciblé par `changeVersion`) sans jamais éteindre complètement ses bogues de défilement — crashs SIGTRAP récurrents sur fling violent (récursion `_updateVisibleCellsNow`), micro-sauts de scène, coût par frame. L'utilisateur a tranché : « ça bogue trop ».

**Décision**:
1. **Le pass et sa machinerie sortent de la compilation** (`Focal/Scroll/**`, `FocalFocusControlBar`, `FocalBridgeRow`, six sites d'appel hôte, atterrissages bande de focus, inset de tête, typographie de focus, champs `isFocused`/`sentAt`). Le code complet reste récupérable au commit `bce87148c` — voir `docs/focal-retrait-ios-2026-08-18.md`.
2. **La loi PARTAGÉE reste intacte** (`ReadingModeOrchestrator`, miroir de `packages/shared/utils/reading-modes.ts` ; `FocalFocusCurve`, miroir de `focus-curve.ts` — la Lentille consomme `.list`). Le clamp vit à la CONSOMMATION iOS : `ReadingModeController.clampRetiredModes` rabat toute décision `.focal` (branche par défaut, préférences collantes historiques, forçage) sur `.script`. Le web garde son Focal.
3. **`FocalRow` reste** : c'est la rangée plate du mode Script — densité uniforme, zéro transform, gabarit CONSTANT (`Focus.avatarSize`/`Focus.textIndent` : hauteur d'en-tête et retrait ne varient jamais).
4. **Stabilité Script — l'entonnoir** : le self-sizing des cellules `UIHostingConfiguration` invalide le layout SANS passer par `shouldInvalidateLayout` ni par les compensations d'offset (quatre itérations de SIGTRAP l'ont prouvé) ; `MessageListLayout.invalidateLayout(with:)` avale les invalidations PARTIELLES au-delà de 4 par transaction et se rattrape au tour suivant par une invalidation complète. Vérifié : 200 flings violents + repos sans crash.
5. **Réactivité** : chrome de retour dès la LEVÉE du doigt (`isDragging` seul), reports de reconfigure jusqu'au vrai arrêt ; pagination vers le haut cache-FIRST (fenêtre GRDB servie AVANT le REST).

**Alternatives rejetées**:
- *Encore une passe de stabilisation du pass* : trois itérations sérieuses n'ont pas suffi ; le couple perspective-par-frame × self-sizing × liste inversée reste structurellement fragile sous UIKit.
- *Supprimer aussi `FocalRow`/`FocalFocusCurve`* : la rangée plate EST le mode Script, et la courbe est un miroir de loi partagée consommé par la Lentille — les retirer casserait des surfaces vivantes pour un gain nul.
- *Clamper dans la loi partagée* : le web garde son Focal ; la loi gelée et ses vecteurs TS↔Swift ne bougent pas pour une décision de plateforme.

**Conséquences**: les préférences collantes `.focal` historiques rendent `.script` sans migration de données ; toute restauration future doit reprendre la dette de stabilité là où le retrait l'a laissée (le retrait ne l'a pas résolue, il l'a retirée de la route) ; `ReadingModeLensCatalog.displayOrder` passe à trois modes et les items « Focal (bêta) » disparaissent des menus de liste.
