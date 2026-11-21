## Une prédiction d'audit a une date de péremption, et elle était de TROIS HEURES (cycle 178, #19604 / #19676)

L'audit adversarial de #19525 a fermé cinq portes de réaction, puis écrit ceci
dans le suivi qu'il ouvrait (#19604) :

> Ce qui reste est une **promesse non tenue** […] un sixième transport qui
> résoudrait son participant à la main ne rougirait nulle part.

La phrase était juste, et elle était classée comme une considération de
DOCTRINE : l'issue prenait soin de dire « pourquoi ce n'est pas un trou vivant »,
et elle avait raison au moment où elle l'écrivait. Le sixième transport est
arrivé le **même jour**, trois heures plus tard, par un lot qui parlait d'autre
chose — #19650 a créé `services/calls/callReactionOnBubble.ts` avec la graphie
NUE `isActive: true`, et le seul verrou en amont ne pose que la question de la
session d'appel.

### Et ma première rédaction de cette leçon était fausse sur son INSTANCE

J'ai d'abord écrit que le chemin était « un membre banni **pendant** qu'il est
dans l'appel ». L'audit adversarial du lot l'a réfuté, et il avait raison :
`resolveBanWrite` (`conversationBanState.ts`, **seul écrivain de `bannedAt`**)
écrit `isActive: false` quand la cible est ACTIVE — le filtre NU refusait donc
déjà ce cas, et le bannissement sort en prime la personne de l'appel
(`endCallParticipationForDepartedMember`). Le scénario que je publiais était
**irréalisable**.

Le vrai producteur est une COURSE, et il est pire : `REJOIN_PARTICIPANT_STATE`
rallume `isActive: true` sans effacer `bannedAt`, délibérément, sur la foi d'une
phrase écrite à côté — « une rentrée ne débannit personne, et les trois portes
refusent un banni **en amont** ». Les trois portes de rentrée n'ont pas la garde
que `restore-for-me` porte DANS son `where`, et dont le commentaire nomme
exactement cette fenêtre. Un bannissement qui tombe entre la décision `rejoin` et
son écriture laisse donc la ligne **vivante ET bannie**, par du code vivant
(#19688).

> **Une leçon de MÉTHODE juste, bâtie sur une INSTANCE fausse, est plus
> dangereuse qu'une leçon absente** : c'est elle que le prochain auditeur citera
> comme prémisse, et il la citera avec confiance parce que la méthode, elle,
> tient. J'avais la bonne règle (« la qualification d'un suivi vieillit ») et je
> l'ai illustrée par un scénario que je n'avais pas ouvert jusqu'au seul écrivain
> de la colonne. **Le prix d'une instance non mesurée est payé par qui s'y
> appuie, pas par qui l'écrit.**

Et la vérification tenait en une commande : énumérer les `data:` qui écrivent
`bannedAt`. Il y en a UN.

### Ce que ça change à la lecture d'un suivi

Un suivi d'audit porte deux choses qui ne vieillissent pas au même rythme :

| la part | vieillit |
|---|---|
| **le constat** (« ces N sites épellent la loi à la main ») | lentement — c'est une propriété de l'arbre |
| **la qualification** (« ce n'est pas un trou vivant ») | à la vitesse des lots qui touchent la famille |

La seconde est une mesure prise sur un arbre, à une date. La recopier sans la
refaire, c'est la famille déjà connue du « suivi hérité est une AFFIRMATION »
(cycle 107) — avec ceci de particulier qu'ici la prémisse n'était pas fausse au
départ : **elle l'est devenue**, comme le commentaire d'impossibilité du
cycle 107 bis.

> **Devant un suivi qui se rassure (« piège armé, pas panne »), la question
> n'est pas « est-ce exact ? » mais « depuis QUAND, et qu'est-ce qui a touché
> cette famille depuis ? »** — et elle se répond par un `git log` sur le
> répertoire, pas par une relecture de l'issue.

### Le corollaire d'ordonnancement, qui est le vrai enseignement

Si une prédiction de ce genre se réalise en trois heures, **le lot qui ferme les
N portes et le lot qui ferme leur point de CONVERGENCE ne sont pas deux lots
également urgents.** Fermer N portes protège les N chemins connus ; fermer la
convergence rend le N+1 gratuit. #19525 a livré les cinq portes et reporté la
convergence en suivi — l'ordre inverse aurait rendu #19676 impossible à écrire.

> **Entre une garde posée aux PORTES et la même garde posée à leur point de
> CONVERGENCE, la seconde se livre d'abord quand le nombre de portes est connu
> pour CROÎTRE.** Les portes disent qui entre aujourd'hui ; la convergence dit
> qui entrera.

Et la raison pour laquelle on ne le fait pas spontanément est mécanique : un
audit énumère ce qu'il TROUVE, donc des portes. La convergence n'apparaît dans
aucune énumération de sites fautifs — elle est, par construction, le site qui
n'était pas fautif.

### La taille de la dette, publiée parce que personne ne l'avait comptée

Mesuré dans le même lot : **199** lookups `prisma.participant.*` du gateway
portent `isActive: true` sans la loi (1 717 fichiers, commentaires dépouillés,
tests exclus). Les deux lots précédents ont chacun fermé « les sites qu'ils
touchaient » sans jamais dire combien restait — et une dette sans taille ne se
priorise pas, donc ne se solde pas (cycle 177). Les 199 ne sont pas 199 défauts :
la loi étroite est FAUSSE pour une liste d'exclusion, qui se construit sur le
sur-ensemble (#16690). Le tri par famille est #19677, et c'est ce tri qui est le
travail — pas le resserrement.
