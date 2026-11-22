## Une liste nommée par une SOUS-CATÉGORIE sera contournée, pas étendue (2026-11-22, #20336, cycle 217)

*Mesuré le 2026-11-22 (#20336, cycle 217), sur `apps/web/src/lib/api/socket.ts`.*

### Le fait

#18573 avait corrigé une divergence entre deux branches de rattrapage en créant
la liste que les deux doivent itérer, et avait écrit la leçon sur place : « une
liste qu'il faut retaper à chaque branche est une liste qu'une branche finira
par ne pas avoir ».

**Deux lots plus tard, la divergence était revenue**, avec quatre familles dans
une seule branche. La liste existait pourtant, déclarée une fois, à trois lignes
du site fautif.

### La cause

Elle s'appelait `CATCH_UP_PERSONAL_FAMILIES`. #18641 et #18914 ajoutaient des
familles de PUBLICATION (le fil social, le rail des stories, les humeurs, les
catégories). Une liste de familles « personnelles » n'avait pas de place pour
elles : chaque lot a écrit son `invalidateQueries` en ligne, juste sous la
boucle, **sans se sentir en faute** — et avec une suite verte, puisqu'aucun
témoin ne nomme la famille qui n'existe pas encore.

### La règle

> **Le nom d'un site unique n'est pas une étiquette : c'est son prédicat
> d'appartenance.** C'est lui qu'un lot consulte pour savoir s'il a le droit
> d'écrire ailleurs. Nommer par la PROPRIÉTÉ que la liste porte — ici « ce que
> la fenêtre a emporté » — jamais par la famille qui s'y trouvait d'abord.

Un correctif structurel qui crée un site unique n'est donc pas fini quand le
site existe : il l'est quand **son nom accueille le cas suivant**. Demander, au
moment de nommer : *quelle est la prochaine chose qui devra entrer ici, et son
auteur se reconnaîtra-t-il dans ce nom ?*

C'est la leçon 261 (« un lot ferme une classe dans SA langue ») appliquée non
pas à une énumération, mais au NOM de la liste qui la porte.

### Les deux corollaires, mesurés dans le même lot

- **Un témoin de comportement ne peut pas garder un site unique.** Il atteste
  les familles qu'il NOMME ; la suivante n'y est nommée nulle part, par
  construction. Ce qui garde un site unique est un cliquet de **FORME** — ici :
  le corps de la fonction ne contient que DEUX `invalidateQueries`, la famille
  à portée particulière et la boucle. Prouvé : sous la mutation « une famille de
  plus dans une seule branche », c'est le seul témoin qui tombe.

- **Une portée optionnelle est un arbitrage qui n'a pas eu lieu.** `exact?:
  boolean` laisse un défaut implicite décider pour une clé dont deux des neuf
  ont un voisin sous leur racine. Rendue REQUISE, elle force chaque famille à
  dire sa portée — même règle que « le silence n'est jamais la réponse » des
  schémas de réponse.

### Et le témoin qui gelait la lacune

Deux témoins disaient « jamais à la première authentification », sans aucune
raison écrite pour ce `jamais` : ils décrivaient ce que le lot avait FAIT, pas
ce que le produit veut. Le fichier le dénonçait déjà, soixante lignes plus haut,
à propos d'un témoin retiré au lot précédent — « l'assertion gelait une lacune
sous les apparences d'une décision ».

> **Devant une assertion NÉGATIVE (« jamais X »), chercher sa raison écrite.**
> Absente, ce n'est pas une décision : c'est un procès-verbal de l'implémentation
> du jour, promu au rang de contrat.

Le second de ces deux témoins vivait dans un fichier de FAMILLE, pas dans celui
du rattrapage, et le relevé par lecture l'avait manqué : **c'est la suite
complète qui l'a nommé.** Un relevé de sites se confronte à une exécution.
