/**
 * **GRAVER ET ANNONCER — le site UNIQUE d'attribution d'un succès composé (#5847).**
 *
 * Avant ce module, `CerclesAchievements.graveTiers` et
 * `GlobalAchievements.graveTiers` étaient la MÊME fonction écrite deux fois :
 * même boucle, même `P2002`, même silence. Y ajouter l'annonce deux fois
 * aurait garanti la divergence — c'est exactement la forme des jumelles que le
 * dépôt paie ailleurs (deux résolveurs de Prisme, deux hôtes de célébration).
 * Elles délèguent donc ici, et la règle d'annonce n'existe qu'une fois.
 *
 * ## Les trois règles de l'annonce, et pourquoi chacune
 *
 * 1. **Un palier gravé par un GESTE s'annonce.** C'est la raison d'être du
 *    lot : la récompense doit arriver quand l'utilisateur agit, pas quand il
 *    consulte. Sans cette ligne, cent quatorze succès composés tombaient en
 *    silence — mesuré le 2026-09-09, `createNotification` n'apparaissait nulle
 *    part dans ce dossier.
 *
 * 2. **Un palier gravé par le BALAYAGE ne s'annonce pas.** `sweep` est un
 *    rattrapage : il découvre ce qui était déjà vrai. Notifier ferait tomber
 *    des dizaines de bannières à la première ouverture de l'écran
 *    « Progression », pour des gestes vieux de plusieurs jours. Une
 *    célébration qui arrive en rafale et en retard ne célèbre rien.
 *
 * 3. **Un geste qui franchit plusieurs paliers n'en annonce QU'UN — le plus
 *    haut.** Le cas se produit au premier geste d'un compte qui a déjà de
 *    l'historique : passer de « rien de gravé » à 1 000 messages grave 1, 10,
 *    100 et 1 000 d'un coup. « 1 000 messages envoyés » SUBSUME « 1 message
 *    envoyé » ; quatre bannières pour un geste diluent la seule qui compte.
 *
 * ## Ce que ce module ne fait pas
 *
 * Il ne crédite AUCUN point (#5758) — un succès nomme un fait, il n'alimente
 * pas la monnaie. Et il n'échoue jamais vers l'appelant : la ligne
 * `EngagementMilestone` est ce qui fait foi, la bannière n'en est que l'écho.
 * Une bannière perdue laisse un succès ACQUIS, que l'écran restituera ;
 * l'inverse — un geste métier qui échoue parce qu'une notification n'est pas
 * partie — serait un très mauvais échange.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  achievementKey,
  tiersOf,
  type AchievementFamily,
} from '@meeshy/shared/types/achievement-catalog';
import { achievementLabel } from '@meeshy/shared/utils/achievement-labels';
import { notificationString } from '@meeshy/shared/utils/notification-strings';
import { NotificationService } from '../notifications/NotificationService';
import { getSharedNotificationService } from '../notifications/notification-service-registry';
import { RECIPIENT_LANG_SELECT, recipientLanguage } from '../../utils/recipient-language';
import { ENGAGEMENT_ROUTE } from '../engagement/EngagementService';
import { enhancedLogger } from '../../utils/logger-enhanced';

const log = enhancedLogger.child({ module: 'AchievementAnnounce' });

/**
 * D'où vient l'attribution — la SEULE chose qui décide si elle s'annonce.
 *
 * Le nom porte la distinction produit plutôt que technique (`'immediate'` /
 * `'batch'` ne diraient pas POURQUOI l'un se tait) : un `geste` est une action
 * que l'utilisateur vient de faire, un `balayage` est une lecture de ce qui
 * était déjà vrai.
 */
export type AchievementOrigin = 'geste' | 'balayage';

/** Prisma signale une violation d'index unique par le code `P2002`. */
function isP2002(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}

/**
 * Grave tous les paliers de `family` que `valeur` franchit, et annonce le plus
 * haut des paliers NEUFS quand l'attribution vient d'un geste.
 *
 * On ne compare pas à la valeur précédente : la contrainte unique
 * d'`EngagementMilestone` suffit, et s'en passer rend la fonction rejouable —
 * un backfill ou un événement perdu se rattrapent sans logique de reprise.
 * C'est aussi ce qui rend la règle 3 nécessaire plutôt qu'anecdotique.
 */
export async function graveEtAnnonce(params: {
  readonly prisma: PrismaClient;
  readonly userId: string;
  readonly family: AchievementFamily;
  readonly valeur: number;
  readonly origin: AchievementOrigin;
}): Promise<void> {
  const { prisma, userId, family, valeur, origin } = params;

  let plusHautNeuf: number | null = null;
  for (const palier of tiersOf(family)) {
    if (valeur < palier) continue;
    try {
      await prisma.engagementMilestone.create({
        data: { userId, milestoneType: 'achievement', milestoneKey: achievementKey(family, palier) },
      });
      plusHautNeuf = palier;
    } catch (err) {
      // P2002 : déjà gravé — l'anti-rejeu a joué, et ce palier n'est PAS neuf,
      // donc il ne concourt pas à l'annonce.
      if (isP2002(err)) continue;
      throw err;
    }
  }

  if (origin !== 'geste' || plusHautNeuf === null) return;
  await annonce({ prisma, userId, family, tier: plusHautNeuf });
}

/**
 * La bannière d'un succès, dans la langue du LECTEUR.
 *
 * Le libellé passe par `achievementLabel`, qui rend `null` pour une famille
 * sans gabarit : dans ce cas on n'annonce RIEN plutôt que d'afficher la clé.
 * C'est la leçon du `first_content` servi tel quel sur un écran verrouillé
 * (#5731) — une clé stable n'est pas un mot.
 *
 * `route` dit au client où le tap MÈNE (l'écran « Progression », qui restitue
 * le palier) et `achievementKey` dit QUOI célébrer : c'est cette seconde clé
 * que la vue de révélation lit pour montrer le bon succès plutôt que d'ouvrir
 * une grille où il faut le retrouver soi-même.
 */
async function annonce(params: {
  readonly prisma: PrismaClient;
  readonly userId: string;
  readonly family: AchievementFamily;
  readonly tier: number;
}): Promise<void> {
  const { prisma, userId, family, tier } = params;
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: RECIPIENT_LANG_SELECT });
    const lang = recipientLanguage(user, 'fr');
    const titre = achievementLabel(lang, family, tier);
    if (titre === null) return;

    const notificationService = getSharedNotificationService() ?? new NotificationService(prisma);
    await notificationService.createNotification({
      userId,
      type: 'achievement_unlocked',
      priority: 'normal',
      content: notificationString(lang, 'engagement.achievementUnlocked', { title: titre }),
      context: {},
      metadata: {
        action: 'view_details',
        route: ENGAGEMENT_ROUTE,
        achievementKey: achievementKey(family, tier),
      },
    });
  } catch (err) {
    log.warn("annonce de succès échouée — le palier reste ACQUIS", {
      userId,
      achievementKey: achievementKey(family, tier),
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
