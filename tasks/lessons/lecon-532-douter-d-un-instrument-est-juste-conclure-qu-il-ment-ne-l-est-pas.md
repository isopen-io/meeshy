## Leçon 532 — Douter d'un instrument est juste ; conclure qu'il ment ne l'est pas

**Enchaînement mesuré le 2026-09-05**, sur « le canvas d'un post part-il ? ».

1. Sonde : `'storyEffects' in post` sur la réponse de l'API → **absent**.
   Conclusion annoncée : « le canvas n'est jamais parti ».
2. Doute légitime, une heure plus tard : *ai-je vérifié que ce champ est SERVI
   par cette API ?* Non. La leçon 531 venait précisément de coûter un
   instrument aveugle.
3. **Rétractation** : « mon sondage ne pouvait rien mesurer, je retire ».
4. Expérience DISCRIMINANTE : interroger le MÊME endpoint pour des STORIES,
   qui ont toujours un canvas → **10 items sur 13 portent la clé**.

Donc le champ est bien servi, la sonde était valide, et le canvas n'était
réellement pas parti. **La rétractation était une SUR-CORRECTION** : j'avais
raison au point 1, pour une raison que je n'avais pas encore établie.

> **Douter d'un instrument est une bonne réaction ; en déduire qu'il ment est
> une seconde affirmation non mesurée.** « Cet instrument est peut-être
> aveugle » et « cet instrument est aveugle » sont deux propositions
> différentes, et la seconde demande sa propre preuve — exactement comme celle
> qu'elle prétend annuler.

Ce qui tranche n'est jamais l'introspection, c'est une **expérience
discriminante** : trouver un cas où les deux hypothèses prédisent des
observations DIFFÉRENTES. Ici, une story a un canvas par construction — si
l'API sert le champ, elle le montre ; sinon, elle ne le montre pour personne.
Une seule requête, et le doute est clos dans un sens ou dans l'autre.

**Le coût de la sur-correction n'est pas nul** : entre 3 et 4, j'ai annoncé au
porteur que je ne savais plus si le canvas voyageait, alors que je le savais —
et j'ai ouvert une piste (« le serveur ne projette pas le champ ») qui a coûté
six lectures de code côté gateway avant d'être écartée par une seule requête.

**Corollaire pour la formulation** : entre 1 et 4, la phrase juste n'était ni
« le canvas n'est pas parti » ni « je retire », mais *« le champ est absent de
la réponse ; je n'ai pas encore vérifié que cette API le sert — voici
l'expérience qui le dira »*. Une affirmation datée de son niveau de preuve
n'a pas à être retirée : elle se complète.
