# K11 — MeeshyExpandingPill (la pilule qui s'ouvre vers le haut)

Relevé sur `origin/dev` `fa00e224ab` le 2026-11-12. Registre : `.claude/workflows/meeshy-kit-planche.lots.json`, entrée K11 (chantier #17312, milestone 258 ; issue du lot #17788). Lois 6, 7, 12, 13 et 16 de `docs/product/composer-vue-finale.md` ; lois 14 et 17 de `docs/product/appels-vue-finale.md`. Planche : `.xp.glass.deep` (ligne 29), `.xp`, `.xph`, `.xpr` (50 à 53), `xpill` (226), `toolPanel` (251). Vues : `xpill()` R7, R8, R9, S1 à S5, P5 ; `toolPanel()` O5 à O8 ; `.xp` écrit en direct R12, P4, O9, O10 ; appels G3. Dépend de K00 et de K10 (donc K01, K02). K10 est fusionné sur iOS seulement : les lots Android et web de K11 attendent K10 sur leur plateforme. Les entrées de catalogue K11 existent, vides, sur les trois plateformes.

## 1. Rôle
Ouvre une option à réglages ou une confirmation DANS la pilule K10, qui grandit vers le haut : en-tête ‹ Retour · titre · Fermer, corps fourni par l'hôte, rangée de la pilule gardée en pied ou retirée.

Il ne fait pas :
- le verre, sa largeur, son morphisme, la rangée, le retrait (`stowed`), l'ancrage : K10 ; le ton et la densité : K01 ; les boutons : K02 ;
- le contenu du corps (K03 à K08, K19, K21, lignes à cocher de R7, liste de R9) ni son état vide, chargement, erreur, hors ligne ;
- la pile des niveaux (où ‹ ramène), l'option ouverte, l'application en direct d'un réglage, le pas d'annulation, ce qu'un toucher sur la scène referme : l'hôte ;
- ce que la confirmation détruit, les libellés traduits des choix ;
- une liste longue ou une feuille (K15), un mode plein écran (K16), le menu du (…) (K18), la capsule de refus (K14).

## 2. API (mêmes noms sur les trois plateformes)
| | iOS `MeeshyUI/Kit/MeeshyExpandingPill.swift` | Android `me.meeshy.ui.component.kit` | Web `components/kit/meeshy-expanding-pill.tsx` |
|---|---|---|---|
| Pilule | `MeeshyExpandingPill(label:option:onBack:onClose:…buttons:primary:headerTrailing:content:)` | `MeeshyExpandingPill(label, option, modifier, onBack, onClose, …, primary, headerTrailing, buttons, content)` | `<MeeshyExpandingPill label option onBack onClose … primary headerTrailing buttons>{(option) => …}</MeeshyExpandingPill>` |
| Option | `MeeshyExpandingPillOption(id:title:showsHeader:keepsRow:)`, `Equatable` | `data class` identique | objet de même forme |
| En-tête seul | `MeeshyExpandingPillHeader(title:onBack:onClose:trailing:)` | idem | `<MeeshyExpandingPillHeader>` |
| Confirmation | `MeeshyPillConfirmation(title:message:cancel:confirm:)` | idem | `<MeeshyPillConfirmation>` |
| Choix | `MeeshyPillChoice(title:role:hint:action:)`, `MeeshyPillChoiceRole { neutral, destructive }` | idem | objet et union de chaînes |
| Lois pures | `MeeshyExpandingPillRule`, `MeeshyExpandingPillRecipe` | `object` identiques | `meeshy-expanding-pill-recipe.ts` + `styles/kit-expanding-pill.css` |

Paramètres, tous opaques, mêmes défauts partout :
- `label` (obligatoire) : le nom de la pilule, remis à K10 ; `option: MeeshyExpandingPillOption? = nil` : `nil`, c'est K10 au repos, sans rien de plus ;
- `option.id` (son changement déclenche le fondu enchaîné), `option.title` (obligatoire : nom dit, et titre peint si `showsHeader`), `showsHeader = true`, `keepsRow = true` ;
- `onBack: (() -> Void)? = nil` et `onClose: (() -> Void)? = nil` : un bouton n'existe que si son rappel existe ; `onEscape: (() -> Void)? = nil` : Échap, retour matériel et échappement du lecteur d'écran, par défaut `onBack`, sinon `onClose` ;
- `backLabel = « Retour »` et `closeLabel = « Fermer »` du kit (`kit.expanding_pill.back`, `.close`), que l'hôte remplace (« Retour aux actions ») ;
- `maxBodyHeight: CGFloat? = nil` (défaut : la loi du § 6) ; `isBodyScrollLocked = false` (un geste du corps tient le défilement) ; `takesFocus = true` (faux pendant une saisie : le clavier reste) ;
- remis tels quels à K10 : `presence` (`shown` ou `stowed` ; K11 choisit seul `withoutRow`), `layout`, `tone`, `showsDivider`, `expandedMaxWidth`, `onRevive` ; web seulement : `restoreFocusTo`, `backEntry = true`, `data`.

Emplacements : `buttons(size)` et `primary` (ceux de K10, inchangés), `content(option)` (le corps de l'option reçue, y compris celle qui part), `headerTrailing` (avant ✕ : le compteur « 86 / 1000 » d'O9, la bascule Traduit / Original du journal). La confirmation est un corps : `content` rend `MeeshyPillConfirmation` sous une option `showsHeader: false, keepsRow: false`.

## 3. États
- Fermée (`option == nil`) : la pilule K10 au repos, serrée, densité `regular` : R2.
- En-tête ‹ · titre · ✕, rangée gardée : R7 (lignes à cocher, indisponibles grisées avec leur raison), R8 (« Publier le post »), S1 à S5, P5 (rangée sans Média, « Publier l'humeur »).
- En-tête ‹ · titre · ✕, sans rangée : R9, O10.
- En-tête ‹ · titre · accessoire de fin, sans ✕ ni rangée : O9.
- Sans en-tête, rangée de l'objet gardée, l'outil courant en disque blanc (K02 `active`) : O5 à O8.
- Confirmation, ni en-tête ni rangée : R12 (titre, phrase, Annuler · Tout effacer), P4 (titre seul, Garder le brouillon · Abandonner).
- Avec filet entre corps et rangée (`showsDivider`) : appels G3 (Enregistrer, Réagir) ; ✕ seul et bascule en `headerTrailing` : le journal.
- Option qui en remplace une autre (R7 vers R8, panneau vers panneau des appels) : fondu enchaîné dans le même verre.
- Conservés du code, sans vue : corps plus haut que le plafond (il défile, en-tête et rangée fixes), ton `onLight` (K01), pilule rangée par l'hôte pendant qu'une option est ouverte (K10).
- Vide, chargement, erreur, hors ligne : ceux du corps ; la pilule garde sa largeur et suit sa hauteur.

Loi 13 :
- pas de ‹ sans `onBack`, pas de ✕ sans `onClose`, pas d'en-tête sans titre peint ni bouton ni accessoire ; le titre reste centré, la place d'un bouton absent est réservée ;
- pas de bouton « OK » ni « Valider » : un réglage s'applique en direct (loi 7) ; pas de poignée de glissé ; pas de voile sur la scène, qui garde sa taille et reste touchable ;
- pas de filet sans rangée ; pas de rouge hors du choix destructif d'une confirmation ; pas de second verre ;
- un corps de hauteur nulle sans en-tête : la pilule reste fermée, jamais une bande vide ;
- grand écran (I1 à I4) : l'hôte ne monte pas la pilule (loi 15) ; K11 n'a pas de variante large, il tient sous `expandedMaxWidth` (560).

## 4. Gestes et retours
- ‹ appelle `onBack`, ✕ appelle `onClose`, une fois, au relâcher. Échap, retour matériel (Android, coque web par `useBackDismiss`) et échappement du lecteur d'écran appellent `onEscape` ; fermée, K11 n'écoute rien (ni `BackHandler`, ni entrée d'historique).
- Aucun glissé ne ferme. Un toucher hors du verre n'est pas capté : l'hôte décide (loi 5). Le débord de 8 de K10 vaut aussi agrandie.
- Le corps défile à la verticale au-delà du plafond, sous un fondu de bord ; un toucher dans le corps ne renvoie pas le clavier (#9146).
- Confirmation : le choix neutre appelle `cancel.action`, l'autre `confirm.action` ; `onEscape` vaut Annuler.
- Haptique : K11 n'en joue aucune. ‹ et ✕ jouent le `light` de K02 par le site unique ; chaque choix d'une confirmation joue un `light` par le même site ; le retour du résultat est à l'hôte.
- Ouverture et fermeture : le morphisme de K10 (le verre seul change de taille, ancré en bas) ; le contenu entre et sort en fondu avec une échelle de 0,94 ancrée en bas (iOS, Android) ou un glissement de 8 (web). Ce qui part reste peint, inerte et muet, jusqu'au terme de son fondu.
- Changement d'option : fondu enchaîné pendant que le verre se redimensionne ; même `id`, aucun mouvement.
- « Réduire les animations » : fondu seul, 200 ms, ni échelle ni glissement ; le verre suit K10.

## 5. Accessibilité
- Nom du panneau : `option.title` ; rôle : groupe nommé (web `role="group"` + `aria-labelledby`). Le titre est un en-tête. La confirmation est modale pour le lecteur d'écran (iOS `.isModal`, Android volet nommé, web `role="alertdialog"`, `aria-describedby` sur la phrase, Tab enfermé entre les deux choix).
- Valeur : aucune pour K11 ; « outil courant » et « coché » sont dits par K02 et par le corps.
- Ordre de lecture : ‹, titre, accessoire, ✕, corps, puis la rangée et `primary` (K10).
- Focus : à l'ouverture il va au titre (au choix neutre pour une confirmation), sans ouvrir de clavier, sauf `takesFocus` faux ; à la fermeture il revient à ce qui a ouvert (web : `restoreFocusTo` ; iOS : même limite que K15, suivie par une issue).
- Web, clavier : Tab parcourt en-tête, corps, rangée ; Échap appelle `onEscape` sans remonter ; anneau `:focus-visible` de K01 et K02.
- Dynamic Type, `fontScale` 2,0, zoom 200 % : le titre passe sur deux lignes puis se tronque, les disques ne grandissent pas, le corps grandit puis défile ; les deux choix d'une confirmation s'empilent quand ils ne tiennent plus côte à côte, le destructif en dernier. Mesures web en `rem`.
- RTL : ‹ au bord de début avec son chevron retourné, ✕ au bord de fin ; neutre au début, destructif à la fin.
- Contraste : titre et corps sur verre `dense` de K01, en `deep` comme en `onLight`, clair et sombre ; le texte secondaire (blanc 70 %) et le libellé blanc du choix destructif tiennent 4,5:1, mesuré. « Réduire la transparence » : fond plein de K01.
- Cibles : 44 pt, 48 dp, 44 px pour ‹, ✕ et chaque choix.

## 5 bis. Performance
- Ne se re-rend jamais : la rangée et `primary` quand une option s'ouvre, change ou que son corps bouge ; l'en-tête quand le corps change (comparé sur titre, présence des boutons et libellés) ; la scène derrière. K11 n'observe aucun magasin.
- S'anime : la taille du verre seul (K10), l'opacité et la transformation du contenu. Jamais le flou, l'ombre ni la mise en page du corps.
- Un seul flou : celui de K10 ; ‹, ✕ et les choix sont des fonds pleins, déclarés emboîtés.
- Le corps n'est monté qu'ouvert. Sa hauteur est mesurée au changement de taille, pas à chaque image ; le conteneur qui défile ne s'active qu'au-delà du plafond. iOS : pas de `ViewThatFits` autour du corps (rendu asynchrone d'iOS 26, #9456) : mesure en fond, plafond, défilement.
- Rien de retenu une fois fermé ou l'écran quitté : double de sortie, animation, observateur de taille, `BackHandler`, entrée d'historique.
- Budget : aucune image perdue à l'ouverture (R2 vers R7), au changement (R7 vers R8) ni pendant qu'un des onze curseurs d'O5 glisse.

## 6. Jetons et mesures
Mesures de la planche : marge intérieure 10 en haut et en bas, 12 sur les côtés ; écart 12 entre en-tête, corps et rangée ; en-tête : ‹ et ✕ en K02 `soft` de 40, titre 16 gras centré ; rangée centrée, écart 6 ; confirmation : marge 16, titre 16 gras centré, phrase 13 à 70 %, deux choix de 44 de haut, rayon 22, largeur égale, écart 8, neutre en voile blanc, destructif en rouge plein. Le rayon 30 de `.xp` cède au 32 de K10 : c'est le même verre.

Loi de hauteur : le verre entier ne dépasse pas 62 % de la hauteur de l'hôte (R9, la vue la plus haute, en prend 58 %) ; plafond du corps = cette part moins l'en-tête et la rangée, jamais sous 160 ; `maxBodyHeight` la remplace (grille d'un appel de groupe, journal).

Jetons : `MeeshySpacing.md` (12), `smPlus` (10), `sm` (8), `lg` (16), `xsPlus` (6) ; boutons `MeeshyGlassButtonSize.s40`, genre `soft` ; titre au style « headline » du design system ; phrase et texte secondaire `MeeshyColors.mediaChromeSecondary` ; encre `MeeshyColors.onMedia` ; fonds des choix : le voile `soft` et le rouge `destructive` de `MeeshyGlassButtonRecipe`. Sans jeton, donc dans `MeeshyExpandingPillRecipe` seulement : la part de 62 %, le plancher de 160, l'échelle 0,94, le glissement de 8, le rayon 22. Durées et ressort : ceux de `MeeshyGlassPillRecipe`. Aucun appel à `glassEffect`, `adaptiveGlass`, `backdrop-filter` ni classe `.glass*` dans les fichiers de K11.

Vecteurs communs : `docs/product/kit/K11-MeeshyExpandingPill.vectors.json` (présence remise à K10, boutons d'en-tête, plafonds).

## 7. Jumeaux
K11 ne rebranche aucun écran.
- iOS. DEVIENT le composant : `CallPanelHeader` et `CallPanelHeaderButton` (`CallPillRow.swift`), la mesure plafonnée de `ComposerPropertiesSheetPlate` et sa loi `ComposerPropertiesSheetLayout`, `unfoldTransition` (`CallView+Pill.swift`).
- iOS, supprimés : par I1, `CallPanelHeader`, `CallPanelHeaderButton`, `unfoldedRows`, `unfoldTransition` et leurs emplois (`CallRecordingPanel`, `reactionPanelRows`, `CallJournalPanel`) ; par I5, `ComposerInlineToolPanel`, `ComposerPropertiesSheetPlate`, `ComposerPropertiesHeader` ; par I6, l'en-tête de `ComposerBackgroundModifySheet` et de `ComposerFrameBand` ; par I2, le `confirmationDialog` « Tout effacer » de `ComposerSceneMoreMenu` (R12) ; par I7, celui de `MeeshyComposerHost+AnchoredSheet.swift` (P4). `CallPillRow`, `CallPillChip`, `familyRows` et `CallScreenLayer` restent à l'app : contenu et état.
- Android. DEVIENT : `CallPillPanel`, `CallPanelCloseButton` (`CallPillPanel.kt`), `UnfoldedContent` et `HeldLayer` (`CallControlsPill.kt`), le retour système de `rememberEditingLevels` (`ComposerEditingRail.kt`).
- Android, supprimés : par I1, ces quatre-là ; par I5, `EditingRailLevels` et `SceneLevelBack` (`ComposerRailStack` reste : c'est l'état) ; par I2, `StoryAudienceSheet` pour la liste d'audience (R9) ; par I6, `BackgroundRemoveConfirmation` (`AlertDialog`).
- Web. DEVIENT : `CallPanelFrame` (`call-panel-frame.tsx` : en-tête, réserve du ‹ absent, Échap, ordre de focus, `trailing`), `DeckContent` et `leaveAsGhost` (`call-deck-motion.tsx`), le plafond qui défile de `Deck`.
- Web, supprimés : par I1, `CallPanelFrame` et ses emplois (`call-control-panels.tsx`, `call-journal-panel.tsx`, `call-people-sheet.tsx`, ces deux derniers par `MeeshyExpandingPillHeader` seul), `DeckContent`, `leaveAsGhost` ; par I5 et I6, `StudioInlinePanel` (`routes/story-compose-inline-panel.tsx`).
- Ne sont PAS des jumeaux : `ConfirmDialog`, `admin/confirm-sheet.tsx` et `Sheet` (confirmations et feuilles du reste de l'application), `PanelRow` et `CHIP` (contenu, K04), `glass-surface.tsx`, `composer-*` (barre de message), `scene-*` (lecteur), `story-*` (rails du lecteur) ; `ComposerSceneMoreMenu` comme menu (feuille Plus, K15) ; `ComposerTrailingOptionsPlate` (dessin, K16).

## 8. Témoins exigés
Comportements (`MeeshyExpandingPillTests`, `MeeshyExpandingPillTest`, `meeshy-expanding-pill.test.tsx`, vecteurs communs) :
- chaque vecteur (option, `keepsRow`, `showsHeader`, rappels, présence de l'hôte) rend la présence remise à K10, les boutons d'en-tête et le filet attendus ;
- fermée, la pilule est celle de K10 : serrée, densité `regular`, jamais élargie à 560 ;
- plafond : sous lui pas de défilement, au-delà le corps défile, en-tête et rangée fixes ;
- ‹, ✕ et `onEscape` partent une fois ; rien ne part fermée ; aucune entrée d'historique ne reste ;
- changer `id` : fondu enchaîné, le contenu qui part reste jusqu'au terme, inerte et absent du lecteur d'écran ; même `id` : rien ;
- la rangée ne se re-rend pas quand l'option s'ouvre, change ou que le corps bouge ; l'en-tête non plus quand le corps bouge ;
- confirmation : chaque choix part une fois, destructif en dernier, empilés quand la largeur manque, Échap vaut Annuler, ni en-tête ni rangée ;
- accessibilité : nom, en-tête, ordre, focus à l'ouverture et rendu à la fermeture (web), piège de tabulation de la confirmation, chevron retourné en RTL ;
- un seul verre demandé à K01 ; les fichiers de K11 n'en écrivent aucun ; « réduire les animations » : fondu seul ; contraste du choix destructif et du texte secondaire mesuré.

Instantanés (clair, sombre, grande police, RTL ; `-iOS26` et verre dessiné ; 390, 820 et 1440 px sur le web) : `formats` (R7), `disposition` (R8), `audience` (R9), `fond` (S1), `duree` (S5), `humeur` (P5), `outil` (O5), `description` (O9), `temps` (O10), `confirmation` (R12), `confirmation-courte` (P4), `appel` (G3, filet), `clair`, `defile`. Les images de référence partent dans la PR du lot (K02 a été retiré de `dev` pour les avoir omises).

Catalogue : entrée K11 remplie sur les trois plateformes, mêmes identifiants d'état, avec une bascule « ouvrir, changer d'option, fermer » qui joue le morphisme.

Preuve : gardes locales vertes, puis CI ; si les runs de branche sont annulés, le lot se fusionne dans `dev` et se prouve sur `dev` ; rouge sur `dev`, il est corrigé ou retiré aussitôt.

## 9. Écarts et choix retenus (mode autonome)
1. Forme. La planche dessine `.xp` comme un bloc à part ; K10 a tranché un seul verre. Retenu : K11 ENVELOPPE K10 (il pose en-tête et corps dans `above` et choisit `withoutRow`). Écarté : un simple contenu que l'hôte range lui-même dans `above` ; un second verre.
2. `above` statique sur iOS. `MeeshyGlassPill` décide `hasAbove` par le TYPE de l'emplacement : avec un `above` conditionnel, la pilule au repos serait `dense` et étirée à 560. Retenu : le lot iOS ajoute à K10 un paramètre interne de présence du dessus, seul ajout permis à ses fichiers, API publique inchangée. Écarté : mesurer un dessus vide (une image de retard), deux pilules distinctes (le morphisme sauterait).
3. En-tête. Trois formes sur la planche (complet, sans ✕ en O9, absent en O5 à O8). Retenu : un bouton existe si son rappel existe, `showsHeader` coupe tout. Écarté : un énuméré de formes.
4. Échap et retour système. Android descend d'un niveau, le web des appels ferme tout. Retenu : `onEscape`, par défaut ‹ sinon ✕ ; les appels du web passent `onClose` à I1 pour ne rien changer.
5. « OK » du composer iOS (`ComposerPropertiesHeader`). Retenu : il disparaît, ‹ et ✕ referment le niveau et le réglage s'applique en direct (loi 7) ; aucune fonction perdue.
6. Hauteur. Code : 42 % de la fenêtre (composer iOS), 340 dp (Android), `100dvh − 13rem` (web), `ViewThatFits` (appels iOS). Retenu : 62 % de l'hôte pour le verre entier, plancher 160, corps qui défile, `maxBodyHeight` pour l'hôte. Écarté : 42 % (R9 défilerait, contre la planche), aucun plafond.
7. Boutons et titre d'en-tête. Les deux planches montrent ‹ et ✕ en `soft` de 40 et un titre de 16 gras ; le code des appels a des disques de verre et un titre de 13. Retenu : la planche ; I1 le dit dans sa PR, captures à l'appui.
8. Choix d'une confirmation. `MeeshyModeCapsule` (K16) n'a ni genre neutre ni destructif et pose du verre. Retenu : deux capsules à fond plein dessinées par K11 avec les fonds de la recette K02 ; une issue de suivi demande une seule capsule à libellé pour K11, K13 et K16. Écarté : étendre K16 depuis ce lot.
9. Rouge. La planche met du blanc sur rouge plein ; `ConfirmDialog` du web l'interdit faute de contraste. Retenu : la planche, à condition de tenir 4,5:1, avec le rouge du design system qui le tient ; témoin de contraste. Écarté : texte rouge sur voile neutre.
10. Confirmation. Le code emploie `confirmationDialog`, `AlertDialog`, `ConfirmDialog`. Retenu : dans la pilule, sans voile, modale pour le lecteur d'écran, pour R12 et P4 (I2, I7) ; les autres confirmations du composer sont tranchées par leur lot d'intégration.
11. Teinte du plateau (`plateauTint` à 55 % sur iOS) et rayon 30. Retenu : ton `deep` et densité `dense` de K01, rayon 32 de K10.
12. Place. iOS ouvre une feuille basse qui réduit la scène, le web un panneau en haut à droite. Retenu : dans la pilule, la scène garde sa taille (loi 7) ; le changement d'écran est à I5 et I6.
13. Hôtes hors pilule (colonne du journal du web, feuille Ajouter, journal iOS). Retenu : `MeeshyExpandingPillHeader` exposé seul.
14. Glisser vers le bas pour fermer. Écarté : c'est le geste de K15.
15. Registre. R9 y est cité deux fois ; O5 à O9 n'y sont pas alors que `toolPanel` et O9 sont cette pilule agrandie. Retenu : K11 couvre les dix-sept vues du § 3.

Aucune question ne reste au porteur.

## 10. Réalisation iOS (lot K11, 2026-11-12)
Fichiers : `MeeshyExpandingPill.swift` (la pilule), `MeeshyExpandingPillPanel.swift` (panneau et corps mesuré), `MeeshyExpandingPillHeader.swift` (en-tête et mots), `MeeshyPillConfirmation.swift` (confirmation, choix, disposition), `MeeshyExpandingPillModels.swift` (option, choix, rôle), `MeeshyExpandingPillRecipe.swift` (recette et lois pures). K10 reçoit un seul ajout interne (`aboveIsShown`), sans changement d'API publique.

- Rouge du choix destructif (§ 9.9) : `MeeshyColors.errorInk` (5,7:1 avec le blanc). `errorStrong`, le rouge de K02, n'y tient que 3,8:1 : K02 le destine à un GLYPHE (3:1), un libellé de choix en exige 4,5.
- Ouverture : `MeeshyExpandingPillRule.isOpen` garde la pilule fermée pour un corps de hauteur nulle sans en-tête ; le panneau reste monté (il mesure), K10 reçoit `aboveIsShown: false`.
- Hôte : `.frame(maxHeight: .infinity)` donne à K11 la hauteur que l'ancrage offre (`MeeshyGlassPillDock`) ; hors d'un ancrage, `maxBodyHeight` fixe le plafond.
- Aucun écran n'est rebranché : les jumeaux du § 7 restent en place jusqu'à I1, I2, I5, I6 et I7, qui les remplaceront par ce composant.
