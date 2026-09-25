## Le transfert d'un contenu éphémère ou à vue unique — refuser d'un côté, propager de l'autre

**Contexte** : transférer un message crée une ligne `Message` INDÉPENDANTE. `forwardedFromId` ne
pointe que vers l'origine, il ne transporte aucun état : la copie naissait sans `expiresAt`, sans
`isViewOnce` et sans le bit `EPHEMERAL`. Le balayage du cycle 92 détruisait donc l'original à
l'heure dite pendant que la copie, faite deux secondes après réception, restait lisible pour
toujours dans une autre conversation. Aucun garde ne s'y opposait à aucun des trois transports
d'envoi (REST, socket texte, socket pièces jointes), et `MessageActionResolver` (iOS) propose
`.forward` INCONDITIONNELLEMENT — contrairement aux deux défauts précédents de la même veine,
celui-ci ne demandait pas un client modifié : un appui long suffisait.

**Décision** : un garde unique, `admitMessageForward` (`services/messaging/forwardAdmission.ts`),
appelé depuis `MessagingService.handleMessage` — le seul point où les trois transports convergent
avant l'écriture. Il répond différemment aux deux promesses, et la différence est forcée, pas
choisie :

- **Éphémère → propager.** La copie hérite de la DURÉE de l'original (`expiresAt − createdAt`),
  recomptée depuis l'envoi du transfert. Le compte repart de zéro parce que les nouveaux
  destinataires n'ont rien vu : leur servir les 3 secondes résiduelles d'un minuteur de 24 h ne
  voudrait rien dire. La propriété est TRANSITIVE sans code dédié — la copie est à son tour une
  source éphémère bien formée.
- **Vue unique → refuser.** Propager ne fermerait rien : `viewOnceCount` repart à zéro sur la ligne
  neuve, donc se transférer à soi-même une photo à vue unique rendrait un budget de vues neuf,
  autant de fois que voulu. Seul le refus tient la promesse. C'est aussi ce que font WhatsApp et
  Signal, qui interdisent l'un comme l'autre le transfert d'un contenu à vue unique.

**Alternatives rejetées** :
- **Lire `Message.ephemeralDuration`**, qui dit exactement ce qu'il faudrait : le champ est ÉCRIT
  PAR PERSONNE (aucun transport ne le transmet, `saveMessage` ne le range pas) et vaut `null` sur
  toute la collection. S'y fier aurait rendu le garde inopérant en silence.
- **Un garde par route** : quatrième copie d'une règle de permission, exactement la maladie que
  `messageEditAdmission` soigne.
- **Refuser aussi le transfert de l'éphémère** : plus simple, mais ferme une fonctionnalité que ni
  WhatsApp ni Signal ne ferment, alors que la propagation suffit à tenir la promesse.

**Conséquences** :
- Une source introuvable ou une lecture qui échoue n'interrompt PAS l'envoi : le transfert dégénère
  en message ordinaire (comportement d'avant, ne fuit rien de plus). Transformer un envoi en erreur
  parce que la base a hoqueté coûterait plus que ce que ce garde protège.
- Le refus remonte en `success: false` par `createErrorResponse`, sur les trois transports. Les
  clients affichent l'erreur ; **aucun ne masque encore `.forward` sur un message à vue unique** —
  l'UX reste une action offerte puis refusée. Suivi iOS ouvert (`MessageActionResolver` : ajouter
  `isViewOnce` à `MessageMenuContext` et filtrer `.forward`/`.share`).
- Dette ANTÉRIEURE rendue plus visible, non traitée ici : `copyForwardedAttachments` copie
  `filePath` VERBATIM, donc la copie et l'original partagent le fichier sur disque. La destruction
  de l'original (`deleteAttachment` → `fs.unlink`) emporte donc le média de la copie avant sa propre
  échéance. Le défaut préexiste (la copie perdait déjà son fichier quand elle était permanente) et
  ne fuit rien — il dégrade. Le fermer demanderait de dupliquer l'octet ou de compter les
  références.
