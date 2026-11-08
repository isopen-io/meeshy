import { beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { loadCommunityMembershipCatalog } from '@/lib/i18n-community-membership-catalog';
import { loadCommunitySettingsCatalog } from '@/lib/i18n-community-settings-catalog';

import { CommunitySettingsLink } from './community-members-parts';
import { SettingsCreatorOnly, SettingsDangerZone, SettingsSaveButton } from './community-settings-parts';

/**
 * LES RÉGLAGES DESSINÉS (#6377) — « Enregistrer » inerte tant que rien ne
 * change, la zone dangereuse nommée, le refus d'un non-créateur dit dans la
 * langue du lecteur, et l'entrée « Réglages » du détail qui mène à l'écran.
 */

const noop = () => undefined;

describe('les réglages d’une communauté', () => {
  beforeAll(async () => {
    await Promise.all([loadInterfaceCatalog('fr'), loadCommunitySettingsCatalog('fr'), loadCommunitySettingsCatalog('ar'), loadCommunityMembershipCatalog('fr')]);
  });

  test('« Enregistrer » est un bouton d’envoi, inerte et dit inerte quand rien ne change', () => {
    const html = renderToStaticMarkup(<SettingsSaveButton language="fr" saving={false} disabled />);
    expect(html).toContain('type="submit"');
    expect(html).toContain('Enregistrer');
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain(' disabled="');
  });

  test('pendant l’envoi, le bouton le dit', () => {
    const html = renderToStaticMarkup(<SettingsSaveButton language="fr" saving disabled />);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('Enregistrement…');
  });

  test('la zone dangereuse est une section nommée, et « Supprimer » n’est pas un envoi', () => {
    const html = renderToStaticMarkup(<SettingsDangerZone language="fr" disabled={false} onDelete={noop} />);
    expect(html).toContain('aria-labelledby="community-settings-danger"');
    expect(html).toContain('Zone dangereuse');
    expect(html).toContain('type="button"');
    expect(html).toContain('Supprimer la communauté');
  });

  test('un lecteur qui ne l’a pas créée voit un refus annoncé, dans sa langue', () => {
    const html = renderToStaticMarkup(<SettingsCreatorOnly language="ar" />);
    expect(html).toContain('role="alert"');
    expect(html).toContain('للمنشئ فقط');
  });

  test('l’entrée « Réglages » du détail mène à l’écran des réglages', () => {
    const html = renderToStaticMarkup(<CommunitySettingsLink language="fr" communityId="m-club" />);
    expect(html).toContain('href="/communities/m-club/settings"');
    expect(html).toContain('Réglages');
  });
});
