/**
 * **LES BORDS DE L'APPEL, UN SEUL CHUNK** (#17650) — ce que l'écran montre
 * AVANT d'être vivant (la réponse à un appel entrant) et APRÈS (les réponses
 * de l'écran de fin). Ni l'un ni l'autre ne sert un appel connecté : ils
 * quittent `call_overlay` ensemble, et partagent leur bouton rond sans qu'il
 * devienne un chunk de plus.
 */
export { CallIncomingAnswer } from './call-incoming-answer';
export { CallEndedControls } from './call-ended-controls';
