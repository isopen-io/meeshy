## Avant de conclure qu'un commentaire mentait, FINIR DE LE LIRE (cycle 178, #18760)

Le dépôt porte une règle juste et souvent payante : **un commentaire qui raconte
un incident résolu est une AFFIRMATION, et se vérifie comme telle** (cycles 94,
107 bis). #18760 l'a invoquée contre le bloc `concurrency` de `ci.yml`, a cité
le commentaire, et a conclu : « un commentaire qui raconte un incident résolu
est une affirmation, et celle-ci dit faux. »

La mesure dit l'inverse, et la réponse était **dans le commentaire lui-même**,
quelques lignes sous la partie citée.

### Ce que l'issue a cité, et ce qu'elle n'a pas cité

Elle a cité le RÉCIT de l'ancien incident — « onze runs consécutifs annulés,
aucune conclusion pendant deux heures » — puis a observé neuf annulations en
rafale sur `dev` et en a déduit que la protection ne tenait pas, par le piège
connu de la chaîne truthy (`cancel-in-progress: ${{ … }}` rendant `"false"`,
non vide donc vrai).

Le même commentaire, plus bas, explique exactement ce qu'elle observait :

> « les annulations surviennent à des âges courts et IRRÉGULIERS […], signature
> d'un run qui ATTENDAIT et qu'un arrivant plus récent a évincé — **un seul run
> en attente à la fois** »

Et il laissait même le test de falsification à employer : « le symptôme d'une
file qui s'accumulerait reste celui-ci : `run_started_at - created_at` qui
GRANDIT d'un run à l'autre. » Ce test n'a pas été appliqué — et c'est lui qui
discrimine les deux hypothèses.

### La mesure, et pourquoi elle tranche

Sur les 30 derniers runs `push` de `dev` : les 19 annulations tombent à la
seconde où le run SUIVANT est créé, et les 5 qui concluent tournent 2 h 29 à
3 h 46 en traversant jusqu'à **quatre** poussées sans être touchées. Un run en
cours qui survit à quatre poussées est l'inverse exact de
`cancel-in-progress: true` : l'expression s'évalue donc bien `false`.

### La règle

> **La vérification d'un commentaire porte sur ce qu'il affirme EN ENTIER, pas
> sur le paragraphe qui a servi à le trouver.** Un commentaire long se lit
> souvent par le passage qu'un `grep` a rendu — et ce passage est, par
> construction, celui qui ressemble le plus à la question qu'on se posait, donc
> le moins susceptible de contenir la réponse qu'on n'attendait pas.

C'est le symétrique de la leçon 261 : là-bas, une énumération affirme aussi
qu'elle est COMPLÈTE ; ici, une CITATION affirme aussi qu'elle est
REPRÉSENTATIVE. Les deux affirmations implicites se vérifient de la même façon
— en allant voir ce qui n'a pas été cité.

### Et la moitié de l'issue qui avait raison

Elle visait un défaut RÉEL et l'a mal nommé. `dev` obtient bien un verdict, mais
il porte un commit PÉRIMÉ (le run protégé est le PREMIER de la rafale, pendant
que `dev` avance de huit commits), la tête attend jusqu'à 3 h 46 le sien, et
aucun commit intermédiaire n'en a — ce que `false` était censé offrir et
n'offre, en rafale, jamais.

D'où une conclusion contre-intuitive qui vaut d'être retenue : pour l'usage que
la directive #9226 fait de `dev` (« CI verte autorise la fusion »),
`cancel-in-progress: true` serait **strictement meilleur** que `false`. #4395 a
optimisé « obtenir UNE conclusion » là où le besoin est « obtenir la conclusion
de la TÊTE » — deux objectifs différents, et le réglage qui sert le premier
dessert le second.

> **Un réglage juste pour l'objectif de son époque devient faux quand
> l'objectif change, sans qu'une ligne bouge.** Ce n'est pas une erreur de
> #4395 : c'est #9226, arrivée après, qui a déplacé ce qu'on attend de `dev`.
