---
'@meeshy/gateway': patch
'@meeshy/shared': patch
---

Une notification ne survit plus au message éphémère qu'elle annonce.

`createMessageNotification` refuse déjà de créer une notification pour un message DÉJÀ expiré. Rien
ne disait ce qu'il advient de celle qui est créée AVANT l'expiration : le message éphémère disparaît
quelques minutes plus tard, la ligne reste. Elle ne montre rien (l'extrait d'un message protégé est
déjà un libellé générique), elle ne mène nulle part (`action: view_message` ouvre un message absent),
et son badge non lu ne peut plus être décrémenté par une lecture — on ne lit pas ce qui n'est plus là.

`Notification.expiresAt` existait pour exactement ça, depuis l'origine du modèle, et le type partagé
le publie jusqu'aux clients (`state.expiresAt`, `isNotificationExpired`). Aucun producteur ne
l'écrivait, aucune lecture ne l'honorait : les deux moitiés d'une même règle, mortes chacune de son
côté. Ce lot les rebranche.

**Producteur.** La notification hérite de l'échéance du message qu'elle désigne — message régulier,
réponse et mention. Le chemin `new_message` la prend de sa propre relecture VIVANTE (celle de la
garde d'admission : aucune lecture ajoutée) ; la réponse et les mentions la reçoivent de l'éventail,
qui la tient déjà, plutôt que de la relire une fois par destinataire. Les deux sources ne peuvent pas
diverger : `Message.expiresAt` est écrit à l'insertion et jamais modifié ensuite.

**Lectures.** Un filtre à la lecture, et non un balayage : contrairement au rappel, la péremption
n'est pas un événement — personne ne passe à l'instant T, et un balayage périodique laisserait
toujours une fenêtre. Le filtre est exact à la milliseconde et ne coûte aucune écriture. Les sept
lectures qui répondent à la même question — liste REST et son total, compte non-lus REST, les deux
compteurs poussés par socket, le badge embarqué dans le push, le digest e-mail — la posent désormais
par une seule unité, `visibleNotificationsWhere`. `emitCountsUpdate` portait déjà en commentaire la
trace d'une divergence passée entre le prédicat du badge et celui de la liste ; sept copies l'auraient
rejouée.

**Index.** `Notification[userId, isRead]` devient `[userId, isRead, expiresAt]` — un remplacement, pas
un index de plus : l'ancienne clé est un préfixe de la nouvelle. Sans `expiresAt` dans l'index, le
filtre force un fetch de document par candidat sur un compteur qui tourne à CHAQUE notification créée,
donc une fois par destinataire de chaque message ; avec, les deux branches du OU restent des plages
d'index et le compte reste couvert. Migration `010_notification_expiry_index.js` pour les bases
existantes (idempotente, crée avant de supprimer).

Ce que ce lot ne fait pas : la ligne expirée reste en base (elle ne porte aucune copie du contenu), et
un badge déjà affiché ne se corrige qu'au prochain recalcul — cohérence à terme, pas immédiate.
