# Appels audio et vidéo : la vue finale

> **La cible que web (`apps/web`, coque Capacitor comprise), Android natif (`apps/android`) et iOS (`apps/ios` + `packages/MeeshySDK`) doivent atteindre.** Approche « C adaptée », retenue par le porteur le 2026-09-27, complétée par la décision #16612 (2026-11-06) sur l'ordre des sous-titres et par les directives du 2026-11-07 (couleur, gestes, partage, capture). Issue : #16633. Toute évolution de la vue d'appel se lit contre ce fichier. Une directive porteur postérieure le supplante, et c'est alors l'issue fermée qui fait foi.

- Planche (toutes les vues, ouvrable dans un navigateur) : [`appels-vue-finale/planche.html`](appels-vue-finale/planche.html)
- Captures : [`appels-vue-finale/vues/`](appels-vue-finale/vues/). Elles se régénèrent d'une seule commande, `node docs/product/appels-vue-finale/capture.mjs`, et aucune n'est posée à la main.
- Planches d'origine, éphémères : l'artifact « C adapté ». Le fichier du dépôt fait foi, jamais une URL.

**Conformité = disposition, hiérarchie, états et gestes.** Les polices, rayons et teintes exactes viennent du design system de chaque plateforme (`MeeshyColors.swift`, `packages/design-tokens/ios.css`). Les couleurs d'auteur, elles, ne se choisissent pas : elles sortent de la fonction partagée (loi 4).

## Les lois

1. **Une seule pilule de verre, en bas : (…) · Micro · Sortie · Fin.** Fin est en rouge. Un bouton actif est un disque blanc plein à icône sombre ; un bouton inactif n'a pas de fond. Jamais de verre posé sur du verre.
2. **(…) fait sortir les actions, et les range.**
   - En duo, deux rails verticaux sortent vers les bords. **Gauche = mon image** : Caméra, Retourner, Effets, Écran. **Droite = l'appel** : Sous-titres, Enregistrer, Ajouter, Messages.
   - En groupe, les mêmes huit actions montent dans la pilule, qui s'agrandit en deux rangées légendées (mon image, puis l'appel).
   - L'ordre et le vocabulaire sont les mêmes sur les trois plateformes.
3. **Le verre est adaptatif.** Sur un contenu clair (un écran partagé), il s'assombrit pour garder le contraste, en-tête et pilule compris.
4. **Chaque personne a UNE couleur, partout dans l'appel et après** (#16612, #16614, précisée par le porteur le 2026-11-07, #16662).
   - La graine est `authorAccentColor(userId, name)` (`@meeshy/shared`). Ses miroirs sont `DynamicColorGenerator.colorForName(userId)` sur iOS et `CallSpeakerColor` sur Android. L'identifiant prime sur le nom, et il n'y a jamais de seconde palette.
   - Cette couleur teinte :
     - le liseré de la vignette, **la mienne comprise** ;
     - l'anneau de qui parle ;
     - **le pseudo, toujours** ;
     - **la phrase, SEULEMENT quand elle sert une traduction**.
   - Une phrase originale reste à l'encre du thème (blanc sur le verre d'appel, noir ou blanc dans le fil selon le thème) :
     - ma parole, jamais traduite pour moi ;
     - une phrase déjà dans ma langue ;
     - l'original déplié sous une traduction, qui est en encre secondaire.
   - La couleur est rendue lisible (AA 4,5:1) sur son fond par le plus petit pas possible :
     - sur le verre d'appel : web `speakerColor`, iOS et Android `CallSpeakerColor` (adaptée au sombre) ;
     - dans le fil : web `authorInk`, iOS et Android `CallSpeakerColor` adaptée au schéma.
5. **Le sous-titre part tout de suite dans l'original, et la traduction le rejoint DANS LA MÊME LIGNE** (#16612, #16613).
   - L'original s'affiche dès qu'il est reconnu, étiqueté de sa langue (« EN ») ; trois points disent qu'une traduction arrive.
   - La traduction remplace l'original sur place, comme un message, et l'étiquette devient « EN → FR ».
   - Une phrase non finale reste pâle jusqu'à sa version finale.
   - Ma phrase n'est jamais traduite pour moi.
   - La ligne servie descend le **Prisme** du lecteur (`resolvePrismTranslation` / `served`), jamais `translations[0]`.
6. **Toucher une phrase montre son original dessous** ; la retoucher le replie. « Journal » ouvre tout l'appel.
7. **Le journal est FIDÈLE, pendant et après l'appel.**
   - C'est le MÊME journal avant et après la fin de l'appel : mêmes phrases, même ordre, mêmes couleurs, même descente du Prisme, original dessous.
   - Rien n'est tronqué, et une ligne dont la traduction arrive après la fin de la phrase est mise à jour sur place, pas dupliquée. Les règles de fusion sont web `mergeCaption`, iOS `CallTranscriptMergeRules`, Android `CallLiveJournal.merged`.
   - Après l'appel, il se déplie sous la bulle d'appel du fil et dans le détail de l'historique. Une bascule Traduit / Original s'applique à tout l'appel.
   - Pendant l'appel :
     - le défilement est libre ;
     - « Revenir au direct » apparaît dès qu'on a remonté ;
     - le journal survit à l'appel réduit, aux sous-titres coupés et à une reconnexion.
8. **Micro coupé = ma parole n'est plus transcrite** (#8475).
9. **Effets = filtres vidéo et flou d'arrière-plan, sans effets de voix** (#8050).
10. **L'écran partagé de quelqu'un d'autre passe à la une tout seul.** La caméra de celui qui partage passe en médaillon, au liseré de sa couleur.

11. **Un toucher n'importe où sur l'image range tout, un autre toucher rend tout** (#16663).
    - Le premier toucher cache l'en-tête, la pilule, les rails et les bandeaux, et ma vignette passe à sa petite taille.
    - Le second toucher fait revenir les contrôles partout, et ma vignette reprend la taille que j'avais choisie.
    - Il n'y a pas de minuterie. Un bouton touché pendant le fondu répond quand même.
    - Les sous-titres et une carte d'accord (enregistrement, cadre) ne se cachent jamais.
12. **Lancer un partage d'écran RÉDUIT l'appel** (#16664).
    - Je quitte Meeshy pour montrer autre chose, et l'appel me suit en capsule : icône d'écran, nom · durée, « Arrêter ».
    - Toucher la capsule rouvre l'appel ; le bandeau « Vous partagez votre écran · Arrêter » y reste sous l'en-tête.
    - Mon partage ne passe jamais à la une chez moi.
13. **Une capture ou un enregistrement d'écran se voit et se garde** (#16665).
    - Une puce rouge « X capture l'écran de l'appel » apparaît chez tous, en audio comme en vidéo.
    - Une ligne datée entre dans le journal et reste dans celui d'après l'appel.
    - L'enregistrement demande l'accord de tous, sur une carte qui ne se cache jamais, et le journal note son début et sa fin.
14. **Options en surimpression.**
    - Une option à réglages (Enregistrer, Réagir) s'ouvre DANS la pilule, qui grandit vers le haut avec ‹ Retour et Fermer.
    - « Participants » et « Journal » s'ouvrent en feuille.
    - Effets et Montage sont des modes plein écran avec Quitter · Réglages · Valider ; « Quitter » rend mon image d'avant.
15. **À la une.**
    - Toucher une vignette la met à la une, choix local jamais imposé. Si les contrôles sont cachés, le toucher les rend d'abord.
    - La vignette à la une n'a pas de badge : une capsule en haut à droite offre « Revenir à la grille » et « Plein écran ».
    - Le bandeau des autres est en bas en portrait, en colonne en paysage.
    - Pincer zoome sur un écran partagé jusqu'à 4×, deux tapes reviennent à 1×.
16. **Cadres en direct, en duo vidéo.**
    - Je choisis un cadre dans Montage (ambiances, carrousel, déclinaisons par balayage vertical, option « Cadre »). Il s'applique chez moi et se PROPOSE à l'autre (« Non merci » · « Appliquer »).
    - Le proposeur apprend la réponse en une capsule.
    - Le cadre tombe si l'appel passe à trois.

## Les vues

### Duo vidéo, portrait

| P1 · Repos | P2 · Actions affichées | P3 · L'original d'abord | P4 · La traduction rejoint la ligne |
|---|---|---|---|
| ![P1](appels-vue-finale/vues/P1.png) | ![P2](appels-vue-finale/vues/P2.png) | ![P3](appels-vue-finale/vues/P3.png) | ![P4](appels-vue-finale/vues/P4.png) |

| P5 · Toucher = l'original | P6 · Journal pendant l'appel | P7 · Micro coupé | P8 · Effets de ma caméra |
|---|---|---|---|
| ![P5](appels-vue-finale/vues/P5.png) | ![P6](appels-vue-finale/vues/P6.png) | ![P7](appels-vue-finale/vues/P7.png) | ![P8](appels-vue-finale/vues/P8.png) |

### Gestes et options

| G1 · Un toucher : tout se range | G2 · Un autre toucher : tout revient | G3 · Option en surimpression | G4 · Caméra coupée |
|---|---|---|---|
| ![G1](appels-vue-finale/vues/G1.png) | ![G2](appels-vue-finale/vues/G2.png) | ![G3](appels-vue-finale/vues/G3.png) | ![G4](appels-vue-finale/vues/G4.png) |

| P8b · Effets : réglages |
|---|
| ![P8b](appels-vue-finale/vues/P8b.png) |

### À la une

| U1 · Une personne à la une | U2 · Écran à la une, plein écran | U3 · À la une, paysage |
|---|---|---|
| ![U1](appels-vue-finale/vues/U1.png) | ![U2](appels-vue-finale/vues/U2.png) | ![U3](appels-vue-finale/vues/U3.png) |

### Je partage mon écran

| S1 · L'appel se réduit en capsule | S2 · De retour dans l'appel |
|---|---|
| ![S1](appels-vue-finale/vues/S1.png) | ![S2](appels-vue-finale/vues/S2.png) |

### Cadres en direct

| C1 · Choisir un cadre | C2 · La proposition chez l'autre | C3 · Cadre appliqué |
|---|---|---|
| ![C1](appels-vue-finale/vues/C1.png) | ![C2](appels-vue-finale/vues/C2.png) | ![C3](appels-vue-finale/vues/C3.png) |

### Capture et enregistrement

| R1 · Quelqu'un capture l'écran | R2 · Demande d'enregistrement | R3 · Enregistrement en cours |
|---|---|---|
| ![R1](appels-vue-finale/vues/R1.png) | ![R2](appels-vue-finale/vues/R2.png) | ![R3](appels-vue-finale/vues/R3.png) |

### Duo audio

En audio, la personne est au centre et son anneau prend sa couleur quand elle parle. « Caméra » (rail gauche) bascule l'appel en vidéo.

| P9 · Audio, repos | P10 · Audio, actions et sous-titres |
|---|---|
| ![P9](appels-vue-finale/vues/P9.png) | ![P10](appels-vue-finale/vues/P10.png) |

### Groupe

La grille prend l'écran. Chaque vignette porte le liseré de sa couleur, la mienne comprise, et qui parle s'illumine de sa couleur. Toucher une vignette la met à la une ; la retoucher rend la grille.

| P11 · Repos | P12 · (…) touché | P13 · Sous-titres dans le cadre | P14 · À la une |
|---|---|---|---|
| ![P11](appels-vue-finale/vues/P11.png) | ![P12](appels-vue-finale/vues/P12.png) | ![P13](appels-vue-finale/vues/P13.png) | ![P14](appels-vue-finale/vues/P14.png) |

### Partage d'écran, appel entrant, appel réduit

| P15 · Écran reçu | P16 · Je partage | P17 · Vidéo entrante | P18 · Appel réduit |
|---|---|---|---|
| ![P15](appels-vue-finale/vues/P15.png) | ![P16](appels-vue-finale/vues/P16.png) | ![P17](appels-vue-finale/vues/P17.png) | ![P18](appels-vue-finale/vues/P18.png) |

### Paysage

Les rails restent sur les bords, centrés verticalement. La pilule et la bande de sous-titres se centrent en bas, la bande limitée à 560 px. Ma vignette se range en haut à droite.

| L1 · Duo, repos | L2 · Duo, actions |
|---|---|
| ![L1](appels-vue-finale/vues/L1.png) | ![L2](appels-vue-finale/vues/L2.png) |

| L3 · Duo, sous-titres | L4 · Groupe |
|---|---|
| ![L3](appels-vue-finale/vues/L3.png) | ![L4](appels-vue-finale/vues/L4.png) |

| L5 · Écran reçu |
|---|
| ![L5](appels-vue-finale/vues/L5.png) |

### Après l'appel : le journal fidèle

| A1 · Bulle d'appel, fil clair | A2 · Bulle d'appel, fil sombre |
|---|---|
| ![A1](appels-vue-finale/vues/A1.png) | ![A2](appels-vue-finale/vues/A2.png) |

### Grand écran (web)

Sur un écran large, la scène reste centrée et le journal se pose en colonne de verre à droite, au lieu de recouvrir l'image.

| W1 · Duo, journal en colonne |
|---|
| ![W1](appels-vue-finale/vues/W1.png) |

| W2 · Groupe |
|---|
| ![W2](appels-vue-finale/vues/W2.png) |

## Où en est chaque plateforme (relevé du 2026-11-07 sur `dev`)

Ce tableau est un compte rendu daté. L'état vivant est dans les issues du milestone « Appels de groupe et appels traduits ».

| Loi / vue | Web | iOS | Android natif |
|---|---|---|---|
| Pilule, rails, groupe (lois 1–3) | livré | livré ; reliquats de mise en page dans `apps/ios/tasks/routine-appels.md` (APP-1 à APP-6) | à vérifier contre la planche |
| Sous-titre coloré, original puis traduction (lois 4–5) | livré (#16613, #16614) | livré | livré (`CallSpeakerColor`) |
| Ma vignette à ma couleur (loi 4) | livré, grille et coin du duo (#16635) | livré en groupe (`GroupCallStage`, « me » compris) | à vérifier |
| Journal pendant l'appel coloré (lois 4, 7) | livré, nom et phrase (#16634) | livré (`CallCaptionRow`) | livré (`CallCaptionRow`) |
| Journal après l'appel coloré (lois 4, 7) | livré, `authorInk` sur le fil (#16634) | livré, `CallSpeakerColor` adaptée au schéma (#16634) | livré, `CallSpeakerColor` adaptée au schéma (#16634) |
| Couleur : pseudo toujours, phrase seulement traduite (loi 4) | livré (#16662) | livré (#16662) | livré (#16662) |
| Toucher : tout se range, ma vignette se réduit (loi 11) | livré (#16663) | livré (#16663) | livré (#16663) |
| Partage lancé ⇒ appel réduit en capsule (loi 12) | **manque**, #16664 | **manque** (bandeau seul), #16664 | à vérifier, #16664 |
| Capture visible chez tous et gardée au journal (loi 13) | puce seule, #16665 | enregistrement d'écran seul, puce en audio seulement, #16665 | à vérifier, #16665 |
| Cadres en direct (loi 16) | absent | livré | à vérifier |
| Journal en colonne sur grand écran (W1) | à faire | sans objet (iPad : à trancher) | sans objet |
| Vidéo entrante avec aperçu et « Sans vidéo » (P17) | à vérifier | APP-6 | à vérifier |

## Pour les agents qui travaillent l'interface d'appel

- **Lire ce fichier avant toute modification de la vue d'appel.** Une divergence avec une vue ou une loi est un défaut à corriger, ou une décision à demander au porteur dans une issue `décision-produit`. Elle ne se tranche jamais en silence.
- La couleur d'une personne ne se calcule qu'à travers la fonction partagée et ses miroirs (loi 4). Ajouter une palette locale est une régression.
- Une loi qui touche une plateforme touche les TROIS (Kotlin natif dégelé, #11570).
- Les deux files d'agents en cours ont reçu leur direction :
  - routine « calling agent » (passerelle et web) : `docs/engineering/calling-agent/STATE.md` ;
  - routine « vue d'appel » iOS : `apps/ios/tasks/routine-appels.md`.
- Quand la planche change, régénérer les captures (`capture.mjs`) dans le même commit.
