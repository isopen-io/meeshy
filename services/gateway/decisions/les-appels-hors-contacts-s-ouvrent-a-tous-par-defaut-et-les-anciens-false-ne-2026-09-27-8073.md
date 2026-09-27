## 2026-09-27 : « Appels hors contacts » est ouvert à tous par défaut, et les anciens `false` ne ferment rien (#8073)

**Statut** : Accepté, en attente de la confirmation du porteur (recommandation retenue en attendant)

**Contexte** : la porte de sonnerie (`services/calls/callRingPolicy.ts`) lit la préférence de confidentialité « Appels hors contacts ». Sous son premier nom, `privacy.allowCallsFromNonContacts`, son défaut était `false` partout : schéma partagé, SDK, écrans. Ce défaut n'avait jamais rien gouverné, parce qu'aucune porte ne le lisait. L'appliquer tel quel aurait retiré à tous les utilisateurs, du jour au lendemain, la sonnerie de quiconque n'est pas un ami accepté.

Les `false` déjà enregistrés ne sont pas des choix. La bascule iOS était grisée (« Bientôt disponible »), et `UserPreferencesManager` synchronise le bloc `privacy` ENTIER. Chaque réglage de confidentialité touché sur iOS a donc écrit `allowCallsFromNonContacts: false`, le défaut du SDK, dans `user_preferences.privacy` (JSON, sans colonne Prisma).

Il y a un second mécanisme, que le seul défaut ne ferme pas. Les applications iOS déjà publiées gardent `false` comme défaut dans leur SDK. Elles réécriraient donc ce `false` à chaque synchronisation du bloc, à chaque « réinitialiser » et à chaque synchronisation en attente rejouée, même après une migration.

**Décision** :
- La clé qui gouverne la porte change de nom : `acceptCallsFromNonContacts`, défaut `true` (schéma partagé, `PRIVACY_PREFERENCE_DEFAULTS`, défauts de la passerelle, SDK Swift, web). Préférence absente ⇒ tout le monde peut faire sonner. Seul un utilisateur qui coupe explicitement le réglage ne sonne plus que pour ses amis acceptés.
- L'ancienne clé `allowCallsFromNonContacts` est **retirée de toute lecture**. Elle reste déclarée `z.boolean().optional()` pour une seule raison : les écritures de préférences valident en `.strict()`, et les applications publiées la soumettent dans chaque bloc `privacy`. La retirer du schéma ferait échouer en 400 toute synchronisation de confidentialité de ces clients.
- Aucune migration de données. Les lignes existantes gardent leur ancien `false`, que plus rien ne lit.

**Alternatives rejetées** :
- **Migration unique (`$unset` ou `$set: true` sur l'ancienne clé)** : elle nettoie les lignes une fois, mais les applications publiées réécrivent `false` dès leur synchronisation suivante. Le défaut reviendrait dans la base sans que personne l'ait choisi. Rejouée plus tard, elle effacerait aussi le choix réel de qui aurait coupé le réglage entre-temps.
- **N'honorer un `false` que s'il porte une marque de choix** : une ancienne application qui soumet le bloc entier ferait poser la marque au même titre qu'un vrai geste. La marque ne distinguerait rien.
- **Retirer l'ancienne clé du schéma** : la validation stricte refuserait toute synchronisation de confidentialité des applications publiées, ce qui est une régression plus large que le défaut corrigé.

**Conséquences** :
- Les applications iOS publiées ne peuvent plus fermer la porte, puisque leur bascule était grisée. Le réglage s'active avec la version qui envoie `acceptCallsFromNonContacts`.
- Le miroir Kotlin (gelé) lit et écrit encore l'ancienne clé. Sa bascule n'a donc aucun effet sur la porte, et c'est consigné, pas soldé.
- Les lignes héritées portent une clé morte. Une purge (`$unset` de `privacy.allowCallsFromNonContacts`) pourra se faire quand plus aucun client publié ne l'écrira. Elle serait inoffensive aujourd'hui mais sans effet utile.

**Tests** :
- Partagé : le défaut est ouvert ; l'ancienne clé passe la validation stricte sans rien fermer.
- Passerelle (`callRingPolicy.test.ts`) : une préférence absente fait sonner un non-contact ; un ancien `allowCallsFromNonContacts: false` fait sonner.
- SDK : un décodage sans la clé accepte les appels ; l'ancienne clé est ignorée et n'est plus jamais émise.
- Web : le défaut servi est ouvert.
