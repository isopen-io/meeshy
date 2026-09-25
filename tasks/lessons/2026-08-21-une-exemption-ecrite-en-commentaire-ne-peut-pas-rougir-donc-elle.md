## 2026-08-21 — Une exemption écrite en COMMENTAIRE ne peut pas rougir, donc elle pourrit (cycle 77)

Le contrat portait un bloc de prose intitulé « Call events RESERVED (no emitter
yet) », qui énumérait les canaux d'appel déclarés avant leur émetteur. Il
nommait encore six événements — `call:missed`, `call:quality-alert`,
`call:translated-segment`, `call:transcription-active`,
`call:already-answered`, `call:screen-capture-alert` — dont la passerelle avait
entre-temps implémenté l'émission. Personne n'était venu corriger la phrase,
parce que rien ne pouvait la contredire.

> **Une exemption que rien n'exécute survit à sa raison d'être, et finit par
> couvrir un vrai défaut.** Si une liste d'exceptions mérite d'exister, elle
> mérite d'être une VALEUR que le code importe — et vérifiée dans les DEUX sens :
> ce qui y figure doit encore avoir besoin d'y figurer.

La réservation vit donc désormais dans `RESERVED_SERVER_EVENTS`, exportée par le
contrat, et la garde rougit aussi bien sur un nom orphelin non réservé que sur
un nom réservé dont l'émetteur a atterri.

### Corollaire — où placer la table d'exceptions

Pas dans la garde. Une table d'exceptions cachée au fond d'un fichier de test
est un endroit où l'on dépose ce qu'on ne veut pas traiter, et que personne ne
relit. Placée à côté des noms qu'elle qualifie, dans le fichier qu'on ouvre de
toute façon pour déclarer l'événement, réserver un canal redevient un acte
VISIBLE en revue.

### La prose piège les gardes AUX DEUX BOUTS

La garde du cycle 76 importait les objets du contrat plutôt que de les relire au
motif, précisément pour qu'un nom cité en PROSE ne passe pas pour déclaré. Elle
scannait pourtant le code client sans retirer les commentaires — et elle a rougi
sur `// NOTE: there is no socket.on("post:reaction-sync")`, une phrase qui
documente une absence d'abonnement, lue comme un abonnement.

> **Un commentaire n'est ni une déclaration ni un abonnement.** Toute garde qui
> LIT du code doit dépouiller les commentaires avant de chercher — la précaution
> vaut au bout serveur comme au bout client, et n'en armer qu'un seul laisse
> l'autre moitié du piège en place.

### Trois choses DÉCRIVENT le code, et on les lit comme si elles l'ÉTAIENT

Trois formes du même piège, rencontrées dans la même journée (2026-09-03), dont
deux que j'ai posées moi-même :

| l'artefact | ce qu'on croit lire | ce que c'est |
|---|---|---|
| un **corps d'issue** | l'état du code | l'état du code **au jour où il a été écrit** |
| un **doc-comment** | ce que le code fait | ce que le code faisait **quand le commentaire a été écrit** |
| une **capture envoyée par le porteur** | l'écran d'aujourd'hui | l'écran **au moment du screenshot** |

Les trois cas :

1. **Le corps d'issue.** J'avais justifié une contrainte de #5018 par une règle du
   dépôt citée exactement — vraie, mais gouvernant une autre surface (voir la
   leçon ci-dessous sur la PORTÉE).
2. **Le doc-comment.** `ComposerSceneSurface` documente l'ordre de sa zone basse
   comme un escalier des niveaux du modèle. J'ai écrit dans #5036 que l'ordre
   venait « de l'ordre d'écriture d'un `VStack` » — c'est-à-dire que j'ai décrit
   une doctrine délibérée comme un accident. La différence n'est pas de style :
   **un accident se corrige, un renversement se documente.**
3. **La capture.** Le porteur a envoyé un écran montrant les hashtags visibles
   pendant qu'une rangée d'outils occupe le bas. La session voisine a mesuré que
   cette capture **précède le commit `c6d5577cdb`**, qui rend la situation
   impossible. Mon diagnostic — « la rangée d'options s'intercale » — décrivait
   un état révolu, et je l'avais lu comme l'état courant.

> **Un écran envoyé par le porteur est DATÉ, comme un corps d'issue.** Devant un
> défaut montré en image, la première question n'est pas « où est-il dans le
> code ? » mais **« cette image est-elle encore vraie ? »** — `git log` sur les
> fichiers concernés depuis l'heure de la capture répond en une commande.

Et le corollaire qui vaut pour les trois : **avant de qualifier un état de
défaut, chercher s'il est ÉCRIT quelque part.** Un ordre documenté, une règle
énoncée, un choix justifié en commentaire ne sont pas des accidents ; les traiter
comme tels fait perdre la raison qu'ils portaient, et laisse derrière soi une
explication qui dément le code — le piège suivant, pour quelqu'un d'autre.

### PROJETÉ PUIS JETÉ — la troisième nature d'un rendu manquant, et la plus trompeuse

Le modèle du lecteur distinguait deux natures d'écart entre clients : le **repli
déclaré** (#4911 — « dit la même chose en moins bien ») et l'**absence muette**
(#4912 — « ne dit rien »). Une troisième est apparue en mesurant les transitions
de scène (#5043), et elle est pire que les deux pour qui relit le code.

Android **traduit** `scene.opening` / `scene.closing` — `opening =
transitionOf(scene.opening)` dans `CanvasV3Projection.kt` — porte le vocabulaire
complet (`StoryTransitionEffect` : FADE · ZOOM · SLIDE · REVEAL, identique à
iOS), et **aucune vue ne consomme le résultat**.

> **Une projection orpheline se LIT comme une implémentation.** On cherche le
> champ : il est là. Son type : il est là. Sa conversion : elle est là. Rien,
> dans ce qu'on vient de lire, ne dit que la chaîne s'arrête au maillon suivant.
> Un repli se VOIT, une absence se CHERCHE — celle-ci se déguise.

Le réflexe qui l'attrape est celui du Prisme, appliqué un cran plus loin :
**« qui affiche ce que ce code vient de produire ? »**, posé sur le RÉSULTAT de
la conversion et pas sur son entrée. En pratique, `grep` le nom de la propriété
projetée hors du fichier qui la projette — s'il ne sort que des tests et des
mappings, la chaîne est orpheline.

Corollaire pour l'écriture : **une projection sans consommateur mérite un
commentaire qui le DIT**, sinon le prochain lecteur la comptera comme faite. Une
ligne suffit — « traduit ici, non consommé, voir #n » — et elle transforme un
piège en dette déclarée.

### Un report CONDITIONNEL est daté par sa CONDITION, pas par sa date

Le web déclare hors périmètre les transitions inter-scènes, et pose sa condition
noir sur blanc (`CanvasV3Scene.tsx:836`) :

> « Reste hors périmètre, **et le sera tant qu'aucun lecteur ne le rendra** […]
> leur donner un rendu serait du neuf, pas de la parité. »

Le raisonnement était juste à l'écriture : si personne ne rend, ne pas rendre ne
creuse aucun écart. **Mais iOS les rend** (`StoryOpeningEntrance.armed`). La
condition est fausse aujourd'hui, et « du neuf » est devenu « de la parité » —
sans que personne ne relise la phrase, parce que **ce qui l'a périmée s'est passé
sur une AUTRE plateforme**.

> **Un commentaire qui décrit l'état d'un VOISIN est le plus fragile de tous :
> rien, dans le fichier qui le porte, ne change quand le voisin bouge.** Un
> commentaire sur son propre code se fait démentir par le diff d'à côté ; celui-là
> peut rester faux des mois sans qu'aucun geste ne le croise.

Deux réflexes qui l'attrapent :

- **En lisant** un report conditionnel, ne pas lire la conclusion — lire la
  CONDITION, et la vérifier. Elle est la seule partie datée.
- **En écrivant**, préférer une condition qu'un TÉMOIN peut surveiller à une
  condition en prose. « Tant qu'aucun lecteur ne le rend » est vérifiable par une
  garde de source sur les trois clients ; laissée en prose, elle ne se vérifie
  que le jour où quelqu'un passe par là.

Parenté avec la leçon des trois artefacts qui DÉCRIVENT le code : ici l'artefact
décrit le code de quelqu'un d'autre, ce qui ajoute une distance de plus entre
l'affirmation et ce qui pourrait la démentir.

### Un `pbxproj` régénéré : le NOMBRE ne dit rien, le STATUT GIT dit tout

`xcodegen` globe le **disque**, pas l'index. Régénérer le projet ajoute donc
TOUT ce qui traîne, y compris le travail non committé des sessions voisines —
et deux situations opposées produisent le même diff volumineux.

| ce que le diff ajoute | ce que c'est | ce qu'il faut faire |
|---|---|---|
| des fichiers **tous trackés** | une **réparation** — le `pbxproj` du dépôt était périmé par rapport aux sources | committer est légitime, en le DISANT dans le message |
| **un seul** fichier non tracké | une **bombe** — le projet référencera un fichier absent au prochain checkout, et il ne compilera pas | écarter le `pbxproj` du commit |

Les deux cas ont été rencontrés le 2026-09-03, à quelques heures d'écart et par
deux sessions différentes : trente fichiers ajoutés, tous committés (réparation)
d'un côté ; cinq ajoutés dont trois non trackés (bombe) de l'autre. **Le volume
ne discrimine pas** — une leçon écrite sur un seul des deux sens ferait interdire
ce qui est légitime, ou autoriser ce qui casse.

> Le contrôle tient en deux commandes : lister les `.swift` ajoutés par
> `git diff -- <pbxproj>`, puis `git ls-files --error-unmatch` sur chacun.

**Et le refus est indolore**, ce qui enlève toute raison d'hésiter : la CI lance
`xcodegen generate` avant de builder, et `meeshy.sh` régénère sur dérive chez qui
tire le commit. Écarter le `pbxproj` ne perd donc rien — il n'y a jamais de raison
d'éditer ce fichier à la main pour n'en garder qu'une partie.

### Un message d'échec RÉVÈLE ce que sa garde suppose — et décide de qui sera accusé

L'extraction du #5069 a fait tomber deux gardes qui se ressemblent en tout :
toutes deux lisent un fichier de source **par son nom**, toutes deux gardent une
règle de câblage, toutes deux se périment au moment où le code déménage. Leurs
messages d'échec sont opposés.

| garde | ce qu'elle dit en tombant |
|---|---|
| `test_leRetrait_estServiAuxDeuxSurfaces` | « un seul est le défaut de #4918 rejoué : la trace existait, mais une seule surface la recevait » |
| `test_laSurfaceDeDocument_aTousSesRappelsBranches` | « la garde doit être re-pointée, sinon elle mesure le vide » |

La première produit **un faux rouge ARGUMENTÉ** : elle cite un défaut historique
réel, décrit un symptôme cohérent, et envoie chercher exactement au mauvais
endroit. Elle accuse un câblage INTACT d'être à moitié fait. La seconde envisage
sa propre péremption et dit quoi faire.

> **La différence n'est pas dans la règle gardée, elle est dans ce que le message
> SUPPOSE.** La première suppose que si le compte est faux, c'est le code qui a
> changé. La seconde envisage que ce soit elle.

C'est une qualité qui s'écrit **au moment de rédiger le message**, pour un
lecteur qu'on ne connaîtra pas — et elle ne coûte rien de plus qu'une subordonnée.

La règle pratique, pour toute garde qui lit une source par son CHEMIN : son
message doit nommer les DEUX hypothèses, et dans cet ordre — *soit la règle est
violée, soit je cherche au mauvais endroit*. Une garde de source mesure toujours
la géographie autant que la règle ; celle qui l'ignore ment avec aplomb le jour
où la géographie bouge.

### Un ORDRE juste peut produire une disposition FAUSSE — le vide n'est pas un frère

J'ai ouvert #5036 en lisant une capture du porteur : les hashtags apparaissaient
SOUS une rangée d'outils, donc l'ordre de la pile était en cause. J'ai mesuré
77 pt entre le bas de la carte et le pied des références, et conclu qu'il fallait
une règle de RANG.

**Les deux moitiés du diagnostic étaient fausses**, et la session voisine l'a
établi en livrant le correctif :

1. le pied était **déjà** avant la rangée d'outils — l'ordre n'a jamais été le
   défaut ;
2. les 77 pt n'étaient ni une marge ni un espacement : le canvas est
   `maxHeight: .infinity` et la carte, ajustée à son ratio, s'y **centre**.
   C'était la moitié basse du letterbox.

> **Réordonner n'aurait rien changé.** Ce qui séparait le pied de la carte
> n'était pas un frère mal placé, c'était du VIDE — et une pile ne voit pas le
> vide de ses enfants, seulement leurs cadres.

Le remède existait déjà deux fois dans le même fichier (`sceneLeadingInset` pour
le bord gauche, `sceneBottomInset` pour les rails) ; il manquait sa remontée aux
FRÈRES de la pile, par une clé de préférence jumelle.

Ce que je retiens pour le prochain écart de disposition : **avant de postuler un
ordre, demander ce qui OCCUPE l'espace.** Si l'arbre d'accessibilité ne rend
aucun élément entre deux voisins qui s'éloignent, ce n'est pas qu'un frère
invisible s'intercale — c'est qu'un cadre est plus grand que son contenu. Les
deux se corrigent à des endroits opposés : l'un dans l'ordre de la pile, l'autre
dans la géométrie du parent.

Et un corollaire de mesure, du même échange : **une gouttière et un espacement de
pile ne se confondent pas.** Un contenu monté en *overlay* ne paie aucun
espacement ; un frère en paie un. Le haut et le bas d'une même carte peuvent donc
donner le même écart visible par deux chemins différents — et les confondre
double l'écart au premier réglage.

### Une ABSENCE confirme une hypothèse aussi facilement qu'elle l'infirme — et alors on ne la vérifie pas

Quatrième forme du même piège le 2026-09-03, et la plus retorse. Les trois
premières me faisaient conclure *« ça n'existe pas »* ; celle-ci m'a fait
conclure *« ça a fonctionné »*.

Je vérifiais une livraison voisine : *quand un outil s'ouvre, les éléments
permanents de la zone canonique cèdent la place*. J'ouvre l'outil texte, je
relève l'arbre : le pied des références, le socle, la description et l'en-tête du
son ont tous disparu. Verdict apparent : **vérifié, tout cède.**

La capture d'écran dit autre chose. **Rien n'a cédé : un AUTRE écran s'est
ouvert** — l'éditeur d'objet plein écran. Les éléments sont restés sur le
précédent. J'avais mesuré une navigation et lu un comportement.

> **Quand une absence CONTREDIT ce qu'on attend, on la creuse ; quand elle le
> CONFIRME, on la publie.** C'est le même signal, et c'est le biais qui décide
> de son traitement. Une absence n'est jamais une preuve à elle seule : elle dit
> « je n'ai pas trouvé », pas « ce n'est pas là », et encore moins « ce que je
> croyais s'est produit ».

Le contrôle, ici, ne coûtait rien non plus : **regarder l'écran.** Une capture
aurait montré le titre « ‹ 1 » et le bouton « Terminé » — deux affordances de
NAVIGATION qui n'existent pas sur l'écran qu'on croit observer. La règle
pratique : devant une absence qui confirme une attente, demander *« que
verrait-on si la cause était tout autre ? »* — et se donner le moyen de le voir.

Les quatre formes de la journée, pour mémoire, parce qu'elles ne se ressemblent
pas : un `grep` sensible à la casse · un arbre d'accessibilité qui n'entre pas
dans les conteneurs · un geste trop bref pour déclencher un glisser-fermer · une
navigation prise pour un masquage. **Un seul et même défaut de raisonnement, sous
quatre instruments différents** — ce qui explique qu'armer l'un n'apprenne rien
sur les autres.

### « Glyphe ou libellé » était la mauvaise question — la bonne est : le nom est-il REPRIS ailleurs ?

Trois décisions du composer semblaient se contredire :

| surface | forme | |
|---|---|---|
| rail de l'éditeur d'objet | glyphes NUS | noms retirés sur directive (#5029) |
| rangée d'outils du Post | tuiles ÉTIQUETÉES | libellés ajoutés sur mesure (#4071) |
| barre de prise de vue | pastilles ÉTIQUETÉES | délibéré (#4080) |

Posées comme un choix de style, elles obligent à trancher au cas par cas — et
l'on finit par transposer la décision d'une surface à l'autre, ce qui défait un
lot livré. J'ai failli le faire en portant les outils du Post à gauche : les
mettre en glyphes nus « comme la scène » aurait rejoué les huit glyphes muets que
#4071 avait corrigés.

> **Le discriminant n'est pas la forme, c'est la REDONDANCE : le nom est-il
> repris ailleurs à l'écran ?** Sur la scène, ouvrir un outil fait apparaître un
> panneau dont le titre redit son nom — le glyphe peut rester nu. Le Post n'a
> aucun panneau ; la barre de prise de vue non plus. Les deux étiquettent, pour
> la même raison, et le rail de l'éditeur cesse d'être une exception.

Une règle qui unifie trois décisions vaut mieux que trois décisions défendues
séparément : elle se transporte à la quatrième surface sans qu'on ait à
redemander. (Formulation de `v2-meeshy-dc`, meilleure que la mienne — je
défendais « étiqueter tant qu'il n'y a pas de panneau », ce qui est le cas
particulier et non la règle.)

### Un extracteur borné par un NOMBRE DE LIGNES ne connaît pas les bornes de ce qu'il extrait

En comparant `CreatePostRequest` entre Swift et Kotlin, j'ai compté **17** champs
côté Kotlin et signalé six champs « présents chez Kotlin seul ». **Cinq
n'existaient pas dans cette classe** : `grep -A 30` avait débordé sur la classe
voisine, une charge de transcription. Le vrai chiffre est 12.

Ce qui rend l'erreur dangereuse est la **plausibilité du résultat** : des noms de
champs bien formés, dans le bon fichier, dans le bon langage. Rien, dans ce que
l'extracteur rend, ne dit qu'il a franchi une frontière — contrairement à un
`grep` vide, qui au moins signale qu'on n'a rien trouvé.

> **Borner par la SYNTAXE, jamais par une distance.** Une classe Kotlin s'arrête
> à sa parenthèse fermante en début de ligne ; une `struct` Swift à la déclaration
> de haut niveau suivante. Un `-A <n>` est une supposition sur la taille de ce
> qu'on lit, et cette supposition n'est vérifiée par personne.

Le contrôle qui l'attrape est le même que pour les autres pièges de la journée, et
il est ici presque gratuit : **le résultat contient-il quelque chose qui n'a rien
à faire là ?** `confidence`, `durationMs`, `segments` dans un corps de requête de
publication — les mots eux-mêmes disaient qu'ils venaient d'ailleurs. J'avais la
réponse sous les yeux avant d'avoir la mesure.

Parenté : c'est la variante « faux POSITIF » des leçons voisines, qui portent
toutes sur des faux négatifs. Un instrument mal borné peut aussi bien inventer
que rater — et l'invention est plus difficile à soupçonner, parce qu'elle donne
quelque chose à voir.

### Un outil qui n'énumère pas ce qu'il ne traverse pas rend un faux négatif en forme d'INVENTAIRE

Sixième erreur de mesure du 2026-09-03, et la plus coûteuse : j'ai ouvert une issue
(#5051) affirmant que les rails du composer étaient inaccessibles à VoiceOver —
neuf portes réduites à un seul élément. **C'était faux, et le travail
d'accessibilité en place était soigné** : chaque porte a son étiquette, sa valeur
de badge, et ses glyphes décoratifs sont masqués.

La cause : `idb ui describe-all` **n'entre pas dans les conteneurs**. Un rail
déclaré `.accessibilityElement(children: .contain)` — le modificateur JUSTE, celui
qui préserve les enfants — n'apparaît que comme un `AXGroup`. L'outil a rendu dix
éléments pour tout l'écran, ce qui ressemble à un écran nu.

> **Une liste est toujours complète *pour ce que l'outil sait rendre*.** Ce qui la
> rend trompeuse n'est pas son contenu mais sa FORME : un inventaire se lit comme
> exhaustif, alors qu'un `grep` à zéro se lit — au mieux — comme une absence de
> preuve. Le faux négatif déguisé en inventaire est plus dur à soupçonner que le
> faux négatif déguisé en silence.

Le contrôle coûte une commande, et c'est le même que celui des `grep` :
**interroger un point où l'on SAIT qu'un contrôle existe.**
`idb ui describe-point --udid <udid> 32 277` rend « Ajouter un son », `AXButton`.
Si le point répond et que l'arbre se taisait, c'est l'arbre qui mentait.

Ce qui rend cette erreur instructive : j'avais appliqué ce contrôle toute la
journée sur des `grep` — « vérifier que le motif peut trouver » — et je ne l'ai pas
appliqué à `describe-all`, parce qu'un outil d'inspection d'UI ne ressemble pas à
un motif de recherche. **La discipline vaut pour tout instrument qui rend une
ABSENCE, quelle que soit sa forme** : compilateur, arbre d'accessibilité, journal
filtré, listing tronqué.

### Chercher la RÉPONSE avant de formuler la question — et la chercher dans la GOUVERNANCE

Cinq fois le 2026-09-03, j'ai affirmé une absence, posé une question ou ouvert une
issue sur un sujet **que le dépôt documentait déjà**. Les trois premières étaient
des motifs de recherche trop étroits (leçon voisine) ; les deux dernières sont
d'une autre nature, et plus coûteuses :

| ce que j'ai fait | ce qui existait, et où |
|---|---|
| demandé au porteur si `apps/web` et `apps/web-v3` coexistent | **premier paragraphe** de `docs/product/MeeshyWebV3Design/conception-web-v3.md`, comme décision porteur non négociable |
| ouvert #5040 en affirmant qu'aucune surcharge ne portait `storyEffects` | `PostService.createCanvasPost` la porte — et `docs/product/api-simplification/social.md` nomme **cinq** sites de construction du corps là où j'en voyais un |

La différence avec un grep trop étroit : là, je cherchais **au mauvais endroit**.
Je lisais le CODE pour répondre à des questions d'INTENTION et de PLAN — or le
dépôt sépare explicitement les deux, et le dit : « l'ÉTAT vit dans les issues
GitHub, jamais ici ; ce document décrit la CIBLE et les MÉCANISMES ».

> **Le code dit ce qui EST ; la gouvernance dit ce qui est VOULU et ce qui est
> DÉJÀ SU.** Une question d'intention (« faut-il ? », « remplace-t-on ? »), une
> affirmation d'absence (« rien ne fait X ») et un projet de lot se cherchent
> d'abord dans `docs/product/`, dans le milestone et dans son épopée — pas au
> `grep`.

Le réflexe, en une ligne : **avant d'ouvrir une issue, lire le document que son
milestone cite.** Le milestone #74 nomme `MeeshyWebV3Design/ordre.md` ; le
document de conception nomme `api-simplification/*.md`. Les deux réponses que
j'ai manquées étaient à un saut de lien de la gouvernance que je consultais déjà.

Et un corollaire d'humilité utile : mon erreur sur `createCanvasPost` est
**exactement** celle qu'a commise l'auteur de `createBorrowedSoundPost`, qui a
justifié un contournement par une surcharge qu'il n'avait pas vue. Deux personnes
s'y sont trompées en une semaine, sur le même fichier — ce n'est plus une
distraction, c'est une propriété de la surface. Un télescope de onze déclarations
ne se parcourt pas des yeux, donc il se re-crée au lieu de se réutiliser.

### Un motif TROP ÉTROIT rend un faux négatif CONFIANT — trois fois en une session

Le 2026-09-03, trois mesures fausses, toutes de la même forme : un motif de
recherche plus étroit que la question, et un « zéro » lu comme une réponse.

| ce que je cherchais | le motif employé | ce qu'il ratait | ce que j'ai conclu, à tort |
|---|---|---|---|
| une région de code à borner | un `// MARK:` | les commentaires sont DÉPOUILLÉS par la garde | « la fonction n'existe pas » |
| le type `MeeshySceneObject` | `struct\|type\|interface\|class` | c'est un **`enum`** somme | « c'est un nom de doc, pas un type » |
| les transitions au contrat | `grep "transition"` | **la casse** — `clipTransitions` | « aucune transition n'est modélisée » |

La troisième est la plus coûteuse : elle est partie dans une réponse au porteur
ET dans un document committé, où elle a vécu une heure. Les transitions existent,
sont produites par le composer et rendues par les **trois** clients.

> **Un `grep` qui rend zéro ne prouve rien tant qu'on n'a pas vérifié que son
> motif pouvait trouver.** Le test tient en une commande : chercher un cas dont
> on SAIT qu'il existe. Si le motif ne le trouve pas non plus, le zéro ne parlait
> pas du monde — il parlait du motif.

Et le réflexe qui les attrape toutes les trois : **quand un zéro contredit une
attente raisonnable, suspecter l'instrument avant le monde.** Le porteur
supposait les transitions acquises ; cette attente était le signal qu'il fallait
élargir le motif, pas la corriger. Deux formes concrètes, gratuites :
`grep -i` par défaut sur un nom de concept, et chercher la RACINE
(`transit`, `Scene`) plutôt que le mot entier.

Fil rouge avec les leçons voisines : celle sur la PORTÉE dit qu'un extrait
vérifié ne l'est que sur son texte ; celle-ci dit qu'une ABSENCE mesurée ne l'est
que sur son motif. Les deux se réduisent à la même prudence — **la mesure décrit
l'instrument autant que l'objet.**

### Une règle citée MOT POUR MOT peut être fausse par sa PORTÉE

En écrivant #5018 j'ai justifié une contrainte par une règle du dépôt, citée
exactement :

> « un son de la bibliothèque reste crédité à son auteur : il ne peut pas devenir
> une pièce jointe »

La phrase existe, au caractère près (`ComposerSoundRoleCopy.borrowedForegroundRefusal`).
**La portée que je lui ai donnée, elle, était inventée.** Elle gouverne le premier
plan sur la surface POST AUDIO — où « premier plan » signifie *pièce jointe* — et
elle n'est consommée qu'à deux lignes d'`AudioPostComposerView`. Sur la surface
SCÈNE, `ComposerSoundDestination.forForeground(on:)` fait dire au même mot
« puce de scène », qui ne ré-uploade rien et garde son `soundId`.

Le doc-comment du refus donne sa propre raison — « une pièce jointe est un
FICHIER de la publication […] supposerait de le ré-uploader » — et cette raison
**ne survit pas au changement de destination**. Le code le dit même dans le sens
inverse de ma prémisse : `addBorrowedSound` pose déjà une piste empruntée en
PREMIER PLAN dès qu'un fond existe.

Le plus instructif : le codebase avait écrit l'avertissement douze lignes plus
haut — *« le mot "premier plan" désignait deux choses »* — et je suis tombé dans
exactement la distinction qu'il documente, en lisant le fichier qui la porte.

> **Un extrait vérifié n'est vérifié que sur son TEXTE.** « Cette règle existe »
> et « cette règle gouverne mon cas » sont deux affirmations, et la seconde ne
> s'établit pas en relisant la citation — elle s'établit en cherchant ses
> CONSOMMATEURS. Un `grep` du nom de la règle répond en une commande à une
> question qu'une lecture attentive du texte ne peut pas trancher.

C'est la jumelle de la leçon 261 (« une énumération de sites porte deux
affirmations ») appliquée à une règle unique : là-bas l'angle mort était
*ce que la liste omet*, ici c'est *où la règle s'applique*.

#### Le miroir de cette précaution : un témoin ne peut plus s'ANCRER sur un commentaire

La leçon ci-dessus dit qu'une garde doit dépouiller. Sa conséquence se paie un
cran plus loin, et je viens de la payer (#5017) : **parce que le dépouillement
existe, un témoin qui BORNE une région par un `// MARK:` cherche un repère que
le texte qu'il lit ne contient plus.**

```swift
guard let debut = surface.range(of: "private func ancreAuDessusDuDessin"),
      let fin = surface.range(of: "// MARK: - Les sons POSÉS sur la scène", ...)
else { return XCTFail("l'ancre haute doit exister et être délimitée") }
```

Le premier repère est du CODE et se trouve ; le second est un COMMENTAIRE et ne
se trouve jamais. Le témoin tombe sur son propre message de délimitation — un
échec qui ressemble à « la fonction n'existe pas » alors qu'elle existe et qu'elle
est juste. J'ai perdu un aller-retour de build complet à lire ce message au pied
de la lettre.

> **Une région de code se borne par la DÉCLARATION suivante, jamais par le
> commentaire qui la précède.** `"\n    private "`, `"\n    var "`, `"\n    func "`
> — le premier des trois qui tombe. Et le fil rouge tient : les deux moitiés du
> piège ont la même racine, mais elles se ressemblent si peu qu'armer l'une
> n'apprend rien sur l'autre. Ici la précaution CRÉE le piège qu'elle ne dit pas.

### Et le frère oublié, TROISIÈME occurrence

`reaction:sync` avait été retiré du contrat pour cause d'absence d'émetteur — le
commentaire de retrait raconte même qu'un client s'y était abonné et versait
l'instantané dans le seau incrémental de `reaction:added`, donc un vrai bug. Ses
deux frères du même pipeline, `post:reaction-sync` et `comment:reaction-sync`,
sont restés déclarés. C'est le même motif qu'au cycle 76
(`TranscriptionReadyEvent` plat quand son jumeau voisin avait déjà été corrigé),
et c'est la troisième fois.

> **Une correction de contrat ou de charge utile se termine par un `grep` des
> FRÈRES**, pas du seul symbole corrigé. Les canaux d'un même pipeline
> (`*:reaction-sync`, `*:translation-*`) partagent l'émetteur, donc le défaut.

### Cycle 77-bis — Retirer un canal mort découvre parfois un gestionnaire vide

Le retrait de `conversation:online-stats` classait ce canal « inoffensif :
aucun consommateur d'interface, nulle part ». C'était vrai sur iOS, faux sur le
web : au bout de sa chaîne de six niveaux, un handler de quarante lignes
alimentait la liste des présents de la vue stream. Il était bien mort. Mais la
question qu'il posait — **qui tient cette liste à jour, alors ?** — n'a pas été
posée, et la réponse dormait quarante lignes plus haut dans le même fichier :

```ts
const handleUserStatus = useCallback((userId, username, isOnline) => {
  // Géré par les événements socket - peut être étendu si nécessaire
}, []);
```

Résultat à l'écran : liste semée à l'ouverture, puis figée. Qui arrive après
vous n'apparaît jamais ; qui part reste affiché.

> **Les deux moitiés d'un défaut se protègent l'une l'autre.** Le gestionnaire
> vide paraissait couvert par le canal riche à côté de lui ; le canal riche
> paraissait dispensé d'émetteur par la présence d'un récepteur complet. Lue
> seule, chacune ressemble à une décision — « c'est géré ailleurs ».

Et le corollaire opératoire, qu'aucune garde ne peut porter — une garde de
contrat raisonne sur des NOMS de canaux, jamais sur ce que les gestionnaires
écrivent :

> **Avant de retirer du code mort, demander ce qu'il ALIMENTAIT, et qui l'écrit
> encore une fois qu'il est parti.** Un récepteur mort qui était le seul
> écrivain apparent d'un état d'interface laisse cet état sans personne.

Enfin, le commentaire du gestionnaire vide DISAIT le défaut : « géré par les
événements socket - peut être étendu si nécessaire ».

> Un corps de gestionnaire vide portant un commentaire d'intention (« géré
> ailleurs », « à étendre si besoin ») est un aveu, pas une note : c'est
> l'endroit exact où quelqu'un s'est arrêté. Aller vérifier qui fait le travail
> à sa place — souvent personne.

---
