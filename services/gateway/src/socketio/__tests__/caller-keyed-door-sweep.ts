/**
 * **LE BALAYAGE FRÈRE : LES PORTES À CLÉ D'APPELANT** (#20155).
 *
 * Squelette de réservation — l'implémentation suit dans ce même lot.
 *
 * `sweepConversationAudiences` relève les AUDIENCES : « qui reçoit ». Son
 * discriminant écarte DÉLIBÉRÉMENT toute clause qui NOMME une personne
 * (#20100), parce qu'une audience est un ensemble. La conséquence, mesurée en
 * livrant #20135 : **toute PORTE qui résout l'appelant par son propre `userId`
 * est hors de portée du cliquet par construction** — et c'est la forme des
 * trois défauts de sécurité livrés en deux jours (#20104, #20135, #20136).
 *
 * Ce balayage a le discriminant OPPOSÉ. Il ne remplace pas l'autre et ne
 * l'élargit pas : les deux inventaires répondent à deux questions, et les
 * fondre transformerait « pas encore instruit » en « décidé large ».
 */
export const CALLER_KEYED_DOOR_SWEEP_RESERVED = '#20155' as const;
