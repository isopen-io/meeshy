/**
 * #12333 (audit B1) — `attachmentSocketSelect` charge, pour la loi des
 * contenus d'à-côté, la description d'une pièce ET la protection BRUTE de son
 * message (`message`). Une route qui sert ce qu'elle a chargé sans le
 * projeter publie les deux : `GET /admin/messages` l'a fait, sous
 * `additionalProperties: true`.
 *
 * Cliquet : tout fichier de production qui CHARGE par ce select passe ce qu'il
 * a chargé par l'un des projecteurs qui appliquent la loi et retirent
 * `message`, ou le remet à un projecteur nommé avec son témoin (`HANDS_OFF`).
 *
 * Il se double d'un témoin de VALEUR SERVIE sur la route d'administration
 * (`unit/routes/admin-content-description.test.ts`) : un balayage de source
 * dit qui charge, seul un témoin de route dit ce qui part.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';

const SRC = path.resolve(__dirname, '..');
const LOADS = /(?:select:\s*attachmentSocketSelect\b|\.\.\.attachmentSocketSelect\b)/;
const PROJECTORS = /\b(serializeAttachmentForSocket|cleanAttachmentsForApi|servedDescription|emitAttachmentUpdated)\s*\(/;

/**
 * Les chargeurs qui REMETTENT leurs lignes à un projecteur d'un autre fichier,
 * chacun avec le témoin qui prouve la projection en aval. Rien d'autre.
 */
const HANDS_OFF: Readonly<Record<string, string>> = {
  // Les pièces finales d'un message neuf : les deux producteurs de
  // `message:new` les sérialisent (`message-new-producer-parity.test.ts`,
  // « aucun transport n'émet une clé hors de l'inventaire du canal socket ») ;
  // la réponse REST de création passe `messageAttachmentSchema`, fermé.
  'services/messaging/MessageProcessor.ts': 'message-new-producer-parity.test.ts',
};

function productionFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === '__tests__' ? [] : productionFiles(full);
    return name.endsWith('.ts') && !name.endsWith('.test.ts') ? [full] : [];
  });
}

describe('tout chargement par attachmentSocketSelect est PROJETÉ', () => {
  const loaders = productionFiles(SRC).filter((file) => LOADS.test(readFileSync(file, 'utf8')));

  it('le balayage voit bien les chargeurs (une garde négative qui ne voit rien reste verte)', () => {
    expect(loaders.map((file) => path.relative(SRC, file))).toEqual(expect.arrayContaining(['routes/admin/content.ts']));
  });

  it('aucun chargeur ne sert la ligne brute', () => {
    const unprojected = loaders
      .filter((file) => !PROJECTORS.test(readFileSync(file, 'utf8')))
      .map((file) => path.relative(SRC, file))
      .filter((file) => !(file in HANDS_OFF));
    expect(unprojected).toEqual([]);
  });
});
