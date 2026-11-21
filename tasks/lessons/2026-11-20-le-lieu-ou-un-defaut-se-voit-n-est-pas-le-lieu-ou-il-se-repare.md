## Le lieu où un défaut se VOIT n'est pas le lieu où il se répare (cycle 187, #19917, lot RETIRÉ)

*2026-11-20. Un lot écrit, testé, documenté, prouvé rouge par mutation — et
retiré après audit, parce qu'il réparait au mauvais endroit.*

**Le défaut.** Le dédoublonnage d'un envoi rendait « succès » sans lier les
pièces jointes que le transport venait pourtant d'admettre. Le symptôme se
voyait là : dans le bloc `earlyHit`, à la ligne qui rend la réponse. J'y ai posé
la réparation.

**Ce que ça a coûté**, et chaque point a été vérifié dans le code :

| ce que le raccourci sautait | l'état qu'il laissait |
|---|---|
| le filtre d'auteur (le `where` du dédup n'a pas de `senderId`) | **n'importe quel participant** pouvait attacher son fichier au message d'un autre, avec les protections de la victime |
| les trois gardes d'admission (état du conteneur, droit d'écriture, `attachmentSendRefusal`) | le dédup court AVANT elles **parce qu'il ne fait que LIRE** |
| le scellement au repos | le fichier en clair sur disque, hors de la fenêtre du rattrapage |
| le pipeline audio | un vocal **jamais transcrit**, donc hors du Prisme, pour toujours |
| la dérivation du `messageType` | une image sous un message `'text'` |
| le `select` de relecture | `filePath`, `encryptionIv`, `encryptionAuthTag` servis au client |

> **Un correctif ne se juge pas à ce qu'il répare, mais à l'ÉTAT qu'il laisse.**
> Celui-ci remplaçait un échec BRUYANT — la pièce manque, l'utilisateur renvoie
> — par un état à moitié réparé, SILENCIEUX et définitif. C'est un plus mauvais
> produit que le défaut.

**La question qui l'attrape**, et elle se pose AVANT d'écrire : *le chemin
nominal, lui, fait quoi d'autre ?* Si la réponse est « quatre gestes de plus »,
le raccourci n'est pas un raccourci — c'est une seconde implémentation,
partielle, de quelque chose qui existe déjà en entier.

### Corollaire : une branche qui ne faisait que LIRE a des invariants de LECTEUR

Le dédoublonnage passe avant toutes les gardes d'admission, et son commentaire
JUSTIFIE cet ordre : refuser un rejeu maintenant ferait marquer « échoué » un
message pourtant délivré. Ce raisonnement est juste — **pour une lecture.**

> **Poser une écriture dans une branche de lecture hérite de toutes les
> permissions que la lecture s'était autorisées.** Et ces permissions sont
> écrites comme des justifications, pas comme des gardes : on les lit en
> hochant la tête. La question à poser à tout site où l'on ajoute une écriture
> est : *qu'est-ce que ce code avait le droit de sauter parce qu'il ne faisait
> que lire ?* — à commencer par le filtre d'auteur, qu'une lecture n'a aucune
> raison de porter.

### Corollaire : la règle de méthode ne se transporte pas d'un cycle à l'autre

Le cycle précédent avait versé une leçon sur les témoins qui ne peuvent pas
tomber. Celui-ci en a écrit un : son harnais fabriquait, sur l'objet rendu par
la requête de dédup, un champ `attachments` que cette requête **ne charge
jamais**. La garde centrale du lot était donc morte en production, et son
témoin vert. Un `as never` au site d'appel étouffait le `TS2741` qui l'aurait
dit — `tsc` passe sans ce cast.

**Mesure à reproduire, et elle tient en une phrase :** faire rendre au double
la forme EXACTE de la production (le `select`/`include` réel, copié, pas
reconstruit) avant de croire un témoin qui porte sur ce que la requête rend.
C'est la seule chose qui distingue un témoin d'une fiction d'accord avec
elle-même.
