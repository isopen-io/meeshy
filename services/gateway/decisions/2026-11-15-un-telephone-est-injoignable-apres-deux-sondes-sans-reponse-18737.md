## 2026-11-15 : un téléphone est injoignable après deux sondes silencieuses restées sans réponse

**Statut** : Accepté le 2026-11-15 (#18737, TEL-01 du catalogue `docs/specs/cercles/etat-du-telephone.md`). Suit la forme de la batterie (#14147) et réutilise son téléphone suivi.

**Contexte** : le catalogue demande « Le téléphone de Jacques est injoignable depuis 14:10 », avec la cause probable, « déclenché quand la socket tombe et que deux push ne sont pas distribués ». Deux faits rendent la phrase littérale inapplicable :

1. **Une socket iOS tombe à chaque passage en arrière-plan.** Une socket fermée est l'état NORMAL d'un iPhone dans une poche : elle ne dit rien de la joignabilité.
2. **APNs et FCM ne disent pas qu'un push a été distribué**, seulement qu'ils l'ont accepté. Le seul accusé de distribution du dépôt (`PushDeliveryReceiptService`) est celui des messages.

**Décision** :

1. **Le signe de vie.** Le téléphone SUIVI — la session de téléphone la plus récemment active, celle de la batterie, sans son repli : un compte sans téléphone reconnu n'a rien à surveiller (`isTrackedPhone`) — remet son horloge à zéro par une socket authentifiée, un relevé de batterie, ou la réponse à une sonde (`POST /me/device/alive`). Un ordinateur ou une tablette ne disent rien du téléphone.
2. **La sonde est le « push distribué ».** Après 10 min sans signe de vie, la passerelle envoie un push SILENCIEUX (`data.type = device_probe`, aucun titre, aucun nom) ; le téléphone qui le reçoit répond. Une sonde sans réponse en 10 min déclenche la seconde ; la seconde sans réponse rend le téléphone **injoignable depuis son dernier signe de vie**. Un téléphone dont la socket est ouverte n'est jamais sondé : le balayage la vérifie avant chaque sonde.
3. **Le budget des pushs silencieux.** iOS bride les pushs `content-available` : un téléphone sondé toutes les dix minutes finirait par ne plus répondre, et serait déclaré injoignable à tort. Une sonde à laquelle le téléphone a RÉPONDU espace donc la suivante d'une heure (`reprobeAfterMinutes`). Le prix : un téléphone qui se perd juste après avoir répondu est déclaré au plus tard 1 h 20 après, mais toujours « depuis » son vrai dernier signe de vie.
4. **La cause probable** est `battery` quand le dernier épisode de batterie connu était critique ou éteint, `network` sinon. Le serveur ne distingue pas « sans réseau » de « mode avion » : l'interface dit les deux, et le mot « probablement ».
5. **L'accès** : `device.unreachable` = Proche dans la matrice, consentement de l'émetteur tri-état (`unreachableShared`, résolu par `resolveEmitterConsent`) — accordé par défaut entre Sangs et entre comptes de l'équipe (#16623), accord donné une fois entre Proches ; la coupure globale (`unreachableSharingDisabledAt`) est le fantôme : elle ferme aussi la collecte, et le téléphone n'est plus sondé. Un émetteur sans aucun lecteur possible n'est jamais sondé.
6. **Le signal** : `phone:unreachable` / `phone:reachable` dans `user:<lecteur>`, l'annonce seulement quand le lecteur est en conversation (SyncPill) ; hors conversation, un push `device_unreachable` (préférence `deviceUnreachableEnabled`). Le retour n'est poussé qu'à qui a reçu le push d'injoignabilité. Jamais un message de conversation. L'heure exacte est rendue par l'app, dans le fuseau du lecteur ; le push dit « depuis N min ».
7. **Aucun historique** : l'horloge vit 72 h dans Redis, scellée et liée au compte ; la notification expire avec elle et se retire chez qui perd l'accès.

**Alternatives rejetées** :
- *Déclarer injoignable à la chute de la socket* : faux positif à chaque mise en poche.
- *Un accusé de distribution sur un push visible* : il réveillerait le lecteur de l'émetteur pour rien, et l'accusé n'arrive que si l'app s'exécute — c'est la sonde silencieuse, avec une bannière en plus.
- *Sonder en continu* : brûle le budget iOS et rend le signal faux là où il compte.

8. **Un téléphone n'est déclaré qu'une fois PROUVÉ** : une version de l'app antérieure aux sondes les ignore, et la déclarer injoignable serait faux à chaque mise en poche (production rétrocompatible, #9223). Tant que le téléphone n'a jamais répondu à une sonde, deux sondes sans réponse ne déclarent rien : il est re-sondé une fois par heure, en silence, et sa première réponse le rend éligible (`stepUnproven`, `packages/shared/utils/phone-reachability.ts`).

**Conséquences** : la fonctionnalité s'allume d'elle-même pour chaque téléphone dès que sa version répond, sans plancher de version ni bascule sèche. Le balayage relit chaque émetteur surveillé à chaque passe : suffisant sous 1 000 utilisateurs, une file triée par échéance le remplacera avant 100 000 (issue de suivi).
