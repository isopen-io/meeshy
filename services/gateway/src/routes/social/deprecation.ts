import { apiPath } from '@meeshy/shared/api/prefix';
import { dateDeRetrait, type AdresseDepreciee } from '../../utils/deprecation';

/**
 * Le sursis des six adresses de télémétrie de lecture — DÉCLARÉ une fois, pour
 * les six (#4150).
 *
 * ## Pourquoi ce module existe, séparé de `events.ts`
 *
 * Deux raisons, et la seconde est la plus importante.
 *
 * 1. **Une seule déclaration pour six sites.** `POST /posts/:id/view`,
 *    `/impression`, `/impressions/batch`, `/engagement/batch`, `/downloads` et
 *    `/anonymous-view` sont dépréciées LE MÊME JOUR vers LA MÊME adresse. Six
 *    littéraux recopiés, ce sont six dates à corriger le jour où l'échéance
 *    bouge, et cinq qu'on oubliera.
 *
 * 2. **Le balayage de suivabilité doit pouvoir l'ÉVALUER.**
 *    `__tests__/security/deprecation-successor-sweep.ts` n'exécute pas les
 *    routes : il réunit l'expression `successeur` et ce dont elle dépend, puis
 *    l'exécute pour de vrai afin de juger la CHAÎNE ÉMISE — jamais la forme de
 *    sa déclaration. Il résout les dépendances de MÊME FICHIER, plus une table
 *    de modules PURS (`dateDeRetrait`, `apiPath`), et échoue franchement sur
 *    toute autre dépendance croisée plutôt que de mentir.
 *
 *    Déclarer ce sursis dans `events.ts` le mettrait donc hors de portée du
 *    balayage : ce module importe Prisma, Fastify et `PostService`, et n'est
 *    pas exécutable en isolation. Ce fichier-ci n'importe que les deux
 *    fonctions pures que le balayage résout déjà — il rejoint sa table, et le
 *    successeur des six alias est VÉRIFIÉ, pas inventorié. Un site simplement
 *    gelé dans un inventaire est un site que plus personne ne mesure.
 */

/**
 * L'adresse qui remplace les six — composée par `apiPath`, jamais écrite en dur.
 *
 * Un `Link: </social/events>` non versionné enverrait le client sur une adresse
 * que la passerelle ne sert pas : le successeur qu'on ANNONCE doit être celui
 * qu'on MONTE, et le préfixe de version est déjà une source unique.
 */
export const SOCIAL_EVENTS_SUCCESSEUR = apiPath('/social/events');

/**
 * Le jour où les six adresses sont devenues dépréciées — une DATE, jamais
 * « maintenant ».
 *
 * Une échéance dérivée de l'instant de la requête recule d'un jour chaque jour :
 * le client qui rappelle demain lit une date plus lointaine qu'hier, et le
 * retrait n'arrive jamais.
 */
const DEPRECIEES_DEPUIS = '2026-09-02';

/**
 * Les trois en-têtes que chacun des six alias annonce.
 *
 * `Sunset` est SERVI — dérivé de {@link dateDeRetrait}, donc de la fenêtre de
 * 180 jours écrite dans `docs/product/api-simplification/identity.md` § 5 — et
 * non posé « pour avoir quelque chose » : c'est la condition que
 * `utils/deprecation.ts` met à son émission. Le retrait RÉEL reste gouverné par
 * un compteur d'accès nul (#4275) et par le relevé Android que le critère 10
 * exige ; cette date INFORME le client, elle ne décide pas à sa place.
 *
 * Le successeur est STATIQUE — `POST /social/events` ne porte aucun paramètre
 * de chemin — donc validé et composé UNE fois, à l'enregistrement : une adresse
 * mal écrite fait échouer le démarrage bruyamment plutôt que de servir en
 * silence une annonce fausse pendant des mois.
 *
 * > Note d'énoncé : le critère 6 de l'issue demande `Deprecation: true`. La RFC
 * > 9745 en fait un champ structuré de type Date (`Deprecation: @1787011200`),
 * > et c'est la forme que sert le site unique du dépôt — parce qu'elle porte
 * > une INFORMATION, depuis quand, là où `true` n'en porte aucune. Le `true` du
 * > brouillon de 2019 n'est pas repris.
 */
export const socialEventsDeprecation = (): AdresseDepreciee => ({
  depuis: DEPRECIEES_DEPUIS,
  successeur: SOCIAL_EVENTS_SUCCESSEUR,
  retraitLe: dateDeRetrait(DEPRECIEES_DEPUIS),
});
