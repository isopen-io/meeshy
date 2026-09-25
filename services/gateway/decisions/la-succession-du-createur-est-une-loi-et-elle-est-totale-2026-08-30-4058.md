## La succession du créateur est UNE loi, et elle est totale (2026-08-30, #4058)

**Décision porteur du 2026-08-28** : « si créateur parti, **le premier à avoir
été admin devient créateur** ». Les quatre questions restées ouvertes sont
tranchées ici, et la règle tient en trois lignes :

1. les **administrateurs actifs**, classés par **instant de promotion** ;
2. à défaut d'administrateur, le **membre actif le plus ancien** ;
3. à défaut de membre éligible, la **clôture** de la conversation.

Site UNIQUE : `services/conversations/creatorSuccession.ts` — `elireSuccesseur`
(la loi, PURE, tombante sans base de données) et `resoudreSuccessionDuCreateur`
(la lecture, puis la loi) —, lu par les deux portes qui posaient chacune sa
version. Elles ne divergeaient pas d'un détail : `delete-for-me.ts` élisait un
**modérateur** avant un administrateur — l'ordre des rangs y était INVERSÉ —
pendant que `leave.ts` **refusait** le départ (400, « transférez l'ownership ou
supprimez »). Le même geste rendait donc deux réponses opposées selon le bouton
pressé.

**L'instant de promotion se lit dans `Notification`**, la seule trace datée d'un
changement de rang : `Participant` n'en porte aucune. Cette écriture n'a aucune
garde de sourdine — contrairement à `member_left` et consorts — donc la trace
existe même pour qui a mis la conversation en sourdine.

**Ce qui décide est `metadata.newRole`, PAS le `type` de la ligne.** Le type est
dérivé d'une table `roleHierarchy` en MAJUSCULES comparée à un `previousRole`
que l'appelant passe tel qu'il est en base — en minuscules : une rétrogradation
`admin → MODERATOR` s'étiquette donc `member_promoted`. C'est la leçon #4008
appliquée un cran plus haut — la casse y décide de l'ÉTIQUETTE, et l'étiquette
aurait décidé de l'héritage. Les trois types sont acceptés, `newRole` tranche.

**Le repli est `joinedAt`, et c'est ce qui rend la règle totale.** Une
participation créée DÉJÀ administrateur (seed, ajout direct) n'écrit aucune
notification : cet administrateur-là l'EST depuis son arrivée, donc son
`joinedAt` **est** son instant de promotion. Conséquence recherchée : la
succession ne dépend plus d'une table effaçable en bloc (`DELETE /notifications`
fait un `deleteMany({})` global) — une table vidée DÉGRADE la succession vers
l'ancienneté d'appartenance, elle ne la casse pas. C'est la réponse à la
quatrième question de #4058 : une règle qui ne peut pas échouer n'a pas de
source de vérité à protéger.

**Hériter demande un compte.** Un participant sans `userId` — un visiteur venu
par un lien de partage — n'est pas éligible. Gouverner un fil (fermer, bannir,
promouvoir) depuis une session qui expire, et sans ligne `User` à qui l'imputer,
n'est pas une succession : c'est une conversation laissée sans gouvernance sous
couvert d'en avoir une. Le filtre vit dans la loi PURE, pas seulement dans le
`where` : une porte qui remettrait ses propres candidats ne doit pas pouvoir le
contourner.

**Le DM jamais utilisé se ferme au lieu de se transmettre** — règle qui vivait
dans `delete-for-me.ts` seul, donc `leave.ts` transmettait ce que sa jumelle
fermait. Elle appartient à la loi, pas à la porte.

**Ce n'est PAS une question d'autorité.** `utils/conversation-authority.ts`
(#3892) dit qu'un ADMIN ou BIGBOSS de la plateforme, une fois membre, agit avec
les droits du créateur. C'est le voisin d'apparence interchangeable :
`effectiveConversationRole` répond « ce geste est-il permis ? », jamais « qui
hérite ? ». Un administrateur de plateforme simple membre n'a pas été
administrateur DE CE FIL, seul rang que la décision porteur classe.

**Les deux lectures sont BORNÉES** (#4165) et la trace est cadrée sur la
conversation par la BASE : sans ce filtre, la requête ramenait tout l'historique
de rang des comptes candidats sur TOUS leurs fils pour n'en garder qu'une
poignée.
