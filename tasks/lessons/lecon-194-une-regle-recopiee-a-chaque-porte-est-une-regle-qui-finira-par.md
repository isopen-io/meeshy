## Leçon 194 — une règle recopiée à chaque porte est une règle qui finira par manquer à une porte (2026-08-16, routine temps réel, cycle 42)

**Le défaut.** `read-status:updated` avait quatre émetteurs REST. Trois
consultaient `showReadReceipts` avant de diffuser ; le quatrième ne l'avait
jamais fait. Un utilisateur qui avait retiré ses accusés de lecture les
diffusait donc quand même — nominativement, à toute la conversation — dès que la
lecture passait par cette porte-là.

**Ce qui rend la forme dangereuse.** La garde n'était pas DANS la diffusion,
elle était AUTOUR : chaque appelant écrivait son propre `if
(shouldShowReadReceipts)` avant d'appeler le fan-out. Une garde extérieure est
invisible depuis l'unité qu'elle protège : rien, ni un type ni un test, ne peut
constater qu'un appelant l'a omise. Elle a été écrite trois fois et oubliée une
— ce qui est le taux normal d'une consigne humaine, pas le taux acceptable d'un
réglage de confidentialité. *Une règle qui vit au site d'appel est une règle
dont le respect dépend de la mémoire de celui qui ajoute le prochain site.*

**Le réflexe à prendre.** Devant un défaut d'un site parmi N, ne pas corriger le
site : compter les N. Si les N-1 autres tiennent la règle par recopie, le
correctif n'est pas d'écrire une N-ième copie correcte — c'est de faire
descendre la règle dans l'unité, pour que le prochain appelant ne puisse plus
l'oublier. Écrire la copie correcte, c'est rejouer exactement le mécanisme qui a
produit le défaut, en se félicitant d'avoir fait attention cette fois.

**Une moitié protégée peut masquer l'autre.** Le payload fuyait, mais son
compteur (`summary`) retirait déjà les opt-out, numérateur et dénominateur. En
lisant vite, la porte semblait couverte. Ce qui fuyait était l'`identité` de
l'acteur — `participantId`, `userId`, `type: 'read'`, horodaté — c'est-à-dire
exactement ce que le réglage protège. *Quand une partie du payload est assainie,
vérifier ce qui reste : l'assainissement partiel ressemble à s'y méprendre à
l'assainissement.*

**Sur « aucun appelant » comme argument de suppression.** Un balayage complet du
dépôt n'a trouvé aucun client de cette route — et ce n'était pas une raison
suffisante de la retirer. Un dépôt prouve l'absence d'appelant DANS LE DÉPÔT ;
les builds mobiles déjà installés ne se relisent pas dans `git`. Retirer un
point d'entrée REST public transforme leur marquage de lecture en 404 silencieux
— une régression invisible côté serveur et non réparable côté client. *« Personne
ne l'appelle » se vérifie en télémétrie, pas en `grep` ; et le retrait d'une
surface publique mérite sa propre dépréciation, pas d'être emporté au passage
par un correctif de confidentialité.*

**Corollaire de test, deuxième cycle consécutif.** Deux doubles ont dû être
complétés pour que le correctif soit observable : un `io` sans `.except()` (la
chaîne jetait, le `try/catch` de la route avalait, et AUCUNE émission n'était
visible — le double décrivait un autre programme), et une app de test sans
`socketIOHandler`. Le cycle 41 avait déjà réparé un double pour la même raison.
*Un double qui ne connaît pas la forme réelle de l'appel ne teste pas le
programme livré, et son silence se lit comme un succès.*
