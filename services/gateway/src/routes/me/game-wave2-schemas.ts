/**
 * LES SCHÉMAS DE RÉPONSE DE LA VAGUE 2 (#9384 à #9390) — écrits à la main parce
 * que le sérialiseur de Fastify SUPPRIME toute clé qu'un schéma ne déclare pas :
 * c'est la garde (conformité A-6) qui empêche un champ ajouté demain à un service
 * de partir sur le fil. Chaque forme est confrontée au schéma Zod PARTAGÉ par les
 * tests de route : `parse` sur la charge servie.
 *
 * Les lectures de la ligue publique sont `additionalProperties: false` : un
 * pseudonyme, un total, une zone, une coupe — rien d'autre.
 */

const nullableString = { type: ['string', 'null'] } as const;

const closes = {
  type: 'object',
  additionalProperties: false,
  properties: { dayKey: { type: 'string' }, minuteOfDay: { type: 'number' } },
} as const;

/** `{ success, data }` — le `data` est celui du contrat. */
const envelope = (data: object) =>
  ({ type: 'object', properties: { success: { type: 'boolean' }, data } }) as const;

const strict = (properties: Record<string, object>) => ({ type: 'object', additionalProperties: false, properties }) as const;

export const leagueConsentResponse = envelope(strict({ consent: { type: 'boolean' }, pseudonym: nullableString }));

export const leaguePseudonymResponse = envelope(strict({ pseudonym: { type: 'string' } }));

export const leagueWeekResponse = envelope(
  strict({
    weekKey: { type: 'string' },
    snapshotDay: { type: 'string' },
    closes,
    placed: { type: 'boolean' },
    league: nullableString,
    groupId: nullableString,
    entries: {
      type: 'array',
      items: strict({
        rank: { type: 'number' },
        displayName: { type: 'string' },
        weekPoints: { type: 'number' },
        zone: { type: 'string' },
        cup: nullableString,
        isMe: { type: 'boolean' },
      }),
    },
  }),
);

export const leagueFriendsResponse = envelope(
  strict({
    weekKey: { type: 'string' },
    closes,
    entries: {
      type: 'array',
      items: strict({ rank: { type: 'number' }, userId: { type: 'string' }, weekPoints: { type: 'number' }, isMe: { type: 'boolean' } }),
    },
  }),
);

export const duoInviteResponse = envelope(strict({ status: { type: 'string' }, duoId: { type: 'string' }, weekKey: { type: 'string' } }));

export const duoAcceptResponse = envelope(strict({ status: { type: 'string' }, duoId: { type: 'string' } }));

export const duoAbandonResponse = envelope(strict({ status: { type: 'string' }, duoId: { type: 'string' } }));

export const seasonClaimResponse = envelope(
  strict({
    status: { type: 'string' },
    step: { type: 'number' },
    reward: strict({ kind: { type: 'string' }, amount: { type: 'number' } }),
    seal: { anyOf: [{ type: 'null' }, strict({ cosmeticKey: { type: 'string' } })] },
    completed: { type: 'boolean' },
    gloryGained: { type: 'number' },
    score: { type: 'number' },
  }),
);

export const seasonSealResponse = envelope(strict({ status: { type: 'string' }, balance: { type: 'number' } }));

export const showcaseOrderResponse = envelope(strict({ order: { type: 'array', items: { type: 'string' } } }));

const visibilityShape = strict({ showcase: { type: 'string' }, rank: { type: 'string' }, treasury: { type: 'string' }, atlas: { type: 'string' } });

export const visibilityResponse = envelope(strict({ visibility: visibilityShape }));

export const prestigeResponse = envelope(
  strict({
    status: { type: 'string' },
    prestige: { type: 'number' },
    score: { type: 'number' },
    level: { type: 'number' },
    gloryGained: { type: 'number' },
    trophyKey: { type: 'string' },
  }),
);

export const userShowcaseResponse = envelope(
  strict({
    visible: { type: 'boolean' },
    items: { type: 'array', items: strict({ key: { type: 'string' }, awardedMonth: { type: 'string' }, count: { type: 'number' } }) },
    order: { type: 'array', items: { type: 'string' } },
  }),
);

export const privacyResponse = envelope(strict({ gameHidden: { type: 'boolean' }, friendsLeagueOptOut: { type: 'boolean' } }));

export const gameSettingsResponse = envelope(strict({ gameHidden: { type: 'boolean' }, friendsLeagueOptOut: { type: 'boolean' }, visibility: visibilityShape }));

const nullableTier = strict({ tier: nullableString });

export const userGameProfileResponse = envelope(
  strict({
    visible: { type: 'boolean' },
    standing: {
      anyOf: [
        { type: 'null' },
        strict({
          level: { type: 'number' },
          tier: { type: 'string' },
          prestige: { type: 'number' },
          flame: nullableString,
          rank: { type: 'string' },
          division: { type: ['number', 'null'] },
          // Servis aux AMIS seulement (#9541) : absents pour tout autre lecteur — optionnels, jamais requis.
          points: { type: 'number' },
          trophyCount: { type: 'number' },
        }),
      ],
    },
    treasury: { anyOf: [{ type: 'null' }, nullableTier] },
  }),
);
