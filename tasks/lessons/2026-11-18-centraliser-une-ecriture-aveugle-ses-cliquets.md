## Centraliser une écriture aveugle les cliquets qui nommaient ses sites

*2026-11-18, cycle 179 (#19688). Mesuré sur trois cliquets du gateway, dans le
même lot.*

Le lot déplaçait la rentrée d'une participation des TROIS portes qui l'écrivaient
vers une unité partagée, pour y poser la garde de bannissement une fois. Le
correctif est juste. Ce qu'il a fait aux cliquets ne l'était pas :

| cliquet | ce qu'il a fait |
|---|---|
| `participant-reactivation-writers-sweep` (#10436) | **resté VERT**, inventaire vidé de ses trois rentrées |
| `participant-reactivation-rejoins-room-sweep` (#16964) | a rougi **par sa seule sonde de non-vacuité** (« ≥ 5 sites », tombée à 2) |
| `participant-language-producer-sweep` (#4662) | a classé l'unité partagée **`sans-langue`** — affirmation FAUSSE |

Les trois cherchaient une GRAPHIE : `.participant.update(`. L'écriture s'appelle
désormais `commitParticipantRejoin(`. Aucune ligne d'aucun inventaire n'a bougé.

> **Un cliquet qui cherche une graphie mesure cette graphie, pas la propriété** —
> et un cliquet resté vert après une centralisation n'atteste rien. La question à
> poser à tout lot qui déplace une écriture est : *quels inventaires nommaient
> les sites que je viens de faire disparaître, et que disent-ils maintenant ?*

C'est la règle du cycle 105 (« chercher une forme fautive par son NOM de
déclaration manque tous les sites qui l'obtiennent autrement ») prise par l'autre
bout : là-bas, c'était un contournement qui échappait au balayage ; ici, **c'est
la réparation.**

### Trois corollaires, tous mesurés dans ce lot

**1. Deux cliquets qui portent la même COPIE du scanner deviennent aveugles
ensemble.** Les deux premiers posaient deux questions différentes sur le même
ensemble de sites, et chacun portait son `callBodies`. Le scanner vit désormais
une fois (`__tests__/helpers/participant-reactivation-scan.ts`), et les deux
graphies y sont déclarées au même endroit : la prochaine se déclare UNE fois.

**2. Seul le cliquet qui portait une borne de NON-VACUITÉ a rougi.** « Le
balayage voit bien des écritures (sans quoi il resterait vert à vide) » n'est pas
une formalité d'écriture de test : c'est le seul organe qui distingue « rien à
signaler » de « je ne vois plus rien ». Tout inventaire gardé VIDE en a besoin ;
un inventaire gardé NON vide l'a gratuitement, par son égalité.

**3. Le verdict le plus coûteux n'est pas le silence, c'est l'affirmation
fausse.** Le troisième cliquet lisait un `data` posé en RACCOURCI (`{ where,
data }`), n'y trouvait pas de valeur, et concluait `sans-langue` — « ce site
n'écrit pas la colonne ». Les trois `language` des rentrées ont quitté la
surveillance **sous une classification**, pas sous un « je ne sais pas ». Son
propre en-tête l'interdisait (« une chaîne qu'il ne sait pas remonter rend
`non-resolue`, JAMAIS `conforme` : un balayage négatif doit se tromper du côté
qui accuse ») ; la règle était écrite et la mécanique ne la tenait pas sur cette
forme-là. Corrigé dans les deux sens, avec son témoin.

### Et la raison pour laquelle la garde manquait à trois portes sur quatre

La quatrième — `restore-for-me` — portait `unsetOrNull('bannedAt')` dans son
`where` **et disait pourquoi**, sur cinq lignes de commentaire. Les trois autres
ne l'ont jamais reçue : **un commentaire ne documente que l'exemplaire qu'il
touche.** Et l'argument qui tenait leur place dans l'inventaire — « la loi
d'entrée refuse un banni EN AMONT » — était vrai de la LECTURE et faux de la
FENÊTRE.

> **Une garde posée en AMONT d'une écriture garde une LECTURE.** La question à
> poser n'est pas « le cas interdit est-il refusé ? » mais **« l'état que
> l'écriture POSE est-il encore légitime au moment où elle commet ? »** — et
> seule la clause de l'écriture peut y répondre. Un inventaire qui accepte une
> garde d'amont comme garde d'écriture gèle la fenêtre au lieu de la fermer.
