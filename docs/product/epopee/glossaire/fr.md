# Glossaire de l'épopée — français (la source)

> Tiré de la conception `docs/superpowers/specs/2026-10-20-epopee-du-jeu-design.md` (§ 2, § 3, § 4). En cas d'écart, la conception a raison et ce glossaire se corrige. Les six autres langues ont chacune leur glossaire (`en.md`, `es.md`, `de.md`, `it.md`, `pt.md`, `ar.md`), qui traduisent CE fichier terme pour terme.
>
> Ce glossaire fait foi pour les textes du jeu sur le web, sur iOS et dans la passerelle : **un terme par concept, le même partout.**
>
> Sa projection vérifiable est `packages/shared/design/game-epic-vocabulary/fr.json` (les mots bannis et les noms canoniques), que la garde web `apps/web/src/lib/game/epic-vocabulary.test.ts` applique à chaque valeur des catalogues du jeu. Une règle qui entre ici entre là, dans le même commit. Format : `README.md`.

## Ce qui ne change jamais

- **Les règles du jeu** : seuils, prix, gains, plafonds. Aucun nombre ne bouge.
- **Les clés du fil** : `etincelle`, `lumiere`, les clés de rang, de ligue, de forme de Flamme, les noms de champs servis. Seul le TEXTE affiché change.
- Les paramètres (`{count}`, `{level}`…) et les familles plurielles (`.one`, `.other`) de chaque clé.

## Le récit en une page

Le joueur connecté est **le héros**. Sa quête : devenir une **Légende**. Au-delà, le **Mythe** n'attend que cent élus, « ceux que le dieu de leurs aïeux précède ».

Chaque vrai échange fait jaillir des **étincelles**. Ensemble, elles forment **ta lumière**. Tes **aïeux** veillent sur toi : chaque nuit, ils t'envoient un **rêve** à réaliser ; à chaque évolution, ils **se manifestent**. À Ambassadeur, ils se révèlent : tu reconnais leur terre parmi sept (Afrique éternelle, Égypte solaire, Olympe, Empire céleste, Aurores du Nord, Abysses, Néon).

**Mee et Meo**, deux colibris, portent les messages entre les deux mondes. Ils guident chaque étape et parlent la voix du récit. Ils agissent ou parlent : jamais un décor.

**Le dieu des aïeux** n'est jamais nommé ni dessiné. Il ne parle qu'une fois, au seuil du Mythe.

## Les deux voix

| Voix | Où | Forme | Exemple |
|---|---|---|---|
| **A, la synthèse** | bandeau du joueur, pastilles, blason à côté d'un nom, cadres de la vue principale de Progression | un nom court et son chiffre | « Passeur IV », « 12 Meeshes · Escarcelle », « Jade · 4ᵉ » |
| **B, le récit d'abord** | page Progression détaillée, fiches de concept, cartes de Mee et Meo, signes des aïeux, feuilles de précisions, carnet des règles | la phrase mène, le chiffre exact suit en petit | « Ton Escarcelle tient 12 Meeshes », puis en petit « le Coffret à 50 » |

Une surface non classée : s'il y a la place d'une phrase, B ; sinon A. Les mots bannis disparaissent dans les deux voix.

Le ton : on tutoie, on écrit pour un enfant de 13 ans, une idée par phrase. Dans une phrase, « gloire » s'écrit en minuscule et se lie par « de » : « +250 de gloire ».

## Les mots bannis (partout)

| Mot banni | Ce qui le remplace |
|---|---|
| augmenter, faire monter (une valeur) | grandir, nourrir, s'éveiller, briller plus fort |
| compteur | le nom du concept (« ta gloire », « ta Flamme ») |
| valeur, valeur réelle | « ta lumière » |
| convertibles, en poche | « ta lumière » |
| potentiel | rien : on dit ce qu'on possède |
| dette | « une ombre voile N étincelles de ta lumière » (l'**Ombre**) |
| record (total à vie) | « reçues depuis toujours » |
| record de niveau | « ta plus haute lumière » |
| record de Flamme, record de série | « ta plus longue Flamme » |
| record de Meeshes | « frappées depuis toujours » |
| encore N avant X | en petit, « N jusqu'à X » |
| coûte, prix (sur une fiche) | une phrase : « elle fige N étincelles de ta lumière » ; le calcul va dans les règles |
| restera | rien : aucune soustraction sur une fiche |
| barème | « chaque geste fait jaillir les siennes » |
| prix de base, pourcentage, facteur (sur une fiche) | rien : le calcul vit dans les règles |

## Un mot, un sens

| Mot | Il désigne désormais | Il ne désigne plus |
|---|---|---|
| Braise | la première forme de la Flamme | le premier palier de niveau (→ Étincelle) |
| Lumière | ta lumière, le fil entier (la Lumière du héros) | un palier de niveau (→ Clarté) |
| Coffre | la quatrième réserve de l'Héritage | le coffre du jour (→ l'Offrande) |
| Trésor | la cinquième réserve de l'Héritage | le concept entier (→ l'Héritage) |
| Étoile | le ciel : le palier Étoile, le ciel des aïeux, les fragments d'étoile | le Prestige (→ âges), la saison (→ pas) |
| Étape | l'intégration (l'accueil) seulement | le seuil des dix niveaux (→ épreuve), la saison (→ halte) |
| Rang | le nom que le monde donne au héros | la place en ligue (→ place) |
| Record | plus rien | voir « depuis toujours », « ta plus haute lumière », « ta plus longue Flamme », « frappées depuis toujours » |

## Les concepts

### La Lumière (le niveau — `game.level.*`, `game.tier.*`, étapes `level-steps`)

- **Ce que c'est** : la lumière du héros, qui traverse vingt états. Son niveau est le chiffre de l'anneau.
- **Les vingt états** : **Étincelle** (clé `etincelle`, jamais « Braise »), Lueur, **Clarté** (clé `lumiere`, jamais « Lumière »), Éclat, Rayon, Aurore, Comète, Étoile, Constellation, Galaxie, puis Nébuleuse, Pulsar, Quasar, Supernova, Magnétar, Amas, Superamas, Cosmos, Infini, Singularité.
- **L'épreuve** : tous les dix niveaux, de 10 à 100, les aïeux demandent une épreuve (une Meesh, un rêve, une Flamme, un rang). Tant qu'elle n'est pas réussie, la lumière attend.
- **Le rang ouvre la lumière** : la Supernova est la limite sous Ambassadeur, Ambassadeur ouvre jusqu'à la Singularité, Oracle lève toute limite.
- **A** : anneau « 34 » · Éclat ; « Niveau 34 ».
- **B** : « Ta lumière brille en Éclat », puis en petit « niveau 34 · 3 200 étincelles jusqu'au niveau 35 ».
- **Bannis** : « encore N avant le niveau X » → « N étincelles jusqu'au niveau X » ; « étape » → « épreuve » ; « record de niveau » → « ta plus haute lumière ».

### Les Étincelles (`game.sparks.*`, `game.points.*`)

- **Ce que c'est** : l'unité. Chaque vrai échange fait jaillir des étincelles ; ensemble, elles forment **ta lumière**.
- **Les noms** : la poche = « ta lumière » ; le cycle = « depuis ta dernière renaissance » ; le total à vie = « reçues depuis toujours » ; la dette = **l'Ombre**.
- **La fiche** s'appelle « Étincelles ». Sa tête : « Ta lumière », **108 233 étincelles** en grand, « 377 752 reçues depuis toujours » en petit.
- **A** : « 108 233 étincelles ».
- **B** : « Ta lumière compte 108 233 étincelles », puis en petit « 377 752 reçues depuis toujours ».
- **L'Ombre** : « Une ombre voile N étincelles de ta lumière : tes prochaines étincelles la dissiperont. Tant qu'elle est là, on ne frappe pas. »
- **Bannis** : « convertibles », « valeur réelle », « potentiel », « record d'étincelles », « en poche » → « ta lumière » ; « dette » → l'Ombre ; « barème » → « chaque geste fait jaillir les siennes ».

### Le Rang (la gloire — `game.glory.*`, `game.rank.*`)

- **Ce que c'est** : le nom que le monde donne au héros. La gloire le donne, et il ne recule jamais.
- **Les rangs** : Murmure, Écho, Voix, Conteur, Passeur, Polyglotte, Ambassadeur, Orateur, Oracle, Légende, puis le **Mythe** (cent élus).
- **Les marches** : cinq par rang, de V (la première) à I (la plus haute).
- **A** : « Passeur IV » ; « gloire 44 600 ».
- **B** : « On t'appelle Passeur », puis en petit « deuxième marche · gloire 44 600 ».
- **Bannis** : « encore N de Gloire avant X » → « N de gloire jusqu'à X » ; « +250 Gloire » → « +250 de gloire » ; « compteur » → « ta gloire ».

### L'Héritage (`game.treasury.*`, `game.meesh.*`, `game.mint.*`)

- **Ce que c'est** : les pièces gardées pour la lignée. **Frapper une Meesh fige une part de ta lumière dans une pièce numérotée** : ta lumière, donc ton niveau, baisse d'autant ; ce qui a été reçu reste reçu.
- **La fiche des Meeshes** s'appelle « L'Héritage ».
- **Les contenants** (inchangés) : Bourse (1), Escarcelle (10), Coffret (50), Coffre (100, rang Voix I), Trésor (500, Polyglotte III), Réserve (1 000, Ambassadeur III).
- **Les éditions** : argent ; or (chaque centième) ; prisme (chaque millième).
- **A** : « 88 Meeshes · Coffret ».
- **B** : « Ton Coffret », **88 Meeshes** en grand, « le Coffre s'ouvre à 100 », « 91 frappées depuis toujours ».
- **La frappe** : « La Meesh n° 92 — Elle fige 10 423 étincelles de ta lumière, qui en compte 108 233. » ; le bouton « Frapper avec Mee et Meo », « +1 000 de gloire » en petit dedans.
- **Bannis** : « coûte », « restera », « prix de base … % au niveau … » → rien sur la fiche ; « record de Meeshes » → « frappées depuis toujours » ; « convertibles » → « ta lumière » ; « trésor » (le concept) → « l'Héritage ».

### Le Rêve et l'Offrande (`game.mission.*`, `game.chest.*`)

- **Ce que c'est** : chaque nuit, les aïeux envoient un **rêve** en trois actes, de plus en plus riches en gloire.
- **Les noms** : **Acte I**, **Acte II**, **Acte III**, parfois l'**Acte d'or**. Les trois actes réalisés font apparaître **l'Offrande**, un présent voilé (fermée, elle ne dévoile rien). L'**Heure du Prisme** : une heure où chaque acte compte double. Changer un acte demande une Meesh.
- **A** : « Rêve 2/3 ».
- **B** : « Le rêve de cette nuit · 2 actes sur 3 », puis en petit « l'Acte III vaut 250 de gloire ».
- **Bannis** : « missions du jour » → « le rêve » ; « mission » → « acte » ; « coffre du jour » → « l'Offrande » ; « 10 missions du jour » (épreuve) → « 10 rêves réalisés ».

### La Flamme (`game.flame.*`)

- **Ce que c'est** : le feu que les aïeux confient au héros. Un geste par jour l'entretient.
- **Les formes** : Braise (1 jour), Flamme (7), Brasier (30), Astre (100), Soleil (365).
- **La Veilleuse** garde la Flamme allumée un jour d'absence (deux au plus, une Meesh chacune). Éteinte, la Flamme se rallume dans les 48 heures (trois Meeshes).
- **Elle nourrit tes rêves** : chaque jour ajoute des étincelles à chaque acte, jusqu'à moitié plus.
- **A** : « ▲ 23 j », « Flamme 23 jours ».
- **B** : « Ta Flamme brûle depuis 23 jours », puis en petit « +46 % sur tes rêves ».
- **Bannis** : « gel » → « Veilleuse » ; « série » → « Flamme » ; « record de Flamme » → « ta plus longue Flamme ».

### La Joute et l'Alliance (`game.league.*`, `game.duo.*`)

- **Ce que c'est** : chaque semaine, trente héros de lumière semblable se mesurent sous leur **nom de joute**.
- **Les cercles** (inchangés) : Quartz, Ambre, Jade, Saphir, Rubis, Améthyste, Diamant, Prisme.
- Les sept premiers **gravissent le cercle suivant**, les cinq derniers redescendent, les trois premiers reçoivent une **coupe**. La **Joute des amis** reste toujours ouverte.
- **L'Alliance** : une fois par semaine, avec un ami ; si chacun réalise sa part, la récompense double.
- **A** : « Jade · 4ᵉ ».
- **B** : « Joute de Jade · 4ᵉ place », puis en petit « les 7 premiers montent au Saphir ».
- **Bannis** : « ligue » → « joute » ; « rang » en ligue → « place » ; « pseudonyme » → « nom de joute » ; « duo », « mission en duo » → « alliance ».

### Le Voyage (`game.season.*`)

- **Ce que c'est** : toutes les huit semaines, les aïeux envoient le héros en voyage dans une **terre de langue** : français, espagnol, arabe, swahili, japonais, portugais, hindi, chinois (« en terre française »).
- **Les pas** : chaque acte réalisé fait avancer de quelques pas (1 pour un acte, 2 pour l'Acte III, 3 pour l'Acte d'or, 5 pour une alliance). Quatre pas mènent à la **halte** suivante ; quarante haltes font le voyage. Au bout, la **coupe du voyage**.
- **Le Sceau du voyage** (10 Meeshes) ajoute des objets à collectionner, sans avantage.
- **A** : « Voyage 1 · halte 9/40 ».
- **B** : « En terre française · 9ᵉ halte », puis en petit « 2 pas jusqu'à la halte suivante ».
- **Bannis** : « saison » → « voyage » ; « étoiles de saison » → « pas » ; « étape de saison » → « halte ».

### La Renaissance (`game.prestige.*`)

- **Ce que c'est** : au niveau 100, quand sa lumière est devenue Galaxie, le héros peut renaître. Sa lumière redevient Étincelle et sa légende entre dans un nouvel **Âge**. Les aïeux lui offrent un trophée et une grande gloire. Rien d'autre ne se perd.
- **Les Âges** : Premier Âge (avant toute renaissance), Deuxième Âge… jusqu'au Sixième Âge (cinq renaissances au plus).
- **A** : « Âge II ».
- **B** : « Ta légende vit son Deuxième Âge ».
- **Bannis** : « prestige » → « renaissance » ; « étoiles » de prestige → « âges ».

### Les traces de la légende

| Aujourd'hui | Dans l'épopée | Précisions |
|---|---|---|
| célébration, moment photo | **signe des aïeux** | « Tes aïeux se manifestent » : une animation, un cadre, une photo avec Mee et Meo |
| carnet de progression | **la Chronique** | le livre de la légende, où chaque signe s'immortalise |
| succès | **les Hauts faits** | raretés inchangées |
| vitrine, trophées | **les Trophées** | coupes de joute et de voyage, trophées de renaissance et de Flamme |
| badges | **les Médailles** | matières : Cuivre, Bronze, Argent, Or, Platine, Obsidienne, Prisme |
| Atlas | **l'Atlas** | un tampon par langue vraiment échangée |
| Constellation, fragments d'étoile | **le ciel des aïeux** | dix fragments d'étoile allument une étoile ; chaque étoile offre une parure |

- **Bannis** : « succès » → « hauts faits » ; « badges » → « médailles » ; « carnet » → « Chronique » ; « constellation » (le concept) → « le ciel des aïeux » ; « célébration » → « signe des aïeux ».

### Élans et Défis

Inchangés. « Un Élan multiplie les étincelles qui jaillissent. »

## Les noms des cadres de Progression (voix A)

La Lumière · Étincelles · L'Héritage · Le Rang · La Flamme · Le Rêve · La Joute · Le Voyage · La Renaissance · Élans · Médailles · Défis · Hauts faits · Trophées · L'Atlas.
