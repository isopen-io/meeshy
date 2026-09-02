/**
 * Cliquet — « MOOD » ne revient pas dans une union de FIL (#4906).
 *
 * `docs/product/meeshy-composer-modele.md` § 7 tranche le vocabulaire du
 * quatrième profil, et il le tranche bien :
 *
 * > Le quatrième profil s'appelle `status` dans le CODE et « mood » dans la
 * > PROSE, et les deux sont justes. […] Ce n'est donc pas une divergence à
 * > réduire, mais une frontière à tenir : **un identifiant qui traverse le
 * > fil garde `status`** ; une chaîne d'interface et un texte explicatif
 * > disent « mood ».
 *
 * Ce témoin FIGE cette frontière, dans les deux sens — c'est ce qui le rend
 * utilisable comme cliquet :
 *
 *  - côté FIL, il interdit `'MOOD'` : l'union que lisent les trois clients
 *    (`metadata.postType` / `metadata.contentType`) déclare exactement ce que
 *    `enum PostType` sait produire, ni plus ni moins ;
 *  - côté PROSE, il EXIGE que le mot survive : un témoin qui bannirait
 *    « mood » du dépôt serait faux — il ferait rougir la prose légitime, qui
 *    est précisément la moitié que le § 7 protège.
 *
 * Pourquoi un cliquet et pas seulement un correctif : `'MOOD'` était du
 * vocabulaire de fil MORT (aucun producteur, absent de `enum PostType`) et
 * pourtant pas inoffensif — une valeur de fil que personne n'émet est une
 * AUTORISATION. Le type disait « ceci est légal », les surfaces clientes le
 * confirmaient en le tolérant, et les deux qui ne l'avaient pas suivie ne
 * l'auraient dit qu'en production : la passerelle reclassait un mood en POST
 * (`status_reaction` élu sur `=== 'STATUS'`), et le catalogue rendait la même
 * entité de deux façons selon le synonyme employé.
 *
 * Le balayage se fait sur la SOURCE, commentaires dépouillés : un doc-comment
 * a le droit — le devoir, même — de nommer « MOOD » pour expliquer ce retrait.
 * Ce que le témoin garde est la DÉCLARATION, jamais le mot.
 */

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildNotificationDisplay, notificationString } from '../../utils/notification-strings';

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const readSource = (relativePath: string): string =>
  readFileSync(join(PACKAGE_ROOT, relativePath), 'utf8');

/**
 * Dépouille `//` et les blocs `/* … *\/` avant tout balayage. Sans ce
 * dépouillement, le témoin confondrait « ce nom est ÉCRIT » (vrai, et voulu)
 * et « ce nom est DÉCLARÉ comme une valeur de fil » (le seul fait gardé ici).
 */
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/** Les membres de `enum PostType` tels que la BASE les déclare. */
function prismaPostTypeMembers(): readonly string[] {
  const schema = readSource('prisma/schema.prisma');
  const block = /enum\s+PostType\s*\{([\s\S]*?)\}/.exec(schema);
  if (!block?.[1]) throw new Error('enum PostType introuvable dans prisma/schema.prisma');
  return block[1]
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, '').trim())
    .filter((line) => line !== '');
}

/** Le membre droit d'un `export type <name> = … ;`, commentaires dépouillés. */
function aliasRightHandSide(relativePath: string, name: string): string {
  const code = stripComments(readSource(relativePath));
  const declaration = new RegExp(`export type ${name}\\s*=([^;]*);`).exec(code);
  if (!declaration?.[1]) throw new Error(`export type ${name} introuvable dans ${relativePath}`);
  return declaration[1].replace(/\s+/g, ' ').trim();
}

/** Les littéraux de chaîne d'un membre droit d'union (vide si c'est un alias). */
const stringLiteralsOf = (rightHandSide: string): readonly string[] =>
  [...rightHandSide.matchAll(/'([^']*)'/g)].map((match) => match[1] as string);

const sorted = (values: readonly string[]): readonly string[] => [...values].sort();

describe('cliquet — l\'union de FIL ne porte que ce que la base peut produire (#4906)', () => {
  test('enum PostType (base) et PostType (TS) portent exactement les mêmes valeurs', () => {
    // Le premier des deux sens du cliquet : si l'une des deux listes gagne un
    // membre sans l'autre, c'est ici que ça se voit — avant qu'un client ne
    // reçoive un discriminant qu'il ne sait pas router.
    expect(sorted(stringLiteralsOf(aliasRightHandSide('types/post.ts', 'PostType'))))
      .toEqual(sorted(prismaPostTypeMembers()));
  });

  test('SocialPostType EST PostType — par alias, pas par recopie', () => {
    // Une recopie se re-déclare et dérive en silence ; un alias rend la dérive
    // impossible plutôt que seulement détectable. C'est la règle « Single
    // Source of Truth » appliquée à la valeur qui traverse le fil.
    expect(aliasRightHandSide('types/notification.ts', 'SocialPostType')).toBe('PostType');
  });

  test('NotificationPostKind EST SocialPostType — le catalogue et le fil ne divergent pas', () => {
    expect(aliasRightHandSide('utils/notification-strings.ts', 'NotificationPostKind'))
      .toBe('SocialPostType');
  });

  test('aucune déclaration de types/notification.ts ne porte le littéral \'MOOD\'', () => {
    // Balayage du FICHIER entier, pas de la seule ligne de `SocialPostType` :
    // une garde nominative posée sur une seule déclaration meurt en silence le
    // jour où le littéral réapparaît dans la déclaration VOISINE (un
    // `postType?: SocialPostType | 'MOOD'`, un champ de metadata neuf).
    const declarations = stripComments(readSource('types/notification.ts'));

    expect(declarations).not.toContain("'MOOD'");
    expect(declarations).not.toContain('"MOOD"');
  });

  test('la déclaration de NotificationPostKind ne porte pas le littéral \'MOOD\'', () => {
    // Ici le balayage est nominatif, et il DOIT l'être : le catalogue garde
    // légitimement « MOOD » comme CLÉ de prose (`NotificationPostLabelKind`),
    // pour rendre une charge déjà persistée. Ce qui est interdit, c'est que le
    // kind du FIL la porte.
    expect(stringLiteralsOf(aliasRightHandSide('utils/notification-strings.ts', 'NotificationPostKind')))
      .not.toContain('MOOD');
  });
});

describe('cliquet — la PROSE garde le mot « mood », et la tolérance de lecture avec (#4906)', () => {
  test('le catalogue dit toujours « mood » / « humeur » pour le quatrième profil', () => {
    // Le second sens du cliquet. Un lot qui « nettoierait » MOOD partout ferait
    // tomber ce témoin : le § 7 protège le mot dans l'interface autant qu'il le
    // bannit du fil.
    expect(notificationString('en', 'friend.mood')).toContain('mood');
    expect(notificationString('fr', 'friend.mood')).toContain('humeur');
  });

  test('une charge déjà persistée qui porte « MOOD » se rend encore', () => {
    // « Un contrat neuf s'ajoute à l'ancien » : le retrait interdit d'ÉMETTRE
    // MOOD, il n'autorise personne à perdre une notification qui le porte.
    const legacy = buildNotificationDisplay('fr', {
      type: 'user_mentioned',
      actorName: 'Alice',
      postType: 'MOOD',
    });
    const current = buildNotificationDisplay('fr', {
      type: 'user_mentioned',
      actorName: 'Alice',
      postType: 'STATUS',
    });

    expect(legacy.title).not.toBeNull();
    expect(legacy.title).toBe(current.title);
  });

  test('le sous-titre d\'une publication d\'humeur reste « Nouvelle humeur »', () => {
    expect(notificationString('fr', 'friend.subtitleNew', { postType: 'MOOD' }))
      .toBe('Nouvelle humeur');
  });
});
