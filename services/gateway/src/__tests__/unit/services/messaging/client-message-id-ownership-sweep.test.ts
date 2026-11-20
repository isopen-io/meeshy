/**
 * @jest-environment node
 *
 * **LE CLIQUET DE L'INVENTAIRE** (#19960) — toute porte de production qui
 * APPARIE un `clientMessageId` porte `senderId` dans son filtre.
 *
 * L'issue en énumérait DEUX ; le dépôt en portait CINQ. Une énumération de
 * sites porte deux affirmations — « ces sites appliquent la règle »
 * (vérifiable) et « ce sont les sites où la règle s'applique » (presque jamais
 * vérifiée). Ce balayage garde la seconde.
 *
 * ## Ce que la PREMIÈRE version de ce fichier ne voyait pas (audit adversarial)
 *
 * Elle filtrait LIGNE PAR LIGNE (`grep clientMessageId | includes('where')`).
 * Un `where:` écrit sur plusieurs lignes met `where` et `clientMessageId` sur
 * deux lignes différentes, et **aucune des deux ne passait le filtre** — une
 * forme que le dépôt porte déjà (`services/CallService.ts`). Elle comptait de
 * plus les COMMENTAIRES comme des sites, ce que le `CLAUDE.md` du gateway
 * prescrit depuis longtemps de ne pas faire.
 *
 * > Un balayage qui mesure la popularité d'un IDIOME ne mesure pas une
 * > PROPRIÉTÉ. Celui-ci lit le texte débarrassé de ses commentaires, et
 * > résout chaque bloc `where { … }` en ENTIER, accolades équilibrées.
 *
 * ## L'exemption, et elle est NOMMÉE
 *
 * Les clés DÉRIVÉES côté serveur (`callSummaryClientMessageId` ⇒
 * `call-summary:<callId>`) vivent dans un espace de noms DISJOINT : les trois
 * entrées qui acceptent une clé d'un appelant la valident contre
 * `CLIENT_MESSAGE_ID_REGEX` (`cid_<uuid v4>`), que cette forme ne peut pas
 * satisfaire. Un résumé d'appel n'a pas d'expéditeur qui le relit : y exiger
 * `senderId` serait faux. **La prémisse de cette exemption est gardée à part**
 * (#19993) — ce balayage gèle l'exemption, pas ce qui la fonde.
 */
import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { execFileSync } from 'child_process';
import path from 'path';

const SRC = path.resolve(__dirname, '../../../..');

/** Le texte SANS ses commentaires — un commentaire n'est pas un site. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/(^|[^:])\/\/.*$/, '$1'))
    .join('\n');
}

function productionFiles(): readonly string[] {
  return execFileSync('grep', ['-rl', '--include=*.ts', 'clientMessageId', SRC], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .filter((file) => !file.includes('__tests__') && !file.endsWith('.test.ts'));
}

/**
 * Chaque bloc `where { … }` du fichier, accolades ÉQUILIBRÉES — donc les
 * blocs multi-lignes, que la version ligne-à-ligne manquait entièrement.
 */
function whereBlocks(source: string): readonly string[] {
  const blocks: string[] = [];
  const text = stripComments(source);
  for (const match of text.matchAll(/where\s*:\s*\{/g)) {
    let depth = 1;
    let i = match.index! + match[0].length;
    while (i < text.length && depth > 0) {
      if (text[i] === '{') depth += 1;
      else if (text[i] === '}') depth -= 1;
      i += 1;
    }
    blocks.push(text.slice(match.index!, i));
  }
  return blocks;
}

/** Le producteur des clés DÉRIVÉES — reconnu par son NOM, jamais par son fichier. */
const DERIVED_KEY_PRODUCER = 'callSummaryClientMessageId(';

type Offender = { readonly file: string; readonly block: string };

function pairingsWithoutSender(): readonly Offender[] {
  const offenders: Offender[] = [];
  for (const file of productionFiles()) {
    const relative = file.replace(`${SRC}/`, '');
    for (const block of whereBlocks(readFileSync(file, 'utf8'))) {
      if (!block.includes('clientMessageId')) continue;
      if (block.includes(DERIVED_KEY_PRODUCER)) continue;
      if (block.includes('senderId')) continue;
      // La loi partagée : son appel PORTE `senderId`, c'est sa signature.
      if (relative.endsWith('clientMessageIdOwnership.ts')) continue;
      offenders.push({ file: relative, block: block.replace(/\s+/g, ' ').slice(0, 110) });
    }
  }
  return offenders;
}

describe('toute porte qui apparie un clientMessageId porte aussi son auteur (#19960)', () => {
  it('le balayage VOIT les blocs multi-lignes — la sonde qui l’a pris en défaut', () => {
    const multiline = whereBlocks(`
      const q = prisma.message.findFirst({
        where: {
          conversationId,
          clientMessageId
        },
      });
    `);

    expect(multiline).toHaveLength(1);
    expect(multiline[0]).toContain('clientMessageId');
  });

  it('un COMMENTAIRE n’est pas un site', () => {
    expect(whereBlocks('/* where: { clientMessageId } */ const x = 1;')).toEqual([]);
    expect(whereBlocks('// where: { clientMessageId }')).toEqual([]);
  });

  it('le balayage trouve bien des appariements réels — une sonde vide resterait verte pour rien', () => {
    const all = productionFiles().flatMap((file) =>
      whereBlocks(readFileSync(file, 'utf8')).filter((block) => block.includes('clientMessageId')));

    expect(all.length).toBeGreaterThanOrEqual(5);
  });

  it('aucun appariement de production n’omet `senderId`, hors clés dérivées', () => {
    expect(pairingsWithoutSender()).toEqual([]);
  });
});
