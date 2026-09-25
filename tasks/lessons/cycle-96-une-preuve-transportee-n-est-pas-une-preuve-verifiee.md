## Cycle 96 — une preuve TRANSPORTÉE n'est pas une preuve VÉRIFIÉE

Journal complet : `tasks/realtime-sync-audit-2026-08-22-cycle96.md`.

`signedPreKey.signature` est la seule chose qui rattache la pré-clé signée à la
clé d'identité, donc la seule chose qui fasse de X3DH un accord authentifié. Le
dépôt la PRODUISAIT (`SignalKeyManager`), la PERSISTAIT (`DMAEnrollment`), la
RELISAIT pour la placer dans le paquet (`SignalProtocolEngine`), et la DÉCLARAIT
obligatoire (`PreKeyBundle`). Quatre couches, chacune irréprochable. La cinquième
— celle qui la lit — n'existait pas.

> **Un champ présent à chaque étape se lit comme un champ traité.** C'est
> exactement ce qui rend cette famille invisible : il n'y a rien à trouver. Pas
> de `TODO`, pas de champ manquant, pas de type qui ment. La preuve voyage, bien
> formée, jusqu'au bout — et personne ne l'ouvre. Chaque couche rassure la
> suivante, et l'absence de vérificateur ne ressemble à rien.

La question à poser n'est donc pas « ce champ est-il là ? » mais **« qui le
LIT, et que fait-il quand il est faux ? »**. Un `grep` du nom du champ répond à
la première ; seul le second membre de la phrase trouve le défaut. Ici, le nom
apparaissait six fois dans le sous-arbre, et zéro fois à droite d'une
comparaison.

**La suite du sous-arbre le documentait sans le voir** : ses six constructions de
paquet passaient `signature: crypto.randomBytes(64)`, et l'accord aboutissait.
C'est la preuve la plus courte que rien ne vérifiait — et elle était écrite dans
le dépôt, verte, depuis toujours. **Une valeur ABSURDE qu'un témoin fait passer
sans broncher nomme la garde qui manque.** Chercher dans les fixtures ce qu'un
attaquant n'aurait jamais pu produire est un balayage à part entière.

### Corollaire — une garde conditionnée à la présence de ce qu'elle garde est un no-op

Le second défaut du même lot, dans le même sous-arbre :

```ts
if (senderIdentityKey && encryptedMessage.signature.length > 0) { /* refuser si invalide */ }
else if (encryptedMessage.signature.length > 0) { /* avertir */ }
```

Un message SANS signature ne franchit aucune des deux branches : ni vérification,
ni avertissement, ni refus. Le bloc se déclare `SECURITY: Strict signature
verification`. Il était strict contre une signature FAUSSE, jamais contre une
signature RETIRÉE — et le retrait est strictement moins cher que la forgerie.

> **Une authentification dont l'attaquant décide s'il la subit n'est pas une
> authentification.** Dès qu'une garde se conditionne à la PRÉSENCE de la preuve,
> l'omission devient la manœuvre gagnante. Le discriminant juste est l'INTENTION
> de l'appelant (« m'a-t-on donné de quoi vérifier ? »), jamais l'obligeance de
> l'émetteur (« m'a-t-on donné quelque chose à vérifier ? »).

Même forme que le commentaire qui scellait la connexion 2FA en la décrivant
(cycle 91 bis) et que la note de `storyAuthorSelect` qui ÉNUMÉRAIT trois
audiences en omettant la quatrième (cycle 83) : **le texte affirme la garde, le
code porte l'exception, et c'est le texte qu'on relit.**

### Et le `as any` disait où était le trou

`SignalProtocolAdapter.performX3DH` portait `recipientBundle as any` depuis
toujours. Le cast n'était pas une facilité de frappe : le contrat
`ISignalProtocolAdapter` ne transportait pas la signature que `PreKeyBundle`
déclare obligatoire, et le cast **faisait taire exactement cette absence-là**.

> **Un `as any` sur un objet de contrat nomme le champ qui manque.** Le retirer
> n'est pas de l'hygiène de typage — c'est la question « pourquoi ce champ n'y
> est-il pas ? », et la réponse est parfois un défaut de sécurité. Le cycle 95
> l'avait consigné comme dette cosmétique de dernier rang ; c'était l'indice.

Corollaire de manœuvre, vérifié ici : **rouvrir une signature de méthode révèle
ce qu'elle déclarait faux.** En y portant la signature cryptographique, deux
autres mensonges du même contrat sont tombés — un paramètre
(`ourEphemeralPrivate`) DÉCLARÉ et silencieusement ignoré, et un résultat qui
jetait la clé éphémère publique sans laquelle le pair ne peut rien dériver. Ni
l'un ni l'autre n'aurait été trouvé en cherchant des défauts de sécurité ; les
deux sont tombés en écrivant honnêtement une liste de paramètres.
