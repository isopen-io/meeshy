## Leçon 605 — Une borne abaissée sur directive peut rester INATTEIGNABLE parce qu'une règle VOISINE la retire, et le gate reste vert (2026-09-14)

**Cas.** Directive du 13 septembre, après mesure de 18 refus d'inscription pour
2 comptes créés en 24 h : « il faut diminuer à 6 caractères au lieu de 12 ».
`PASSWORD_MIN_LENGTH` est passée de 12 à 6, ses trois littéraux Ajv alignés, la
garde de parité verte. Mais `validatePasswordStrength` — appelée par les CINQ
portes qui acceptent un mot de passe — exige en plus une majuscule, un chiffre
et un score `zxcvbn` ≥ 3/4. Aucun mot de passe de six caractères CHOISI PAR UN
HUMAIN n'atteint 3/4. La borne abaissée n'a atteint personne, et le refus
mesuré en production a continué.

1. **Une borne ne gouverne que ce qu'elle est SEULE à gouverner.** La question
   à poser en abaissant un seuil n'est pas « la valeur est-elle bien changée
   partout ? » (ce que la garde de parité mesure très bien) mais **« qui
   d'autre refuse la même chose, pour une autre raison ? »**. Le voisin ne
   partage ni le nom, ni le fichier, ni le témoin.
2. **Le motif est celui de la « loi qui calcule une valeur que personne ne
   lit », dans sa forme la plus coûteuse** : ici la valeur est LUE, la garde
   est verte, la directive est appliquée — et le symptôme survit. Ce qui la
   rend invisible est précisément que tout est correct.
3. **Le témoin qui l'attrape n'est pas un témoin de valeur.** Ce n'est pas
   « `PASSWORD_MIN_LENGTH === 6` » mais « il EXISTE un mot de passe de
   `PASSWORD_MIN_LENGTH` caractères que la porte accepte ». Une borne déclarée
   sans témoin d'atteignabilité est une promesse que rien ne tient.
