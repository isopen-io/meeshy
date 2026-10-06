/**
 * LES TROPHÉES (#9387) — producteur UNIQUE de `GameTrophy`. La LOI (clés,
 * valeur d'un trophée, ordre par défaut, mois d'obtention d'un visiteur) vient
 * de `@meeshy/shared/utils/game/trophies` ; ce service l'applique contre la base.
 *
 * L'attribution est IDEMPOTENTE par `(userId, key)` : une coupe rejouée, un
 * règlement relancé, un Prestige rejoué n'ajoutent rien. Elle ne lève jamais
 * pour un doublon — `false` dit « déjà là ».
 *
 * Ce qu'un VISITEUR apprend (conformité D-1 à D-3, leçon 275) : la clé PROJETÉE
 * (`visitorShowcase` — une coupe de ligue y porte le mois, jamais sa semaine) et
 * le MOIS d'obtention — jamais le jour ni l'heure — et seulement si le réglage
 * du membre (`GameProfileService.facetVisibleTo`) l'y autorise. ADMIN compris :
 * seul le membre lui-même lit ses clés complètes. Un refus rend
 * `visible: false`, jamais une erreur qui dirait que la vitrine existe.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { UserShowcaseResponse } from '@meeshy/shared/types/game';
import {
  flameTrophiesEarned,
  flameTrophy,
  orderShowcase,
  trophyKey,
  visitorAwardedMonth,
  visitorShowcase,
  type TrophyRecord,
  type TrophySpec,
} from '@meeshy/shared/utils/game/trophies';
import type { PresenceViewer } from '../PresenceVisibilityService';
import { GameProfileService } from './GameProfileService';

/** Un compte ne porte jamais plus de trophées que le contrat ne sert. */
export const TROPHY_LIST_MAX = 500;

function isP2002(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}

export class TrophyService {
  private readonly profile: GameProfileService;

  constructor(
    private readonly prisma: PrismaClient,
    deps: { readonly profile?: GameProfileService } = {},
  ) {
    this.profile = deps.profile ?? new GameProfileService(prisma);
  }

  /** Grave un trophée. `true` s'il est nouveau, `false` s'il était déjà gravé. */
  async award(userId: string, spec: TrophySpec | string, now: Date = new Date()): Promise<boolean> {
    const key = typeof spec === 'string' ? spec : trophyKey(spec);
    try {
      await this.prisma.gameTrophy.create({ data: { userId, key, awardedAt: now }, select: { id: true } });
      return true;
    } catch (err) {
      if (isP2002(err)) return false;
      throw err;
    }
  }

  /** Les trophées de la Flamme franchis par cette série (100 et 365 jours). */
  async awardFlameTrophies(params: { readonly userId: string; readonly previousLongest: number; readonly longest: number }): Promise<void> {
    for (const days of flameTrophiesEarned(params)) await this.award(params.userId, flameTrophy(days));
  }

  async list(userId: string): Promise<TrophyRecord[]> {
    const rows = await this.prisma.gameTrophy.findMany({
      where: { userId },
      select: { key: true, awardedAt: true },
      orderBy: { awardedAt: 'desc' },
      take: TROPHY_LIST_MAX,
    });
    return rows.map((row) => ({ key: row.key, awardedAt: row.awardedAt.toISOString() }));
  }

  /** La vitrine d'un membre telle qu'un LECTEUR la voit. */
  async showcaseFor(params: { readonly viewer: PresenceViewer; readonly targetId: string }): Promise<UserShowcaseResponse> {
    const allowed = await this.profile.facetVisibleTo({ viewer: params.viewer, targetId: params.targetId, facet: 'showcase' });
    if (!allowed) return { visible: false, items: [], order: [] };

    const [owned, settings] = await Promise.all([this.list(params.targetId), this.profile.settings(params.targetId)]);
    if (params.viewer?.userId !== params.targetId) {
      const view = visitorShowcase({ owned, order: settings.showcaseOrder });
      return { visible: true, items: [...view.items], order: [...view.order] };
    }
    const items = owned.flatMap((trophy) => {
      const awardedMonth = visitorAwardedMonth(trophy.awardedAt);
      return awardedMonth === null ? [] : [{ key: trophy.key, awardedMonth }];
    });
    return { visible: true, items, order: [...orderShowcase({ owned, order: settings.showcaseOrder })] };
  }
}
