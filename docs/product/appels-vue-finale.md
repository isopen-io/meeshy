# Appels audio et vidéo : la vue finale

> **La cible que web (`apps/web`, coque Capacitor comprise), Android natif (`apps/android`) et iOS (`apps/ios` + `packages/MeeshySDK`) doivent atteindre.** Approche « C adaptée », retenue par le porteur le 2026-09-27, complétée par la décision #16612 (2026-11-06) sur la couleur et l'ordre des sous-titres. Issue : #16633. Toute évolution de la vue d'appel se lit contre ce fichier. Une directive porteur postérieure le supplante, et c'est alors l'issue fermée qui fait foi.

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
4. **Chaque personne a UNE couleur, partout dans l'appel et après** (#16612, #16614).
   - La graine est `authorAccentColor(userId, name)` (`@meeshy/shared`). Ses miroirs sont `DynamicColorGenerator.colorForName(userId)` sur iOS et `CallSpeakerColor` sur Android. L'identifiant prime sur le nom, et il n'y a jamais de seconde palette.
   - Cette couleur teinte :
     - le liseré de la vignette, **la mienne comprise** ;
     - l'anneau de qui parle ;
     - le nom ET la phrase d'un sous-titre ;
     - la traduction de cette phrase ;
     - la ligne du journal, pendant et après l'appel.
   - Elle est rendue lisible (AA 4,5:1) sur son fond par le plus petit pas possible :
     - sur le verre d'appel : web `speakerColor` (`legibleTint` vers le blanc), iOS `adaptedColor(.dark)` ;
     - dans le fil clair ou sombre : web `authorInk`, iOS `adaptedColor(colorScheme)`.
     - Une teinte déjà lisible reste la sienne.
   - L'original affiché sous une phrase reste en encre secondaire, pour qu'on voie d'un coup d'œil ce qui est la parole servie.
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
10. **L'écran partagé passe à la une tout seul.** La caméra de celui qui partage passe en médaillon, au liseré de sa couleur.

## Les vues

### Duo vidéo, portrait

| P1 · Repos | P2 · Actions affichées | P3 · L'original d'abord | P4 · La traduction rejoint la ligne |
|---|---|---|---|
| ![P1](appels-vue-finale/vues/P1.png) | ![P2](appels-vue-finale/vues/P2.png) | ![P3](appels-vue-finale/vues/P3.png) | ![P4](appels-vue-finale/vues/P4.png) |

| P5 · Toucher = l'original | P6 · Journal pendant l'appel | P7 · Micro coupé | P8 · Effets de ma caméra |
|---|---|---|---|
| ![P5](appels-vue-finale/vues/P5.png) | ![P6](appels-vue-finale/vues/P6.png) | ![P7](appels-vue-finale/vues/P7.png) | ![P8](appels-vue-finale/vues/P8.png) |

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
| Ma vignette à ma couleur (loi 4) | **manque** : liseré blanc, #16635 | à vérifier, #16635 | à vérifier, #16635 |
| Journal pendant l'appel coloré (lois 4, 7) | **partiel** : le nom seul, #16634 | livré (`CallCaptionRow`) | à vérifier, #16634 |
| Journal après l'appel coloré (lois 4, 7) | **manque** : encre neutre, #16634 | **manque** : `indigo400` / `brandPrimary`, #16634 | à vérifier, #16634 |
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
