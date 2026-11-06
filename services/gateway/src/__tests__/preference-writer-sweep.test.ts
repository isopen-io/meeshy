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
 * | `conversationPreferencesSync.detachConversationsFromCategory` | `USER_PREFERENCES_UPDATED`, une par conversation détachée — ajouté au cycle 129 |
 * | `services/packs/PackCatalog.settle` (bascule conditionnelle, contact d'`updatedAt`, création) | `PACK_INSTALLATION_UPDATED` après chaque écriture — #10148 (LP0), témoin `packs-engine.test.ts` |
 * | `services/packs/LensPacks.restore` (remise à zéro des installations d'une lens rétablie, #12321) | `PACK_INSTALLATION_UPDATED` (`installed: false`) à chaque compte remis à zéro — témoin `lens-packs.test.ts` |
 * | `services/stickers/StickerLibrary` (création, remontée ×2, retrait) | `STICKER_LIBRARY_UPDATED` après chaque écriture — #16515, témoins `StickerLibrary.announce.test.ts` (l'écrivain annonce) et `sticker-library-broadcast.test.ts` (la route le câble) |
 * | `routes/me/preferences/categories.ts` (create · update · delete · reorder) | `CATEGORY_CREATED` · `CATEGORY_UPDATED` · `CATEGORY_DELETED` · `CATEGORIES_REORDERED` — un verbe, une diffusion ; entré dans ce cliquet par #16515, qui a élargi l'énumération des tables |
 *
 * Les trois écrivains de `user-deletions.ts` n'y figurent PAS : ils passent par
 * `writeConversationPreferences`, ce qui est précisément la forme voulue — un
 * écrivain consolidé ne crée pas de site de plus.
 *
 * | `services/packs/PackPrivacy` (`userSticker.deleteMany`) | aucune — purge RGPD d'un compte supprimé (#10151), aucun appareil à prévenir : même motif que sa jumelle `userStickerPack` une ligne plus bas. |
 * | `routes/communities/settings.ts` (DELETE, `userCommunityPreferences.deleteMany`) | aucune — #9508 : suppression TERMINALE de la communauté, dans la MÊME transaction que `community.delete` ; il n'existe plus d'écran « préférences de cette communauté » à resynchroniser puisque la communauté elle-même disparaît. Même motif de consolidation que `user-deletions.ts` ci-dessus. |
 */
const FROZEN_WRITE_SITES = [
  'routes/communities/settings.ts|userCommunityPreferences|deleteMany',
  'routes/community-preferences.ts|userCommunityPreferences|delete',
  'routes/community-preferences.ts|userCommunityPreferences|upsert',
  'routes/community-preferences.ts|userCommunityPreferences|upsert',
  'routes/conversation-preferences.ts|userConversationPreferences|update',
  'services/packs/LensPacks.ts|userStickerPack|updateMany',
  'services/packs/PackCatalog.ts|userStickerPack|create',
  'services/packs/PackCatalog.ts|userStickerPack|updateMany',
  'services/packs/PackCatalog.ts|userStickerPack|updateMany',
  // La purge RGPD d'un compte supprimé (#10151) : aucun appareil à prévenir, le compte n'existe plus.
  'services/packs/PackPrivacy.ts|userStickerPack|deleteMany',
  // Même purge, même ligne de code (#10151) : la bibliothèque part avec le compte.
  'services/packs/PackPrivacy.ts|userSticker|deleteMany',
  // « Mes stickers » (#7938) : l'écrivain UNIQUE, qui diffuse depuis #16515.
  'services/stickers/StickerLibrary.ts|userSticker|create',
  'services/stickers/StickerLibrary.ts|userSticker|delete',
  'services/stickers/StickerLibrary.ts|userSticker|update',
  'services/stickers/StickerLibrary.ts|userSticker|update',
  // Les dossiers de conversation : quatre verbes, quatre diffusions.
  'routes/me/preferences/categories.ts|userConversationCategory|create',
  'routes/me/preferences/categories.ts|userConversationCategory|delete',
  'routes/me/preferences/categories.ts|userConversationCategory|update',
  'routes/me/preferences/categories.ts|userConversationCategory|updateMany',
  'services/conversationPreferencesSync.ts|userConversationPreferences|updateMany',
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
  it('voit réellement les cinq tables', () => {
    const models = new Set(sweepPreferenceWriteSites().map((site) => site.model));
    expect([...models].sort()).toEqual([
      'userCommunityPreferences',
      'userConversationCategory',
      'userConversationPreferences',
      'userSticker',
      'userStickerPack',
    ]);
  });

  /**
   * `userSticker` est un PRÉFIXE de `userStickerPack`. Les deux tables sont
   * dans ce cliquet, et les confondre ferait d'un site de packs un site de
   * stickers — un inventaire juste par accident, puis faux au premier
   * déplacement.
   */
  it('ne confond pas userSticker avec userStickerPack', () => {
    const sites = sweepPreferenceWriteSites();
    expect(sites.filter((site) => site.model === 'userSticker').map(formatSite).sort()).toEqual([
      'services/packs/PackPrivacy.ts|userSticker|deleteMany',
      'services/stickers/StickerLibrary.ts|userSticker|create',
      'services/stickers/StickerLibrary.ts|userSticker|delete',
      'services/stickers/StickerLibrary.ts|userSticker|update',
      'services/stickers/StickerLibrary.ts|userSticker|update',
    ]);
    expect(sites.filter((site) => site.model === 'userStickerPack' && site.file.includes('stickers/'))).toEqual([]);
  });

  /** Seul `StickerLibrary` écrit la bibliothèque — hors la purge d'un compte supprimé (#16515). */
  it('n’écrit userSticker que depuis l’écrivain unique, ou la purge de compte', () => {
    const outside = sweepPreferenceWriteSites().filter(
      (site) =>
        site.model === 'userSticker' &&
        site.file !== 'services/stickers/StickerLibrary.ts' &&
        site.file !== 'services/packs/PackPrivacy.ts',
    );
    expect(outside).toEqual([]);
  });

  /** Seul le moteur des packs écrit l'installation d'un pack (#10148) : un second écrivain contournerait le compteur atomique et la diffusion. */
  it('n’écrit userStickerPack que depuis services/packs/', () => {
    const outside = sweepPreferenceWriteSites().filter((site) => site.model === 'userStickerPack' && !site.file.startsWith('services/packs/'));
    expect(outside).toEqual([]);
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
