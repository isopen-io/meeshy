import type { QueuedMessagePayload } from '@meeshy/shared/types/delivery-queue';
import {
  loadHistoryFloorsOrFail,
  type HistoryFloorParticipation,
} from '../services/historyFloor';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { carriesMessageText } from './queuedEventContract';
import type { QueuedMessageFacts } from './queuedMessageFacts';

/**
 * Le PLANCHER D'HISTOIRE du lecteur, relu au DRAIN — la CINQUIÈME garde de la
 * frontière de rejeu (#18615).
 *
 * #18613 a posé le plancher là où il manquait : `message:attachment-updated`
 * était le cinquième porteur de texte déclaré et le seul qui n'interrogeait
 * jamais la loi. Cette garde-ci porte sur autre chose — non pas le SITE qui
 * pose le plancher, mais le MOMENT où tous le posent.
 *
 * Les quatre producteurs porteurs de texte calculent le plancher et excluent
 * les lecteurs sous plancher **de la file**, avec leur raison écrite sur place
 * (`broadcastMessageMutation`, `deliverTextTranslation`, `emitAttachmentUpdated`).
 * Tous le font à l'ENFILEMENT. Le drain, lui, ne relisait que `isActive` et
 * `bannedAt` — et son propre doc-comment énonçait la règle qu'il n'appliquait
 * pas :
 *
 * > « Une autorisation se lit donc contre l'autorité au dernier instant
 * > possible, jamais contre une copie prise à l'enfilement. »
 *
 * ─── Pourquoi l'enfilement ne peut pas suffire ───────────────────────────────
 *
 * Le plancher est MUTABLE vers le haut : `PATCH …/participants/:id/rights`
 * accepte `historyVisibleFrom: string | null`, et `null` **RÉVOQUE** l'octroi.
 * Le discriminant est celui que le dépôt nomme déjà (§ « Une règle appliquée à
 * l'ÉCRITURE n'est pas appliquée ») : **quand ce que la règle décide change plus
 * souvent que le moment où elle s'exécute, la décision persistée est un état
 * FAUX jusqu'à la prochaine écriture.** Une entrée vit 48 h
 * (`DELIVERY_QUEUE_TTL_SECONDS`) ; un octroi se révoque en une requête.
 *
 * Et rien ne compense. C'est ce qui distingue cette garde de celle de
 * l'appartenance : les quatre routes qui mettent fin à une participation
 * SORTENT les sockets de la cible de `conversation:<id>`, donc le canal vivant
 * se ferme à l'instant même et seule la file survit. **Une révocation de
 * plancher n'expulse aucune socket et ne touche pas la file** — il n'y a aucun
 * mécanisme en face, à aucun étage.
 *
 * ─── Le cadrage, emprunté et non réénuméré ───────────────────────────────────
 *
 * `carriesMessageText` (`TextBearingQueuedEvent`, #12822). Posée sur TOUTES les
 * entrées, cette garde serait un défaut pire que celui qu'elle corrige, pour la
 * raison exacte qui vaut pour la vivacité : `'deleted'` et `'expired'` ont pour
 * UNIQUE objet d'annoncer la mort du message, et les refuser laisserait le
 * client afficher indéfiniment un message qu'il n'a plus le droit de voir. Ils
 * ne portent aucun texte ; les refuser ne protège rien et coûte la convergence.
 *
 * ─── Fail-CLOSED, et la frontière exacte de ce que ça couvre ─────────────────
 *
 * La garde POSSÈDE deux lectures, et échoue FERMÉ sur les deux :
 *
 *  - la ligne du LIEN, quand c'est lui qui décide du plancher. La posture est
 *    déjà celle du module de plancher, qui l'écrit (« la seule dégradation sûre
 *    est de ne rien servir ») et ne retire QUE les participations dont le lien
 *    décidait — `loadHistoryFloorsOrFail` les rend par `unreadableConversationIds` ;
 *  - la DATE du message. Un plancher sans date de message ne peut pas se
 *    prononcer : on ne sait pas de quel côté l'entrée tombe.
 *
 * C'est la posture des PRODUCTEURS sur la même question — `messageReadership`
 * rend `'unknown'`, et l'appelant n'émet rien et n'enfile rien. Elle est payable
 * ici pour une raison mesurable : **elle n'est payée que par les lecteurs qui
 * ONT un plancher.** Un membre ordinaire, un administrateur, un rôle de
 * plateforme privilégié n'en ont aucun (rangs i et ii de `historyFloorFor`), et
 * le lot entier passe sans qu'une seule date soit regardée.
 *
 * **Ce qu'elle ne couvre PAS, et c'est délibéré** : la lecture des
 * participations elle-même, que la garde ne possède pas — elle est PARTAGÉE
 * avec le gate d'appartenance, dont le `catch` a déjà arbitré, fail-OPEN, avec
 * sa raison écrite (« une absence de réponse n'autorise rien à conclure », une
 * tempête de reconnexions étant le moment où la base est sous pression). On ne
 * change pas en silence la posture d'une lecture qu'on emprunte. Et sous cette
 * panne-là le résidu est strictement INCLUS dans une fuite déjà assumée : le
 * même échec fait déjà rejouer l'arriéré des conversations quittées ou dont le
 * lecteur a été banni.
 *
 * ─── Un refus DÉLIBÉRÉ n'est pas une perte ───────────────────────────────────
 *
 * Comme le gate d'appartenance et celui de vivacité, ce refus ne passe pas par
 * `dropEntry` : celui-ci journalise en ERROR une perte à rattraper et NOMME sa
 * conversation dans `pending-messages:delivered` pour y envoyer le client
 * relire. Ici il n'y a rien à relire — `GET …/messages`, `/sync`,
 * `conversation:updated` et `GET /attachments/:id` refusent tous ce message au
 * même lecteur. Nommer la conversation l'enverrait chercher ce qu'aucune porte
 * ne lui sert.
 */
export type DrainFloorRefusal = {
  readonly entry: QueuedMessagePayload;
  readonly reason: 'below-history-floor' | 'floor-unreadable' | 'message-date-unreadable';
};

export type DrainFloorOutcome = {
  readonly kept: QueuedMessagePayload[];
  readonly refused: readonly DrainFloorRefusal[];
};

export type DrainFloorPrisma = Pick<PrismaClient, 'conversationShareLink'>;

/**
 * Retire du lot les entrées porteuses de texte que le plancher du lecteur
 * n'autorise plus — ou dont il ne peut PAS prouver qu'il les autorise.
 *
 * `participations` sont les lignes VIVANTES du lecteur, telles que le gate
 * d'appartenance vient de les lire : la garde n'ouvre aucune requête de
 * participant à elle. `facts` porte la lecture de `Message` partagée avec la
 * garde de vivacité.
 */
export async function dropQueuedEntriesBelowHistoryFloor(params: {
  readonly prisma: DrainFloorPrisma;
  readonly participations: readonly HistoryFloorParticipation[];
  readonly entries: QueuedMessagePayload[];
  readonly facts: QueuedMessageFacts;
}): Promise<DrainFloorOutcome> {
  const { prisma, participations, entries, facts } = params;

  // Le lot ne porte aucun texte : rien à borner, et pas une requête de liens.
  if (!entries.some((entry) => carriesMessageText(entry.eventType))) {
    return { kept: entries, refused: [] };
  }
  if (participations.length === 0) return { kept: entries, refused: [] };

  const { floors, unreadableConversationIds } = await loadHistoryFloorsOrFail(prisma, participations);
  const unreadable = new Set(unreadableConversationIds);
  // Le cas DOMINANT : aucune participation bornée et aucun plancher illisible.
  // La garde sort ici sans avoir regardé une seule date — c'est ce qui rend son
  // fail-closed payable.
  if (floors.size === 0 && unreadable.size === 0) return { kept: entries, refused: [] };

  const kept: QueuedMessagePayload[] = [];
  const refused: DrainFloorRefusal[] = [];
  for (const entry of entries) {
    const reason = refusalFor(entry, floors, unreadable, facts);
    if (reason) refused.push({ entry, reason });
    else kept.push(entry);
  }
  return { kept, refused };
}

function refusalFor(
  entry: QueuedMessagePayload,
  floors: ReadonlyMap<string, Date>,
  unreadable: ReadonlySet<string>,
  facts: QueuedMessageFacts,
): DrainFloorRefusal['reason'] | null {
  if (!carriesMessageText(entry.eventType)) return null;
  if (unreadable.has(entry.conversationId)) return 'floor-unreadable';

  const floor = floors.get(entry.conversationId);
  // Pas de plancher sur cette conversation : rien ne borne, et une date
  // illisible ne peut rien y changer. C'est ce qui garde le fail-closed
  // ci-dessous CONFINÉ aux lecteurs bornés.
  if (!floor) return null;

  if (facts.kind === 'unreadable') return 'message-date-unreadable';
  const createdAt = facts.byId.get(entry.messageId)?.createdAt ?? null;
  // Ni ligne, ni id interrogeable, ni colonne : un plancher EXISTE et on ne
  // sait pas de quel côté l'entrée tombe. C'est l'arbitrage OPPOSÉ à celui de
  // la vivacité sur la même absence — là il manque la preuve d'une MORT (donc
  // on livre), ici la preuve d'un DROIT (donc on se taît).
  if (createdAt === null) return 'message-date-unreadable';

  // `historyFloorClause` sert `createdAt: { gte: floor }` : la borne est
  // INCLUSIVE, et la garde ne doit pas être plus stricte que la porte REST
  // qu'elle double.
  return createdAt < floor ? 'below-history-floor' : null;
}
