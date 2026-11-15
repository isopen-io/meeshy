## Leçon 74 — un champ « contexte d'affichage » déjà consommé par les clients n'est PAS une donnée oubliée en route (2026-08-10, routine messaging, cycle 53)

Audit du cœur temps-réel TS. Le cycle précédent venait de brancher les quatre producteurs ancrés
sur un message pour qu'ils héritent de `Message.expiresAt`. La story étant le contenu éphémère
canonique, la symétrie sautait aux yeux : **six** producteurs reçoivent déjà `postExpiresAt` de
leurs appelants et le déposent dans `context.postExpiresAt` — une ligne au-dessus de la colonne
`Notification.expiresAt` que les sept lectures d'inbox honorent. Toute la forme du défaut jumeau
était là : « l'échéance arrive au producteur et s'arrête juste avant la colonne ».

**C'était faux.** `context.postExpiresAt` est une fonctionnalité livrée sur les DEUX clients : le
web en tire « · expirée » (`notification-helpers.ts`), iOS en tire `expiryLabel` et
`isLinkedContentExpired`. Le produit montre délibérément la notification d'une story périmée,
marquée. Estampiller la colonne l'aurait masquée côté serveur et rendu mort le code des deux
clients. Le vrai défaut était sept jours plus loin et d'un cran plus sévère : le **hard-delete** du
balayage, seul chemin de destruction de post du gateway — que le backlog du cycle 52 nommait
correctement, et que la relecture « plus élégante » avait déplacé.

**Leçons :**

1. **Avant de déplacer une donnée d'un champ vers un autre, chercher qui LIT le champ de départ —
   chez les clients, pas seulement dans le service.** Un `context.<clé>` a un consommateur par
   définition : c'est ce que le mot « contexte » veut dire dans ce modèle. Le grep qui tranche
   traverse `apps/web` et `packages/MeeshySDK`, pas `services/`. Une symétrie qui se vérifie
   entièrement côté serveur peut être fausse pour une raison qui ne vit que côté client.
2. **Deux entités éphémères ne se ressemblent pas parce qu'elles ont toutes deux un `expiresAt`.**
   Ce qui décide, c'est ce que la ligne MONTRE et ce que sa cible RÉPOND. La notification de message
   ne porte qu'un libellé générique et sa cible est détruite à l'échéance → masquer. Celle de story
   porte un vrai extrait, un acteur, une vignette, et `getPostById` ne filtre pas l'expiration →
   montrer, marqué. La forme du schéma suggère la symétrie ; seule la donnée la confirme ou la
   réfute.
3. **Une piste héritée peut être fausse sur un MOT et vraie sur le reste.** « Les stories expirées
   ne retirent pas leurs notifications » : *expirées* est faux, *ne retirent pas* est vrai. Réfuter
   une piste n'est pas la jeter — c'est trouver lequel de ses mots ne tient pas. Et quand la
   relecture « améliore » l'énoncé d'origine, se demander laquelle des deux versions a lu le code.
4. **La règle qu'on croit devoir inventer est souvent écrite trois lignes plus bas, pour son
   voisin.** La passe portait déjà, au-dessus de `releasePosts`, l'exigence exacte du cas :
   « placé AVANT les suppressions, et il REJETTE volontairement — ni relation ni cascade, donc
   supprimer après un échec laisserait des lignes que plus aucun chemin n'atteindrait ».
   `context.postId` a la même forme que `SoundUsage.postId`. Avant d'arbitrer un ordre ou un
   contrat d'erreur, lire les effets VOISINS du même bloc : ils ont déjà tranché la même question.
5. **Un plafond change de sens quand l'entrée change de nature.** Le plafond de drainage était un
   garde-fou anti-boucle tant que l'entrée était UN post. L'entrée devenue « une heure
   d'expirations de toute la plateforme », le même plafond devient atteignable — et l'avertissement
   qui suffisait devient un silence qui orpheline. Élargir une signature oblige à relire ses bornes,
   pas seulement son corps.
