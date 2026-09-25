## 2026-08-09 (18) — Une piste laissée au cycle suivant est une hypothèse, pas une consigne

Le cycle 17 fermait sur une piste très précise : `TrackingLink` porte un `messageId`, quatre
écrivains suppriment un message, aucun ne bascule `isActive: false`, « nommer la liste ». En la
suivant, le diagnostic tient — et le correctif qu'elle suggère est une **régression**. Désactiver
`where: { messageId }` aurait coupé, dans le cas le plus courant, un lien qu'un autre message
toujours affiché porte encore.

1. **Une piste écrite au cycle N-1 a été formulée par quelqu'un qui n'avait pas ouvert le code du
   correctif.** Elle vaut par la ZONE qu'elle désigne, jamais par le geste qu'elle propose : à
   l'instant où elle a été écrite, seul le défaut était établi. La lire comme une consigne, c'est
   hériter d'une confiance que personne n'a payée. Règle : **reprendre la piste comme une
   hypothèse à réfuter d'abord** — la première demi-heure d'un cycle qui hérite d'une piste va à
   *vérifier que le correctif suggéré est le bon*, pas à l'écrire.
2. **Une colonne qui NOMME une relation ne la porte pas forcément.** `TrackingLink.messageId` se
   lit comme « le message de ce lien ». Ses deux écrivains disent autre chose : l'un filtre
   `messageId: null` (premier arrivé, jamais réécrit), l'autre écrase sans garde (dernier arrivé).
   Une même ligne étant réutilisée par plusieurs messages (`findExistingTrackingLink` la rend à
   toute la conversation), la colonne est une **trace de passage**, pas une appartenance. Avant de
   décider sur une colonne de relation, **lire ses écrivains, pas son nom** : deux écrivains aux
   politiques opposées sur le même champ prouvent à eux seuls qu'il ne modélise rien d'exclusif.
3. **Quand une relation est reconstituée depuis deux index dérivés, il faut lire les deux.** Un
   token vit soit dans le contenu réécrit (`m+<token>`, chemin des syntaxes explicites), soit dans
   `metadata.trackingLinks` (chemin des URLs brutes) — jamais les deux, parce que les deux chemins
   de minting n'écrivent pas au même endroit. Un décompte qui n'en lit qu'un est faux pour la
   moitié des liens, silencieusement.
4. **Choisir le sens dans lequel une heuristique a le droit de se tromper.** Le préfiltre Mongo est
   volontairement TROP LARGE et l'exactitude est refaite en JS ; à la panne, le lien reste ACTIF.
   Les deux décisions vont dans le même sens : couper à tort casse un message vivant et rien ne le
   rouvre, ne pas couper ne coûte qu'un clic compté en trop. **Avant d'écrire un best-effort,
   nommer laquelle des deux erreurs est réparable** — et faire pencher le code de ce côté-là.
5. **Une file `mockResolvedValueOnce` dimensionnée sur le nombre d'appels d'un handler couple le
   test à sa structure interne.** Deux tests ont échoué non par assertion mais par FUITE : un
   `Once` non consommé (le correctif ayant déplacé un appel) contaminait le test suivant, qui
   recevait un `null` destiné à son prédécesseur et rendait 404 au lieu de 200 — un symptôme qui ne
   désigne pas sa cause. Quand un test casse dans un fichier qu'on n'a pas touché, **soupçonner la
   file de mocks du test PRÉCÉDENT** avant de soupçonner le correctif.

**Piste pour le cycle suivant** — troisième colonne de la table de divergence, laissée ouverte en
connaissance de cause : `conversationMessageStatsService.onMessageDeleted` n'est appelé que par
`DELETE /conversations/:id/messages/:messageId`. Les deux autres chemins de suppression ne
décrémentent aucun compteur : les statistiques de conversation dérivent à chaque message supprimé
depuis le composer web ou depuis `DELETE /messages/:id`. Ne PAS l'ajouter en passant — la méthode
exige du message des informations que les deux autres routes ne lisent pas (types MIME des pièces
jointes, `messageType`, contenu), et c'est un service de compteurs dont il faut d'abord vérifier
les semantiques d'incrément/décrément avant de les diffuser à trois appelants. Appliquer la
leçon 1 à cette piste-ci : la vérifier avant de l'écrire.


---

# Cycle 45b — Un vert local ne dit rien sur l'arbre poussé
