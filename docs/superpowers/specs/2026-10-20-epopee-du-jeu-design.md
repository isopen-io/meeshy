# L'épopée du jeu — conception

> Séance du 2026-10-20 avec le porteur. Lancée par le porteur : « lance l'orchestration pour tout le reste ! », après la carte du récit (« Tout est OK ! ») et la maquette de la frappe (« Parfait »).
> Maquettes de référence : `docs/product/epopee/` (carte du récit, voix, hiérarchie des fiches, cérémonie de la frappe).
> Leçon liée : `tasks/lessons/2026-10-20-une-fiche-met-en-tete-ce-qu-on-possede-et-ne-dit-chaque-chiffre-qu-une-fois.md`.

## 1. L'intention

Le porteur : « Il faut mettre à jour le jeu de Meeshy, que de parler de compteur d'incrément donne de la vie, une histoire pour chaque concept plutôt. L'ensemble doit faire partie cohérente d'une histoire, d'une épopée qui prendra des années à se réaliser ! Fais un effort pour une cohérence entre chaque concept du jeu, des rangs, niveaux, prestiges, etc. On ne parle plus de augmenter, compteur, valeur, mais on donne des noms, d'évolution, etc. »

Le pourquoi : aujourd'hui, chaque concept du jeu parle sa propre langue de comptable (« convertibles », « dette », « encore N avant », « record »), et cinq familles de métaphores se disputent les mêmes mots (Braise, Lumière, Coffre, Trésor, Étoile, Étape, Rang, Record). Le joueur doit comprendre une comptabilité au lieu de vivre une histoire. L'épopée donne à tout le jeu un seul récit, où chaque concept a un nom, une histoire et des étapes d'évolution, et qui se vit sur des années.

**Ce qui ne change pas : les RÈGLES du jeu.** Les seuils, les prix, les gains, les plafonds et les clés du fil restent les mêmes. Ce qui change, c'est ce que le jeu RACONTE, sa voix, la façon dont il montre ce qui compte, la pièce et le geste de la frappe.

## 2. Le récit-cadre (décisions du porteur)

- **Le héros est le joueur connecté.** Sa quête : devenir une **Légende**.
- Le **Mythe** n'attend que quelques élus, les 100 places du code (`MYTHE_SIZE`), « ceux que le dieu de leurs aïeux précède ».
- **Les aïeux sont ceux de CHAQUE joueur.** Ils lui envoient, chaque nuit, un rêve à réaliser (les missions du jour, riches en gloire). Ils se manifestent à chacune de ses évolutions. À chaque rang, ils lui offrent les parures qui disent qui il est devenu (voir § 9, hors de cette vague).
- **À Ambassadeur, les aïeux se révèlent** : le héros reconnaît leur terre parmi sept (le choix d'atmosphère existant) : Afrique éternelle, Égypte solaire, Olympe, Empire céleste, Aurores du Nord, Abysses, Néon.
- **Mee et Meo**, deux colibris, sont les messagers entre les deux mondes. Ils guident chaque étape (comme aujourd'hui) et parlent la voix du récit.
- **Le dieu des aïeux** (choix de Claude, accepté avec la carte) n'est jamais nommé ni dessiné. Il ne parle qu'une fois, au seuil du Mythe, en une phrase : le jeu se lit en sept langues, par des croyants de toutes confessions et par des non-croyants.
- Le premier palier de niveau redevient **« Étincelle »** (porteur : « puisque les points sont des étincelles »). La Flamme garde **« Braise »** comme première forme.

L'écoulement du temps, en ordres de grandeur pour un joueur qui réalise ses rêves chaque jour (≈ 1 100 de gloire par jour, seuils de `glory.ts`) : Voix en une semaine environ, Passeur en un mois, Ambassadeur en quatre mois (les aïeux se révèlent), Oracle en un an (la lumière n'a plus de limite), Légende en un an et demi, Mythe en deux ans et demi environ, puis les Âges. Ce sont des estimations ; le rythme des moments reste une décision ouverte (#9964).

## 3. Les règles d'écriture

### 3.1 Plus de mots de comptable

On ne dit plus « augmenter », « compteur », « valeur », « convertibles », « dette », « record », « encore N avant », « coûte », « restera », « barème », « potentiel ». On nomme et on raconte des évolutions. Le § 4 donne, concept par concept, le mot banni et ce qui le remplace.

### 3.2 Deux voix selon l'emplacement (décision du porteur)

Le porteur : « Mélange de A et B ! Selon l'emplacement ! Là où on a l'espace pour compter, B ; là où on synthétise, A. »

- **B, le récit d'abord** : le nom ou la phrase mène, et le chiffre exact suit en petit. Exemple : « Ton Escarcelle tient 12 Meeshes », puis en petit « le Coffret à 50 ». B vaut pour la page Progression détaillée, les fiches de concept, les cartes de Mee et Meo, les signes des aïeux (célébrations) et les feuilles de précisions.
- **A, la synthèse** : un nom court et son chiffre. Exemples : « Passeur IV », « 12 Meeshes · Escarcelle ». A vaut pour le bandeau du joueur, les pastilles, le blason à côté d'un nom et les cadres de la vue principale de Progression.
- Les mots bannis du § 3.1 disparaissent PARTOUT, en A comme en B.
- Une surface non classée suit la règle : s'il y a la place d'une phrase, B ; sinon A.

### 3.3 La hiérarchie d'un écran (décision du porteur, 2026-10-20)

Le porteur : « Sur la vue principale de progression, plus de scroll horizontal permis, dans chaque cadre éviter la redondance d'information et afficher les informations prioritaires en gros et secondaires en petit. » Et, sur la fiche des étincelles : « [elle] s'intéresse à la somme maximale qu'on a jamais atteinte au lieu de la somme en notre possession actuellement ? »

1. **Rien ne glisse de côté**, nulle part dans le jeu : tout s'empile ou passe à la ligne. Les gardes existantes (#9564, amendement n° 3) couvrent la page Progression. Elles s'étendent à toutes les pages et fiches du jeu.
2. **Un fait ne paraît qu'une fois par écran.** On dédoublonne par l'IDENTITÉ du fait (sa source), sur l'écran entier : tête, pastilles, phrases et lignes. Jamais par égalité de chaîne, ni dans un seul cadre.
3. **Un seul chiffre en grand par cadre**, celui qui répond à la question de l'écran. Sous la tête, deux tailles au plus : secondaire, puis tertiaire.
4. **Ce qu'on possède passe avant ce qu'on a cumulé.** Le « depuis toujours » va en petit.
5. **Aucun calcul sur une fiche** : ni prix de base, ni pourcentage, ni soustraction. Le calcul vit dans les règles.
6. **Une valeur de tête se lie à la donnée qu'elle NOMME**, jamais à un champ technique qui la recouvre par coïncidence. L'en-tête iOS des étincelles lit aujourd'hui `game.level.score`, la base du niveau ; il doit lire la poche par son nom, comme le web (`sparks.pocket`).
7. **Mee et Meo agissent ou parlent.** Ils ne sont jamais un décor posé qui serre l'information. Dans la carte de la frappe, leur scène a sa propre bande, pleine largeur.

### 3.4 Contraintes de fond

- **Les clés du fil ne changent pas** : les clés de palier (`etincelle`, `lumiere`…), de rang, de ligue, de forme de Flamme. Les clients publiés décodent strictement, et une clé inconnue fait tomber tout le bloc. On ne change que les TEXTES affichés, plus l'affichage de la pièce et la cérémonie de la frappe, qui sont dessinés côté client. La production reste rétrocompatible (#9223, #9231).
- **Sept langues** : fr (la source), en, es, de, it, pt-BR, ar. On respecte les familles plurielles et l'isolation RTL de l'arabe. Un terme par concept et par langue, le même sur le web, iOS et la passerelle. Le glossaire de chaque langue fait foi : `docs/product/epopee/glossaire/<langue>.md`.
- **Lisible par un enfant de 13 ans.**
- **Le web ET iOS dans la même vague.** Le Kotlin Android est gelé : on ne le touche pas, et on consigne ce qu'il n'a pas reçu.
- **L'économie reste intacte** (cohérence totale de l'économie du jeu) : aucun nombre de règle ne change. Le choix de Claude, à relire : la gloire des rêves reste à 40 · 100 · 250 · 500.

## 4. Le lexique de l'épopée (français, la source)

| Concept (familles de clés) | Aujourd'hui | Dans l'épopée | Évolutions et noms | Synthèse (A) | Récit (B) | Mots bannis → remplacement |
|---|---|---|---|---|---|---|
| Niveau (`game.level.*`, `game.tier.*`, étapes `level-steps`) | niveau, palier, étape | **la Lumière** du héros, qui traverse vingt états | Étincelle (clé `etincelle`, plus « Braise »), Lueur, **Clarté** (clé `lumiere`, plus « Lumière »), Éclat, Rayon, Aurore, Comète, Étoile, Constellation, Galaxie, puis Nébuleuse, Pulsar, Quasar, Supernova, Magnétar, Amas, Superamas, Cosmos, Infini, Singularité. Tous les dix niveaux, une **épreuve** demandée par les aïeux. **Le rang ouvre la lumière** : la Supernova est la limite sous Ambassadeur, Ambassadeur ouvre jusqu'à la Singularité, et Oracle lève toute limite | anneau « 34 » · Éclat | « Ta lumière brille en Éclat », puis en petit « niveau 34 · 3 200 étincelles jusqu'au niveau 35 » | « Encore N avant le niveau X » → en petit, « N étincelles jusqu'au niveau X » ; « étape » → « épreuve » ; « record de niveau » → « ta plus haute lumière » |
| Étincelles (`game.sparks.*`) | points, poche, convertibles, cumul, record, dette | des **étincelles** (l'unité) qui forment **ta lumière** | la poche = « ta lumière » ; le cycle = « depuis ta dernière renaissance » ; le total à vie = « reçues depuis toujours » ; la dette = **l'Ombre** | « 108 233 étincelles » | « Ta lumière » : **108 233 étincelles** en grand, puis en petit « 377 752 reçues depuis toujours » | « convertibles », « valeur réelle », « potentiel », « record d'étincelles », « en poche » → « ta lumière » ; « dette » → « une ombre voile N étincelles de ta lumière : tes prochaines étincelles la dissiperont ; tant qu'elle est là, on ne frappe pas » ; « barème » → « chaque geste fait jaillir les siennes » |
| Gloire et rang (`game.glory.*`, `game.rank.*`) | Gloire, rang, division | **le Rang**, le nom que le monde donne au héros | Murmure, Écho, Voix, Conteur, Passeur, Polyglotte, Ambassadeur, Orateur, Oracle, Légende, puis le **Mythe** (cent élus). Cinq **marches** par rang (V, la première, à I, la plus haute). Le rang ne recule jamais | « Passeur IV » | « On t'appelle Passeur », puis en petit « deuxième marche · gloire 44 600 » | « Encore N de Gloire avant X » → en petit, « N de gloire jusqu'à X » ; « +250 Gloire » → « +250 de gloire » (minuscule dans les phrases) |
| Héritage (`game.treasury.*`, `game.meesh.*`, `game.mint.*`) | trésor, réserves, coût, solde | **l'Héritage** : les pièces gardées pour la lignée | contenants inchangés : Bourse (1), Escarcelle (10), Coffret (50), Coffre (100, rang Voix I), Trésor (500, Polyglotte III), Réserve (1 000, Ambassadeur III). **Frapper une Meesh fige une part de ta lumière dans une pièce numérotée** : ta lumière, donc ton niveau, baisse d'autant (loi #10892), et ce qui a été reçu reste reçu. Éditions : argent, or (chaque centième), prisme (chaque millième) | « 88 Meeshes · Coffret » | fiche « L'Héritage » : « Ton Coffret » ; **88 Meeshes** en grand ; « le Coffre s'ouvre à 100 » ; « 91 frappées depuis toujours » | « Coûte », « Restera », « Prix de base … % au niveau … » → rien sur la fiche (le calcul part dans les règles) ; « Record de Meeshes » → « frappées depuis toujours » ; « Convertibles » → « ta lumière » ; « trésor » (le concept) → « l'Héritage » |
| Rêve et Offrande (`game.mission.*`, `game.chest.*`) | missions du jour, coffre du jour | **le Rêve** que les aïeux envoient chaque nuit, en trois actes de plus en plus riches en gloire | **Acte I, Acte II, Acte III**, parfois l'**Acte d'or** ; les trois actes réalisés font apparaître **l'Offrande**, un présent voilé (fermée, elle ne dévoile rien, #10567). L'Heure du Prisme : une heure où chaque acte compte double. Changer un acte coûte une Meesh | « Rêve 2/3 » | « Le rêve de cette nuit · 2 actes sur 3 », puis en petit « l'Acte III vaut 250 de gloire » | « missions du jour » → « le rêve » ; « mission » → « acte » ; « coffre du jour » → « l'Offrande » ; « 10 missions du jour » (épreuve) → « 10 rêves réalisés » |
| Flamme (`game.flame.*`) | Flamme, série, gel, bonus | **la Flamme** que les aïeux confient au héros | Braise (1 jour), Flamme (7), Brasier (30), Astre (100), Soleil (365). La **Veilleuse** la garde allumée un jour d'absence (2 au plus, 1 Meesh chacune). Éteinte, elle se rallume dans les 48 heures (3 Meeshes). Elle **nourrit tes rêves** : chaque jour ajoute des étincelles à chaque acte, jusqu'à moitié plus | « ▲ 23 j » | « Ta Flamme brûle depuis 23 jours », puis en petit « +46 % sur tes rêves » | « gel » → « Veilleuse » ; « série » → « Flamme » ; « record de Flamme » → « ta plus longue Flamme » |
| Joute et Alliance (`game.league.*`, `game.duo.*`) | ligue, rang en ligue, pseudonyme, duo | **la Joute** de la semaine, et **l'Alliance** | ligues inchangées : Quartz, Ambre, Jade, Saphir, Rubis, Améthyste, Diamant, Prisme. Trente héros de lumière semblable s'y mesurent sous leur **nom de joute**. Les sept premiers **gravissent le cercle suivant**, les cinq derniers redescendent, et les trois premiers reçoivent une **coupe**. La **Joute des amis** reste toujours ouverte. Une fois par semaine, on peut faire **alliance** avec un ami : si chacun réalise sa part, la récompense double | « Jade · 4ᵉ » | « Joute de Jade · 4ᵉ place », puis en petit « les 7 premiers montent au Saphir » | « ligue » → « joute » ; « rang » en ligue → « place » ; « pseudonyme » → « nom de joute » ; « duo », « mission en duo » → « alliance » |
| Voyage (`game.season.*`, `season-app-events.ts`) | saison, étoiles de saison, étapes, passe | **le Voyage** en terre de langue, tous les huit semaines | terres : français, espagnol, arabe, swahili, japonais, portugais, hindi, chinois. Chaque acte réalisé fait avancer de quelques **pas** (1 pour un acte, 2 pour l'Acte III, 3 pour l'Acte d'or, 5 pour une alliance). Quatre pas mènent à la **halte** suivante, et quarante haltes font le voyage. Au bout, la **coupe du voyage**. Le **Sceau du voyage** (10 Meeshes) ajoute des objets à collectionner, sans avantage | « Voyage 1 · halte 9/40 » | « En terre française · 9ᵉ halte », puis en petit « 2 pas jusqu'à la halte suivante » | « saison » → « voyage » ; « étoiles de saison » → « pas » ; « étape de saison » → « halte » |
| Renaissance (`game.prestige.*`) | Prestige, étoiles de prestige | **la Renaissance** | au niveau 100, quand sa lumière est devenue Galaxie, le héros peut renaître : sa lumière redevient Étincelle et sa légende entre dans un nouvel **Âge** (Premier Âge, avant toute renaissance, jusqu'au Sixième Âge, cinq renaissances au plus). Les aïeux lui offrent un trophée et une grande gloire. Rien d'autre ne se perd | « Âge II » | « Ta légende vit son Deuxième Âge » | « prestige » → « renaissance » ; « étoiles » de prestige → « âges » |
| Traces | célébrations, moments photo, carnet, succès, vitrine, badges, Atlas, Constellation | les **signes des aïeux**, la **Chronique**, les **Hauts faits**, les **Trophées**, les **Médailles**, l'**Atlas**, le **ciel des aïeux** | à chaque évolution, « tes aïeux se manifestent » : une animation, un cadre, une photo à immortaliser avec Mee et Meo, qui rejoint la **Chronique** (le carnet). Hauts faits : raretés inchangées. Médailles : Cuivre, Bronze, Argent, Or, Platine, Obsidienne, Prisme. Atlas : un tampon par langue vraiment échangée. Ciel des aïeux : dix **fragments d'étoile** allument une étoile, et chaque étoile offre une parure | noms courts | phrases | « succès » → « hauts faits » ; « badges » → « médailles » ; « carnet » → « Chronique » ; « constellation » (le concept) → « le ciel des aïeux » ; « célébration » → « signe des aïeux » |
| Élans, Défis | — | inchangés | « un Élan multiplie les étincelles qui jaillissent » | | | |

### Un mot, un sens

| Mot | Ce qu'il désignait | Ce qu'il désigne désormais |
|---|---|---|
| Braise | le premier palier de niveau et la première forme de Flamme | la Flamme seulement ; le palier redevient Étincelle |
| Lumière | un palier de niveau, et le fil entier | le fil (« ta lumière ») ; le palier devient Clarté |
| Coffre | le coffre du jour et la 4ᵉ réserve | la réserve seulement ; le coffre du jour devient l'Offrande |
| Trésor | le concept et la 5ᵉ réserve | la réserve seulement ; le concept devient l'Héritage |
| Étoile | le Prestige, la saison, la Constellation, un palier, les fragments | le ciel seulement (palier Étoile, ciel des aïeux, fragments) ; la saison compte des pas, la renaissance des âges |
| Étape | le seuil des dix niveaux, la saison, l'intégration | l'intégration seulement ; le seuil est une épreuve, le voyage a des haltes |
| Rang | le nom du héros et sa place en ligue | le nom du héros seulement ; la joute parle de place |
| Record | le total à vie, le niveau max, la plus longue Flamme, le nombre de frappes | « depuis toujours », « ta plus haute lumière », « ta plus longue Flamme », « frappées depuis toujours » |

## 5. Les écrans

- **La vue principale de Progression (A)** : chaque cadre a un nom en petit, une valeur en grand et une seule ligne en petit. Aucune rangée ne déborde. Voir `docs/product/epopee/fiches-hierarchie.html`.
- **La fiche des Meeshes devient « L'Héritage » (B).**
  - Premier cadre : « Ton Coffret », **88 Meeshes** en grand, « le Coffre s'ouvre à 100 » en petit, « 91 frappées depuis toujours » en tertiaire.
  - Cadre de la frappe : une bande pleine largeur pour la scène (Mee, l'enclume, le flan, Meo et son marteau), puis « La Meesh n° 92 », puis « Elle fige 10 423 étincelles de ta lumière, qui en compte 108 233. », puis le bouton « Frapper avec Mee et Meo » avec « +1 000 de gloire » en petit dans le bouton, puis une phrase de Mee.
  - « Où j'en suis » disparaît quand il redit la tête.
  - Le calcul du prix (prix de base, facteur, niveau) part dans les règles.
- **La fiche des Étincelles (B)** : « Ta lumière » ; **108 233 étincelles** en grand (la poche) ; « 377 752 reçues depuis toujours » en petit. Le prix de la prochaine pièce n'y paraît plus : un lien mène à l'Héritage. Quand une Ombre existe, elle se dit en une ligne et passe avant le reste, puisqu'elle bloque la frappe.
- **Chaque fiche** applique le § 3.3. Une garde le vérifie sur chaque plateforme : chaque fait rendu porte son identité, et deux rendus de la même identité sur un écran sont un défaut.

## 6. La Meesh (la pièce)

Décisions du porteur, 2026-10-20 :

- **Avers, pour toutes les éditions** : la Signature Meeshy frappée au centre et la tranche cannelée, comme aujourd'hui. La couronne devient **universelle : « MEESHY · 1 MEESH »** (porteur : « selon la langue c'est UNE MEESH ou ONE MEESH, peut-être simplifier en 1 MEESH ? »). On ne la traduit plus : la propriété `inscription` localisée disparaît.
- **Revers** : l'oiseau ou les oiseaux, gravés dans le métal et colorés (relief, #9540), l'année et le numéro.
  - **Argent** : Mee.
  - **Or** : Meo.
  - **Prisme** : Mee et Meo, face à face.
  - **Le numéro** s'écrit « Nº » avec le o en exposant, **souligné**, et **le nombre en petit** (porteur : « pour le numéro mettre o souligné et le nombre en petit »). Le libellé n'est plus localisé : `numberLabel` disparaît.
- **Les matières** :
  - **Argent** : de l'argent veiné d'un peu d'or.
  - **Or** : **de l'or pur**, centre compris. Aujourd'hui, le centre reste argent.
  - **Prisme** : **de l'or mêlé de diamant**, avec des éclats qui scintillent et une tranche irisée.
- **Les décors, différents par édition** (porteur : « prisme doit être royale, or raffiné ») :
  - **Argent : sobre.** La tranche cannelée et la couronne, rien de plus.
  - **Or : raffiné.** Un grènetis fin (une couronne de perles) sur le bord, un guilloché fin en rosace dans le champ, derrière la Signature et derrière Meo, deux rameaux de laurier qui encadrent le numéro, et de petites étoiles entre les mots de la couronne.
  - **Prisme : royal.** Un double grènetis, huit cabochons de diamant taillés autour du bord, un guilloché en soleil rayonnant dans le champ, une couronne royale au-dessus de Mee et Meo, des éclats de diamant qui scintillent, et la tranche irisée.
- **Une seule source de géométrie** : la géométrie des décors (perles, cabochons, couronne, lauriers, rosace) vit dans un fichier partagé (`packages/shared/design/meesh-coin.json`, par exemple). Le web (SVG, `apps/web/src/components/game/meesh-coin.tsx`) et iOS (`MeeshCoinView.swift`, `GameEngravedBirds.swift`) le lisent ou le rejouent, et un témoin de chaque côté vérifie qu'ils dessinent la même pièce.
- Le choix de Claude, à relire : chaque décor reste lisible à 44 pt (la pièce de la Coffret). En petite taille, les détails fins s'effacent, et seuls la matière et la silhouette restent.

La maquette `docs/product/epopee/frappe-ceremonie.html` montre la pièce AVANT les décors et le « 1 MEESH » : elle sert pour la matière et les revers, pas pour les décors.

## 7. La frappe devient une cérémonie

Décisions du porteur :
- « La frappe doit quand même [avoir] Mee et Meo qui frappent, peut-être une animation plus intéressante et complexe même. »
- « Des milliers d'étincelles de ma lumière tissent un cercle, avant de prendre des poussières d'argent [et] un peu d'or. » Son message s'arrêtait là ; Claude l'a lu : « pour former le flan ».
- « La frappe arrive en fin ! »
- « La pièce prisme se mêle avec du diamant en plus des poussières d'or, là où la pièce or est que de l'or pur. »
- Sur la maquette : « Parfait ».

La référence est la maquette `docs/product/epopee/frappe-ceremonie.html`. Elle a un curseur, un ralenti, et les variantes argent, or, prisme et refus. Sa fonction `plan()` donne les instants.

| Temps (argent) | Ce qui se passe |
|---|---|
| 0–0,4 s | la scène s'ouvre en plein écran ; Mee et Meo arrivent des côtés |
| 0,35–2,2 s | **des milliers d'étincelles** (environ 2 600) quittent « ta lumière », en haut, et spiralent jusqu'à un cercle. Deux brins tournent en sens opposés et **se croisent comme une tresse**, puis se resserrent en anneau (2,0–2,55 s) |
| 2,2–2,9 s | **les poussières** : Mee sème l'argent, Meo un peu d'or, en arcs, jusque dans le cercle, où elles tourbillonnent |
| 3,3–3,8 s | **le flan se fige** : la pièce vierge apparaît, et les étincelles et la poussière s'éteignent |
| 3,8–4,2 s | le flan descend sur l'enclume (un petit nuage et un tremblement) |
| 3,95–4,45 s | Mee et Meo prennent place ; Mee pose le coin sur le flan |
| 4,4–4,75 s | Meo lève le marteau. **Si la passerelle n'a pas encore confirmé la frappe, il le garde levé jusqu'à sa réponse** |
| ≈ 4,9 s | **la frappe, en dernier** : le marteau tombe, avec un éclair, une onde, une gerbe d'étincelles, un tremblement, « Tchak ! » et une vibration. **La gravure de l'avers apparaît sous le marteau** |
| +0,25–1,05 s | Mee retire le coin ; la pièce se lève, tourne et montre son revers |
| ensuite | Mee et Meo fêtent la pièce, et Mee dit une phrase (« La n° 92 rejoint ton Coffret. ») |
| ensuite | la pièce file dans le contenant de l'Héritage (le compte se met à jour à son arrivée), et « +1 000 de gloire » monte vers le blason |

- **Or** (chaque centième pièce) : la scène est dorée, la poussière est d'or pur (Meo la verse seul), le flan est tout d'or. Meo frappe trois fois (tchak, tchak, TCHAK). Des rayons d'or jaillissent, et « Tes aïeux se manifestent » s'écrit au-dessus. Le revers montre Meo. Durée totale : environ 9,5 s.
- **Prisme** (chaque millième pièce) : la scène est de nuit et les étincelles prennent sept couleurs. Meo verse l'or et Mee la poussière de diamant. Pour le dernier coup, **Mee prend un marteau à son tour et ils frappent ensemble**. Le prisme éclate en rayons de toutes les couleurs, et les aïeux se manifestent. Le revers montre Mee et Meo. Durée totale : environ 10 s.
- **Le refus** : la frappe est refusée (une Ombre est apparue entre-temps, le trésor est fermé ou le réseau manque). Une ombre voile le cercle. Les étincelles se dénouent et **reviennent à la lumière** par le chemin inverse : rien n'est perdu. Mee, en mode « courage », dit ce qui bloque et ce qui le lèvera.
- **Toucher passe la scène** à tout instant ; l'état final s'applique d'un coup.
- **« Réduire les animations »** : la pièce apparaît frappée en fondu, avec une seule vibration ; ni particules ni tremblement.
- **L'accessibilité** : la scène est décorative. Le lecteur d'écran dit « Meesh n° 92 frappée, argent », comme aujourd'hui.
- **L'optimiste** : la scène part au toucher ; la passerelle confirme pendant le tissage. Le temps d'attente se cache dans le geste, jamais dans un indicateur de chargement.
- **Une loi partagée pour le déroulé** : les instants de chaque phase et de chaque édition, l'attente du serveur, le refus, le passage et le fondu sont une fonction pure. Elle vit dans `packages/shared/utils/game/` (par exemple `mint-ceremony.ts`), avec son miroir Swift, et se rejoue sur des vecteurs partagés, comme les autres lois du jeu. Le web et iOS ne peuvent pas diverger.
- **Le rendu** : web en Canvas 2D ou WebGL2 (le moteur `lib/game/gl` existe), iOS en SwiftUI `Canvas` + `TimelineView` ou en Metal (les shaders du SDK existent). Le budget : 60/120 images par seconde, au plus environ 4 500 particules à l'écran, densité de pixels plafonnée à 2, et moitié moins de particules sur un appareil modeste. iOS 16 doit tenir.
- **Mee et Meo** : on anime leurs figures dessinées existantes (web : `lib/mee/art`, iOS : `GameFigures`/`GameEngravedBirds`). La maquette utilise les autocollants en image fixe. De vrais films dessinés (Lottie) pour les gestes (tenir le coin, lever et abattre le marteau) sont un suivi (§ 9).
- Ce qui reste : la vibration `GameHapticPattern.strike` à chaque coup, plus forte au dernier ; le son « tchak » à chaque coup.

## 8. Ce qui change, lot par lot

Jalon #194 « Le jeu raconte une épopée ». Issues : A #11173 · B #11174 · C #11175 · D #11176 · E #11177 · F #11178 · G #11179 · H #11180 · I #11172. Suivis hors de cette vague : Parures #11181, films de Mee et Meo #11182.

| Lot | Résultat | Fichiers (zones possédées) |
|---|---|---|
| A — la voix source | les textes français du jeu sur le web suivent le § 4 ; une garde de vocabulaire interdit les mots bannis ; glossaire français | `apps/web/src/lib/interface-catalogs/catalog-game*-fr.ts`, `catalog-fr-engagement.ts`, `catalog-viewer-engagement-fr.ts`, `catalog-onboarding-fr.ts` (parties du jeu), `docs/product/epopee/glossaire/fr.md`, nouvelle garde web |
| B — les six langues du web | les catalogues en, es, de, it, pt, ar suivent le français ; un glossaire par langue | `catalog-*-{en,es,de,it,pt,ar}.ts`, `docs/product/epopee/glossaire/{en,es,de,it,pt,ar}.md` |
| C — la passerelle et les textes partagés | les notifications du jeu et les textes partagés racontent l'épopée dans les huit langues du catalogue de notifications ; les événements de saison hors de l'app suivent le Voyage s'ils ne sont pas déjà publiés | `packages/shared/utils/notification-strings.ts` (parties du jeu), `packages/shared/utils/game/personal-mission-copy.ts`, `season-app-events.ts`, textes du jeu dans `services/gateway` |
| D — la pièce | § 6 sur le web, puis sur iOS | web : `apps/web/src/components/game/meesh-coin.tsx`, `paint-defs.tsx`, `lib/game/materials.ts`, `styles/game.css` (jetons des pièces), géométrie partagée ; iOS : `MeeshCoinView.swift`, `GameEngravedBirds.swift`, et ce qu'ils dessinent |
| E — la cérémonie de la frappe | § 7 : la loi partagée, le web, puis iOS | `packages/shared/utils/game/mint-ceremony.ts` et ses vecteurs ; web : `components/game/mint-scene.tsx`, `game-mint-strike.tsx`, `game-effect-layer.tsx`, chorégraphie ; iOS : `MintStrikeScene.swift`, `GameMintSequence.swift`, chorégraphie ; textes neufs dans un catalogue propre (`catalog-game-frappe-<langue>.ts`) |
| F — les écrans (web) | § 5 et § 3.3 sur le web : Progression en synthèse, fiches Héritage et Étincelles, dédoublonnage par identité, garde anti-défilement latéral étendue | `apps/web/src/lib/view/progression-concepts.ts`, `routes/progression-*.tsx`, les composants des fiches, catalogue propre pour les textes neufs (`catalog-game-fiche-<langue>.ts`) |
| G — l'app iOS dans les sept langues | les textes `game.*` de `Localizable.xcstrings` et les `defaultValue` Swift suivent le § 4 dans les 7 langues, avec les mêmes termes que le web ; garde de vocabulaire iOS | `apps/ios/Meeshy/Localizable.xcstrings` (clés `game.*`), `apps/ios/Meeshy/Features/Main/Game/**/*Copy*.swift` et les `defaultValue` du jeu |
| H — les écrans (iOS) | § 5 et § 3.3 sur iOS, dont l'en-tête des étincelles lié à la poche | `ProgressionConceptModel.swift`, `ProgressionConceptViews.swift`, `ProgressionConceptPage.swift`, `GameMintPreviewView.swift`, `ProgressionMeeshEntry.swift`, `GameSparks*.swift`, leurs tests |
| I — les documents | la conception du jeu, l'économie des étincelles et les cadres de gloire racontent l'épopée | `docs/product/jeu-meeshy-conception.html`, `docs/product/etincelles-economie.md`, `docs/product/cadres-de-gloire/README.md` |

Un ordre s'impose :
- A d'abord (la source française) ; B, C et I ensuite.
- D-web puis E-web puis F (une chaîne web).
- G puis H, D-iOS, puis E-iOS (une chaîne iOS, **un seul lot iOS à la fois**).
- Une revue de cohérence entre les plateformes ferme la vague.

## 9. Hors de cette vague (suivis)

- **Les Parures** (#11181) : à chaque rang, un contour d'avatar et une bannière offerts par les aïeux, venus de leur terre à partir d'Ambassadeur. C'est une feature neuve, posée sur le système de décors (#10632, #10932, #10715). Il faut dessiner les parures de 10 rangs × 7 terres. Elle a sa propre issue.
- Le choix de Claude, à relire : un héros peut porter la parure de tout rang qu'il a atteint (celle du rang courant par défaut), jamais celle d'un rang qu'il n'a pas atteint.
- **Les films dessinés de Mee et Meo** pour la frappe (#11182) (Lottie, le moteur d'animation du dépôt).
- **Néon et Abysses** : le choix de Claude, à relire, est qu'ils restent deux des sept terres d'aïeux. Rien ne change dans le choix d'atmosphère.
- **Le saut de niveau en production** : quand la production recevra la loi #10892 (le niveau lu sur la poche), un joueur qui a frappé verra son niveau baisser. Le porteur, par exemple, passera de 61 à 32. C'est la loi décidée le 2026-10-17, et l'épopée l'explique : « frapper fige une part de ta lumière ». Le saut se verra : à annoncer avec la promotion.

## 10. Comment on sait que c'est fini

- Aucune valeur des catalogues du jeu (web, iOS, passerelle) ne contient un mot banni du § 4, dans aucune des sept langues. Les gardes le prouvent sur chaque plateforme.
- Les mêmes clés portent les mêmes termes sur le web et sur iOS. Un témoin compare les clés communes.
- Chaque fiche passe le § 3.3 : garde d'identité des faits, garde anti-défilement latéral sur toutes les pages du jeu.
- La pièce : l'avers dit « MEESHY · 1 MEESH » dans toutes les langues ; le revers montre Mee, Meo, ou Mee et Meo selon l'édition, avec « Nº » souligné ; les décors suivent le § 6 ; le web et iOS dessinent la même pièce, prouvé sur la géométrie partagée.
- La cérémonie : la loi partagée et ses vecteurs, rejoués sur le web et sur iOS. La frappe arrive en dernier. Le refus, le passage au toucher et le mode réduit sont couverts par des témoins. Le rythme est mesuré à 60 images par seconde sur appareil.
- Les suites complètes passent : `bun test` depuis `apps/web`, la passerelle, `packages/shared`, et la compilation et les tests ciblés iOS. La CI de `dev` est verte.
- Chaque issue fermée dit, dans son commentaire de clôture, les dimensions mûres et ce que le miroir Kotlin n'a pas reçu.
