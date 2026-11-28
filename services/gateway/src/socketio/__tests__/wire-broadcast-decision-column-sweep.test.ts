/**
 * **UNE CHARGE DE DIFFUSION NE REJOINT UN CLIENT QUE PAR `emitPostToAudience`**
 * (#20711).
 *
 * Depuis #20711, `withMentions(ligne, WIRE_BROADCAST)` **garde**
 * `repostOf.snapshotAuthorId` — la colonne de DÉCISION — parce que la
 * résolution par lecteur en a besoin, et qu'elle n'arrive qu'au moment
 * d'émettre. C'est `emitPostToAudience` qui la retire, sur chacune de ses
 * charges, par une fabrique unique.
 *
 * **Cet arrangement crée un invariant neuf, et c'est lui que ce cliquet
 * garde** : une charge composée avec `WIRE_BROADCAST` qui atteindrait un client
 * SANS passer par ce seam servirait la colonne. Avant #20711 la question ne se
 * posait pas — la composition la retirait elle-même — donc rien dans le dépôt
 * ne la gardait.
 *
 * > **Un correctif qui déplace le moment d'une protection déplace aussi la
 * > question « qui d'autre passe par là ? ».** Elle ne se pose qu'une fois le
 * > déplacement fait, et personne ne la pose à ce moment-là : c'est la forme du
 * > cycle 84 (« réparer ce qui rendait une donnée invisible oblige à décider,
 * > dans le même lot, si elle a le droit d'être vue ») appliquée non pas à une
 * > donnée mais à un INSTANT.
 *
 * Quand il tombe : ouvrir le site NEUF et répondre à une seule question — sa
 * charge atteint-elle un client autrement que par `emitPostToAudience` ? Si
 * oui, la réparation est de retirer la colonne chez lui (ou de lui faire
 * prendre le seam), **jamais** d'ajouter une ligne à l'inventaire.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

/**
 * Les SEULS sites de production autorisés à composer une charge de diffusion,
 * et ce qu'ils en font — relevé le 2026-11-28, chacun vérifié à la main.
 *
 * Les deux derniers ne COMPOSENT rien : ils DÉCLARENT la loi et la constante.
 * Composer n'est pas déclarer, et les distinguer évite que le cliquet compte la
 * popularité d'un import au lieu d'une propriété (leçon du cycle 107, dont le
 * balayage fut JETÉ pour cette raison exacte).
 */
const COMPOSE_ET_DIFFUSE_PAR_LE_SEAM = [
  'routes/posts/commentSettings.ts',
  'routes/posts/core.ts',
  'routes/posts/interactions.ts',
  'routes/posts/publication.ts',
  'services/attachments/media-processing/ready-listener.ts',
  'services/posts/PostAudioService.ts',
] as const;

const DECLARE_LA_LOI_SANS_RIEN_COMPOSER = [
  'services/posts/separatedCompanions.ts',
  'services/posts/storyEffectsV3.ts',
] as const;

const racine = path.resolve(__dirname, '../..');

function porteursDeProduction(): string[] {
  const sortie = execFileSync(
    'grep',
    ['-rl', '--include=*.ts', 'WIRE_BROADCAST', '.'],
    { cwd: racine, encoding: 'utf8' }
  );
  return sortie
    .split('\n')
    .filter((ligne) => ligne.length > 0)
    .map((ligne) => ligne.replace(/^\.\//, ''))
    .filter((f) => !f.includes('__tests__'))
    .sort();
}

describe('#20711 — les porteurs de `WIRE_BROADCAST` en production', () => {
  it('le balayage voit bien quelque chose — une garde négative qui rend [] reste verte', () => {
    expect(porteursDeProduction().length).toBeGreaterThan(0);
  });

  it('aucun site NEUF ne compose une charge de diffusion sans passer par `emitPostToAudience`', () => {
    const attendus = [...COMPOSE_ET_DIFFUSE_PAR_LE_SEAM, ...DECLARE_LA_LOI_SANS_RIEN_COMPOSER].sort();
    expect(porteursDeProduction()).toEqual(attendus);
  });
});
