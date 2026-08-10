---
'@meeshy/gateway': patch
---

L'éventail de notification ferme la course que le rappel d'un message ne peut pas fermer seul.

Le cycle précédent fait retirer, au rappel, les notifications qu'un message avait produites — un
`deleteMany` filtré sur `messageId`. Il emporte donc tout ce qui existe à son instant, et rien de ce
qui naît après lui. Or l'éventail de notification du même message COURT CONTRE lui : une ligne créée
après ce balayage survit, avec la copie de l'extrait que `createNotification` dénormalise, et
qu'aucun filtre à la lecture ne rattrape.

La piste inscrite au cycle précédent — une garde d'admission en tête d'éventail — RÉTRÉCIT la
fenêtre sans la fermer : `deletedAt` peut être committé entre la relecture et la création. C'est
exactement le trou que porte déjà la garde de `createMessageNotification`, et c'est pourquoi
`createReplyNotification` et `createMentionNotificationsBatch` n'ont pas reçu la même.

Le geste qui ferme est à l'autre bout : une relecture de `deletedAt` APRÈS l'éventail. Soit D
l'instant du commit de `deletedAt`, X celui du `deleteMany` du rappel (X > D — les effets tournent
après le commit), [c1..cn] les créations de l'éventail et R sa relecture finale. Si X > cn, le rappel
voit toutes les lignes ; si X < cn, alors D < X < cn < R et la relecture lit `deletedAt`, donc
l'éventail retire lui-même. Aucun troisième cas.

Placée après le compte rendu, elle ne coûte rien au chemin de latence du push — les notifications
sont déjà parties — là où une garde d'admission aurait allongé TOUS les envois d'un aller-retour.
Elle n'est payée que par un éventail qui visait au moins un destinataire.

Le retrait lui-même passe dans une unité partagée, `retractMessageNotifications`, que les DEUX bouts
appellent : deux copies du même geste auraient divergé comme les listes d'effets de suppression
avaient divergé avant `applyMessageRemovalEffects`.
