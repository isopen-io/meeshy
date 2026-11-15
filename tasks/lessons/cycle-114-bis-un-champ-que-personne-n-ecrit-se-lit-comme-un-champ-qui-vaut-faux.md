## Cycle 114 bis — un champ que PERSONNE n'écrit se lit comme un champ qui vaut faux

### 1. Une garde de confidentialité peut être livrée, testée, verte, et n'avoir jamais eu lieu

`publicationNeedsCaptureConfirmation` était juste. Ses témoins passaient. Le
schéma de la passerelle acceptait le champ et documentait sa raison d'être. Et
la confirmation ne s'est **jamais** affichée, parce que `capturedInApp`
n'existait nulle part ailleurs que dans la règle qui le lit : pas de colonne,
pas de champ de contrat, **aucun chemin d'écriture**.

Le trait à retenir : **rien ne ressemble à un bug.** Il n'y a pas de `TODO`, pas
de type qui ment, pas d'exception. Une valeur absente se lit `undefined`, un
`!!undefined` vaut `false`, et une garde qui ne se déclenche jamais est
silencieuse par nature — c'est exactement ce qu'on attend d'elle quand tout va
bien. **Une garde qui ne se déclenche pas n'est pas observable ; il faut donc
aller vérifier qu'elle PEUT.**

La question à poser à tout drapeau qui commande une garde : **qui l'ÉCRIT ?**
Pas « qui le déclare », pas « qui le transporte » — qui pose la valeur `true`.
Le nom apparaissait cinq fois dans le dépôt et zéro fois à gauche d'une
affectation issue du monde réel. Même balayage que le cycle 96 sur
`signedPreKey.signature` (six occurrences, zéro à droite d'une comparaison) :
compter les sites ne dit rien, c'est leur RÔLE grammatical qui parle.

### 2. Un cast NOMMAIT la déclaration manquante — troisième fois

```ts
const primaryAttachment = (message as { attachments?: Array<{ …; capturedInApp?: boolean }> })
  .attachments?.[0];
```

Règle déjà écrite (cycles 96, 103, 104) et vérifiée une fois de plus : **un cast
sur un objet de contrat nomme le champ qui manque au contrat.** Ici il faisait
mieux que le nommer — il fabriquait, le temps d'une expression, le champ que la
production ne produit pas. Le retirer a fait tomber le compilateur sur les six
sites qui laissaient la valeur passer à la trappe, dont le transformateur web,
seul chemin entre la réponse et l'objet que la feuille lit.

### 3. Un témoin qui FABRIQUE la valeur en litige atteste une fiction

Les témoins web posaient `capturedInApp: true` à la main dans leurs fixtures. Ils
prouvaient que « si le champ vaut vrai, la modale s'ouvre » — une propriété du
composant, vraie, et sans rapport avec la question qui comptait : *ce champ
peut-il valoir vrai ?*

Même famille que le `MagicMock` nu (cycle 90), que le double Prisma qui rend `[]`
(cycle 87) et que les fixtures `'conv-1'` du cycle 112 : **un double ment aussi
par ce qu'il ACCEPTE de représenter.** Le correctif de méthode est le même —
partir de ce que l'ÉMETTEUR émet réellement, jamais de la forme qu'on aimerait
qu'il ait.

### 4. Le commentaire disait la panne, à voix haute, et personne ne l'avait crue

```ts
// `capturedInApp` est DÉCLARÉ par le client, et il est le seul à pouvoir le faire
```

Vrai sur le principe. Faux en fait : **aucun client n'avait de quoi le
déclarer.** C'est la famille « un commentaire qui ÉNONCE une contrainte est une
AFFIRMATION » (cycle 94), avec une variante : celui-ci n'énonçait pas une
contrainte de schéma mais une **répartition des responsabilités**, et personne
n'avait vérifié que l'autre partie tenait la sienne. Devant une phrase de la
forme « c'est X qui fournit ce champ », la question est : *et il le fait ?*

### 5. On peut poser un tuyau parfait et n'y verser personne

C'est la leçon la plus coûteuse du cycle, et elle a failli sortir en production
sous les traits d'un correctif.

Après deux commits — colonne, persistance, `select`, schéma, type requis,
transformateur, trois étages iOS — la garde était **toujours inerte** : rien ne
déclarait la provenance à la capture, donc la colonne valait `false` partout.
J'avais reproduit le défaut d'origine un étage plus haut, avec plus de code et
autant d'effet, et j'aurais pu le clore ainsi : les gates étaient verts, les
témoins prouvaient chaque maillon, et le seul maillon absent était celui dont
personne n'écrit de témoin — **le premier**.

Ce qui l'a rattrapé : la phrase que je venais d'écrire moi-même dans « reste
ouvert » disait la panne en toutes lettres. **Relire son propre journal comme on
relirait le commentaire d'un autre** — les deux se périment de la même façon, et
un aveu écrit sans être entendu ne vaut pas mieux que le commentaire du §4.

Formulation générale : **une chaîne de données se vérifie par son PREMIER
maillon, pas par la longueur du reste.** Les maillons intermédiaires ont chacun
un témoin naturel (« ce mapping recopie-t-il le champ ? ») ; la SOURCE n'en a
pas, parce qu'il n'y a rien en amont à comparer. C'est donc là que la vérification
doit être délibérée, et elle ne se formule qu'en une question : *qui, dans le
monde réel, pose cette valeur, et à quel moment le sait-il ?*

### 6. Corollaire : la provenance est une donnée PÉRISSABLE

Ce champ a une propriété qui explique tout le défaut : **il n'est connaissable
qu'à un seul instant**, et par un seul acteur. Le serveur ne peut pas le
déduire (rien dans un fichier ne distingue une photo prise d'une photo
importée) ; le client ne peut plus le retrouver une seconde après. Le web
essayait de le relire sur un attachement redescendu du serveur — c'est-à-dire à
l'endroit et au moment où l'information n'existe plus.

Devant une donnée de cette famille — provenance, intention, contexte de geste —
**la seule question d'architecture est « où est-elle encore vraie ? »**, et la
réponse commande le reste : elle s'écrit là, ou elle est perdue. Un lot qui la
transporte sans l'écrire à la source déplace le problème en le rendant plus
difficile à voir.

---
