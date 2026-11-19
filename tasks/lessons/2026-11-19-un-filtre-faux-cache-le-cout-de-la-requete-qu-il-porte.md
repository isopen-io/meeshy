## Un filtre faux CACHE le coût de la requête qu’il porte — et une limite écrite protège le site qu’elle cache (cycle 181, #19755)

*2026-11-19, cycle 181 (#19755). Coffre de clés serveur : `ServerKeyVault.initialize()`
chargeait la carte `conversationId → keyId` sous `expiresAt: { equals: null }`, une
égalité qu'aucune ligne n'apparie puisqu'aucun créateur n'écrit la colonne.*

**Ce qui a failli arriver.** Le correctif évident était `...unsetOrNull('expiresAt')` :
une ligne, le défaut nommé par l'issue, les témoins verts. Et il aurait livré un
SECOND défaut le jour même — la lecture réparée charge **chaque** clé de conversation
de la base dans une `Map` **sans borne ni éviction**, soit un plein scan au premier
chiffrement et une rétention proportionnelle au nombre de conversations (`keyCache`
est borné à 500, `designationCache` à 2 000 ; celle-ci à rien). Personne n'avait
jamais vu cette `Map` grandir, et pour une raison mécanique : **tant que le filtre ne
rendait rien, le balayage non borné était gratuit.**

> **Avant de réparer un filtre inerte, lire la requête qu'il porte comme si elle
> rendait TOUT : c'est ce qu'elle va faire.** Un filtre faux est un anesthésiant — il
> rend sans coût une requête dont personne n'a jamais payé le prix, donc dont personne
> n'a jamais relu la forme. Le lot qui le répare hérite de ce prix, et il le découvre
> en production, dans un lot qui parlait d'autre chose.

C'est la règle du cycle 84 (« réparer ce qui rendait une donnée invisible oblige à
décider, dans le même lot, si elle a le droit d'être vue ») portée du CONTENU au
COÛT : réparer ce qui rendait une requête vide oblige à décider, dans le même lot, si
elle a le droit d'être exécutée telle quelle. Ici la réponse était non, et la bonne
forme n'était pas le prédicat juste sur le balayage mais **la suppression du
balayage** : une carte dont le manque se remplit en une lecture est un cache, pas un
index — read-through et bornée.

**Le même défaut un cran plus haut, sur le cliquet.** Celui du cycle 180 PUBLIAIT sa
limite : « il ne voit pas les fragments de `where` nommés ailleurs puis répandus ».
Vraie, honnête, et **incapable de rougir**. Elle cachait exactement un site, et
c'était le prédicat partagé des sept lectures de notifications.

> **Une limite qu'on ÉCRIT au lieu de la mesurer protège le site qu'elle cache.**
> Publiée, elle se relit comme une frontière du problème — pas comme du travail à
> faire. Famille de la leçon 261 (« zéro trouvé n'est pas zéro existe »), avec le tour
> de plus que la publication la rend rassurante : le lecteur suivant croit que
> quelqu'un a regardé.

La réparation est de MESURER la limite, pas de la redire mieux : une annotation
`Prisma.<Modèle>WhereInput` — type de retour, ou type de constante — déclare un
`where` aussi sûrement que la clé littérale.

**Et le corollaire est tombé sur le lot lui-même.** Le correctif extrait son filtre
dans une constante. La première mutation de contrôle — remettre l'égalité nue — a
laissé le cliquet **VERT** : une constante sans annotation n'est pas un `where`.

> **Un lot qui répare une règle en DÉPLAÇANT le code qu'elle gouverne sort du champ de
> sa propre garde.** Extraire, nommer, factoriser sont de bons gestes, et chacun
> déplace le code hors de portée d'un balayage qui cherche une FORME. La question à
> poser à toute extraction faite dans un lot de cliquet : *mon cliquet voit-il encore
> ce que je viens de déplacer ?* — et elle se répond par la mutation, jamais par la
> lecture.

**Ce qui a servi, et qui vient des cycles précédents.** Un témoin de soft-state
s'écrit sur la forme que la PRODUCTION crée (cycle 180) : la ligne sans colonne
`expiresAt` rougit, la ligne à `expiresAt: null` explicite passait déjà — les deux
sont dans le fichier, côte à côte. Un double ment aussi par ce qu'il ACCEPTE (cycle
112) : trois doubles de la table des clés n'appariaient que `purpose`, donc rendaient
leurs lignes quel que soit le filtre, et l'un d'eux servait la clé d'une AUTRE
conversation en laissant son témoin vert. `try`/`catch` et `.catch` sont disjoints
(§ Critical Gotchas, `void p`), pris par l'autre bout : un client qui n'expose pas la
méthode jette SYNCHRONEMENT, et une promesse jamais construite ne porte aucun
`.catch`. Et la forme ATTESTÉE gagne (cycle 180, constat I) : le septième site
`expiresAt` n'a pas été « corrigé » — sa colonne est écrite à chaque création par un
créateur unique, et sa forme à deux branches est servie par un index posé exprès pour
elle (migration mongodb 010). L'absolution est gelée AVEC sa mesure, et un témoin
garde l'absolution elle-même : une discipline gelée qui ne décrit plus aucun site nu
couvrirait le suivant.

**Et le troisième exemplaire était dans le cliquet lui-même.** L'audit adversarial a rendu
BLOQUANT non pas sur la production — jugée saine — mais sur la PREUVE : le cliquet bénissait
`OR: [{ champ: null }, { NOT: { champ: { isSet: false } } }]`, dont la seconde branche dit « la
clé EST posée », donc dont l'union exclut exactement les documents absents. Le défaut gardé,
certifié correct par sa garde. Le cycle 180 avait déjà corrigé ce même cliquet pour la même
raison et n'avait fait que RESSERRER la fenêtre de sa recherche textuelle.

> **Un cliquet qui cherche la forme JUSTE par ses MOTS finit par bénir sa négation.** Le texte
> cherché était le bon ; c'est la POLARITÉ qui change le sens, et aucune expression régulière ne
> la voit. La correction n'est pas une regex plus fine — c'en était déjà une — c'est de chercher
> une STRUCTURE. Et le corollaire de méthode : **un lot dont la preuve est un cliquet doit
> auditer le cliquet comme il auditerait la production**, parce que `tsc` et les témoins sont
> aveugles à l'instrument qui les juge.

**Le quatrième : une justification juste peut reposer sur une affirmation fausse.** Le filtre
posait `isActive: true` nu, justifié par « Prisma écrit son `@default(true)` à chaque création ».
L'audit a refusé : non mesurée, et CUITE DANS LA FIXTURE, qui posait la colonne à la main — donc
aucun témoin de la suite ne pouvait la falsifier. Le prédicat était juste ; sa raison ne l'était
pas. La correction n'était pas de changer le prédicat mais **de trouver la mesure qui le fonde**,
et le compilateur l'a rendue en une ligne : `differsOrUnset('isActive', false)` ne compile pas,
parce que Prisma n'expose `isSet` que sur les colonnes OPTIONNELLES et que celle-ci est REQUISE.
Le piège n'existe pas sur elle.

> **Devant une prémisse qu'on ne peut pas mesurer, chercher qui la mesure déjà.** Ici c'était le
> système de types, à une ligne de distance — et le témoin qui l'épingle (`@ts-expect-error`)
> tombera le jour où la colonne deviendra optionnelle, c'est-à-dire exactement le jour où
> l'égalité nue deviendra un défaut.
