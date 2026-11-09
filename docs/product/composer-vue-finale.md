# Composer de scènes : la vue finale (proposition à valider)

> **Proposition du 2026-11-08, à valider par le porteur (#17019).** Le composer de scènes (post, story, réel, mood, retouche d'une image de conversation) prend la grammaire d'interface des appels, l'approche « C adaptée » (`docs/product/appels-vue-finale.md`). Chaque vue, chaque outil et chaque feature du composer iOS présent sur `dev` (relevé `638ae7d59`) a sa planche. Une vue validée qui diverge du code devient une issue d'implémentation du milestone « Le composer iOS a sa vue finale ».

- Planche (toutes les vues, ouvrable dans un navigateur) : [`composer-vue-finale/planche.html`](composer-vue-finale/planche.html)
- Captures : [`composer-vue-finale/vues/`](composer-vue-finale/vues/). Elles se régénèrent d'une seule commande, `node docs/product/composer-vue-finale/capture.mjs`, et aucune n'est posée à la main.
- Tant qu'elle n'est pas validée, cette proposition ne remplace ni `apps/ios/CLAUDE.md` § « Le composer se pose SUR LA SCÈNE » (#13839), ni `docs/product/meeshy-composer-modele.md`, qui reste l'autorité des noms et des règles.

**Conformité = disposition, hiérarchie, états et gestes.** Les polices, rayons et teintes viennent du design system (`MeeshyColors.swift`, `packages/design-tokens/ios.css`).

## Ce que les appels prêtent au composer

| Appels (C adaptée) | Composer |
|---|---|
| Une pilule de verre en bas : (…) · Micro · Sortie · Fin | Une pilule de verre en bas : (…) · Texte · Média · **Publier ▾** |
| (…) fait sortir deux rails : gauche = mon image, droite = l'appel | (…) fait sortir deux rails : **gauche = ce qu'on POSE sur la scène**, **droite = la scène et la publication** |
| Un toucher range tout, un autre rend tout | Un toucher sur la scène range tout (regarder sa scène), un autre rend tout |
| Une option à réglages s'ouvre DANS la pilule, qui grandit vers le haut | Fond, Durée, Transitions, Cadre, Audience, formats de Publier : dans la pilule |
| Participants, Journal : en feuille | Stickers, Mention, Hashtags, Lieu, bibliothèque de sons : en feuille |
| Effets, Montage : mode plein écran Quitter · Réglages · Valider | Modifier un objet, Dessin, Caméra, Frise : mode plein écran Quitter · Réglages · Valider |
| Le verre s'assombrit sur un contenu clair | Idem sur une scène claire (fond blanc, photo de neige) |
| Toucher une vignette la met à la une | Toucher un objet le sélectionne et le fait passer devant |

## Les lois

1. **Une seule pilule de verre, en bas : (…) · Texte · Média · Publier ▾.**
   - Publier est le seul bouton plein, à la couleur de marque. Il n'existe que si la scène porte quelque chose : sur une scène vide, la pilule est (…) · Texte · Média.
   - Le ▾ choisit ce qui part (story, post, réel, cases combinables, et la disposition du post) ; seul Publier envoie.
   - Un bouton actif est un disque blanc plein à icône sombre ; un inactif n'a pas de fond. Jamais de verre posé sur du verre.
2. **L'en-tête ne porte que ce qui sert maintenant.** ✕ à gauche. ↶ ↷ à droite, seulement s'il y a un historique. L'audience est une puce de l'en-tête, sous ✕, dès que Publier existe.
   - **La rangée des scènes flotte en SURIMPRESSION, sans cadre ni verre**, en haut de la scène, à partir de deux scènes ; « + » est toujours en dernier.
   - Toucher une vignette = aller à la scène ; **double toucher = la dupliquer** ; **appui long = une croix apparaît dessus (supprimer, confirmé) et la vignette se soulève pour aller à une autre place**. En post, la même rangée range l'ordre de publication des médias.
3. **(…) fait sortir les actions, et les range.** Deux rails verticaux sortent vers les bords, centrés.
   - **Gauche = ce qu'on pose** : Sticker · Son · Dessin · Caméra · Mention · Lieu.
   - **Droite = la scène et la publication** : Fond · Scène + · Animation · Durée · Légende (en story) ou Texte du post (en post et réel) · Hashtags · Plus.
   - Plus ouvre une feuille courte : Transitions, Effet visuel, Cadrage du fond (avec un fond média), Aperçu, Enregistrer dans Photos, Partager hors de Meeshy, Autoriser la reprise du son (avec une vidéo), Désactiver les commentaires (post et réel), Tout effacer (rouge, en dernier, confirmé).
   - Un outil que le format ou la porte n'offre pas n'apparaît pas. Un rail ne s'étire jamais au-delà de ses boutons.
4. **Le verre est adaptatif.** Sur une scène claire, il s'assombrit pour garder le contraste, en-tête et pilule compris.
5. **Un toucher sur la scène à vide range tout, un autre toucher rend tout.**
   - Sur une scène vierge, le premier toucher arme la caméra (rien d'autre n'y a de sens).
   - Avec un objet sélectionné, le toucher désélectionne d'abord.
   - Rangé : **la scène prend tout l'écran en gardant ses proportions**, avec un peu de noir en haut et en bas, ou à gauche et à droite, selon l'écran. Plus aucun contrôle. Il n'y a pas de minuterie.
6. **Toucher un objet le sélectionne, et la pilule devient celle de l'objet : ‹ · Modifier · Dupliquer · Temps · (…).** (révisée le 2026-11-09)
   - L'objet passe devant. Aucun cadre ni poignée ne s'affiche ; un léger halo dit la sélection.
   - Les rails et l'en-tête se retirent, ↶ ↷ restent.
   - **(…) ouvre le menu de l'objet**, posé au-dessus de lui : Mettre devant, Mettre en fond, Verrouiller, et **Retirer en dernier, en rouge**. Aucun bouton rouge dans la pilule au repos.
   - **Il n'y a pas de menu à l'appui long** : l'appui long commence le glisser. Double toucher = Modifier.
   - **Glisser un objet fait apparaître deux cibles**, et rien d'autre que les repères d'aimantation : la **duplication en haut**, la **poubelle en bas, à la place de la pilule**. Lâcher sur la poubelle retire l'objet (↶ le ramène) ; lâcher sur la duplication pose une copie identique un rang au-dessus de l'original, et l'original revient à sa place. Cela vaut pour tout objet de la scène.
   - Modifier et Temps disparaissent sur un objet verrouillé. Sur grand écran, le rail « Sélection » liste tout, Retirer en dernier, sans (…).
7. **Une option à réglages s'ouvre DANS la pilule, qui grandit vers le haut avec ‹ Retour et Fermer.** Fond, Cadre du fond, Transitions, Effet visuel, Durée, Audience, formats de Publier. La scène garde sa taille et montre l'effet en direct.
8. **Une liste longue s'ouvre en feuille ancrée** : Stickers, Mention, Hashtags, Lieu, sons, Sauf… et Seulement… de l'audience. La scène se réduit au-dessus d'elle, jamais dessous.
9. **Modifier, Dessin, Caméra et Frise sont des modes plein écran : Quitter · Réglages · Valider.**
   - L'en-tête devient Quitter (à gauche) et Valider (à droite) ; les réglages de l'outil vivent dans une plaque de verre en bas.
   - Quitter rend l'objet d'avant ; Valider garde et fait UN pas d'annulation.
   - Dans un mode, la scène reste manipulable au doigt : glisser, pincer, tourner l'objet modifié (#8535).
10. **Écrire colle la barre au clavier : Aa · ● · ≡ · ▣ · OK.** La pilule et les rails disparaissent. Aa = police, taille, graisse, effet, langue du texte ; **quatre effets seulement, soignés : Néon, Or, Ombre et Flamme, où les flammes animées montent des lettres elles-mêmes** ; ● = couleur et contour ; ≡ = alignement ; ▣ = fond et cadre. Le panneau prend la hauteur du clavier.
11. **Importer plusieurs médias crée une scène par média** (#8533), jusqu'à 10. Le premier remplit la scène vierge. Chaque scène en cours d'ajout porte son fantôme (préparation, envoi, réessayer) ; le passage à l'adresse téléversée est imperceptible (#8534).
12. **Un refus se dit sur place, jamais dans une alerte.** Un format indisponible reste visible et grisé dans le ▾, avec sa raison en une ligne (« Demande une vidéo, un son ou deux photos »). Un plafond atteint (10 scènes, 50 objets d'une famille, 1000 caractères, 2 h) se dit en une capsule au-dessus de la pilule, avec un retour haptique et une annonce VoiceOver.
13. **Ce qui ne doit pas s'afficher ne s'affiche pas.**
    - Pas de ↶ ↷ sans historique, pas de rangée des scènes à une scène, pas de Publier sur une scène vide, pas d'aide « posez au moins un élément ».
    - Pas de rail pendant l'écriture, au viseur, pendant un geste sur un objet, ni en mode plein écran.
    - Pas de Texte du post en story, pas de Légende en post, pas de Transitions sans fond média, pas de Reprise du son sans vidéo.
    - Pas de puce de son si la scène n'a pas de son ; une seule trace du son de fond, au-dessus de la scène.
14. **Le son de fond se lit au-dessus de la scène, les références en dessous.** Une trace fine (titre, auteur, onde) au-dessus du bord haut ; hashtags et « Avec @… » en une ligne sous le bord bas, absente si vide. Toucher l'une ou l'autre rouvre sa feuille.
15. **Grand écran (iPad, Mac) : les rails restent sortis et prennent leur libellé** quand la place autour du 9:16 le permet (`ComposerSceneArrangement`). Gauche « Ajouter » avec Texte et Média en tête ; droite « Sélection » quand un objet est choisi, sinon « Scène ». Publier passe sous la scène, à la largeur de la scène. Les modes plein écran gardent les rails, en grisé.
16. **Publier, c'est voir partir.** Publier se change en anneau de progression dans la pilule ; hors ligne, la pilule dit « Publiée au retour en ligne » ; un échec partiel garde la publication en brouillon et le dit en une capsule avec Réessayer. Fermer un brouillon non vide demande « Garder le brouillon · Abandonner ».
17. **Retoucher une image ou une vidéo, c'est le composer lui-même, en mode simple** (révisée le 2026-11-09 ; remplace la décision du 2026-10-20, #11133). La pièce est le fond d'une scène d'une seule diapo, à ses proportions. En-tête Quitter · ⬇︎ Photos · Terminé ; pilule Looks · Recadrer · Texte · Sticker · Dessin, plus Couper et Son pour une vidéo. Pas de rails, pas d'audience, pas de Publier. Ce qu'on pose est un objet de la scène, avec la pilule d'objet et les gestes de la loi 6. **Rien n'est aplati avant l'envoi** (message, statut, publication) : « Terminé » rend la pièce en attente AVEC sa scène, et la rouvrir retrouve chaque élément, déplaçable et modifiable. Une pièce non modifiée part telle quelle, sans réencodage.

## Les vues

Le tableau des vues et leurs captures est généré avec la planche (voir l'index ci-dessous).

### Repos et (…)

| R1 · Scène vierge | R2 · Repos avec contenu | R3 · (…) touché : les rails | R4 · Un toucher : tout se range |
|---|---|---|---|
| ![R1](composer-vue-finale/vues/R1.png) | ![R2](composer-vue-finale/vues/R2.png) | ![R3](composer-vue-finale/vues/R3.png) | ![R4](composer-vue-finale/vues/R4.png) |

| R5 · Plusieurs scènes | R6 · Appui long sur une scène | R7 · Publier ▾ : formats | R8 · Disposition du post |
|---|---|---|---|
| ![R5](composer-vue-finale/vues/R5.png) | ![R6](composer-vue-finale/vues/R6.png) | ![R7](composer-vue-finale/vues/R7.png) | ![R8](composer-vue-finale/vues/R8.png) |

| R9 · Audience | R10 · Plafond atteint | R11 · Plus | R12 · Tout effacer ? |
|---|---|---|---|
| ![R9](composer-vue-finale/vues/R9.png) | ![R10](composer-vue-finale/vues/R10.png) | ![R11](composer-vue-finale/vues/R11.png) | ![R12](composer-vue-finale/vues/R12.png) |

| R13 · Scène claire : verre adaptatif |
|---|
| ![R13](composer-vue-finale/vues/R13.png) |

### Ajouter

| A1 · Texte : écrire | A2 · Aa : police et effet | A3 · ● : couleur et contour | A4 · ▣ : fond et cadre |
|---|---|---|---|
| ![A1](composer-vue-finale/vues/A1.png) | ![A2](composer-vue-finale/vues/A2.png) | ![A3](composer-vue-finale/vues/A3.png) | ![A4](composer-vue-finale/vues/A4.png) |

| A5 · Mention pendant la frappe | A6 · Média : plusieurs à la fois | A7 · Une scène par média | A8 · Caméra : viseur armé |
|---|---|---|---|
| ![A5](composer-vue-finale/vues/A5.png) | ![A6](composer-vue-finale/vues/A6.png) | ![A7](composer-vue-finale/vues/A7.png) | ![A8](composer-vue-finale/vues/A8.png) |

| A9 · Caméra : filmer | A10 · Caméra : look en direct | A11 · Stickers | A12 · Décorations |
|---|---|---|---|
| ![A9](composer-vue-finale/vues/A9.png) | ![A10](composer-vue-finale/vues/A10.png) | ![A11](composer-vue-finale/vues/A11.png) | ![A12](composer-vue-finale/vues/A12.png) |

| A13 · Dessin | A14 · Son : création audio | A15 · Son : rogner et régler | A16 · Mention |
|---|---|---|---|
| ![A13](composer-vue-finale/vues/A13.png) | ![A14](composer-vue-finale/vues/A14.png) | ![A15](composer-vue-finale/vues/A15.png) | ![A16](composer-vue-finale/vues/A16.png) |

| A17 · Hashtags | A18 · Lieu |
|---|---|
| ![A17](composer-vue-finale/vues/A17.png) | ![A18](composer-vue-finale/vues/A18.png) |

### Un objet

| O1 · Toucher : les outils de l’objet | O2 · (…) de l’objet : le menu | O3 · Glisser : repères, duplication et poubelle | O12 · Lâcher sur la poubelle |
|---|---|---|---|
| ![O1](composer-vue-finale/vues/O1.png) | ![O2](composer-vue-finale/vues/O2.png) | ![O3](composer-vue-finale/vues/O3.png) | ![O12](composer-vue-finale/vues/O12.png) |

| O13 · Lâcher sur la duplication | O4 · Modifier une photo | O5 · Réglages | O6 · Filtres |
|---|---|---|---|
| ![O13](composer-vue-finale/vues/O13.png) | ![O4](composer-vue-finale/vues/O4.png) | ![O5](composer-vue-finale/vues/O5.png) | ![O6](composer-vue-finale/vues/O6.png) |

| O7 · Recadrer | O8 · Vidéo : couper et son | O9 · Description (texte alternatif) | O10 · Temps de l’objet |
|---|---|---|---|
| ![O7](composer-vue-finale/vues/O7.png) | ![O8](composer-vue-finale/vues/O8.png) | ![O9](composer-vue-finale/vues/O9.png) | ![O10](composer-vue-finale/vues/O10.png) |

| O11 · Texte en édition, manipulé au doigt |
|---|
| ![O11](composer-vue-finale/vues/O11.png) |

### La scène

| S1 · Fond | S2 · Cadre du fond média | S3 · Transitions | S4 · Effet visuel |
|---|---|---|---|
| ![S1](composer-vue-finale/vues/S1.png) | ![S2](composer-vue-finale/vues/S2.png) | ![S3](composer-vue-finale/vues/S3.png) | ![S4](composer-vue-finale/vues/S4.png) |

| S5 · Durée | S6 · Légende (story) | S7 · Texte du post (post) | S8 · Animation : la frise |
|---|---|---|---|
| ![S5](composer-vue-finale/vues/S5.png) | ![S6](composer-vue-finale/vues/S6.png) | ![S7](composer-vue-finale/vues/S7.png) | ![S8](composer-vue-finale/vues/S8.png) |

| S9 · Frise : un objet choisi | S10 · Aperçu |
|---|---|
| ![S9](composer-vue-finale/vues/S9.png) | ![S10](composer-vue-finale/vues/S10.png) |

### Publier et brouillons

| P1 · Publication en cours | P2 · Hors ligne | P3 · Échec partiel | P4 · Fermer le brouillon ? |
|---|---|---|---|
| ![P1](composer-vue-finale/vues/P1.png) | ![P2](composer-vue-finale/vues/P2.png) | ![P3](composer-vue-finale/vues/P3.png) | ![P4](composer-vue-finale/vues/P4.png) |

| P5 · Mood | P6 · Modifier une publication |
|---|---|
| ![P5](composer-vue-finale/vues/P5.png) | ![P6](composer-vue-finale/vues/P6.png) |

### Grand écran (iPad)

| I1 · iPad paysage, repos | I2 · iPad, un objet choisi | I3 · iPad, frise | I4 · iPad portrait |
|---|---|---|---|
| ![I1](composer-vue-finale/vues/I1.png) | ![I2](composer-vue-finale/vues/I2.png) | ![I3](composer-vue-finale/vues/I3.png) | ![I4](composer-vue-finale/vues/I4.png) |

### Retouche d’une image ou d’une vidéo : le composer en mode simple

| C1 · Retoucher une photo | C2 · Retoucher une vidéo | C3 · Un objet posé sur la pièce | C4 · En attente d’envoi : toujours modifiable |
|---|---|---|---|
| ![C1](composer-vue-finale/vues/C1.png) | ![C2](composer-vue-finale/vues/C2.png) | ![C3](composer-vue-finale/vues/C3.png) | ![C4](composer-vue-finale/vues/C4.png) |

## Ce que la proposition ajoute ou change au code de `dev`

À trancher par le porteur, vue par vue. Chaque ligne validée devient une issue.

| Changement | Aujourd'hui (`638ae7d59`) | Vue |
|---|---|---|
| Pilule unique en bas, outils derrière (…) | Colonne droite de 8 à 10 boutons ronds toujours visible | R2, R3 |
| Audience en puce d'en-tête | Puce à gauche de Publier, en bas | R2 |
| Publier masqué sur scène vide | Publier visible, refus motivé au toucher | R1 |
| Sélection sans cadre, pilule de l'objet avec (…), Retirer en dernier du menu | Cadre pointillé blanc, barre Modifier · Dupliquer · Temps · Retirer à la place de la colonne | O1, O2 |
| Glisser un objet vers la poubelle (bas) ou la duplication (haut) | Aucune cible de dépôt | O3, O12, O13 |
| La retouche d'une pièce est le composer en mode simple, aplati à l'envoi seulement | Retouche de la prise (`ConversationPieceRetouch`), aplatie à « Terminé » | C1 à C4 |
| Fond, Durée, Transitions dans la pilule | Feuilles ancrées « Fond », « Durée de la diapo » | S1, S5 |
| Modifier en mode Quitter · Réglages · Valider | Rail Modifier dans la colonne, propriétés en plaque basse | O3 |
| Rangée des scènes en surimpression ; double toucher duplique, appui long croix + glisser | Rangée dans un cadre ; `moveSlide` / `duplicateSlide` sans appelant | R5, R6 |
| Quatre effets de texte, dont Flamme animée sur les lettres | 24 effets + Aucun (`StoryTextEffect`) | A2 |
| Une seule piste de rognage pour le son et la vidéo : onde ou vignettes, poignées, tête de lecture, volume, muet | Trois pistes voisines : `MediaTrimStrip`, `ComposerTrimTrack`, `MeeshyAudioTrimmer` | A15, O8, C2 |
| Frise premium : contenu réel par piste (vignettes, texte, sticker, onde), pincer pour zoomer, aimantation avec retour haptique | Les pistes son et vidéo portent déjà leur onde (`WaveformStrip`) ; le reste est à relever dans le code | S8, S9 |
| Rangé = scène plein écran, proportions gardées | Pas d'état rangé | R4 |
| Verrouiller un objet depuis le (…) de la pilule de l'objet | `isLocked` respecté, aucune bascule dans l'UI | O2 |
