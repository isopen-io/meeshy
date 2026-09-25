## Leçon 579 — Un décodage strict sur un champ que PERSONNE ne lit coûte la PAGE entière

2026-09-11, iOS + passerelle (audit de cohérence).
`Message.translations` est une colonne JSON Mongo, relue par la passerelle avec
un CAST — aucune validation. Le type décrit ce que les écrivains d'aujourd'hui
posent, jamais ce que la base contient : écriture partielle, version antérieure,
translator tombé entre deux champs.

La chaîne complète, pour UNE ligne malformée :

1. l'entrée sans `text` produit `translatedContent: undefined` ;
2. le schéma wire ne le déclare pas `nullable` ⇒ `fast-json-stringify` OMET la
   clé ;
3. `APITextTranslation.translatedContent` est non optionnel ⇒ le message échoue ;
4. `MessagesResponse.data` est un `[APIMessage]` décodé d'un bloc ⇒ **la page
   entière échoue**.

La conversation s'ouvre VIDE, et rien dans le journal ne nomme la ligne fautive.

> **La rigueur d'un type se paie au NIVEAU où l'échec remonte, jamais au niveau
> où il est écrit.** Un champ non optionnel dans un élément de tableau est une
> décision sur le TABLEAU. Demander : *si cet élément est refusé, qu'est-ce qui
> disparaît ?* — si la réponse est « plus que l'élément », le décodage doit être
> tolérant par élément.

`translationModel` n'était lu par AUCUNE surface (relevé sur tout le dépôt :
seuls des tests), et le web le traitait déjà comme absent (`|| 'basic'`). Un
champ que personne ne lit ne mérite pas de faire tomber quoi que ce soit.

Parade, en DEUX moitiés qui ne se remplacent pas :
- côté serveur, ne pas servir ce qu'on ne peut pas décrire honnêtement — une
  entrée sans texte n'est pas une traduction (« le client peut se tromper ; la
  charge, non ») ;
- côté client, tolérance par ÉLÉMENT (`decodeLossyArrayIfPresent`, déjà dans le
  SDK), pour la malformation que personne n'a prévue.

Et surtout **ne pas rendre facultatif le champ de CONTENU** pour faire taire le
symptôme : `translatedContent` reste obligatoire, parce qu'une traduction sans
texte n'a rien à faire dans la liste. C'est le champ de MÉTADONNÉE qui devient
facultatif — il dit alors ce qui est vrai plutôt que ce qu'on espérait.
