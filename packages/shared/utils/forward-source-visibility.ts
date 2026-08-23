/**
 * Réciprocité de la SOURCE d'un transfert — qui a le droit d'apprendre d'où
 * vient un message transféré.
 *
 * ## La règle (directive produit 2026-08-23)
 *
 * « permet de rendre configurable l'affichage du nom des transferts (si on
 *   permet d'afficher le nom des transferts, toute personne qui l'a permis
 *   aussi verra mes noms de transfert). Si on ne permet pas, je ne verrai pas
 *   le nom d'auteur des transferts et personne ne verra les miens non plus !
 *   La nomination des groupes publics doit suivre aussi. »
 *
 * Deux volontés, un ET : la source n'est servie que si l'AUTEUR du transfert
 * ET son LECTEUR l'autorisent. Un seul refus suffit. C'est la symétrie que les
 * accusés de lecture n'ont pas : ici, qui se cache ne voit pas.
 *
 * ## Le défaut est TRUE, et l'ABSENCE vaut TRUE
 *
 * C'est un opt-OUT : il faut aller désactiver le réglage. Surtout, la
 * production ne joue AUCUNE migration — les documents `UserPreferences.privacy`
 * déjà en base ne portent pas la clé. `allowsForwardSource` traite donc
 * l'absence comme un « oui » et ne refuse que sur un `false` explicite : sans
 * cela, le déploiement masquerait d'un coup la source de tous les transferts du
 * parc, sans que personne l'ait demandé.
 *
 * ## Pourquoi OMETTRE et non MARQUER
 *
 * `withoutForwardSource` RETIRE les deux objets nommants du payload. Marquer
 * (« sourceHidden: true ») laisserait le nom transiter et confierait la
 * discrétion au client : n'importe quel client modifié, ou un simple
 * inspecteur réseau, le lirait. Ce ne serait pas de la confidentialité, ce
 * serait un rideau. Accessoirement, un champ marqueur non déclaré dans
 * `types/api-schemas.ts` serait strippé EN SILENCE par fast-json-stringify.
 *
 * Les identifiants (`forwardedFromId`, `forwardedFromConversationId`) restent :
 * les trois politiques clientes (`ForwardBadgePolicy` iOS/Android/web) y gattent
 * le badge générique « Transféré », et les portes qui les résolvent exigent
 * déjà la qualité de participant.
 */

export type ForwardSourceVisibilityInput = {
  /** Le lecteur EST l'auteur du transfert : il relit son propre message. */
  readonly isSelf: boolean;
  /** L'auteur du transfert autorise l'affichage de ses sources. */
  readonly forwarderAllows: boolean;
  /** Le lecteur autorise l'affichage des siennes — donc voit celles des autres. */
  readonly readerAllows: boolean;
  /**
   * L'AUTEUR D'ORIGINE du contenu transféré autorise qu'on le nomme.
   *
   * **Optionnel, et permissif par défaut** (`undefined` ⇒ autorise) : ce
   * troisième acteur n'a AUCUN point de collecte aujourd'hui. La directive du
   * 2026-08-23 ne confronte que deux volontés — le transféreur et le lecteur —
   * et le porteur produit a explicitement demandé que le système « permette
   * PLUS TARD que l'auteur puisse décider si on l'affiche ou non, notamment
   * activable par les autorités ».
   *
   * Le champ existe donc pour que ce jour-là la règle n'ait pas à être
   * réécrite : il suffira de l'alimenter. Le laisser absent conserve le
   * comportement bilatéral au bit près — c'est ce que verrouille le témoin
   * `omis ⇒ identique au bilatéral`.
   *
   * Il ne court-circuite PAS `isSelf` : celui qui relit son propre transfert
   * sait déjà d'où il vient, un veto ne lui apprendrait rien et ne ferait que
   * rendre son historique illisible.
   */
  readonly originalAuthorAllows?: boolean;
};

/**
 * La règle, pure. `visible ⇔ auteur ET lecteur`.
 *
 * `isSelf` court-circuite : se cacher des autres n'est pas s'aveugler
 * soi-même. Sans cette porte, désactiver le réglage rendrait illisible son
 * PROPRE historique de transferts — une punition que personne n'a demandée en
 * cochant une case de confidentialité.
 */
export const resolveForwardSourceVisibility = (input: ForwardSourceVisibilityInput): boolean =>
  input.isSelf
  || (input.forwarderAllows && input.readerAllows && (input.originalAuthorAllows ?? true));

/**
 * Lit la préférence d'un document de confidentialité PARTIEL.
 *
 * Absente ⇒ `true`. Voir l'en-tête : c'est ce qui rend le déploiement sûr sans
 * migration. Seul un `false` explicite refuse.
 */
export const allowsForwardSource = (
  stored: { readonly showForwardSource?: boolean } | null | undefined,
): boolean => stored?.showForwardSource !== false;

/**
 * Retire du payload les DEUX objets qui NOMMENT la source — sans mutation.
 *
 * Les deux, jamais un seul : les trois politiques clientes nomment le groupe à
 * partir du seul `forwardedFromConversation`, et l'auteur d'origine à partir du
 * seul `forwardedFrom.sender`. N'en retirer qu'un laisse l'autre nommer, et le
 * correctif serveur devient un no-op visuel.
 *
 * Copie superficielle, jamais de mutation : sur le chemin socket un même
 * payload est diffusé à tout un salon — le muter masquerait la source pour des
 * lecteurs qui y avaient droit, ou pire, la révélerait après coup.
 */
export const withoutForwardSource = <T extends object>(payload: T): T => {
  const {
    forwardedFrom: _forwardedFrom,
    forwardedFromConversation: _forwardedFromConversation,
    ...rest
  } = payload as T & { forwardedFrom?: unknown; forwardedFromConversation?: unknown };

  return rest as unknown as T;
};

/**
 * Le payload porte-t-il quelque chose à masquer ? Permet aux appelants de ne
 * PAYER la résolution des préférences que sur les messages qui nomment
 * réellement une source — la très grande majorité des envois n'en nomme
 * aucune.
 */
export const carriesForwardSource = (payload: object): boolean =>
  'forwardedFrom' in payload || 'forwardedFromConversation' in payload;
