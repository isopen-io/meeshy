/**
 * La loi de CERCLE des accusés de lecture — `dm.readReceipts` (#19385, MSG-04
 * de #14107).
 *
 * ─── POURQUOI CETTE LOI N'AVAIT NULLE PART OÙ VIVRE ─────────────────────────
 *
 * `dm.readReceipts` était déclarée au catalogue (`relation-levels.ts:30,70`,
 * plancher `ACQUAINTANCE`), miroitée par les deux SDK clients, gardée par un
 * témoin de catalogue — et appliquée **par aucun site de la passerelle**, quand
 * son jumeau `dm.typing` (MÊME lot, MÊME plancher) l'était.
 *
 * La cause est structurelle, pas un oubli : les deux résolveurs d'accusés sont
 * AVEUGLES AU VIEWER.
 *
 * | canal | ce qui décidait | le viewer |
 * |---|---|---|
 * | socket (`broadcastReadStatus`) | `shouldShowReadReceipts(acteur)` — un réglage GLOBAL | jamais lu |
 * | REST (`filterReadReceiptVisible`) | les retraits `showReadReceipts` des sujets | pas même un paramètre |
 *
 * C'est exactement `resolvePrefsOnly`, que la loi de PRÉSENCE a **SUPPRIMÉE**
 * (directive 2026-08-25, garde de source `presence-visibility-viewer-aware-guard.test.ts`) :
 * **une résolution aveugle au viewer ne PEUT PAS porter une loi par paire.** Le
 * canal des accusés avait gardé la forme que le canal de présence a retirée, et
 * la loi écrite pour lui est restée inerte faute d'un endroit où s'appliquer.
 *
 * ─── CE QUE CETTE UNITÉ N'EST PAS ───────────────────────────────────────────
 *
 * Elle ne REMPLACE pas le réglage `showReadReceipts` : elle s'applique
 * PAR-DESSUS. La loi RESTREINT — elle n'ouvre jamais un accusé que la
 * préférence du sujet avait tu. Les deux gardes sont disjointes et aucune ne
 * subsume l'autre : la préférence dit « est-ce que J'ÉMETS des accusés ? », la
 * loi dit « à QUI cet accusé a-t-il le droit d'arriver ? ».
 *
 * ─── UN PARAMÈTRE, PAS UNE DÉPENDANCE INJECTÉE ──────────────────────────────
 *
 * La descente prend le `prisma` que ses deux appelants détiennent DÉJÀ, et non
 * un collaborateur injecté. C'est délibéré : **un paramètre dont l'absence
 * désactive une garde est un demi-correctif** (règle du dépôt, § « Une garde de
 * confidentialité se relit CHEZ ELLE »). Une dépendance optionnelle aurait
 * rendu la loi omissible par un appelant futur — ici elle ne l'est pas.
 */
import { pairAccessAmong, type PairAccessDb } from '../services/relations/pairAccess.js';

/** La feature du catalogue que cette unité applique, nommée une fois. */
export const DM_READ_RECEIPTS = 'dm.readReceipts' as const;

/**
 * Les lecteurs INSCRITS auxquels la loi refuse de montrer un accusé de
 * `subjectUserId` — blocage bidirectionnel compris, puisque `pairAccessAmong`
 * le lit pour toute feature.
 *
 * `subjectIs: 'target'` est le sens de la frappe et de « Ne pas déranger » : le
 * sujet est celui qu'on VOIT (c'est sa lecture qu'on montrerait), les autres
 * sont ceux qui regardent. Inverser le sens rendrait le verdict du mauvais
 * côté sur toute paire au lien asymétrique.
 *
 * **LÈVE** si une lecture de la loi échoue, et c'est le contrat de
 * `pairAccessAmong` (« une lecture qui échoue LÈVE : l'appelant ferme »). Un
 * ensemble vide rendu sur une panne voudrait dire « personne n'est refusé »,
 * c'est-à-dire le contraire du fail-closed qu'une porte de confidentialité
 * exige — elle échoue en montrant MOINS, jamais en montrant plus.
 *
 * Un participant SANS compte n'a pas de cercle : il n'entre pas dans
 * `viewerUserIds`, et l'appelant lui garde le régime d'avant ce lot. Même
 * arbitrage que `dm.typing`.
 */
export async function readReceiptDeniedAmong(
  prisma: PairAccessDb,
  subjectUserId: string,
  viewerUserIds: readonly string[],
): Promise<ReadonlySet<string>> {
  const ids = [...new Set(viewerUserIds)].filter((id) => id && id !== subjectUserId);
  if (!subjectUserId || ids.length === 0) return new Set();

  const verdicts = await pairAccessAmong(prisma, {
    feature: DM_READ_RECEIPTS,
    subjectId: subjectUserId,
    otherIds: ids,
    subjectIs: 'target',
  });

  // `!== true` et non `=== false` : une entrée ABSENTE de la carte est un
  // refus, jamais une permission. Laisser passer l'inconnu est la forme exacte
  // de la fuite que la loi de présence a fermée
  // (`vis.get(id)?.showOnline === false ? … : x`).
  //
  // AUCUNE MUTATION NE PEUT LE PROUVER, et il faut le dire : `pairAccessAmong`
  // rend une entrée par id REÇU (`new Map(ids.map(...))`), et `ids` est
  // exactement ce qu'on lui a passé. L'état « entrée absente » est donc
  // INATTEIGNABLE depuis ces deux appels — mesuré, `=== false` laisse les 26
  // témoins du lot verts. La forme défensive se garde quand même : elle
  // protège d'un changement de contrat du collaborateur (une carte qui
  // n'énumérerait plus que les refus, par exemple), et c'est le seul état où
  // une telle protection est gratuite. Noté ici pour qu'un relevé de mutations
  // futur n'y lise pas un trou de couverture mais une impossibilité — règle du
  // cycle 175.
  return new Set(ids.filter((id) => verdicts.get(id)?.allowed !== true));
}

/**
 * L'AUTRE SENS de la même loi : parmi `subjectUserIds`, ceux dont un accusé ne
 * peut pas être montré À `viewerUserId`.
 *
 * ─── POURQUOI DEUX FONCTIONS ET NON UN DRAPEAU ──────────────────────────────
 *
 * Les deux canaux posent la question dans des sens OPPOSÉS, et c'est une
 * propriété du canal, pas une option d'appel :
 *
 * | canal | la question | qui est le sujet |
 * |---|---|---|
 * | socket (`read-status:updated`) | un lecteur lit ⇒ à qui son accusé peut-il ALLER ? | l'acteur, **vu** (`'target'`) |
 * | REST (`…/receipts?detail=people`) | un lecteur demande ⇒ de QUI peut-il voir les accusés ? | le demandeur, **voyant** (`'viewer'`) |
 *
 * Un paramètre de sens aurait rendu l'inversion exprimable au site d'appel,
 * c'est-à-dire possible. Deux fonctions NOMMÉES par leur question la rendent
 * inexprimable : un appelant qui se trompe passe des identités dans le mauvais
 * rôle et le nom le contredit.
 *
 * ─── LE SENS EST AUJOURD'HUI SANS EFFET, ET C'EST MESURÉ ────────────────────
 *
 * Pour `dm.readReceipts` PRÉCISÉMENT, les deux sens rendent le MÊME verdict sur
 * toute paire, et il faut l'écrire pour que personne ne « prouve » la direction
 * par un témoin incapable de tomber (mesuré : inverser `subjectIs` laisse les
 * 26 témoins du lot verts) :
 *
 * | ce qui pourrait désymétriser | pour cette feature |
 * |---|---|
 * | le NIVEAU | symétrique — `niveauxParmi` rend le MINIMUM des deux accords |
 * | le bouclier des MINEURS | **aucun** (`RELATION_MINOR_TARGET_MIN_LEVEL['dm.readReceipts']` est `undefined`) |
 * | le privilège d'ÉQUIPE | exige les DEUX côtés dans l'équipe, donc symétrique |
 *
 * Les deux fonctions subsistent pour autant, et ce n'est pas de la décoration :
 * elles disent l'INTENTION de leur canal, elles sont justes si la feature gagne
 * un jour un bouclier (le catalogue en porte pour d'autres), et c'est le sens
 * qui serait faux — pas le code — s'il fallait le corriger plus tard.
 *
 * Un viewer SANS compte (`null` : invité de lien) n'a pas de cercle, et garde
 * le régime d'avant ce lot — aucun sujet ne lui est caché par la loi. Même
 * arbitrage que `dm.typing`, dont le doc-comment dit qu'« un viewer anonyme
 * n'est jamais dans cette liste » : la loi ne s'applique pas, elle ne refuse
 * pas. Le réglage `showReadReceipts` du sujet, lui, continue de s'appliquer.
 *
 * **LÈVE** comme sa jumelle, et pour la même raison : l'appelant ferme.
 */
export async function readReceiptHiddenFromViewer(
  prisma: PairAccessDb,
  viewerUserId: string | null,
  subjectUserIds: readonly string[],
): Promise<ReadonlySet<string>> {
  if (!viewerUserId) return new Set();
  const ids = [...new Set(subjectUserIds)].filter((id) => id && id !== viewerUserId);
  if (ids.length === 0) return new Set();

  const verdicts = await pairAccessAmong(prisma, {
    feature: DM_READ_RECEIPTS,
    subjectId: viewerUserId,
    otherIds: ids,
    subjectIs: 'viewer',
  });

  return new Set(ids.filter((id) => verdicts.get(id)?.allowed !== true));
}

/**
 * Le viewer de la loi, dérivé d'un contexte d'authentification — `User.id` pour
 * un inscrit, `null` pour un invité de lien.
 *
 * Nommé plutôt que retapé, et c'est la seule raison de son existence : le
 * `gateway/CLAUDE.md` avertit qu'`authContext.userId` porte un `Participant.id`
 * pour un invité de lien, et que le recopier dans un champ qui déclare un
 * `User.id` est une faute. L'idiome `isAnonymous ? null : userId` est retapé
 * une douzaine de fois dans le dépôt ; les portes d'accusés le partagent.
 *
 * Paramètre STRUCTUREL, pas le type du middleware : cette unité reste testable
 * sans construire une requête Fastify. `userId` y est OPTIONNEL parce qu'il
 * l'est sur `UnifiedAuthContext` — le déclarer requis aurait demandé un cast
 * au site d'appel, c'est-à-dire exactement la porte que ce lot ferme ailleurs.
 */
export const receiptViewerOf = (
  context: { readonly userId?: string; readonly isAnonymous?: boolean } | null | undefined,
): string | null => (!context || context.isAnonymous ? null : context.userId || null);
