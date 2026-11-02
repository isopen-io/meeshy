/**
 * Les refus LOCAUX de l'envoi chiffré de bout en bout par le navigateur
 * (#14592). Statut 0, comme le refus d'un clair (`E2EE_PLAINTEXT_WITHHELD`) :
 * rien n'est parti, et ce n'est pas une coupure. Ce module est sans dépendance
 * pour que le fil (`send/failure-reason.ts`, `view/use-send.ts`) les lise sans
 * tirer la pile chargée à la demande.
 */
export const E2EE_ATTACHMENTS_NOT_YET = 'E2EE_ATTACHMENTS_NOT_YET';
export const E2EE_PEER_NOT_ENROLLED = 'E2EE_PEER_NOT_ENROLLED';
export const E2EE_WEB_UNAVAILABLE = 'E2EE_WEB_UNAVAILABLE';
