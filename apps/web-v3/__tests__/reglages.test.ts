/**
 * @jest-environment node
 */

import {
  documentDeLApplication,
  documentDeLEdition,
  documentDeLaSecurite,
  documentDuCarrefour,
  documentDuMotDePasse,
  documentDuProfil,
} from '@/app/connecte/reglages-vue';
import type { Lecteur } from '@/lib/api/compte';
import type { Appareil } from '@/lib/api/reglages';
import { REGLAGES } from '@/lib/contenu/reglages';

/**
 * CE QUE CES TÉMOINS ÉPROUVENT — les six écrans de réglages, et surtout les
 * quatre décisions qu'aucune capture ne montrerait :
 *
 *   • le carrefour ne mène QU'À des destinations qui existent ;
 *   • ce qui ne s'édite pas n'est pas un lien ;
 *   • un formulaire refusé rend la saisie, SAUF les mots de passe ;
 *   • le thème coché vient du COOKIE, jamais de la classe rendue.
 */

const LECTEUR: Lecteur = {
  id: 'u1',
  prenom: 'Amina',
  nom: 'Diallo',
  nomAffiche: 'Amina D.',
  pseudonyme: 'amina',
  bio: 'Deux lignes.',
  email: 'amina@meeshy.me',
  telephone: null,
  systemLanguage: 'fr',
  regionalLanguage: 'wo',
  customDestinationLanguage: null,
};

const APPAREIL: Appareil = { id: 'd1', nom: 'iPhone d’Amina', plateforme: 'ios', vuA: null };

describe('le carrefour des réglages', () => {
  const html = documentDuCarrefour();

  it('mène aux trois écrans que la passerelle sert', () => {
    expect(html).toContain('href="/settings/profile"');
    expect(html).toContain('href="/settings/security"');
    expect(html).toContain('href="/settings/application"');
  });

  /**
   * LE TÉMOIN QUI COMPTE. La cible dessine sept rangées ; quatre n'ont aucune
   * route. Une rangée grisée serait un contrôle sans effet (charte règle 7), et
   * un lien mort serait pire — il se pré-charge, il s'indexe, et il rend 404.
   */
  it('ne mène à AUCUN des quatre écrans que la passerelle ne sert pas', () => {
    ['/settings/privacy', '/settings/media', '/settings/message', '/settings/notification'].forEach((mort) => {
      expect(html).not.toContain(`href="${mort}"`);
    });
  });
});

describe('la fiche du profil', () => {
  const html = documentDuProfil(LECTEUR);

  it('rend les trois rangs du Prisme dans l’ordre, numérotés', () => {
    const rangs = [...html.matchAll(/<span class="rang" aria-hidden="true">(\d)<\/span>/g)].map(([, n]) => n);
    expect(rangs).toEqual(['1', '2', '3']);
  });

  it('dit « Aucune » pour un rang vide plutôt que de le faire disparaître', () => {
    expect(html).toContain(REGLAGES.profil.aucune);
  });

  it('marque chaque langue servie avec son attribut lang — un nom de langue n’est pas du français', () => {
    expect(html).toContain('lang="fr"');
    expect(html).toContain('lang="wo"');
  });

  /**
   * L'E-MAIL EST MONTRÉ ET N'OUVRE RIEN. `PATCH /users/me` l'exclut (#4184) :
   * un chevron y promettrait un écran que la v3 ne sert pas.
   */
  it('montre l’e-mail sans en faire un lien', () => {
    expect(html).toContain('amina@meeshy.me');
    expect(html).not.toMatch(/<a[^>]*>[^<]*amina@meeshy\.me/);
    expect(html).toContain(REGLAGES.profil.ailleurs);
  });

  it('n’offre qu’UNE porte d’écriture — celle de l’édition', () => {
    expect(html).toContain('href="/settings/profile/edit"');
    expect(html).not.toContain('<form');
  });
});

describe('le formulaire du profil', () => {
  it('repose la saisie après un refus, et rend le motif de la passerelle tel quel', () => {
    const html = documentDeLEdition({
      valeurs: { ...LECTEUR, bio: 'Ce que je viens de taper' },
      avis: 'refuse',
      motif: 'Bio must be at most 500 characters',
    });

    expect(html).toContain('Ce que je viens de taper');
    expect(html).toContain('Bio must be at most 500 characters');
    expect(html).toContain('role="alert"');
  });

  it('coche la langue déjà choisie à chacun des trois rangs', () => {
    const html = documentDeLEdition({ valeurs: LECTEUR, avis: null });

    expect(html).toContain('<option value="fr" selected>');
    expect(html).toContain('<option value="wo" selected>');
  });

  it('offre de DÉFAIRE un rang — sans quoi une langue posée serait indélébile', () => {
    const html = documentDeLEdition({ valeurs: LECTEUR, avis: null });

    expect(html).toContain(`<option value="" selected>${REGLAGES.profil.aucune}</option>`);
  });

  it('borne la bio au plafond que le schéma déclare', () => {
    expect(documentDeLEdition({ valeurs: LECTEUR, avis: null })).toContain(`maxlength="${REGLAGES.edition.bioMax}"`);
  });
});

describe('l’apparence', () => {
  it('coche le thème que le cookie porte', () => {
    expect(documentDeLApplication({ theme: 'clair' })).toContain('value="clair" checked');
  });

  /**
   * SANS COOKIE, C'EST « SYSTÈME » QUI EST COCHÉ — jamais « Sombre » au motif
   * que le document est rendu sombre. Le serveur ne connaît pas la préférence
   * système du lecteur : cocher un choix explicite qu'il n'a pas fait lui
   * ferait croire qu'il a déjà tranché.
   */
  it('coche « système » quand aucun choix n’a été fait', () => {
    const html = documentDeLApplication({ theme: 'systeme' });

    expect(html).toContain('value="systeme" checked');
    expect(html).not.toContain('value="sombre" checked');
  });

  it('rend le choix par un groupe de radios nommé, pas par trois boutons', () => {
    const html = documentDeLApplication({ theme: 'systeme' });

    expect(html).toContain('<fieldset class="choix">');
    expect(html).toContain(`<legend>${REGLAGES.application.theme}</legend>`);
    expect((html.match(/type="radio"/g) ?? []).length).toBe(3);
  });

  it('dit que la langue d’interface est unique au lieu d’offrir un sélecteur inerte', () => {
    const html = documentDeLApplication({ theme: 'systeme' });

    expect(html).toContain(REGLAGES.application.langueUnique);
    expect(html).not.toContain(`name="langue"`);
  });
});

describe('la sécurité', () => {
  it('retire un appareil par un formulaire, l’identifiant en champ caché', () => {
    const html = documentDeLaSecurite({ appareils: [APPAREIL], maintenant: Date.now(), avis: null });

    expect(html).toContain('<form method="post">');
    expect(html).toContain('<input type="hidden" name="appareil" value="d1">');
    // Un jeton de push n'a rien à faire dans une URL : ni historique, ni journal.
    expect(html).not.toContain('href="/settings/security?appareil=d1"');
  });

  it('dessine l’état vide plutôt que de laisser une section muette (charte règle 18)', () => {
    const html = documentDeLaSecurite({ appareils: [], maintenant: Date.now(), avis: null });

    expect(html).toContain('carte-vide');
    expect(html).toContain(REGLAGES.securite.aucunAppareil);
  });

  it('mène au changement de mot de passe', () => {
    const html = documentDeLaSecurite({ appareils: [], maintenant: Date.now(), avis: null });

    expect(html).toContain('href="/settings/security/password"');
  });
});

describe('le changement de mot de passe', () => {
  /**
   * LA SEULE EXCEPTION À LA RÈGLE DE LA SAISIE GARDÉE, et elle est délibérée :
   * un mot de passe réémis dans le HTML se retrouve dans le cache du
   * navigateur et dans toute copie de la page.
   */
  it('ne repose JAMAIS ce qui a été tapé, même après un refus', () => {
    const html = documentDuMotDePasse({ avis: 'refuse', motif: 'Current password is incorrect' });

    expect(html).toContain('Current password is incorrect');
    expect(html).not.toContain('value="');
  });

  it('annonce la règle des 8 caractères AVANT la saisie, et la fait porter au champ', () => {
    const html = documentDuMotDePasse({ avis: null });

    expect(html).toContain(REGLAGES.motDePasse.regle);
    expect(html).toContain(`minlength="${REGLAGES.motDePasse.minimum}"`);
    expect(html).toContain('aria-describedby="regle-mdp"');
  });

  it('nomme les deux rôles qu’un gestionnaire de mots de passe attend', () => {
    const html = documentDuMotDePasse({ avis: null });

    expect(html).toContain('autocomplete="current-password"');
    expect(html).toContain('autocomplete="new-password"');
  });
});
