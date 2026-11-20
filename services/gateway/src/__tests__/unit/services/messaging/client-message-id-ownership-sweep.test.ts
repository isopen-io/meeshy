/**
 * @jest-environment node
 *
 * **LE CLIQUET DE L'INVENTAIRE** (#19960) — toute porte de production qui
 * APPARIE un `clientMessageId` porte `senderId` dans son filtre, et toute
 * surface qui le SERT passe par la loi.
 *
 * L'issue en énumérait DEUX ; le dépôt en portait CINQ. Une énumération de
 * sites porte deux affirmations — « ces sites appliquent la règle »
 * (vérifiable) et « ce sont les sites où la règle s'applique » (presque jamais
 * vérifiée). Ce balayage garde la seconde.
 *
 * Quand il tombe, la réparation est d'appeler la loi
 * (`ownReplayWhere` / `servedClientMessageId`), jamais d'ajouter une ligne à
 * l'inventaire : il n'y a pas d'appariement sans auteur légitime à porter.
 *
 * **L'EXEMPTION, et elle est nommée** : les clés DÉRIVÉES côté serveur
 * (`callSummaryClientMessageId` ⇒ `call-summary:<callId>`) vivent dans un
 * espace de noms DISJOINT — les trois entrées qui acceptent une clé d'un
 * appelant la valident contre `CLIENT_MESSAGE_ID_REGEX` (`cid_<uuid v4>`),
 * que cette forme ne peut pas satisfaire. Un résumé d'appel n'a pas
 * d'expéditeur qui le relit : y exiger `senderId` serait faux.
 */
import { describe, expect, it } from '@jest/globals';
import { execFileSync } from 'child_process';
import path from 'path';

const SRC = path.resolve(__dirname, '../../../..');

/** Les sites de PRODUCTION (hors témoins) qui citent la clé dans un `where`. */
function pairingSites(): readonly string[] {
  const out = execFileSync('grep', [
    '-rn', '--include=*.ts', 'clientMessageId', SRC,
  ], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });

  return out
    .split('\n')
    .filter((line) => line.includes('where'))
    .filter((line) => !line.includes('__tests__') && !line.includes('.test.ts'))
    .map((line) => line.trim());
}

/** Les `select` de production qui chargent la clé pour la SERVIR. */
function selectSites(): readonly string[] {
  const out = execFileSync('grep', [
    '-rn', '--include=*.ts', 'clientMessageId: true', SRC,
  ], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });

  return out
    .split('\n')
    .filter(Boolean)
    .filter((line) => !line.includes('__tests__') && !line.includes('.test.ts'))
    .map((line) => line.replace(`${SRC}/`, '').trim());
}

/**
 * Les clés DÉRIVÉES par le serveur : espace de noms disjoint, exemptées avec
 * leur raison (voir l'en-tête). Reconnues par leur producteur, jamais par
 * leur fichier — un site neuf du même fichier ne doit pas hériter de
 * l'exemption.
 */
const DERIVED_KEY_PRODUCER = 'callSummaryClientMessageId(';

describe('toute porte qui apparie un clientMessageId porte aussi son auteur (#19960)', () => {
  it('le balayage trouve bien des sites — une sonde vide resterait verte pour rien', () => {
    expect(pairingSites().length).toBeGreaterThanOrEqual(4);
  });

  it('aucun appariement de production n’omet `senderId`, hors clés dérivées', () => {
    const offenders = pairingSites().filter((line) => {
      if (line.includes(DERIVED_KEY_PRODUCER)) return false;
      // La loi partagée : son appel PORTE `senderId`, c'est sa signature.
      if (line.includes('ownReplayWhere(')) return false;
      // La SEULE question qui s'apparie sans auteur — « quelqu'un d'autre
      // tient-il cette clé ? » — vit DANS la loi, avec sa raison, et ne
      // s'appelle que sur le chemin d'échec.
      if (line.includes('clientMessageIdOwnership.ts')) return false;
      return line.includes('clientMessageId');
    });

    expect(offenders).toEqual([]);
  });

  it('les DEUX seules surfaces qui chargent la clé pour la servir sont connues, et passent par la loi', () => {
    const files = selectSites().map((line) => line.split(':')[0]).sort();

    expect(files).toEqual([
      'routes/conversations/messages-list-query.ts',
      'routes/sync/messages.ts',
      'services/messaging/attachmentSendAdmission.ts',
    ]);
  });
});
