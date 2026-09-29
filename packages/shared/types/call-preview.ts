import { z } from 'zod';

/**
 * L'APERÇU AVANT DÉCROCHÉ (#8480) — l'appelé voit l'appelant, et l'entend s'il
 * le choisit, pendant que l'appel sonne.
 *
 * Un canal DISTINCT de `call:signal`, et c'est ce qui le rend sûr : un `answer`
 * sur `call:signal` décroche l'appel (sonnerie coupée, « répondu ailleurs »),
 * et l'appelé n'y est pas encore participant. Ici rien ne décroche. L'appelé
 * DEMANDE l'aperçu ; l'appelant ouvre un lien en ENVOI SEUL ; l'appelé répond
 * en RÉCEPTION SEULE — son micro et sa caméra ne partent jamais avant
 * `call:join`. La passerelle ne relaie qu'entre l'initiateur d'un appel 1:1
 * qui SONNE et le membre qui l'entend sonner.
 *
 * Le signal lui-même a la forme de `CallSignalEvent` (offre, réponse,
 * candidat), validée par le même schéma côté passerelle.
 */

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/);

/** Client (l'appelé) → serveur : « montre-moi qui m'appelle ». */
export const callPreviewRequestSchema = z.object({ callId: objectId }).strict();

export type CallPreviewRequestEvent = z.infer<typeof callPreviewRequestSchema>;

/** Serveur → l'initiateur : `userId` voit l'appel sonner et demande l'aperçu. */
export type CallPreviewRequestedEvent = {
  readonly callId: string;
  readonly userId: string;
};
