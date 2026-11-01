import { describe, it, expect } from 'vitest';
import {
  creationEncryptionOffer,
  implicitCreationEncryptionMode,
  isCreationEncryptionMode,
  mayChooseEndToEnd,
  IMPLICIT_CREATION_ENCRYPTION_MODE,
  type CreationEncryptionContext,
} from './conversation-creation-encryption';

const context = (overrides: Partial<CreationEncryptionContext> = {}): CreationEncryptionContext => ({
  platformRole: 'USER',
  conversationType: 'direct',
  endToEndSupported: true,
  ...overrides,
});

const modesOf = (ctx: CreationEncryptionContext) => creationEncryptionOffer(ctx).choices.map((choice) => choice.mode);

describe('creationEncryptionOffer — le mode de chiffrement se choisit à la création', () => {
  it('un utilisateur ordinaire choisit entre Serveur et Hybride, Serveur par défaut', () => {
    const offer = creationEncryptionOffer(context({ platformRole: 'USER' }));
    expect(offer.choices).toEqual([
      { mode: 'server', available: true, unavailability: null },
      { mode: 'hybrid', available: true, unavailability: null },
    ]);
    expect(offer.defaultMode).toBe('server');
  });

  it('aucun choix « sans chiffrement » n’existe, pour personne', () => {
    for (const platformRole of ['USER', 'ANALYST', 'ADMIN', 'BIGBOSS', null]) {
      expect(modesOf(context({ platformRole }))).not.toContain('none');
      expect(modesOf(context({ platformRole }))).not.toContain(null);
    }
  });

  it.each(['ANALYST', 'AUDIT', 'MODERATOR', 'ADMIN', 'BIGBOSS', 'analyst'])(
    '%s se voit proposer le bout en bout, présélectionné dans un tête-à-tête',
    (platformRole) => {
      const offer = creationEncryptionOffer(context({ platformRole }));
      expect(offer.choices.at(-1)).toEqual({ mode: 'e2ee', available: true, unavailability: null });
      expect(offer.defaultMode).toBe('e2ee');
    },
  );

  it.each(['USER', 'AGENT', '', null, undefined, 'nonsense'])(
    'le rôle %s ne voit pas le bout en bout (fermé par défaut)',
    (platformRole) => {
      expect(modesOf(context({ platformRole }))).not.toContain('e2ee');
      expect(mayChooseEndToEnd(platformRole)).toBe(false);
    },
  );

  it('dans un groupe, le bout en bout paraît « bientôt » et le défaut reste Serveur', () => {
    const offer = creationEncryptionOffer(context({ platformRole: 'ADMIN', conversationType: 'group' }));
    expect(offer.choices.at(-1)).toEqual({ mode: 'e2ee', available: false, unavailability: 'groups-not-yet' });
    expect(offer.defaultMode).toBe('server');
  });

  it('sur un client qui ne lit pas encore le bout en bout, il paraît « bientôt » et le défaut reste Serveur', () => {
    const offer = creationEncryptionOffer(context({ platformRole: 'ADMIN', endToEndSupported: false }));
    expect(offer.choices.at(-1)).toEqual({ mode: 'e2ee', available: false, unavailability: 'client-not-yet' });
    expect(offer.defaultMode).toBe('server');
  });

  it('le défaut est toujours un choix DISPONIBLE de l’offre', () => {
    const contexts = ['USER', 'ANALYST', 'ADMIN'].flatMap((platformRole) =>
      ['direct', 'group', 'public'].flatMap((conversationType) =>
        [true, false].map((endToEndSupported) => context({ platformRole, conversationType, endToEndSupported })),
      ),
    );
    for (const ctx of contexts) {
      const offer = creationEncryptionOffer(ctx);
      expect(offer.choices.find((choice) => choice.mode === offer.defaultMode)?.available).toBe(true);
    }
  });
});

describe('implicitCreationEncryptionMode — une création hors de l’écran de création', () => {
  it('reprend le défaut de l’offre', () => {
    expect(implicitCreationEncryptionMode(context({ platformRole: 'ANALYST' }))).toBe('e2ee');
    expect(implicitCreationEncryptionMode(context({ platformRole: 'USER' }))).toBe('server');
    expect(implicitCreationEncryptionMode(context({ platformRole: 'ADMIN', endToEndSupported: false }))).toBe('server');
  });

  it('un ancien client qui ne dit rien reçoit Serveur : le serveur chiffre toujours au repos', () => {
    expect(IMPLICIT_CREATION_ENCRYPTION_MODE).toBe('server');
  });
});

describe('isCreationEncryptionMode', () => {
  it('ne reconnaît que les trois modes', () => {
    expect(['server', 'hybrid', 'e2ee'].every(isCreationEncryptionMode)).toBe(true);
    expect([null, undefined, '', 'none', 'E2EE', 42].some(isCreationEncryptionMode)).toBe(false);
  });
});
