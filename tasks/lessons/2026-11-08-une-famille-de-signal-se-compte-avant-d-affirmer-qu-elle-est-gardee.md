## Deux sites qui appliquent une règle ne disent rien du troisième — et le troisième n'a pas de place où rougir (cycle 144)

Le salon d'une conversation porte TROIS signaux éphémères qui nomment une
personne : la frappe, le regard, la position en direct. Deux filtraient le
blocage bidirectionnel, et le disaient à voix haute — `StatusHandler._getBlockedSocketIdsInRoom`
(« *typing is a more sensitive, moment-to-moment signal than presence* ») et
`ConversationViewingHandler` (« *exclut les pairs bloqués dans les deux sens* »,
dès son en-tête).

Le troisième n'avait **aucune occurrence du mot `block`**. Ses quatre diffusions
partaient au salon ENTIER, et son rattrapage servait spontanément la dernière
position connue à tout socket qui entrait. Une coordonnée GPS vivante, pendant
jusqu'à huit heures, à quelqu'un qu'on a bloqué.

Et la route de blocage ÉNUMÈRE ce qu'un blocage coupe :
`cancelAutoAcquaintanceOnBlock`, `stopBringsAfterUserBlock`, `cutTalkiesOnBlock`,
`refreshNowPlayingAfter`. Quatre canaux temps réel nommés un par un. La position
en direct, le plus révélateur des cinq, n'y était pas.

**Ce qui a tenu le défaut en vie n'est pas une erreur de raisonnement : rien
n'obligeait à poser la question.** Chaque handler appliquait la règle chez lui,
avec son commentaire chez lui. Rien ne confrontait le troisième à sa propre
famille — et un fichier qui ne mentionne pas une règle ne peut par construction
pas la mentionner de travers. **Le silence n'a pas de place où rougir.**

C'est la leçon 261 vue depuis le code et non depuis un inventaire : une
énumération de sites porte deux affirmations — « ces sites appliquent la règle »
(vérifiable, et c'était vrai) et « ce sont les sites OÙ la règle s'applique »
(presque jamais vérifiée, et c'était faux).

**Un témoin de comportement garde les sites qui EXISTENT ; ce qu'il fallait
garder est le SUIVANT**, celui qu'un lot futur ajoutera. D'où un cliquet de
SOURCE, dont le discriminant est la **cible** et non la méthode : il relève les
émissions de la famille adressées à un SALON (`ROOMS.…`) sans passer par un
composeur d'exclusion, et laisse passer ce qui n'en est pas une — l'émission à un
socket nommé du rattrapage, la rétractation ciblée dont les destinataires SONT
les bloqués.

**Le réflexe à NE PAS avoir** était un balayage « ce handler cite-t-il la loi de
blocage ? » sur les trois familles. C'est exactement ce qui a rendu sept faux
positifs au cycle 107, dont le balayage a été JETÉ et non gelé : une recherche
d'IDIOME mesure la popularité d'un idiome, jamais une propriété. Deux des trois
handlers appliquent la règle par des chemins différents, et le troisième aurait
pu la citer sans l'appliquer.

> Quand on trouve une règle appliquée à deux endroits, la question n'est pas
> « sont-ils corrects ? » mais **« de quelle FAMILLE ces deux-là sont-ils les
> membres, et combien en compte-t-elle ? »** — puis : *qu'est-ce qui ferait
> rougir le membre qui ne l'applique pas ?* Si la réponse est « rien », le
> correctif de comportement est la moitié du lot.
