/**
 * #16557 — LA PORTE DE LA TRADUCTION DEMANDÉE.
 *
 * `POST /translate-blocking`, `POST /translate` et `translation:request` rendent
 * le contenu d'un message désigné par son identifiant. Chacune recomposait sa
 * garde, et chacune en oubliait un morceau : la vivacité, `isActive`, le lien
 * échu, la vue unique ouverte, la flamme finie. La loi vit dans
 * `messageReadAccess.ts` ; ce fichier ne dit que deux choses de plus.
 *
 * LE CONTENU, PAS SEULEMENT LA LECTURE. La borne est celle de la bulle
 * (`contentStillVisibleToReader`, `D(u)` sans grâce) et non celle du service
 * (`D(u) + 1 h`) : une traduction rend un TEXTE, elle ne dit pas à un second
 * appareil qu'une bulle a expiré. La grâce ne sert ici aucun lecteur, puisque
 * sa bulle est déjà partie de l'écran.
 *
 * UNE LECTURE RATÉE VAUT UN REFUS. La loi propage et laisse l'appelant dire ce
 * que « rien » veut dire. Ici, se taire ne coûte qu'une traduction non servie ;
 * servir à tort coûte le message. Une panne de base rend donc le même refus
 * qu'un message inconnu, sans distinction qui renseignerait l'appelant.
 *
 * Un lecteur `null` (identité incomplète) ferme avant toute lecture : un
 * `where` dont l'identifiant vaut `undefined` ne filtre rien chez Prisma.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { enhancedLogger } from '../../utils/logger-enhanced';
import type { HistoryReader } from '../historyFloor';
import { loadMessageReadableByReader } from './messageReadAccess';

const log = enhancedLogger.child({ module: 'translationReadGate' });

export async function readerMayTranslateMessage(
  prisma: PrismaClient,
  params: { readonly reader: HistoryReader | null; readonly messageId: string; readonly now: Date },
): Promise<boolean> {
  const { reader, messageId, now } = params;
  if (!reader) return false;
  try {
    return (await loadMessageReadableByReader(prisma, { reader, messageId, now })) !== null;
  } catch (error) {
    log.warn('translation read law unreadable — refused', { messageId, error });
    return false;
  }
}
