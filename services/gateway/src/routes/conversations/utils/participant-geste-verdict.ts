/**
 * **Ce qu'un NOYAU de geste de participant rend** — un verdict, jamais une
 * réponse HTTP (#4713).
 *
 * Les quatre gestes de gestion d'un participant (`rights`, `role`, `ban`,
 * `unban`) avaient chacun leur travail ENFERMÉ dans un gestionnaire Fastify :
 * lire la conversation, opposer l'autorité, écrire, diffuser et composer la
 * réponse se succédaient dans une seule fermeture, à laquelle on n'accédait
 * qu'en montant un serveur. Rien de ce qui DÉCIDE n'était appelable.
 *
 * Le patron retenu est celui de `chargerPostsProches`
 * (`routes/posts/nearby.ts`, #4346) : le noyau fait le travail et rend une
 * valeur ; le gestionnaire garde le schéma, l'authentification et la
 * TRADUCTION de cette valeur en réponse. Ce qui change ici, c'est qu'un geste
 * de gestion peut REFUSER, et que ses refus ne se disent pas tous pareil —
 * d'où un type SOMME plutôt qu'un simple retour.
 *
 * ─── Pourquoi le statut plutôt qu'un nom de refus ───────────────────────────
 *
 * Le verdict porte le STATUT que la route servait déjà, et non une étiquette
 * (`'introuvable'`, `'interdit'`) qu'il faudrait re-traduire. Onze appelants de
 * production lisent ces codes ; le statut est donc le fait, et le noyau n'a
 * aucune raison de le paraphraser pour qu'une table le rétablisse ensuite —
 * une table de plus est une occasion de plus de diverger.
 *
 * ─── `code` ABSENT, jamais `undefined` ──────────────────────────────────────
 *
 * `sendForbidden(reply, msg)` et `sendForbidden(reply, msg, { code })` ne sont
 * pas le même appel : leur ARITÉ diffère, et plusieurs suites du dépôt
 * l'observent (`toHaveBeenCalledWith(reply, msg)` échoue sur trois arguments).
 * Le constructeur ci-dessous n'ajoute donc la clé que lorsqu'un code existe, et
 * `repondreAuRefus` reproduit les deux formes d'appel telles quelles.
 */

/** Les trois refus que les quatre gestes savent produire, aujourd'hui. */
export type StatutDeRefus = 400 | 403 | 404;

export type RefusDeGeste = {
  readonly genre: 'refus';
  readonly statut: StatutDeRefus;
  readonly message: string;
  /** Le code machine que la route servait — ABSENT quand elle n'en servait pas. */
  readonly code?: string;
};

export type AccordDeGeste<T> = {
  readonly genre: 'ok';
  readonly donnees: T;
};

export type VerdictDeGeste<T> = AccordDeGeste<T> | RefusDeGeste;

export const refuser = (
  statut: StatutDeRefus,
  message: string,
  code?: string,
): RefusDeGeste =>
  code === undefined
    ? { genre: 'refus', statut, message }
    : { genre: 'refus', statut, message, code };

export const accorder = <T>(donnees: T): AccordDeGeste<T> => ({ genre: 'ok', donnees });
