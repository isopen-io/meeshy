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
2. **L'en-tête ne porte que ce qui sert maintenant.** ✕ à gauche. ↶ ↷ à droite, seulement s'il y a un historique. La rangée des scènes au centre, seulement à partir de deux scènes. L'audience est une puce de l'en-tête, sous ✕, dès que Publier existe.
3. **(…) fait sortir les actions, et les range.** Deux rails verticaux sortent vers les bords, centrés.
   - **Gauche = ce qu'on pose** : Sticker · Son · Dessin · Caméra · Mention · Lieu.
   - **Droite = la scène et la publication** : Fond · Scène + · Animation · Durée · Légende (en story) ou Texte du post (en post et réel) · Hashtags · Plus.
   - Plus ouvre une feuille courte : Transitions, Effet visuel, Cadrage du fond (avec un fond média), Aperçu, Enregistrer dans Photos, Partager hors de Meeshy, Autoriser la reprise du son (avec une vidéo), Désactiver les commentaires (post et réel), Tout effacer (rouge, en dernier, confirmé).
   - Un outil que le format ou la porte n'offre pas n'apparaît pas. Un rail ne s'étire jamais au-delà de ses boutons.
4. **Le verre est adaptatif.** Sur une scène claire, il s'assombrit pour garder le contraste, en-tête et pilule compris.
5. **Un toucher sur la scène à vide range tout, un autre toucher rend tout.**
   - Sur une scène vierge, le premier toucher arme la caméra (rien d'autre n'y a de sens).
   - Avec un objet sélectionné, le toucher désélectionne d'abord.
   - Rangé : il ne reste que la scène et un fin repère de ses bords. Il n'y a pas de minuterie.
6. **Toucher un objet le sélectionne, et la pilule devient celle de l'objet : ‹ · Modifier · Dupliquer · Temps · Retirer.**
   - L'objet passe devant. Aucun cadre ni poignée ne s'affiche ; un léger halo dit la sélection, les repères d'aimantation n'apparaissent que pendant le geste.
   - Les rails et l'en-tête se retirent, ↶ ↷ restent.
   - Appui long = les mêmes actions en menu, posé contre l'objet. Double toucher = Modifier.
   - Retirer est rouge. Modifier et Temps disparaissent sur un objet verrouillé.
7. **Une option à réglages s'ouvre DANS la pilule, qui grandit vers le haut avec ‹ Retour et Fermer.** Fond, Cadre du fond, Transitions, Effet visuel, Durée, Audience, formats de Publier. La scène garde sa taille et montre l'effet en direct.
8. **Une liste longue s'ouvre en feuille ancrée** : Stickers, Mention, Hashtags, Lieu, sons, Sauf… et Seulement… de l'audience. La scène se réduit au-dessus d'elle, jamais dessous.
9. **Modifier, Dessin, Caméra et Frise sont des modes plein écran : Quitter · Réglages · Valider.**
   - L'en-tête devient Quitter (à gauche) et Valider (à droite) ; les réglages de l'outil vivent dans une plaque de verre en bas.
   - Quitter rend l'objet d'avant ; Valider garde et fait UN pas d'annulation.
   - Dans un mode, la scène reste manipulable au doigt : glisser, pincer, tourner l'objet modifié (#8535).
10. **Écrire colle la barre au clavier : Aa · ● · ≡ · ▣ · OK.** La pilule et les rails disparaissent. Aa = police, taille, graisse, effet, langue du texte ; ● = couleur et contour ; ≡ = alignement ; ▣ = fond et cadre. Le panneau prend la hauteur du clavier.
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
17. **Retoucher une image de conversation suit la même grammaire, en plus court.** En-tête Quitter · Terminé ; pilule Filtres · Cadres · Recadrer · Texte, plus Couper et Son pour une vidéo ; ⬇︎ Photos dans l'en-tête. Pas de rails, pas de Publier : la pièce remplace l'originale à sa place.

## Les vues

Le tableau des vues et leurs captures est généré avec la planche (voir l'index ci-dessous).

<!-- INDEX-DES-VUES -->

## Ce que la proposition ajoute ou change au code de `dev`

À trancher par le porteur, vue par vue. Chaque ligne validée devient une issue.

| Changement | Aujourd'hui (`638ae7d59`) | Vue |
|---|---|---|
| Pilule unique en bas, outils derrière (…) | Colonne droite de 8 à 10 boutons ronds toujours visible | R2, R3 |
| Audience en puce d'en-tête | Puce à gauche de Publier, en bas | R2 |
| Publier masqué sur scène vide | Publier visible, refus motivé au toucher | R1 |
| Sélection sans cadre, pilule de l'objet | Cadre pointillé blanc, barre Modifier · Dupliquer · Temps · Retirer à la place de la colonne | O1 |
| Fond, Durée, Transitions dans la pilule | Feuilles ancrées « Fond », « Durée de la diapo » | S1, S5 |
| Modifier en mode Quitter · Réglages · Valider | Rail Modifier dans la colonne, propriétés en plaque basse | O3 |
| Réordonner et dupliquer une scène par appui long sur sa vignette | `moveSlide` / `duplicateSlide` sans appelant | R6 |
| Verrouiller un objet depuis la pilule de l'objet | `isLocked` respecté, aucune bascule dans l'UI | O2 |
| Un toucher range tout | Toucher la scène désélectionne ou arme la caméra | R4 |
