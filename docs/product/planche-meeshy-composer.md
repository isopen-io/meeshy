# MeeshyComposer — la planche, version allégée

> **Source de vérité = ce dépôt.** Ce fichier `.md` et son jumeau `planche-meeshy-composer.html`
> (rendu de design complet, 100+ révisions) sont la vision maintenue du composer unifié. Un artifact
> publié peut disparaître ; ces fichiers, non. L'**état** de chaque tâche vit dans son **issue GitHub**
> (projet « Meeshy — pilotage » #1) ; en cas d'écart, l'issue a raison.
>
> Cette version allégée sert de référence rapide (sans le CSS/JS ni les maquettes du `.html`). Les
> **captures des vues cibles** vivent dans `docs/product/planche-meeshy-composer/` et sont produites
> par l'issue **#3989** ; ce document les référence au fur et à mesure.

## Ce qu'est le composer
Un seul composer produit quatre formats — **Story**, **Post**, **Réel**, **Mood** — et trois viewers
(Story · Post · Réel) partagent un seul noyau de lecture (`MeeshyScenePlayer`). Le contenu est un
**document** d'objets (`text` · `media` · `audio` · `drawing` · `sticker` · `mention` · `location`)
posés sur une **scène 9:16** à trois plans (`.background` · `.content` · `.foreground`), lus par une
**timeline « un plan »**. Changer de format ne jette jamais le contenu (loi 9, livrée 2026-08-27).

## Le modèle — slides, scènes, objets (normalisé 2026-08-27)

> **Sémantique complète : [`meeshy-composer-modele.md`](meeshy-composer-modele.md).**
> La planche porte la VISION, ce fichier-là porte la SÉMANTIQUE ; en cas d'écart sur un
> **nom** ou une **règle**, le modèle a raison.

```
MeeshyPublication  (profil S | R | P | M)
└── slides: [MeeshySlide]                     1..10
     └── MeeshySlide = MeeshyScene + description
          └── MeeshyScene (ratio)
               └── objects: [MeeshyObject]    plans: background · content · foreground
```

Quatre noms, et rien d'autre : **`MeeshyObject`** (l'unité posée) · **`MeeshyScene`** (la surface
qui les restitue) · **`MeeshySlide`** (une scène + sa description) · **`MeeshyPublication`**
(un profil + ses slides). Tout code neuf et toute issue parlent ce vocabulaire (#4048).

**Une slide est TOUJOURS une scène.** Une slide qui ne porte qu'un média est une scène dont le seul
objet est son fond — il n'existe pas deux formes de slide. C'est ce que la planche disait déjà
(« chaque slide est une Scene du document », P8), et c'est ce qui rend vraie sans cas particulier
la demande de départ : une scène doit pouvoir être **un seul média présentable** dans un réel ou un post.

**Ce qu'une slide SIGNIFIE dépend du profil** — le point le plus facile à rater :

| | Story (S) | Réel (R) | Post (P) | Mood (M) |
|---|---|---|---|---|
| Une slide EST | une story entière | le réel entier (le réel EST la scène) | **UN média du post** | — |
| Nombre de slides | plusieurs | 1 | plusieurs | 0 |
| Le texte de la slide est | **le contenu** | **le contenu** | **la légende de ce média** | — |
| `content` de la publication | = le texte de sa slide | = le texte de sa slide | **propre au post** | le contenu, seul |
| Sortir un média de la scène | interdit | autorisé | autorisé | — |

**Poser un média, une seule règle** : pas de fond ⇒ le média **devient le fond** ; un fond déjà là ⇒
il devient un objet de **premier plan**. Un audio devient le **son de fond** s'il n'y en a pas.
Aucune question n'est posée à l'utilisateur (#4038).

**Un objet se manipule par appui long** : Monter · Reculer · Modifier · Sortir de la scène (sauf en
Story) — chacune servie seulement si elle a un effet, jamais grisée (#4046).

## Les onze lois (doctrine, P1)
1. **Un seul document** rend les quatre formats ; le format est un habillage, pas un modèle séparé.
2. **Réemploi total** : chaque brique existante (SDK, viewers, éditeurs) est câblée, jamais reconstruite.
3. **Une seule scène** : Story ET Réel montent la même scène ; le média prend le canvas.
4. **Un contrôle existe** ssi l'objet l'accepte ET le profil l'autorise ET l'action a un effet.
5. **Le socle ne bouge jamais** (Audience · Aperçu · Publier) et se lit sur les trois teintes du plateau.
6. **Même geste, même effet** sur les trois plateformes ; même mot, même icône, même couleur de contexte.
7. **L'icône est le verbe** (`↻`, `♫〰`, `👁`) — jamais un texte, jamais un emoji.
8. **Un seul temps, celui du contenu** : la lecture survit au changement de chrome (carte → détail → plein écran → PiP).
9. **La porte fixe l'état INITIAL, le contenu est PRÉSERVÉ** entre modes (rév. 3, 2026-08-27).
10. **L'audience se souvient PAR FORMAT** ; « dernière utilisée » est indexée S/P/R/M.
11. **La complexité se paie dans le CODE**, jamais chez l'utilisateur.

## Les sections de la planche (P0→P24)
| P | Sujet | Ce qu'on y trouve |
|---|---|---|
| P0 | Avancement | tableau de bord daté (matrice `data-state`, camembert) — DESIGN, l'issue fait foi |
| P1 | Doctrine | les onze lois ci-dessus |
| P2 | Inventaire | les ~85 vues story + feed + mood + repost + 3 viewers, et leur portage vers le modèle d'objet |
| P3 | Carte de navigation | dix portes → un composer → trois viewers |
| P4 | Anatomie | le plateau (fond configurable), la scène 9:16, le socle 3 membres, les états AMORCE/INSPECTEUR |
| P5 | Entrées & profils | l'intention connue d'avance ; la grappe « document du fil » (4 dettes) |
| P6 | La scène | 9:16 fixe, bandes actives d'ancrage, ancrage SÉMANTIQUE (rang, pas coordonnées) |
| P7 | Les outils | 9 cartes : Texte (18 styles) · Média (8 filtres) · Son · Dessin · Sticker · Lieu · Références · Fond · Slides |
| P8 | Timeline | « un plan » : pistes empilées par plan, durée horizontale, pistes fantômes, keyframes |
| P9 | Capture | l'appui long ouvre le viseur, sans mode à armer |
| P10 | Socle & publication | audience 6 niveaux, aperçu = lecteur, Publier → file offline (`PublishIntent`) |
| P11 | Étagère | une liste sectionnée : File · Brouillons · Publiées · Archive |
| P12 | Les viewers | trois chromes, un noyau ; rail figé à l'entrée du slide |
| P13 | Matrice maîtresse | chaque outil × chaque format, exactement (✓ existant / ◆ nouveau / — absent) |
| P14 | Nouveautés & arbitrages | 13 cartes neuves + O1→O16 tranchés |
| P15 | Revue système | budgets perf, portes API iOS 16→27, registre des risques |
| P16 | **Écart SOTA** | 14 manques assumés + les non-buts |
| P17 | Simplification | la passe de coupes + la **décision A′** (rupture v3) |
| P18 | Entrées externes | partage entrant (share extension) & média reçu (2 gestes) |
| P19 | Continuité & PiP | un seul temps ; **livré** (formalisation d'un contrat mergé) |
| P20 | La rupture vécue | écriture stricte v3 armée par drapeau ; **infra mergée**, reste l'armement |
| P21 | 18 styles de texte | spécimen — **18/18 résolus** (iOS + web) |
| P22 | Iconographie | le SF Symbol de chaque contrôle — **~80 % câblé** |
| P23 | Éditeurs | trim audio · rognage image · cut vidéo (noyaux SDK existants) |
| P24 | Cas d'usage | carrousels & réels, avec et sans son (matrice de garde) |

## L'écart SOTA restant (P16) — ce qui reste à faire
- **v1 / quick-win** : alt text média (#3951), presets d'animation de texte (#3952).
- **v1** : stickers interactifs + table votes (#3953/#3954), détourage « lift » (#3955), GIF animé (#3956),
  vitesse média (#3957), layouts (#3958), désactiver les commentaires (#3959).
- **Horizon ultérieur** : publication programmée (#3960), duo (#3961), co-auteur (#3962), beat-sync (#3963).
- **Non-buts** (jamais d'issue) : filtres AR de visage, live, voice changer.

## Le pilotage de tout ceci
Milestones sémantiques du projet #1, chacun un résultat :
- **#47** Le composer atteint la SOTA — les manques encore assumés
- **#48** La rupture v3 s'arme et se lit partout
- **#49** Les trois éditeurs vivent dans le composer
- **#50** Le document du fil a enfin une issue de publication
- **#51** L'audience se choisit à six niveaux, partout
- **#52** Un post porte un son de fond
- **#53** L'Étagère unifiée — brouillons, file, publiées, archive
- **#54** Le composer se montre — spécimens, glyphes et gardes
- **#55** Aucun geste du composer ne perd du contenu
- **#56** Le web compose comme iOS — parité vue par vue

Le milestone **#4 « Composer v2 — finitions »** porte déjà le gros du reste (timeline #3561, reader #3566,
file #3562/#3568, audio #3564/#3567, capture #3776, portes #3783/#3844, scène #3557, gardes #3558/#3559…).

## Vues de référence (captures) — #3989
Générées depuis le rendu du `.html` (Chrome, ×2) dans `docs/product/planche-meeshy-composer/`.
**46 captures** : 40 maquettes téléphone `<section>-figNN.png` + 6 planches de section `<section>-full.png`.

| Fichier | Vue |
|---|---|
| `p4-fig01.png` | Le composer au repos (profil Story, socle 3 membres, scène 9:16 à bandes) |
| `p5-fig01..04.png` | Les portes d'entrée (tray, feed, réels, mood/repost) |
| `p6-fig01..03.png` | La scène : porteur 9:16, porteur 16:9 à bandes, document sans scène |
| `p7-full.png` | Les 9 outils (Texte · Média · Son · Dessin · Sticker · Lieu · Références · Fond · Slides) |
| `p8-full.png` | La timeline « un plan » |
| `p9-fig01..03.png` | La capture par appui long |
| `p10-fig01..03.png` | Le socle & la publication (audience, aperçu, Publier) |
| `p11-fig01.png` | L'Étagère |
| `p12-fig01..03.png` | Les trois chromes viewers |
| `p13-full.png` | La matrice maîtresse (outil × format) |
| `p18-fig01..06.png` | Les entrées externes (partage entrant, média reçu) |
| `p19-fig01..03.png` · `p20-fig01..04.png` | Continuité/PiP · la rupture v3 vécue |
| `p21-full.png` | Les 18 styles de texte (chacun dans sa police) |
| `p22-full.png` | L'iconographie (le SF Symbol de chaque contrôle) |
| `p23-fig01..03.png` | Les éditeurs (trim audio · rognage image · cut vidéo) |
| `p24-full.png` · `p24-fig01..06.png` | Les cas d'usage (carrousels & réels, avec/sans son) |

Régénérer : ouvrir le `.html` dans un navigateur et capturer chaque `.phfig` + les sections `#p7/#p8/#p13/#p21/#p22/#p24`.
Ces captures sont des **spécimens de DESIGN** (rendu de la vision), pas l'état de l'app — l'implémentation se vérifie au simulateur (issue par issue).
