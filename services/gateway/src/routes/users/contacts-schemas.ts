/**
 * Schémas de sérialisation partagés par les routes du répertoire.
 *
 * `fast-json-stringify` retire toute propriété absente du schéma : un profil
 * rapproché doit donc être décrit UNE seule fois, sinon un champ ajouté d'un
 * côté disparaît silencieusement de l'autre.
 */

export const matchedUserSchema = {
  type: 'object',
  nullable: true,
  properties: {
    id: { type: 'string' },
    username: { type: 'string' },
    firstName: { type: 'string', nullable: true },
    lastName: { type: 'string', nullable: true },
    displayName: { type: 'string', nullable: true },
    avatar: { type: 'string', nullable: true },
    isOnline: { type: 'boolean' },
    lastActiveAt: { type: 'string', format: 'date-time', nullable: true }
  }
} as const;

export const directoryEntrySchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    contactKey: { type: 'string' },
    displayName: { type: 'string', nullable: true },
    phoneNumbers: { type: 'array', items: { type: 'string' } },
    emails: { type: 'array', items: { type: 'string' } },
    usernames: { type: 'array', items: { type: 'string' } },
    isOnMeeshy: { type: 'boolean' },
    matchedBy: { type: 'string', nullable: true },
    matchedAt: { type: 'string', format: 'date-time', nullable: true },
    lastSyncedAt: { type: 'string', format: 'date-time', nullable: true },
    matchedUser: matchedUserSchema
  }
} as const;
