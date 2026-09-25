## Leçon 395 — Une garde qui parcourt le modèle DÉCLARÉ est aveugle à ce qui a été perdu AVANT la déclaration

**Lot #4686.** Le témoin central des cinq pages institutionnelles parcourt le
modèle et vérifie que chaque feuille atteint le document. Il est fort — et il
n'a **pas** vu que les cinq encarts de `privacy.protection` étaient déclarés
avec un `corps` INDÉFINI (leur texte vit sous `content` au catalogue, là où
quatre autres familles le portent sous `description`). La page servait cinq
titres nus.

> Un champ absent du MODÈLE n'est pas une feuille, donc il n'est pas cherché.
> La garde de complétude et la garde de SENS ne sont pas la même garde.

Ce qui l'attrape interroge le sens : « une carte sans corps ni items ne dit
rien ». Écrire cette seconde garde demande de savoir **ce qu'un bloc doit
contenir pour être utile**, pas seulement ce qu'il déclare.

Trois autres défauts du même lot ont été trouvés par le **RENDU**, jamais par le
diff ni par une assertion de présence — les deux textes étaient bien là :

| défaut | trace observable |
|---|---|
| douze règles CSS servies **deux fois** après une extraction | **le poids** (+1 420 o), aucun pixel changé |
| `/privacy` **lisait deux fois** le même paragraphe (accroche = 1<sup>re</sup> section) | la capture |
| « Solutions Entreprise » et « Devenir Partenaire » **en double en `<h2>`** | la capture |

Chacun est devenu un témoin structurel — « aucun sélecteur déclaré deux fois »,
« ne répète jamais son accroche dans une section », « ne porte jamais deux fois
le même titre de niveau 2 ». **Une capture d'écran est un instrument de test**,
et un défaut qu'elle seule voit mérite qu'on cherche sa trace mécanique.

Deux corollaires de forme :

- **Une reprise « mot pour mot » est une affirmation tant qu'on ne l'oppose pas
  à sa source.** Trois mots avaient été ajoutés à une description (« …et la
  collaboration internationale **dans votre établissement** ») ; un `includes`
  n'y voyait rien, le texte du catalogue en étant le PRÉFIXE. Le témoin compare
  désormais chaque feuille à l'ensemble des chaînes du JSON.
- **`cd X && cmd` ne garde que la PREMIÈRE commande d'un bloc multi-lignes.**
  Deux fois dans la session : le `cd` échoue, le premier `cat >` est
  court-circuité, les suivants s'exécutent. C'est ainsi que la feuille de la
  vitrine n'a pas été réécrite pendant que la nouvelle était ajoutée — la
  jumelle exacte que l'extraction devait supprimer.
