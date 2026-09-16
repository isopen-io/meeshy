import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { MyProfile } from '@/lib/api/profile';

import {
  ContactSection,
  IdentitySection,
  LanguagesSection,
  MemberSinceSection,
  ProfileHeaderBar,
  ProfileHero,
  ProfileLoadError,
  ProfileOfflineNotice,
  ProgressionEntry,
  RequestsSection,
  StatsSection,
} from './profile-sections';

/**
 * LE PROFIL DESSINÉ (#6289) — miroir `ProfileView.swift` : chaque section est
 * un composant PUR, rendu sans DOM ni TanStack Query (motif
 * `notifications.test.tsx`). Ces témoins prouvent ce qu'aucune capture ne
 * dit : où une section MÈNE, ce qu'elle ANNONCE, et ce qu'elle ne montre pas.
 */

const noop = () => undefined;

const profileOf = (overrides: Partial<MyProfile> = {}): MyProfile => ({
  id: 'u-ada',
  username: 'ada',
  displayName: 'Ada L.',
  firstName: 'Ada',
  lastName: 'Lovelace',
  bio: '',
  avatar: null,
  banner: null,
  systemLanguage: 'fr',
  regionalLanguage: null,
  customDestinationLanguage: 'es',
  email: { masked: 'a•••@meeshy.example', verified: true },
  phone: { masked: '+33 •••• 78', verified: false },
  createdAt: '2025-03-14T09:00:00.000Z',
  ...overrides,
});

describe('l’en-tête', () => {
  test('lecture : un retour NOMMÉ, le titre, et « Modifier »', () => {
    const html = renderToStaticMarkup(
      <ProfileHeaderBar language="fr" editing={false} saving={false} online ready onEdit={noop} onCancel={noop} onSave={noop} />,
    );
    expect(html).toContain('aria-label="Revenir aux conversations"');
    expect(html).toContain('Profil');
    expect(html).toContain('Modifier');
    expect(html).not.toContain('disabled');
  });

  test('hors ligne, « Modifier » est désactivé', () => {
    const html = renderToStaticMarkup(
      <ProfileHeaderBar language="fr" editing={false} saving={false} online={false} ready onEdit={noop} onCancel={noop} onSave={noop} />,
    );
    expect(html).toMatch(/<button[^>]*disabled[^>]*>[^<]*Modifier/);
  });

  /* #6343 — sans profil servi (démarrage à froid, lecture en erreur), aucun
     brouillon ne peut naître : « Modifier » actif serait un bouton sans effet. */
  test('profil pas encore servi, « Modifier » est désactivé — en ligne', () => {
    const html = renderToStaticMarkup(
      <ProfileHeaderBar language="fr" editing={false} saving={false} online ready={false} onEdit={noop} onCancel={noop} onSave={noop} />,
    );
    expect(html).toMatch(/<button[^>]*disabled[^>]*>[^<]*Modifier/);
  });

  test('édition : « Annuler » et « Enregistrer »', () => {
    const html = renderToStaticMarkup(
      <ProfileHeaderBar language="fr" editing saving={false} online ready onEdit={noop} onCancel={noop} onSave={noop} />,
    );
    expect(html).toContain('Annuler');
    expect(html).toContain('Enregistrer');
  });
});

describe('la bannière et l’avatar', () => {
  test('le nom et l’@identifiant ; les initiales quand aucune photo n’est servie', () => {
    const html = renderToStaticMarkup(
      <ProfileHero language="fr" profile={profileOf()} editing={false} pending={{}} onPick={noop} onCancelUpload={noop} />,
    );
    expect(html).toContain('Ada L.');
    expect(html).toContain('@ada');
    expect(html).toContain('>AL<');
    expect(html).not.toContain('<img');
  });

  test('une bannière et une photo servies se peignent', () => {
    const html = renderToStaticMarkup(
      <ProfileHero
        language="fr"
        profile={profileOf({ banner: 'https://static.test/b.webp', avatar: 'https://static.test/a.webp' })}
        editing={false}
        pending={{}}
        onPick={noop}
        onCancelUpload={noop}
      />,
    );
    expect(html).toContain('src="https://static.test/b.webp"');
    expect(html).toContain('src="https://static.test/a.webp"');
  });

  /**
   * BANNIÈRE ET PHOTO SONT DES RÉFÉRENCES DE MÉDIA (#6388) — `MyProfile.banner`
   * et `.avatar` portent la clé de stockage (#4324) ou l'adresse héritée
   * d'avant la migration 013. Le témoin voisin sert deux adresses EXTERNES, qui
   * traversent inchangées ; celui-ci prouve les deux formes de la passerelle.
   */
  test('une clé de stockage et une adresse héritée passent par la route de flux', () => {
    const html = renderToStaticMarkup(
      <ProfileHero
        language="fr"
        profile={profileOf({ banner: '2026/09/6aa607/banner.jpg', avatar: 'https://gate.meeshy.me/2026/09/6aa607/harbor_41.png' })}
        editing={false}
        pending={{}}
        onPick={noop}
        onCancelUpload={noop}
      />,
    );
    expect(html).toContain('src="https://gate.meeshy.me/api/v1/attachments/file/2026%2F09%2F6aa607%2Fbanner.jpg"');
    expect(html).toContain('src="https://gate.meeshy.me/api/v1/attachments/file/2026%2F09%2F6aa607%2Fharbor_41.png"');
  });

  test('en édition, deux contrôles NOMMÉS changent la photo et la bannière', () => {
    const html = renderToStaticMarkup(
      <ProfileHero language="fr" profile={profileOf()} editing pending={{}} onPick={noop} onCancelUpload={noop} />,
    );
    expect(html).toContain('Modifier la photo de profil');
    expect(html).toContain('Modifier la bannière');
  });

  test('un envoi en cours montre l’aperçu LOCAL et offre de l’annuler', () => {
    const html = renderToStaticMarkup(
      <ProfileHero
        language="fr"
        profile={profileOf()}
        editing
        pending={{ avatar: 'blob:aperçu-local' }}
        onPick={noop}
        onCancelUpload={noop}
      />,
    );
    expect(html).toContain('src="blob:aperçu-local"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('Annuler l’envoi');
  });
});

describe('l’identité', () => {
  test('lecture : prénom, nom, pseudo, nom d’affichage, et la bio vide invite', () => {
    const html = renderToStaticMarkup(<IdentitySection language="fr" profile={profileOf()} editing={false} draft={null} onDraft={noop} />);
    for (const text of ['IDENTITÉ', 'Prénom', 'Ada', 'Nom', 'Lovelace', 'Pseudo', '@ada', 'Nom d&#x27;affichage', 'Ada L.', 'Parlez de vous...']) {
      expect(html).toContain(text);
    }
    expect(html).not.toContain('<input');
  });

  test('édition : des champs ÉTIQUETÉS portent le brouillon — le pseudo reste en lecture', () => {
    const html = renderToStaticMarkup(
      <IdentitySection
        language="fr"
        profile={profileOf()}
        editing
        draft={{ firstName: 'Ada', lastName: 'Lovelace', displayName: 'Ada Lovelace', bio: 'Pionnière' }}
        onDraft={noop}
      />,
    );
    expect(html.match(/<input/g)?.length).toBe(3);
    expect(html.match(/<textarea/g)?.length).toBe(1);
    expect(html).toContain('value="Ada Lovelace"');
    expect(html).toContain('Pionnière');
    expect(html).toContain('maxLength="500"');
    expect(html).not.toContain('value="ada"');
  });
});

describe('le contact', () => {
  test('masqué, avec l’état de vérification ; rien à montrer se dit « — »', () => {
    const html = renderToStaticMarkup(<ContactSection language="fr" email={profileOf().email} phone={profileOf().phone} />);
    expect(html).toContain('a•••@meeshy.example');
    expect(html).toContain('Vérifié');
    expect(html).toContain('+33 •••• 78');
    expect(html).toContain('Non vérifié');
    expect(renderToStaticMarkup(<ContactSection language="fr" email={null} phone={null} />)).toContain('—');
  });
});

describe('les langues du Prisme', () => {
  test('les TROIS rangs, dans l’ordre de résolution, chacun sa langue nommée dans sa langue', () => {
    const html = renderToStaticMarkup(
      <LanguagesSection
        language="fr"
        systemLanguage="fr"
        regionalLanguage={null}
        customDestinationLanguage="es"
        disabled={false}
        onOpen={noop}
        onClear={noop}
      />,
    );
    const primary = html.indexOf('Langue principale');
    const regional = html.indexOf('Langue régionale');
    const custom = html.indexOf('Langue personnalisée');
    expect(primary).toBeGreaterThan(-1);
    expect(regional).toBeGreaterThan(primary);
    expect(custom).toBeGreaterThan(regional);
    expect(html).toContain('lang="fr"');
    expect(html).toContain('lang="es"');
    expect(html).toContain('Aucune');
    expect(html).toContain('Le contenu sera traduit dans cette langue');
  });

  test('un rang secondaire posé se retire par un contrôle NOMMÉ ; la langue principale, jamais', () => {
    const html = renderToStaticMarkup(
      <LanguagesSection
        language="fr"
        systemLanguage="fr"
        regionalLanguage="de"
        customDestinationLanguage={null}
        disabled={false}
        onOpen={noop}
        onClear={noop}
      />,
    );
    expect(html).toContain('Retirer la langue régionale');
    expect(html).not.toContain('Retirer la langue principale');
    expect(html).not.toContain('Retirer la langue personnalisée');
  });

  test('hors ligne, les rangs se lisent mais ne s’ouvrent pas', () => {
    const html = renderToStaticMarkup(
      <LanguagesSection
        language="fr"
        systemLanguage="fr"
        regionalLanguage="de"
        customDestinationLanguage={null}
        disabled
        onOpen={noop}
        onClear={noop}
      />,
    );
    expect(html.match(/disabled=""/g)?.length).toBe(3);
  });
});

describe('les statistiques, la progression, les demandes, l’ancienneté', () => {
  test('quatre compteurs, chacun avec son libellé', () => {
    const html = renderToStaticMarkup(
      <StatsSection
        language="fr"
        stats={{ totalMessages: 1204, totalConversations: 18, totalTranslations: 356, languagesUsed: 4, memberDays: 183, friendRequestsReceived: 2 }}
      />,
    );
    for (const text of ['STATISTIQUES', '1204', 'Messages', '356', 'Traductions', '4', 'Langues', '183', 'Jours']) {
      expect(html).toContain(text);
    }
  });

  test('sans statistiques en cache, un squelette OCCUPÉ — jamais des zéros inventés', () => {
    const html = renderToStaticMarkup(<StatsSection language="fr" stats={null} />);
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain('>0<');
  });

  test('la progression mène à /me/progression', () => {
    expect(renderToStaticMarkup(<ProgressionEntry language="fr" />)).toContain('href="/me/progression"');
  });

  test('les demandes d’amis mènent à la découverte, avec leur compte', () => {
    const html = renderToStaticMarkup(<RequestsSection language="fr" pending={{ count: 3, more: false }} />);
    expect(html).toContain('href="/discover"');
    expect(html).toContain('Demandes d&#x27;amis');
    expect(html).toContain('>3<');
    expect(renderToStaticMarkup(<RequestsSection language="fr" pending={{ count: 100, more: true }} />)).toContain('>100+<');
    expect(renderToStaticMarkup(<RequestsSection language="fr" pending={{ count: 0, more: false }} />)).not.toContain('>0<');
  });

  test('membre depuis une date lisible dans la langue de l’interface', () => {
    expect(renderToStaticMarkup(<MemberSinceSection language="fr" createdAt="2025-03-14T09:00:00.000Z" />)).toContain('14 mars 2025');
    expect(renderToStaticMarkup(<MemberSinceSection language="fr" createdAt={null} />)).toContain('—');
  });
});

describe('les états', () => {
  test('l’erreur à cache vide s’annonce et offre de réessayer', () => {
    const html = renderToStaticMarkup(<ProfileLoadError language="fr" onRetry={noop} />);
    expect(html).toContain('role="alert"');
    expect(html).toContain('Impossible de charger votre profil');
    expect(html).toContain('Réessayer');
  });

  test('hors ligne, le profil reste lisible et le dit', () => {
    const html = renderToStaticMarkup(<ProfileOfflineNotice language="fr" />);
    expect(html).toContain('role="status"');
    expect(html).toContain('Hors ligne');
  });
});
