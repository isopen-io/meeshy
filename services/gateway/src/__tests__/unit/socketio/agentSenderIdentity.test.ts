import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

import { agentSenderIdentity } from '../../../socketio/handlers/agentSenderIdentity';

/**
 * #8604 — l'agent recevait un handle en guise de nom d'affichage, et parfois une
 * chaîne vide. Les valeurs attendues ici sont celles qui MANQUAIENT : avant ce
 * lot, le couple rendait `'alice_acct'` au premier cas et `'   '` au second.
 */
describe("agentSenderIdentity — le nom que l'agent apprend", () => {
  it('prend le displayName de la PARTICIPATION quand il existe', () => {
    expect(
      agentSenderIdentity({ displayName: 'Alice Ici', user: { username: 'alice_acct', displayName: 'Alice Compte' } })
    ).toEqual({ senderDisplayName: 'Alice Ici', senderUsername: 'alice_acct' });
  });

  it('descend sur le displayName du COMPTE, pas sur le pseudo, quand la participation n\'en a pas', () => {
    expect(
      agentSenderIdentity({ displayName: null, user: { username: 'alice_acct', displayName: 'Alice Compte' } })
    ).toEqual({ senderDisplayName: 'Alice Compte', senderUsername: 'alice_acct' });
  });

  it('traite une chaîne BLANCHE comme absente — jamais de nom vide chez l\'agent', () => {
    expect(
      agentSenderIdentity({ displayName: '   ', user: { username: 'bob_acct', displayName: 'Bob Compte' } })
    ).toEqual({ senderDisplayName: 'Bob Compte', senderUsername: 'bob_acct' });
  });

  it('garde le pseudo en DERNIER recours quand aucun nom d\'affichage n\'existe', () => {
    expect(agentSenderIdentity({ displayName: null, user: { username: 'carol_acct' } })).toEqual({
      senderDisplayName: 'carol_acct',
      senderUsername: 'carol_acct',
    });
  });

  it('rend les deux champs ABSENTS quand il n\'y a pas d\'auteur — la charge utile ne porte pas de vide', () => {
    expect(agentSenderIdentity(undefined)).toEqual({ senderDisplayName: undefined, senderUsername: undefined });
    expect(agentSenderIdentity(null)).toEqual({ senderDisplayName: undefined, senderUsername: undefined });
    expect(agentSenderIdentity({})).toEqual({ senderDisplayName: undefined, senderUsername: undefined });
  });

  it("ne rend jamais `null` : la charge utile de l'agent déclare `string | undefined`", () => {
    const identite = agentSenderIdentity({ displayName: null, user: { displayName: null, username: null } });
    expect(identite.senderDisplayName).toBeUndefined();
    expect(identite.senderUsername).toBeUndefined();
  });
});

/**
 * La garde suit le RISQUE, pas la forme : ce qui doit rester vrai, c'est que les
 * DEUX tuyaux d'envoi nomment l'auteur par le même site. Un troisième tuyau qui
 * recopierait la coalescence ferait rougir ceci avant de fuir en production.
 */
describe('les deux tuyaux nomment l\'auteur par le site UNIQUE', () => {
  const source = readFileSync(
    join(__dirname, '..', '..', '..', 'socketio', 'handlers', 'MessageHandler.ts'),
    'utf-8'
  );

  it('appelle `agentSenderIdentity` à chacun des deux sites `_notifyAgent`', () => {
    const appels = source.match(/\.\.\.agentSenderIdentity\(message\.sender\)/g) ?? [];
    expect(appels).toHaveLength(2);
  });

  it('ne recompose plus le nom à la main', () => {
    expect(source).not.toContain('senderDisplayName: message.sender?.displayName');
  });
});
