/**
 * Aucun écrivain de `translations: null` n'oublie la table VOISINE (#9899).
 *
 * `Message.translations` porte les traductions du SERVEUR ; `SharedTranslation`
 * porte les versions SCELLÉES que les appareils des membres se passent. Deux
 * tables, un même message — et chaque écrivain qui vide la première (suppression,
 * édition, échéance d'un éphémère, purge d'une vue unique, anonymisation d'un
 * compte supprimé) laissait la seconde intacte : le texte d'un message retiré
 * restait lisible, pour qui détenait la clé, aussi longtemps que la base le
 * gardait.
 *
 * Le correctif tient les écrivains EXISTANTS ; cette garde tient ceux qui
 * viendront. Le signal est celui qui a produit le défaut : **écrire
 * `translations: null` dit « ce message n'a plus les traductions qu'il avait »**,
 * et la table voisine en a une version scellée. Un nouvel écrivain qui copie le
 * geste sans la copie de l'effacement refait le défaut — et rien d'autre ne le
 * verrait, la table n'ayant AUCUNE relation avec `Message` (par construction : ses
 * lignes ne sont pas relues par jointure), donc aucune cascade.
 *
 * ## Ce que la garde exige
 *
 * Tout fichier de production dont le CODE (commentaires retirés) écrit
 * `translations: null` doit AUSSI y APPELER une des entrées d'effacement :
 *
 * - `eraseSharedTranslations(` — l'unité par message, pour un écrivain qui n'a
 *   pas d'unité d'effets (la purge d'une vue unique) ;
 * - `applyMessageRemovalEffects(` — la suppression, l'anonymisation et l'échéance
 *   d'un éphémère passent toutes par elle ;
 * - `applyMessageEditEffects(` — les quatre transports d'édition (socket,
 *   `PUT /messages/:id`, `PUT /conversations/:id/messages/:mid`,
 *   `PATCH /messages/:id`) y confient l'instant qu'ils viennent d'écrire.
 *
 * Un APPEL, pas une mention : un import mort ou un nom cité dans un type se lit
 * comme un effet traité (§ « un champ présent à chaque étage se lit comme un
 * champ traité », `services/gateway/CLAUDE.md`). Les commentaires ne comptent pas
 * non plus — c'est la raison pour laquelle ils sont retirés AVANT la mesure, et
 * pourquoi le fichier de l'effacement lui-même, qui cite `translations: null`
 * dans sa documentation, n'est pas pris pour un écrivain.
 *
 * ## Les entrées d'effacement sont elles-mêmes câblées
 *
 * « Appeler `applyMessageRemovalEffects` » ne vaut que si l'unité efface. La
 * garde lit donc aussi les deux unités d'effets et la purge de compte : sans cet
 * appel, tous les écrivains passeraient au vert en n'effaçant rien.
 *
 * ## Ce que la garde ne dit pas
 *
 * Elle ne prouve pas que l'effacement est CORRECT — les suites des unités et des
 * transports le mesurent, sur une table qui évalue le `where`. Elle prouve qu'un
 * écrivain ne peut pas l'ignorer SANS LE DIRE.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join, relative, sep } from 'path';
import { walk } from './helpers/file-size-sweep';

const SRC_DIR = join(__dirname, '..');

type Source = { readonly file: string; readonly source: string };

const withoutComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const productionSources = (): readonly Source[] =>
  walk(SRC_DIR).map((file) => ({
    file: relative(SRC_DIR, file).split(sep).join('/'),
    source: withoutComments(readFileSync(file, 'utf8')),
  }));

const WRITES_TRANSLATIONS_NULL = /\btranslations\s*:\s*null\b/;

const ERASURE_ENTRY_CALLS = [
  /\beraseSharedTranslations\s*\(/,
  /\bapplyMessageRemovalEffects\s*\(/,
  /\bapplyMessageEditEffects\s*\(/,
] as const;

const writesTranslationsNull = ({ source }: Source): boolean => WRITES_TRANSLATIONS_NULL.test(source);

const callsAnErasureEntry = ({ source }: Source): boolean =>
  ERASURE_ENTRY_CALLS.some((entry) => entry.test(source));

/** Les écrivains qui vident les traductions du serveur sans effacer celles de la table voisine. */
const unguardedWriters = (sources: readonly Source[]): string[] =>
  sources
    .filter(writesTranslationsNull)
    .filter((candidate) => !callsAnErasureEntry(candidate))
    .map(({ file }) => file);

const sourceOf = (sources: readonly Source[], file: string): Source => {
  const found = sources.find((candidate) => candidate.file === file);
  if (!found) throw new Error(`source de production introuvable : ${file}`);
  return found;
};

describe('les écrivains de `translations: null` effacent la table des traductions partagées (#9899)', () => {
  it('le balayage voit bien les écrivains — sinon une mesure vide passerait au vert', () => {
    const writers = productionSources().filter(writesTranslationsNull);

    // Sept fichiers au moment de la garde : les trois transports d'édition et de
    // suppression REST, le handler socket, l'expiration des éphémères, la purge
    // d'une vue unique et l'anonymisation d'un compte supprimé.
    expect(writers.length).toBeGreaterThanOrEqual(7);
  });

  it('chaque écrivain APPELLE une entrée d’effacement', () => {
    expect(unguardedWriters(productionSources())).toEqual([]);
  });

  it('la garde tombe sur un écrivain NU — elle sait voir ce qu’elle interdit', () => {
    const naked: Source = {
      file: 'routes/nouvelle-suppression.ts',
      source: withoutComments('await prisma.message.update({ where: { id }, data: { translations: null, deletedAt: new Date() } });'),
    };

    expect(unguardedWriters([naked])).toEqual(['routes/nouvelle-suppression.ts']);
  });

  it('un nom d’entrée cité en COMMENTAIRE ou importé sans être appelé ne protège pas l’écrivain', () => {
    const decorative: Source = {
      file: 'routes/nouvelle-edition.ts',
      source: withoutComments(`
        import { applyMessageRemovalEffects } from '../services/messaging/messageRemovalEffects';
        // à brancher : eraseSharedTranslations(prisma, { messageIds: [id] })
        /* applyMessageEditEffects(prisma, record) */
        await prisma.message.update({ where: { id }, data: { translations: null } });
      `),
    };

    expect(unguardedWriters([decorative])).toEqual(['routes/nouvelle-edition.ts']);
  });

  it('un écrivain qui appelle l’une des trois entrées est reconnu', () => {
    const guarded = ['eraseSharedTranslations(prisma, { messageIds })', 'applyMessageRemovalEffects(prisma, record)', 'applyMessageEditEffects(prisma, record)']
      .map((call, index): Source => ({
        file: `routes/ecrivain-${index}.ts`,
        source: withoutComments(`await prisma.message.update({ data: { translations: null } });\nawait ${call};`),
      }));

    expect(unguardedWriters(guarded)).toEqual([]);
  });

  it('l’unité de suppression EFFACE — sinon « appeler applyMessageRemovalEffects » ne garde rien', () => {
    const unit = sourceOf(productionSources(), 'services/messaging/messageRemovalEffects.ts');

    expect(unit.source).toMatch(/\beraseSharedTranslations\s*\(/);
  });

  it('l’unité d’édition EFFACE, en épargnant la version qu’elle vient d’écrire', () => {
    const unit = sourceOf(productionSources(), 'services/messaging/messageEditEffects.ts');

    expect(unit.source).toMatch(/\beraseSharedTranslations\s*\(\s*prisma\s*,\s*\{[^}]*keepSourceVersion/);
  });

  it('la purge d’un compte efface ce que les participants du compte ont partagé', () => {
    const purge = sourceOf(productionSources(), 'services/AccountPurgeService.ts');

    expect(purge.source).toMatch(/\beraseSharedTranslationsOfAccount\s*\(/);
  });
});
