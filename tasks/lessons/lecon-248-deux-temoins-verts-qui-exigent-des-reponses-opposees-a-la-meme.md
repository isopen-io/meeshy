## Leçon 248 — Deux témoins verts qui exigent des réponses OPPOSÉES à la même question (2026-08-22, cycle 102)

Une règle métier écrite deux fois n'a pas deux gardes : elle en a une par
exemplaire, et **chaque garde atteste son exemplaire**, y compris quand il est
faux. Rien ne les confronte, donc rien ne rougit.

Cas mesuré. La question : *quel `messageType` porte un message dont la pièce
jointe est un `text/plain` ?*

| fichier | témoin | réponse |
|---|---|---|
| `attachment-message-type.test.ts` | « treats an unknown or empty MIME as a generic file, **never text** » | `'file'` |
| `MessageProcessor.test.ts` | « **does not update** message type for text/plain forward » | `'text'` |

Les deux verts, dans le même service, depuis des mois. Le second ne décrivait
aucune règle : il **gelait le trou** de l'exemplaire manuscrit qu'il gardait —
lequel ne connaissait que le préfixe `application/` et ne lisait que
`attachments[0]`.

> **Un témoin atteste la règle de son exemplaire, jamais LA règle.** Quand une
> règle a plusieurs sites, la couverture croît avec le nombre d'exemplaires
> pendant que la justesse décroît. Le vert n'est pas une mesure de la règle,
> c'est une mesure de l'accord d'un site avec lui-même.

Le geste qui le trouve n'est pas un balayage de duplication — les deux corps ne
se ressemblaient pas — mais une question posée à la COLONNE : **qui l'écrit ?**
Ici quatre chemins, dont un seul appelait la règle canonique.

Corollaires :

- **Compter les ÉCRIVAINS d'une colonne avant d'en corriger un.** `grep` sur le
  nom de colonne à gauche d'un `:` ou d'un `=`, pas sur le nom de la fonction
  qu'on soupçonne — la fonction canonique est justement celle que les sites
  fautifs n'appellent PAS.
- **Le point unique est celui où la donnée est COMPLÈTE**, pas celui où on la
  reçoit. Ici : après la relecture des pièces jointes, la seule étape que les
  trois chemins traversent — donc le seul endroit où la règle puisse être
  écrite une fois pour tous.
- **Un correctif de règle unique est ADDITIF ou il n'est pas sûr.** Ne parler
  que si la colonne porte encore son défaut laisse intactes les valeurs qu'un
  producteur légitime a posées (`'location'`, `'system'`), et rend le lot
  mesurable : les témoins d'additivité passent AVANT comme APRÈS, et ce sont eux
  qui prouvent qu'on n'a rien détruit.
- **Un double qui ment sur son collaborateur cache le trou.** Quatre témoins de
  transfert mockaient la relecture à `[]`, ce que la production ne fait jamais.
  Tant que le double affirmait « il n'y a pas de pièce jointe à relire », aucun
  d'eux ne pouvait voir que personne ne dérivait le type.

Et la cause RACINE était plus haut que les quatre sites : la colonne était
renseignée **depuis un champ de requête**, et `SendMessageRequest` du SDK iOS
n'a pas ce champ. **Quand un serveur délègue à ses clients un fait qu'il est
seul à connaître entièrement, il faut compter les clients qui peuvent le dire —
il y en a toujours un qui ne peut pas.**
