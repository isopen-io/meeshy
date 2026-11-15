## 2026-08-08 (8) — `public` ne veut pas dire atteignable : ce sont les DÉPENDANCES qui enferment

Les quatre cycles précédents butaient tous sur des méthodes `private`, et la règle qui en est
sortie (cycle 17 #5 : « toute obligation destinataire qui n'a pas de nom appelable est
inatteignable ») visait le mot-clé de visibilité. Celui-ci bute sur une méthode **`public`**,
dont le docstring annonce même « source unique partagée par les DEUX émetteurs ». Elle était
malgré tout hors de portée des deux routes de lien, parce qu'elle vit sur l'objet qui détient
`io` et `connectedUsers` — que nulle route ne détient.

**Leçons :**
1. **Chercher ce qu'une unité EXIGE avant de chercher qui l'expose.** Le verrou était double :
   sa classe d'accueil (dépendances) et son paramètre (`Message` Prisma complet, dont elle ne
   lisait que deux champs, et qu'un appelant légitime ne construit pas). Une signature qui
   demande plus que ce qu'elle lit est un verrou aussi solide qu'un `private`. Corollaire de
   méthode : lire le CORPS pour établir la liste réelle des champs lus, puis ramener le
   paramètre à cette liste — c'est ce qui rend l'unité appelable par construction.
2. **Un docstring qui compte ses appelants (« les DEUX émetteurs ») est un invariant daté.**
   Le chiffre était juste quand il a été écrit et faux depuis qu'un troisième transport existe.
   Un dénombrement dans un commentaire ne se met pas à jour tout seul : le lire comme une
   affirmation à vérifier, pas comme une description.
3. **Un prédicat de présence se juge contre la clé sous laquelle la carte a été REMPLIE.**
   `!!p.userId && connectedUsers.has(p.userId)` se lit comme prudent ; il est en fait
   impossible à satisfaire pour un anonyme, que `AuthHandler._registerUser` indexe sous son
   `Participant.id`. Rien dans le prédicat ne le signale — il faut aller lire l'écrivain de la
   Map. Règle : devant tout `map.has(x)`, remonter à l'unique site qui fait `map.set(...)` et
   comparer les clés, population par population.
4. **Un numérateur et son dénominateur doivent être énumérés par la MÊME clé.**
   `getLatestMessageSummary` comptait `totalMembers` par `Participant.id` (anonymes inclus) et
   ne pouvait alimenter `deliveredCount` que pour des `User.id`. Un rapport dont les deux
   termes n'ont pas la même population ne dégrade pas : il devient inatteignable. Quand un
   ratio produit (« remis à tous », « lu par tous ») semble bloqué, comparer d'abord les clés
   d'énumération des deux termes, avant de chercher un événement manquant.
5. **Une remarque entre parenthèses dans « reste ouvert » peut porter le vrai sujet.** Le cycle
   18 nommait le câblage manquant et signalait l'exclusion des anonymes en aparté, « le câblage
   devra décider si c'est voulu ». Câbler sans corriger aurait livré un accusé structurellement
   incapable d'acquitter quoi que ce soit sur les conversations concernées. Règle : traiter
   chaque parenthèse d'un « reste ouvert » comme un point à instruire au même titre que la
   ligne principale — celui qui l'a écrite n'avait pas fini de la vérifier.
