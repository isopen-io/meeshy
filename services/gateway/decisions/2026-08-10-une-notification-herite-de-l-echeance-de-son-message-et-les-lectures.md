## 2026-08-10 : Une notification hérite de l'échéance de son message, et les lectures d'inbox la respectent

**Statut** : Accepté

**Contexte** : `createMessageNotification` porte une garde d'admission qui refuse de créer une notification pour un message déjà expiré. Rien ne couvrait le cas symétrique — la notification créée AVANT l'expiration. Le message éphémère disparaît quelques minutes plus tard ; la ligne `Notification` reste. Elle ne montre rien (`protectedPreview` a déjà remplacé le contenu par un libellé générique à la création — il n'y a donc aucune fuite de contenu, contrairement au cas du rappel), ne mène nulle part (`action: view_message` ouvre un message absent), et porte un badge non lu que plus aucune lecture ne peut décrémenter. `Notification.expiresAt` existait pour exactement ça, jusque dans les types partagés (`isNotificationExpired`, `isNotificationUnread`), mais aucun producteur ne l'écrivait et aucune des sept lectures serveur ne l'honorait.

**Décision** :
- **Producteur** : la notification hérite de `Message.expiresAt` — message régulier, réponse, mention. Le chemin `new_message` la prend de sa relecture VIVANTE (celle de la garde d'admission : aucune lecture ajoutée) ; réponse et mentions la reçoivent de l'éventail via `messageExpiresAt`, celui-ci la tenant déjà dans `FanOutMessage`. Les deux sources ne peuvent pas diverger : `Message.expiresAt` est écrit à l'insertion et jamais modifié ensuite.
- **Lectures** : un prédicat unique, `visibleNotificationsWhere` (`services/notifications/visibleNotificationsWhere.ts`), appelé par les sept lectures qui répondent à la même question — liste REST et son total, compte non-lus REST, les deux compteurs de `emitCountsUpdate`, le badge embarqué dans le push, et les deux lectures du digest e-mail. *(AMENDÉ le 2026-09-21 par la décision D-L1 ci-dessous : le badge du push a quitté cette liste — il ne compte plus des notifications. Les six autres lectures sont inchangées.)*
- **Index** : `Notification[userId, isRead]` → `[userId, isRead, expiresAt]`, plus migration `scripts/migrations/mongodb/010_notification_expiry_index.js` pour les bases existantes.

**Alternatives rejetées** :
- **Un balayage périodique** : la péremption n'est pas un événement — personne ne passe à l'instant T. Un balayage laisserait toujours une fenêtre entre l'expiration et son passage, là où le filtre est exact à la milliseconde et ne coûte aucune écriture.
- **Supprimer la ligne**, comme `retractMessageNotifications` le fait au rappel : ce geste-là est imposé par la copie de l'extrait que la ligne détient. Ici elle ne détient rien, et masquer ne demande aucun déclencheur.
- **Que chaque créateur relise l'échéance du message qu'il désigne** (aucun paramètre nouveau, chemin d'édition fermé au passage) : coûterait une lecture PAR MENTION là où l'éventail tient déjà la valeur — le coût refusé aux cycles 44 et 47.
- **Un index de plus** plutôt qu'un remplacement : inutile, `[userId, isRead]` est un préfixe de la nouvelle clé.

**Conséquences** :
- **Aucune réparation de données.** Les lignes déjà en base portent `expiresAt: null` et empruntent la branche `null` du filtre : visibles exactement comme avant.
- **L'index n'est pas un confort.** Sans `expiresAt` dans la clé, le `$or` devient un filtre résiduel — un fetch de document par candidat — sur `emitCountsUpdate`, qui tourne une fois par destinataire de CHAQUE message. Déployer la migration avant le code : le filtre reste correct sans l'index, seulement plus cher.
- **Ce que la décision n'assure PAS** : la ligne expirée reste en base (un index TTL Mongo serait le balayage naturel, hors portée de `@@index` Prisma) ; un badge déjà affiché ne se corrige qu'au prochain recalcul — cohérence à terme, pas immédiate ; les clients ne s'auto-périment pas (`isNotificationExpired` n'est appelé nulle part).

**Tests** : 11 neufs, sonde en trois temps (filtre neutralisé → 5 rouges ; estampille producteur → 2 ; plomberie de l'éventail → 2). Le double Prisma ÉVALUE les `where` contre des lignes au lieu de les recopier (`__tests__/helpers/notification-where.ts`) et jette sur toute clé qu'il ne sait pas interpréter. Suite gateway complète verte (636 suites, 16176 tests).
