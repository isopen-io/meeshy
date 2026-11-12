# K10 — MeeshyGlassPill (la pilule de verre du bas)

Relevé sur `origin/dev` `7c6fe22812` le 2026-11-12. Registre : `.claude/workflows/meeshy-kit-planche.lots.json`, entrée K10 (chantier #17312, milestone 258 ; issue du lot #17725). Lois 1, 4, 5, 6, 13 et 17 de `docs/product/composer-vue-finale.md` ; lois 1, 11 et 17 de `docs/product/appels-vue-finale.md`. Planche : `.pill` (ligne 41), `pillItems` (210), `pill` (211), `TOOLS` (242), `objItems` (248), `objPill` (249), `retouchPill` (255). Vues : `pill()` R1, R2, R3, R5, R6, R10, R13, A7, A21, P1, P2, P3, P6 ; `objPill()` O1, O14, O4, O15, O2, O13, C3 ; `retouchPill()` C1, C2 ; la même pilule agrandie (K11, `xpill` et `toolPanel`) R7 à R9, R12, S1 à S5, P4, P5, O5 à O10. Dépend de K00, K01 et K02, fusionnés sur les trois plateformes. Les entrées de catalogue K10 existent, vides (iOS : remplie par ce lot).

## 1. Rôle
Un seul bloc de verre posé en bas porte une rangée d'emplacements, grandit vers le haut quand on lui confie quelque chose à montrer au-dessus, et se retire par son bord quand l'hôte le demande.

Il ne fait pas :
- son contenu : quels boutons, dans quel ordre, lequel est actif, la table d'outils par type d'objet (`ComposerPillGrammar`, `CallActionSet`, la table partagée avec la retouche) restent à l'app ;
- les boutons (K02), l'action principale et son anneau (K13, K09), l'en-tête Retour · titre · Fermer et le corps d'une option (K11), la capsule (K14), le menu du (…) (K18), les rails (K12), les cibles du glisser (K25), la piste de coupe (K21) : aucun n'est dans son verre, sauf ce que K11 pose dans `above` ;
- le verre, le ton et la densité : K01 ; la décision de se ranger (toucher la scène, écriture, glisser, mode plein écran, grand écran) : l'hôte ;
- l'haptique, les libellés traduits, la mise au point du lecteur d'écran quand le contenu change.

## 2. API (mêmes noms sur les trois plateformes)
| | iOS `MeeshyUI/Kit/MeeshyGlassPill.swift` | Android `me.meeshy.ui.component.kit` | Web `components/kit/meeshy-glass-pill.tsx` |
|---|---|---|---|
| Pilule | `MeeshyGlassPill(label:…buttons:primary:above:)` | `MeeshyGlassPill(label, modifier, …, primary, above, buttons)` | `<MeeshyGlassPill label … primary above>{(size) => …}</MeeshyGlassPill>` |
| Présence | `MeeshyGlassPillPresence { shown, withoutRow, stowed }` | `enum class` identique | `'shown' \| 'withoutRow' \| 'stowed'` |
| Disposition | `MeeshyGlassPillLayout { hug, spread(maxWidth: CGFloat = 440) }` | `sealed interface` identique | `'hug' \| { spread: number }` |
| Ancrage | `MeeshyGlassPillDock(bottomGap:minimumBottom:sideMargin:) { … }` | `MeeshyGlassPillDock(...)` | `<MeeshyGlassPillDock>` |
| Loi d'ajustement | `MeeshyGlassPillFit.resolve(availableWidth:buttonCount:primaryWidth:)` → taille, défile | `object` identique | `meeshyGlassPillFit(...)` |
| Loi de présence | `MeeshyGlassPillPresenceRule` (`duration`, `leavesByItsEdge`, `travel`, `acceptsTouches`) | idem | `meeshyGlassPillPresenceRule` |
| Valeurs | `MeeshyGlassPillRecipe` | idem | `meeshyGlassPillRecipe` + `styles/kit-glass-pill.css` |

Paramètres, tous opaques, mêmes défauts partout :
- `label` (obligatoire, non vide) : le nom du groupe (« Pilule du composer », « Outils du sticker », « Commandes de l'appel ») ;
- `presence = shown` ; `layout = hug` ; `tone: MeeshyGlassTone? = nil` (celui de l'hôte, par K01) ;
- `showsDivider = false` : le filet entre `above` et la rangée ; `expandedMaxWidth = 560` ;
- `buttonCount: Int? = nil` : le nombre de boutons de la rangée, quand l'hôte le sait ; sans lui, la pilule le déduit de la largeur mesurée de la rangée (voir § 9, 14) ;
- `onRevive: (() -> Void)? = nil` : un toucher reçu pendant le retrait ; le web ajoute `data` (sondes `data-*`).

Emplacements :
- `buttons(size)` : la rangée, du début à la fin ; il reçoit la taille K02 que la pilule a retenue (`s48`, `s44` ou `s40`) et la remet à ses boutons ;
- `primary` (optionnel) : l'action principale, toujours en dernier, jamais dans le défilement ;
- `above` (optionnel) : ce qui vit au-dessus de la rangée DANS le même verre (K11, sous-titres et journal des appels).

`MeeshyGlassPillDock` ancre en bas au centre, à `sideMargin = 12` des bords et à `max(zone sûre + bottomGap, minimumBottom)` du bas (`12` et `28`), sans suivre le clavier, et remet sa marge à la pilule pour la sortie. Un hôte qui s'ancre lui-même (les appels) passe sa marge par `.meeshyGlassPillStowMargin(_:)`, `LocalMeeshyGlassPillStowMargin`, `--kit-pill-stow-margin`.

## 3. États
- Repos, sans action principale : R1 (ton `plain`, trois boutons).
- Repos, avec action principale : R2, R5, R6, R10, A7, A21, P3 ; P6 (Enregistrer sans ▾).
- Un bouton actif, pilule inchangée : R3 ((…) ouvert), O2 ((…) de l'objet), C2 (Couper).
- Ton `onLight` : R13. Ton `deep` : toutes les autres.
- Action principale qui change de largeur (anneau, « Au retour en ligne ») : P1, P2 ; le verre suit par morphisme.
- Pilule d'objet ‹ · outils · (…) : O1, O14, O4, O15, O13, C3. Pilule de retouche : C1 (cinq outils en 48), C2 (sept outils : la loi d'ajustement choisit la taille).
- Agrandie, rangée gardée en pied (`above`, verre `dense`) : R7 à R9, S1 à S5, P5, O5 à O8.
- Agrandie sans rangée (`withoutRow`) : R12, P4, O9, O10 ; appels G1 (sous-titres seuls, #17343).
- Rangée (`stowed`) : R4, A1 à A5, O11, S6, S7 (écriture), O3, O12 (glisser), A8 à A10, A13, S8 à S10 (modes), feuilles ancrées (R11, A6, A11 à A19).
- Répartie (`spread`) : aucune vue du composer ; la pilule des appels sur iOS et Android, conservée.
- Défilement de la rangée (plus de boutons que de place en 40) : aucune vue, filet de sécurité.

Loi 13 :
- contenu de largeur nulle (ni bouton, ni `primary`, ni `above`) : aucun verre, jamais une bande vide ;
- pas de filet sans `above` ; pas de second verre dans la pilule (K02 y est sans fond en verre dessiné) ; la capsule, le menu et la piste de coupe sont des surfaces à part, au-dessus ;
- composer sur grand écran (I1 à I4) : l'hôte ne monte pas la pilule (loi 15) ; K10 n'a pas de variante large ;
- la pilule n'a pas d'état « désactivé » ni « chargement » : ce sont ceux de ses emplacements.

## 4. Gestes et retours
- La pilule ne porte aucun geste à elle et ne joue aucune haptique : chaque bouton joue la sienne par le site unique (K02).
- Débord : un toucher à moins de 8 de son bord reste à elle et ne traverse pas vers la scène (#8735).
- Retrait (`stowed`) : translation vers le bas de toute sa hauteur MESURÉE plus sa marge, et fondu, 250 ms ; retour par le chemin inverse. Elle répond jusqu'au TERME du fondu ; un toucher reçu pendant le retrait appelle `onRevive` sans prendre le toucher. Au terme, son contenu est retiré du rendu (ni toucher, ni focus, ni lecteur d'écran) en gardant sa place.
- `withoutRow` : la rangée se replie vers le bas dans le même verre, qui se resserre autour d'`above`.
- Morphisme : le verre suit la taille mesurée de son contenu, ancré en bas, le contenu rogné à sa forme. Ressort (réponse 0,35, amorti 0,85) sur iOS, 250 ms sur Android, 260 ms `cubic-bezier(0.2, 0.9, 0.3, 1)` sur le web ; interruptible, il repart de la taille affichée. La première mesure ne joue rien.
- « Réduire les animations » : retrait en fondu seul, 150 ms, sans déplacement ; taille du verre en 200 ms, sans ressort ni échelle.
- Changement de densité ou de ton : le fondu de K01 (200 ms).

## 5. Accessibilité
- Nom : `label`. Rôle : groupe de contrôles (iOS conteneur nommé, Android groupe de parcours nommé, web `role="toolbar"` et `aria-orientation="horizontal"` sur la rangée ; avec `above`, un `role="group"` nommé enveloppe le tout).
- Valeur : aucune. L'état d'un bouton (ouvert, enclenché) est dit par K02.
- Ordre de lecture : `above`, puis la rangée du début à la fin, `primary` en dernier.
- `stowed` : masquée au lecteur d'écran et au clavier (`inert` sur le web) dès le début du retrait. Sous VoiceOver ou TalkBack, ne pas ranger est la règle de l'hôte.
- Web, clavier : un seul arrêt de tabulation dans la rangée ; ← et → vont au voisin en boucle, inversés en RTL ; Début et Fin vont aux bouts ; Tab sort. `above` garde sa propre navigation. Anneau de focus : celui de K02 et de K01.
- Dynamic Type, `fontScale` 2,0, zoom 200 % : les disques ne grandissent pas (K02) ; le libellé de `primary` grandit, la loi d'ajustement réduit alors les boutons, puis la rangée défile ; `above` fait grandir la pilule en hauteur. Mesures web en `rem`.
- RTL : la rangée se retourne, `primary` reste à la fin ; le retrait reste vertical.
- Contraste : celui de K01 pour `plain`, `deep`, `onLight`, clair et sombre ; K10 n'ajoute ni voile ni encre. Le filet (blanc 14 %) ne porte aucune information. « Réduire la transparence » : fond plein de K01.
- Cible : 44 pt, 48 dp, 44 px par bouton (K02) ; l'écart de 6 laisse le débord de deux 40 voisins.

## 5 bis. Performance
- Ne se re-rend jamais : la rangée quand un bouton est pressé, quand `presence` change, ni quand le ton change (seule la surface de K01 le lit). La pilule n'observe aucun magasin.
- S'anime : la translation et l'opacité (retrait), la taille du verre seul (morphisme : `transform` d'un élément de verre à part sur le web, taille de la surface sur iOS et Android, lue en phase de dessin là où c'est possible). Jamais le flou, l'ombre ni la mise en page du contenu.
- Un seul flou pour la pilule et tout ce qu'elle porte ; sur iOS 26, un seul groupe de verre (`MeeshyGlassGroup`).
- La hauteur est mesurée à chaque changement de taille, pas à chaque image ; l'ajustement n'essaie que trois tailles, et seulement quand la largeur ou le contenu change.
- Rien de retenu une fois l'écran quitté : observateur de taille et animations en cours libérés. Web : le moteur du morphisme est un chunk à part, chargé à la première pilule qui porte `above`, pesé par `measure-weight.mjs`.
- Budget : aucune image perdue pendant le retrait et le retour avec vingt boutons à l'écran (R3), ni pendant le morphisme de R7.

## 6. Jetons et mesures
Mesures de la planche : hauteur 64 au repos (boutons de 48, marge 8), écart 6, rayon 32 (la moitié de la hauteur au repos), centrée, bas à 28 ; agrandie : bords à 12 de l'écran, marge intérieure 10 et 12, écart 12 ; capsule à 14 au-dessus, menu à 10 au-dessus.

Loi d'ajustement : `largeur(d) = n·d + (n−1)·6 + (primary ? 6 + largeur de primary : 0) + 16`, place = largeur de l'hôte − 24 ; on retient le premier `d` de 48, 44, 40 qui tient, sinon 40 et la rangée défile sous un fondu de bord de 8. Exemples : sept outils à 390 ⇒ 44 ; à 360 ⇒ 40 ; à 320 ⇒ 40 et défilement. Un `primary` seul (n = 0) pèse sa largeur plus 16, sans écart ; rien du tout pèse 0.

Jetons : écart `MeeshySpacing.xsPlus` (6) ; marge `MeeshySpacing.sm` (8) ; marge verticale de `spread` `MeeshySpacing.smPlus` (10, soit 68 de haut) ; bord d'écran `MeeshySpacing.md` (12) ; retrait du filet `MeeshySpacing.lg` (16) ; tailles `MeeshyGlassButtonSize` ; encre et matière : K01. Pas de jeton de 32 (`MeeshyRadius` s'arrête à 24, `--radius-sheet` vaut 24) : le rayon, les largeurs 440 et 560, les durées 250, 150 et 200 ms, le ressort, le débord de 8 et le filet à 14 % vivent dans `MeeshyGlassPillRecipe`, nulle part ailleurs. Aucun appel à `glassEffect`, `adaptiveGlass`, `backdrop-filter` ni classe `.glass*` dans les fichiers de K10.

Les vecteurs communs aux trois plateformes sont dans `docs/product/kit/K10-MeeshyGlassPill.vectors.json`.

## 7. Jumeaux
K10 ne rebranche aucun écran : il promeut l'enveloppe la plus complète, ses lois et ses témoins.
- iOS. DEVIENT le composant : l'enveloppe de `callControlsPill` et de `callControlsBlock` (`CallView+Pill.swift`), `callControlsGlass(in:)`, `CallEdgeStow`, `CallChromeVisibilityModifier`, les lois `CallChromeStow`, `CallChromeVisibility.acceptsTouches`, `CallPillWidth`, `pillHairline`.
- iOS, supprimés : par I1, ces sites pour le bord bas (`CallEdgeStow` reste pour l'en-tête jusqu'à K16, `callControlsGlass` de `CallModeCarousel` part avec K16 et celui de `CallView+Rails` avec K12) ; par I2, `socle` de `MeeshyComposerHost+Socle.swift` et la colonne de `ComposerRestChrome`. `ComposerPillGrammar`, `ComposerPillSlot` et `CallControlsLayout` restent à l'app : ce sont les tables de contenu.
- Android. DEVIENT : `CallControlsGlass`, `CALL_PILL_RADIUS`, `CallPillHairline` (`CallControlGlass.kt`), `CallChromeFade` et `callReviveOnTouch` (`CallConnectedLayout.kt`), la chorégraphie de `CallControlsPill`, les lois `CallChromeStow`, `CallPillMotion`, `CallPillWidth` (`:core:model`).
- Android, supprimés : par I1, ceux-là (les emplois de `CallControlsGlass` par les rails, la bande et les modes partent avec K12 et K16) ; par I2, `ScenePublishSocle`, `SceneToolColumn`, `SOCLE_VEIL`.
- Web. DEVIENT : l'enveloppe de `CallControlPill` (`call-control-pill.tsx` : boîte, verre à part, débord, `inert`), `usePillGlass` et `createPillGlass` (`use-pill-motion.ts`, `pill-motion-engine.ts`), les lois de `call-pill-motion.ts`, `rowStep` de `call-row-keys.ts`, `PILL_TEXT_WIDTH_CLASS`.
- Web, supprimés : par I1, ceux-là et `.glass-call` sur la pilule (la barre de `call-mode-carousel.tsx` part avec K16) ; par I2, les rangées `data-story-socle-row` de `routes/story-compose.tsx`. `glass-surface.tsx`, `sheet.tsx`, `composer-format-bar.tsx` et `scene-*` ne portent aucune pilule du bas.
- Ne sont PAS des jumeaux : `FloatingCallPillView`, `CallPill` (Android, public) et `call-floating-pill.tsx`, la pastille de l'appel réduit, en haut de l'écran ; `SyncPill`, `engagement-pill`, `composer-language-pill`.

## 8. Témoins exigés
Comportements (`MeeshyGlassPillTests`, `MeeshyGlassPillTest`, `meeshy-glass-pill.test.tsx`, vecteurs communs `docs/product/kit/K10-MeeshyGlassPill.vectors.json`) :
- loi d'ajustement : chaque vecteur (largeur, nombre, largeur de `primary`) rend la taille et le défilement attendus, et la pilule rendue retient la même taille ;
- `primary` reste visible et hors défilement ; contenu vide ⇒ aucun verre ;
- loi de présence : durées, sortie par le bord sauf sous « réduire les animations », distance = hauteur + marge, hauteur non mesurée comptée pour zéro ;
- elle répond pendant le fondu, plus après ; `onRevive` part une fois pour un toucher reçu pendant le retrait ; rangée, elle est absente du lecteur d'écran et du focus ;
- `withoutRow` garde `above` et retire la rangée ; `spread` répartit à largeur égale sous son plafond ; `above` passe la largeur au plafond de 560 et le verre en `dense` ;
- un seul verre demandé à K01 et aucun par un bouton emboîté ; les trois fichiers n'écrivent aucun verre ;
- nom, rôle et ordre de lecture ; web : un seul arrêt de tabulation, flèches, RTL ;
- la rangée ne se re-rend pas quand `presence` ou le ton changent.

Instantanés (clair, sombre, grande police, RTL ; `-iOS26` et verre dessiné ; 390, 820 et 1440 px sur le web) : `repos-vide` (R1), `repos` (R2), `ouvert` (R3), `clair` (R13), `en-cours` (P1), `objet` (O1), `texte` (O14), `retouche-video` (C2), `agrandie` (S5), `sans-rangee` (R12), `repartie` (appels), `defilement`.

Catalogue : entrée K10 remplie sur les trois plateformes, mêmes identifiants d'état, avec une bascule « ranger » qui joue le retrait.

## 9. Écarts et choix retenus (mode autonome)
1. Frontière avec K11. La planche dessine `.xp` comme un bloc à part ; les appels font grandir LE MÊME verre. Retenu : K10 possède le verre unique, la rangée, `above`, la largeur et le morphisme ; K11 remplit `above`. Écarté : un second verre pour K11.
2. Disposition. Planche du composer : serrée au contenu. Appels iOS et Android : répartie jusqu'à 440. Retenu : `hug` par défaut et `spread` pour les appels, pour que I1 ne change pas leur aspect. Écarté : `hug` seul.
3. Mesures. 64 et 32 (composer), 72 et 36 (planche des appels), 68 (code iOS et Android), rayon 24 (web). Retenu : 64 et 32 en `hug`, 68 en `spread`, rayon 32 partout ; le web passe de 24 à 32 à I1.
4. Les 42 de C2. K02 n'a pas de taille 42. Retenu : la loi 48 → 44 → 40, puis défilement. Écarté : une cinquième taille, un rétrécissement continu.
5. Présence. Retenu : trois états, retrait par le bord, grâce du fondu et `onRevive`, repris des appels. Écarté : un booléen (perdrait les sous-titres seuls et R12).
6. Place. La planche pose le bas à 28, soit 6 dans la zone sûre d'un iPhone à encoche ; le code est à zone sûre + 12. Retenu : `max(zone sûre + 12, 28)` dans le dock, et la pilule ne suit jamais le clavier (l'hôte la range pendant l'écriture, loi 10).
7. Filet. Les appels en ont un, la planche non. Retenu : `showsDivider`, coupé par défaut.
8. Clavier du web. La rangée des appels a quatre arrêts de tabulation. Retenu : `toolbar` à un arrêt et flèches.
9. Débord de 8. Le web seul le porte. Retenu : les trois plateformes.
10. Pastille de l'appel réduit. Le registre cite `CallPill` comme existant Android. Retenu : hors de K10.
11. « Réduire les animations ». Le web remplace le morphisme par un fondu de 150 ms, iOS et Android redimensionnent en 200 ms. Retenu : 200 ms sans ressort, le web s'aligne.
12. Voile. Les appels posent un voile noir sous le verre de la pilule ; retenu : le ton `deep` de K01 le remplace, sans paramètre de voile. Web : `MeeshyGlassScope` ne sait pas dire « emboîté » à un frère du verre ; le lot web lui ajoute `nested`, seul ajout permis au fichier de K01.
13. Légendes sous les boutons (appels de groupe) : elles restent dans l'emplacement, à l'app ; la hauteur de la pilule a un plancher, pas un plafond.
14. Le nombre de boutons (lot iOS, mode autonome). La loi d'ajustement exige `n`, que l'emplacement `buttons(size)` ne dit pas (un `@ViewBuilder` ne se compte pas sans SPI). Retenu : un paramètre optionnel `buttonCount` que l'hôte passe quand il le sait, et sinon une déduction pure (`MeeshyGlassPillFit.inferredButtonCount`) depuis la largeur mesurée de la rangée à la taille courante, exacte pour des disques K02. Écarté : `_VariadicView` (SPI, aucun précédent dans le dépôt) ; `ViewThatFits` (mesure asynchrone sur iOS 26, #9456).
15. Cette étape ne change aucun écran (iOS). Les lois de la pilule d'appel (`CallChromeStow`, `CallChromeVisibility.acceptsTouches`, `CallPillWidth`) deviennent des appelants minces des lois du kit ; l'enveloppe `callControlsPill` et `CallEdgeStow` sont rebranchées par I1, pas par ce lot.

Aucune question ne reste au porteur.
