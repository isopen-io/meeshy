/**
 * #10945 — le contour équipé voyage avec CHAQUE résumé de personne. La forme
 * est UNE : `profileDecor: { avatarRing }` (celle de la fiche de conversation
 * et de l'auteur d'un message, #10713), déclarée au schéma minimal partagé pour
 * que les listes qui l'emploient (communautés, demandes d'amis, réactions,
 * dernier message) ne l'effacent pas au sérialiseur.
 */
import { describe, expect, it } from 'vitest';
import { participantProfileDecorSchema, userMinimalSchema } from '../api-schemas/user';
import { messageMinimalSchema } from '../api-schemas/message';
import { parsePersonProfileDecor, type PersonProfileDecor } from '../profile-decor';

const RING = { pack: 'contours-essentiels', item: 'filet', origin: 'builtin', contract: null } as const;

describe('PersonProfileDecor — la forme portée par une personne', () => {
  it('se lit au contour seul', () => {
    const decor: PersonProfileDecor | undefined = parsePersonProfileDecor({ avatarRing: RING, banner: RING });
    expect(decor).toEqual({ avatarRing: RING });
  });

  it.each([undefined, null, 'x', {}, { avatarRing: null }, { avatarRing: { pack: 'Pas Bon', item: 'x' } }])('rend undefined pour %j', (input) => {
    expect(parsePersonProfileDecor(input)).toBeUndefined();
  });
});

describe('schémas de réponse — la clé est DÉCLARÉE', () => {
  it('userMinimalSchema déclare profileDecor', () => {
    expect(userMinimalSchema.properties.profileDecor).toBe(participantProfileDecorSchema);
  });

  it('le dernier message de la liste déclare le contour de son expéditeur', () => {
    const sender = (messageMinimalSchema.properties as Record<string, { properties?: Record<string, unknown> }>)['sender'];
    expect(sender?.properties?.['profileDecor']).toBe(participantProfileDecorSchema);
  });
});
