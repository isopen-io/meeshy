/**
 * #6501 — un script de preuve ne laisse aucun message sans expéditeur.
 *
 * `scripts/preuves/preuve-inscription-par-email.sh` crée un compte sur staging,
 * puis l'efface à la main en mongosh (`MagicLinkToken`, `Participant`,
 * `UserSession`, `User`). L'inscription avait pourtant posé un avis d'arrivée
 * dans la conversation globale, dont l'expéditeur était le `Participant` retiré.
 * `Message.sender` étant une relation REQUISE, onze exécutions ont laissé onze
 * orphelins — et « Meeshy Global » ne s'ouvrait plus pour personne.
 *
 * Deux règles, chacune avec son cas POSITIF (la garde rougit bien sur la forme
 * historique) et sa garde de PÉRIMÈTRE (le balayage lit bien quelque chose) :
 *
 * 1. une instruction qui retire des `Participant` retire d'abord LEURS messages ;
 * 2. mongosh n'émule pas les `onDelete: Cascade` de Prisma : un script qui efface
 *    des messages nomme chaque modèle que le schéma fait tomber avec eux, sans
 *    quoi il déplace l'orphelin d'une table vers la suivante.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const REPO = join(__dirname, '../../../../..');
const PREUVES = join(REPO, 'scripts/preuves');
const SCHEMA = join(REPO, 'packages/shared/prisma/schema.prisma');

const PARTICIPANT_DELETION = /\bParticipant\.deleteMany\(/;
const MESSAGES_OF_SENDERS = /\bMessage\.find\(\{senderId:\{\\?\$in:/;
const MESSAGE_DELETION = /\bMessage\.deleteMany\(/;

function deletionsThatOrphanMessages(source: string): string[] {
  return source.split('\n').filter((line) => {
    const participant = line.search(PARTICIPANT_DELETION);
    if (participant === -1) return false;
    const senders = line.search(MESSAGES_OF_SENDERS);
    const deletion = line.search(MESSAGE_DELETION);
    return senders === -1 || deletion === -1 || senders > participant || deletion > participant;
  });
}

function cascadeChildrenOfMessage(schema: string): string[] {
  return [...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)]
    .filter(([, , body]) => /^\s+message\s+Message\??\s+@relation\([^)]*onDelete:\s*Cascade/m.test(body))
    .map(([, name]) => name);
}

const scripts = () =>
  readdirSync(PREUVES)
    .filter((nom) => nom.endsWith('.sh'))
    .map((nom) => ({ nom, source: readFileSync(join(PREUVES, nom), 'utf8') }));

describe('#6501 — un script de preuve ne laisse aucun message sans expéditeur', () => {
  it('le balayage lit bien des scripts qui retirent des participants', () => {
    expect(scripts().filter(({ source }) => PARTICIPANT_DELETION.test(source)).length).toBeGreaterThan(0);
  });

  it("la garde rougit sur la forme historique — le Participant part, son avis d'arrivée reste", () => {
    const historique =
      "JS=\"d=db.getSiblingDB('meeshy'); n=0; d.User.find({email:'x'},{_id:1}).forEach(function(u){ " +
      'n+=d.MagicLinkToken.deleteMany({userId:u._id}).deletedCount; ' +
      'n+=d.Participant.deleteMany({userId:u._id}).deletedCount; });"';

    expect(deletionsThatOrphanMessages(historique)).toHaveLength(1);
  });

  it('aucun script ne retire un participant avant ses messages', () => {
    const fautifs = scripts().flatMap(({ nom, source }) => deletionsThatOrphanMessages(source).map(() => nom));

    expect(fautifs).toEqual([]);
  });

  it('le schéma fait bien tomber des modèles avec un message — la liste n’est pas vide', () => {
    expect(cascadeChildrenOfMessage(readFileSync(SCHEMA, 'utf8'))).toEqual(
      expect.arrayContaining(['MessageStatusEntry', 'Reaction', 'MessageAttachment'])
    );
  });

  it('un script qui efface des messages efface aussi ce que Prisma aurait fait tomber avec eux', () => {
    const enfants = cascadeChildrenOfMessage(readFileSync(SCHEMA, 'utf8'));
    const manquants = scripts()
      .filter(({ source }) => MESSAGE_DELETION.test(source))
      .flatMap(({ nom, source }) => enfants.filter((enfant) => !source.includes(`'${enfant}'`)).map((e) => `${nom}: ${e}`));

    expect(manquants).toEqual([]);
  });
});
