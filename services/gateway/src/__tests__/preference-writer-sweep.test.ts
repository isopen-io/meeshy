/**
 * Cliquet d'inventaire des écrivains de préférences par utilisateur.
 *
 * Voir `preference-writer-sweep.ts` pour ce que ce balayage mesure — et pour
 * ce qu'il ne mesure PAS : il relève des sites d'ÉCRITURE, jamais des
 * diffusions. Sa valeur est de forcer la question au lot suivant.
 *
 * **Quand il tombe :**
 *
 * - une entrée EN TROP ⇒ un écrivain NEUF vient d'apparaître. Vérifier qu'il
 *   diffuse sur la room personnelle (`broadcastToUser`) avant d'ajouter sa
 *   ligne ici, et poser le témoin d'émission à côté de ses voisins
 *   (`conversation-preferences-broadcast.test.ts`,
 *   `community-preferences-broadcast.test.ts`). Ne JAMAIS geler une écriture
 *   muette : c'est exactement le défaut que ce cliquet existe pour attraper.
 * - une entrée EN MOINS ⇒ un écrivain a disparu ou a été consolidé ; retirer
 *   sa ligne fait partie du lot.
 */

import { describe, it, expect, afterEach } from '@jest/globals';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { sweepPreferenceWriteSites, formatSite } from './preference-writer-sweep';

/**
 * Chaque ligne a été ouverte et vérifiée. La colonne « diffuse » nomme
 * l'émission qui suit l'écriture.
 *
 * | site | diffuse |
 * |---|---|
 * | `conversationPreferencesSync.writeConversationPreferences` | `USER_PREFERENCES_UPDATED` |
 * | `conversationPreferencesSync.reorderConversationPreferences` | `USER_PREFERENCES_REORDERED` |
 * | `conversation-preferences.ts` (DELETE, reset EN PLACE pour garder `version` monotone) | `USER_PREFERENCES_UPDATED` (`reset: true`) |
 * | `community-preferences.ts` (PUT) | `USER_PREFERENCES_UPDATED` (scope communauté) |
 * | `community-preferences.ts` (DELETE) | `USER_PREFERENCES_UPDATED` (`reset: true`) |
 * | `community-preferences.ts` (reorder) | `USER_PREFERENCES_COMMUNITY_REORDERED` — ajouté au cycle 128 |
 *
 * Les trois écrivains de `user-deletions.ts` n'y figurent PAS : ils passent par
 * `writeConversationPreferences`, ce qui est précisément la forme voulue — un
 * écrivain consolidé ne crée pas de site de plus.
 */
const FROZEN_WRITE_SITES = [
  'routes/community-preferences.ts|userCommunityPreferences|delete',
  'routes/community-preferences.ts|userCommunityPreferences|upsert',
  'routes/community-preferences.ts|userCommunityPreferences|upsert',
  'routes/conversation-preferences.ts|userConversationPreferences|update',
  'services/conversationPreferencesSync.ts|userConversationPreferences|upsert',
  'services/conversationPreferencesSync.ts|userConversationPreferences|upsert',
].sort();

describe('préférences par utilisateur — inventaire des écrivains', () => {
  it('ne porte aucun écrivain hors inventaire', () => {
    const found = sweepPreferenceWriteSites().map(formatSite).sort();
    expect(found).toEqual(FROZEN_WRITE_SITES);
  });

  /**
   * Le balayage doit pouvoir TOMBER, sinon il n'atteste rien : un cliquet dont
   * le collecteur ne trouve jamais rien reste vert quoi qu'on écrive. On prouve
   * donc qu'il voit bien des sites, et que le dépouillement des commentaires ne
   * les a pas tous emportés avec eux.
   */
  it('voit réellement les deux tables', () => {
    const models = new Set(sweepPreferenceWriteSites().map((site) => site.model));
    expect([...models].sort()).toEqual(['userCommunityPreferences', 'userConversationPreferences']);
  });
});

/**
 * Le collecteur exercé sur une arborescence FABRIQUÉE : c'est la seule façon de
 * montrer qu'il tombe sous la mutation qu'il nomme sans muter la production.
 */
describe('sweepPreferenceWriteSites — le collecteur', () => {
  let root: string | null = null;

  const buildTree = (files: Record<string, string>): string => {
    root = mkdtempSync(join(tmpdir(), 'pref-writer-sweep-'));
    for (const [relative, source] of Object.entries(files)) {
      const absolute = join(root, relative);
      mkdirSync(join(absolute, '..'), { recursive: true });
      writeFileSync(absolute, source, 'utf8');
    }
    return root;
  };

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
    root = null;
  });

  it('attrape un écrivain neuf dans un fichier neuf', () => {
    const tree = buildTree({
      'services/newWriter.ts': 'await prisma.userCommunityPreferences.upsert({ where, create, update });',
    });

    expect(sweepPreferenceWriteSites(tree).map(formatSite)).toEqual([
      'services/newWriter.ts|userCommunityPreferences|upsert',
    ]);
  });

  it('compte chaque site, pas chaque fichier', () => {
    const tree = buildTree({
      'routes/two.ts': [
        'await prisma.userConversationPreferences.upsert({});',
        'await prisma.userConversationPreferences.update({});',
      ].join('\n'),
    });

    expect(sweepPreferenceWriteSites(tree).map(formatSite)).toEqual([
      'routes/two.ts|userConversationPreferences|update',
      'routes/two.ts|userConversationPreferences|upsert',
    ]);
  });

  /**
   * Les LECTURES ne sont pas des écritures : un balayage qui les compterait
   * mesurerait la popularité de la table, pas la propriété qui nous intéresse.
   */
  it('ignore les lectures', () => {
    const tree = buildTree({
      'routes/reads.ts': [
        'await prisma.userCommunityPreferences.findUnique({});',
        'await prisma.userCommunityPreferences.findMany({});',
        'await prisma.userCommunityPreferences.count({});',
      ].join('\n'),
    });

    expect(sweepPreferenceWriteSites(tree)).toEqual([]);
  });

  /**
   * Le dépouillement des commentaires est ce qui empêche le balayage de
   * retrouver les commentaires des cycles précédents — qui CITENT les sites —
   * au lieu des sites eux-mêmes.
   */
  it('ne compte ni les commentaires de ligne ni les blocs', () => {
    const tree = buildTree({
      'routes/commented.ts': [
        '// await prisma.userCommunityPreferences.upsert({});',
        '/* historique : prisma.userConversationPreferences.update({}) */',
        'await prisma.userCommunityPreferences.upsert({});',
      ].join('\n'),
    });

    expect(sweepPreferenceWriteSites(tree).map(formatSite)).toEqual([
      'routes/commented.ts|userCommunityPreferences|upsert',
    ]);
  });

  it('ignore les fichiers de test', () => {
    const tree = buildTree({
      '__tests__/double.ts': 'prisma.userCommunityPreferences.upsert({});',
      'routes/real.ts': 'prisma.userCommunityPreferences.upsert({});',
    });

    expect(sweepPreferenceWriteSites(tree).map(formatSite)).toEqual([
      'routes/real.ts|userCommunityPreferences|upsert',
    ]);
  });
});
