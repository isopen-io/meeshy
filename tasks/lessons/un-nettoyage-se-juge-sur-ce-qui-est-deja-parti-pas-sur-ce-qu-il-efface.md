## Un nettoyage se juge sur ce qui est DÉJÀ PARTI, pas sur ce qu'il efface (cycle 188, #19956)

#19956 a fait d'un échec de liaison de pièces jointes un échec d'ENVOI :
libérer les pièces, supprimer la ligne `Message`, propager. L'audit adversarial
a rendu BLOQUANT, et les deux constats décisifs tiennent.

### 1. La propriété qui fonde un nettoyage n'est pas « qui a écrit » mais « qui a FINI »

`associateAttachmentsToMessage` écrit une pièce par requête sous
`Promise.all` — **qui rejette à la première erreur en laissant les autres EN
VOL.** L'appelant repartait donc nettoyer pendant qu'elles volaient. La
libération remet `messageId` à `null`, ce qui satisfait de nouveau le `where`
d'une retardataire (`unsetOrNull`) : elle re-liait sa pièce au message qu'on
supprimait. Cascade `onDelete: Cascade` (émulée côté client sur MongoDB) ⇒
pièce **détruite** si l'écriture atterrit avant, **inéligible au rejeu à
jamais** si elle atterrit après. Soit l'état exact que le lot promettait
d'éliminer.

> J'avais lu la bonne chose — « une pièce par requête », c'est ce qui JUSTIFIE
> la libération — et pas la ligne au-dessus, qui dit comment la boucle
> ABANDONNE. **`Promise.all` ne tient pas les promesses qu'il n'attend plus.**
> Devant tout nettoyage qui suit un échec, demander : *l'opération que je
> nettoie a-t-elle encore des écritures en vol ?* `Promise.allSettled` puis
> propagation de la première erreur garde le contrat et rend le nettoyage sûr.

### 2. « Que reste-t-il de FAIT que ce nettoyage ne défait pas ? »

Sur le chemin libsignal par appareil (hybride + `deviceLayerRelay`, admis AVEC
des pièces jointes — `assertNoPlaintextPieces` ne garde que l'e2ee PUR), les
`MessageEnvelope` sont écrites avec la ligne **puis DIFFUSÉES**, à l'étape 3,
avant la liaison. Elles ne déclarent qu'un `messageId` nu, sans `@relation` :
aucune cascade ne les emporte. « L'envoi échoue » était donc **faux sur le
fil** — le chiffré était déjà chez le destinataire, et le rejeu en livrait un
second jeu pour le même clair.

> C'est la question du cycle 125 posée à un ABANDON plutôt qu'à une protection,
> et **la réponse ne se trouve pas en lisant la fonction qu'on corrige** : elle
> se trouve en lisant ce que les ÉTAPES PRÉCÉDENTES ont écrit ET ÉMIS. Un
> `delete` sur une ligne n'est pas un abandon ; c'est un abandon seulement si
> rien de ce qui pendait à elle n'a de vie propre, et sur MongoDB « pendre »
> n'implique aucune cascade.

Corollaire d'inventaire : la liste des dix tables qui pendent à un message
vivait dans le purgeur de conversation obsolète. Elle vit maintenant dans un
site unique que les deux consomment. **Neuf de ces tables ne peuvent pas encore
porter de ligne au moment de l'abandon — c'est l'ÉNUMÉRATION qui tient dans le
temps, pas le fait qu'elle soit vide aujourd'hui.**

### 3. Une loi d'échec se vérifie contre TOUS ses appelants, pas contre le nominal

« L'échec fait échouer l'envoi » suppose un appelant qui **REJOUE**. Des trois
producteurs d'`attachmentIds`, `agent-response-bridge` est le seul sans outbox,
sans `clientMessageId` et sans file : il journalise et abandonne. Une
illustration qui ne se lie pas ne coûtait que l'illustration ; elle aurait
coûté la RÉPONSE ENTIÈRE de l'agent, texte compris, que personne n'aurait
redemandée.

> Deux appelants rejouent, un non — et c'est celui-là qui décide si la loi est
> une amélioration ou une régression. **Avant de rendre un échec bruyant,
> énumérer qui l'ENTEND, et ce que chacun en fait.**

### 4. Et la faute de méthode, commise dans le lot qui prêche contre elle

Le témoin `« ne masque pas l'erreur d'origine quand la suppression échoue »`
**ne pouvait pas tomber** : la fonction ne REÇOIT pas l'erreur d'origine.
L'intitulé nommait une propriété que rien dans le corps n'observait — la faute
exacte du cycle 187, rejouée à vingt lignes de l'endroit où le journal la
raconte.

Et les dix témoins du premier lot **mockaient `AttachmentService`** : aucun ne
pouvait voir la course, puisque le fait qui JUSTIFIE la libération — une
requête par pièce — disparaît dès qu'on double le linker.

> **Un correctif qui s'appuie sur la FORME d'un collaborateur doit être prouvé
> contre le collaborateur RÉEL**, au moins une fois. Doubler ce dont on invoque
> la structure, c'est supposer la prémisse qu'on voulait vérifier.
>
> Et le rempart qui a fonctionné n'est pas la vigilance de celui qui écrit :
> c'est d'avoir fait relire le lot par quelqu'un qui cherchait à le casser.
> **Une règle de méthode ne se transporte pas d'un paragraphe au suivant ; elle
> se réapplique, témoin par témoin.**
