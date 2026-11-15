## Un cliquet qui mesure les APPELS ne voit pas une seconde INSTANCE — et un cliquet de TEXTE ne voit pas une indirection

**Le défaut.** Deux doc-comments affirmaient qu'une seule `RedisDeliveryQueue`
vivait dans le processus, « la seule dont la tranche MÉMOIRE porte des entrées ».
Le pipeline média en construisait une seconde (#18616). Sa tranche mémoire n'était
jamais drainée, jamais purgée, jamais nettoyée — un vocal enrichi tombé en
mémoire pendant un hoquet Redis n'atteignait jamais son destinataire, et la
transcription d'un message détruit y survivait.

**Pourquoi le cliquet existant ne pouvait rien voir.** `delivery-queue-door-sweep`
balaie les appels `\.enqueue(` hors des portes partagées. La seconde instance
**passait par la porte partagée** — elle lui remettait simplement un autre objet.
Un inventaire d'APPELS répond à « qui enfile ? » ; il ne pose jamais « sur
QUOI ? ». Les deux questions ont l'air d'une seule quand le singleton est tenu
pour acquis, et c'est précisément quand il est tenu pour acquis qu'il cesse d'être
vrai.

**Le symétrique, à chercher ailleurs dans un dépôt** : partout où un
doc-comment dit « l'instance vivante est celle-ci », compter les constructions,
pas les usages. Un `grep 'new X('` coûte dix secondes et répond à une question
qu'aucun test de comportement ne pose.

**Et la limite du cliquet qu'on pose alors, mesurée plutôt que supposée.** Un
inventaire de constructions lit une FORME DE TEXTE. À la mutation, une
construction indirecte — `new (require('…').X)(…)`, une fabrique, un alias de la
classe — l'a traversé sans le faire rougir. Ce n'est pas réparable en élargissant
l'expression : un balayage statique ne suit pas une indirection. Les deux
réponses honnêtes sont de **borner la portée dans le doc-comment du cliquet**
(il attrape la forme que la régression prend réellement, écrite par une main qui
construit ce dont elle a besoin) et d'ajouter une seconde moitié qui ne dépende
pas du texte : un témoin qui mesure l'**identité** de l'objet remis tombe sur
n'importe quelle façon d'en fabriquer un autre.

**Corollaire sur le correctif.** Un cliquet « zéro construction ici » est
intégralement satisfait par « ne rien remettre du tout ». Mesuré : la mutation
`deliveryQueue: null` passait le cliquet et coupait en silence tout le rejeu hors
ligne du canal. Tout inventaire qui INTERDIT quelque chose a besoin de son jumeau
qui EXIGE la chose juste.

**Et sur la cause.** La seconde instance n'était pas de la négligence, mais une
contrainte d'ORDRE : le constructeur du handler court avant l'enregistrement de
la file, son démarrage après. Qui résout trop tôt ne trouve rien et construit.
Devant un doublon d'instance, chercher d'abord à quel MOMENT la résolution a
lieu — le correctif est souvent un déplacement dans le temps, pas dans l'espace.
