import { beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { loadCommunityMembershipCatalog } from '@/lib/i18n-community-membership-catalog';
import { loadCommunitySettingsCatalog } from '@/lib/i18n-community-settings-catalog';

import { CommunitySettingsLink } from './community-members-parts';
import { SettingsCreatorOnly, SettingsDangerZone, SettingsImages, SettingsSaveButton } from './community-settings-parts';

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

  test('la bannière et l’avatar se changent par deux boutons nommés, de 44 px au moins', () => {
    const html = renderToStaticMarkup(
      <SettingsImages language="fr" name="Club" shown={{ avatar: null, banner: null }} uploading={{}} disabled={false} onPick={noop} />,
    );
    expect(html).toContain('aria-label="Changer la bannière"');
    expect(html).toContain('aria-label="Changer l’avatar"');
    expect(html).toContain('Modifier');
    expect(html).toContain('min-width:44px');
    expect(html).toContain('width:44px;height:44px');
    expect(html).not.toContain('data-community-settings-uploading');
  });

  test('une image servie s’affiche par la route de flux ; une image en cours d’envoi, sous un voile annoncé', () => {
    const html = renderToStaticMarkup(
      <SettingsImages
        language="fr"
        name="Club"
        shown={{ avatar: 'blob:https://meeshy.me/aperçu', banner: '2026/11/65f0c0ffee/banner.webp' }}
        uploading={{ avatar: true }}
        disabled={false}
        onPick={noop}
      />,
    );
    expect(html).toContain('src="blob:https://meeshy.me/aperçu"');
    expect(html).toContain(encodeURIComponent('2026/11/65f0c0ffee/banner.webp'));
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('Envoi de l’image…');
    expect(html.match(/data-community-settings-uploading/g)?.length).toBe(1);
  });
});
