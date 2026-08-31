import { axe } from 'jest-axe';
import { renderToStaticMarkup } from 'react-dom/server';

import { DOCUMENT_LANGUAGE } from '@/app/document-language';
import { languesProposees } from '@/app/(public)/chats/[lien]/langues';
import {
  etatDeRefus,
  etatDuVerdictServi,
  pointsDuLien,
  pseudoARemplir,
  type EtatDeRefus,
} from '@/app/(public)/chats/[lien]/etats';
import { VueDeJonction } from '@/app/(public)/chats/[lien]/vue';
import { THEME_PAR_DEFAUT } from '@/app/theme-script';
import { CAUSES_DE_REFUS, type CauseDeRefus, type LienDadhesion } from '@/lib/api/adhesion';
import { refusServiDepuisLaValeur } from '@/lib/api/refus-servi-cookie';
import type { CleDeLien } from '@/lib/api/guest-session';

/**
 * L'écran `join` tel qu'un visiteur SANS JAVASCRIPT le reçoit.
 *
 * Ce que ce témoin juge est le HTML STATIQUE — celui que le serveur envoie et
 * que le navigateur rend seul, sans hydratation. C'est exactement la population
 * du critère de fin (`javaScriptEnabled: false`), et c'est pourquoi le rendu
 * passe par `renderToStaticMarkup` puis par un `document.write` : un
 * `render()` de bibliothèque de test monterait React, donc jugerait une page
 * que ce visiteur ne reçoit jamais.
 *
 * Le document est écrit COMPLET — `<html lang>`, classe de thème, `<body>` —
 * parce qu'`axe` juge une page et non un fragment : `html-has-lang`,
 * `landmark-one-main`, `region` et `page-has-heading-one` ne peuvent tomber que
 * là, et ce sont précisément celles qu'un écran servi sans JavaScript doit
 * tenir.
 */

const LIEN: LienDadhesion = {
  cle: 'mshy_lagos' as CleDeLien,
  nom: 'Équipe Lagos',
  invitation: 'On prépare la revue de mars. Écris dans ta langue, tout est traduit.',
  exigePseudo: true,
  exigeEmail: false,
  exigeNaissance: false,
  exigeCompte: false,
  echeance: Date.parse('2026-08-12T00:00:00.000Z'),
  placesRestantes: 14,
  languesDuLien: [],
  languesParlees: ['en', 'fr', 'yo'],
};

const ecran = (
  ajustements: {
    readonly lien?: Partial<LienDadhesion>;
    readonly refus?: EtatDeRefus | null;
    readonly pseudo?: string;
    readonly acceptLanguage?: string | null;
  } = {},
) => {
  const lien = { ...LIEN, ...ajustements.lien };
  const proposition = languesProposees({
    lien,
    acceptLanguage: ajustements.acceptLanguage ?? 'fr-FR,fr;q=0.9,en;q=0.8',
  });

  return {
    lien,
    proposition,
    prerempli: { pseudo: ajustements.pseudo ?? '', langue: proposition.choisie },
    refus: ajustements.refus ?? null,
    action: '/chats/mshy_lagos',
    retour: '/chats/mshy_lagos',
  };
};

const ecrit = (markup: string): void => {
  document.open();
  document.write(
    `<!doctype html><html lang="${DOCUMENT_LANGUAGE}" class="${THEME_PAR_DEFAUT}"><body>${markup}</body></html>`,
  );
  document.close();
};

const peint = (parametres: Parameters<typeof ecran>[0] = {}): void =>
  ecrit(renderToStaticMarkup(<VueDeJonction ecran={ecran(parametres)} />));

const graves = async (): Promise<readonly string[]> => {
  const rapport = await axe(document.documentElement);
  return rapport.violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map((violation) => `${violation.id} — ${violation.help}`);
};

describe('l’écran de jonction, servi sans JavaScript', () => {
  it('rend l’invitation avec ses repères de page', () => {
    peint();

    expect(document.querySelector('header')).not.toBeNull();
    expect(document.querySelector('main#main-content')).not.toBeNull();
    expect(document.querySelector('h1')?.textContent).toBe('Équipe Lagos');
    expect(document.querySelector('blockquote')?.textContent).toContain('revue de mars');
  });

  it('n’expédie AUCUN script — le formulaire est du HTML, pas un îlot', () => {
    peint();

    expect(document.querySelectorAll('script')).toHaveLength(0);
    expect(document.querySelectorAll('[onclick]')).toHaveLength(0);
  });

  it('ne transporte rien de l’identité du créateur du lien', () => {
    peint();

    expect(document.body.innerHTML).not.toContain('Ibrahim');
    expect(document.body.innerHTML).not.toContain('creator');
  });
});

describe('l’accordéon des droits', () => {
  it('est un <details>/<summary> natif — donc atteignable au clavier sans un octet de JS', () => {
    peint();

    const details = document.querySelector('details');
    const resume = details?.querySelector(':scope > summary');

    expect(details).not.toBeNull();
    expect(resume).not.toBeNull();
    // Le clavier vient de la BALISE : un `tabindex` posé à la main dirait que
    // l'atteignabilité a été fabriquée, donc qu'elle peut se défaire.
    expect(resume?.getAttribute('tabindex')).toBeNull();
  });

  it('est fermé par défaut et porte un point par condition du lien', () => {
    peint();

    const details = document.querySelector('details');
    expect(details?.hasAttribute('open')).toBe(false);
    expect(details?.querySelectorAll('li')).toHaveLength(pointsDuLien(LIEN).length);
  });

  it('s’ouvre de lui-même quand le refus porte sur ce que le lien impose', () => {
    peint({ refus: etatDeRefus('lien-epuise') });

    expect(document.querySelector('details')?.hasAttribute('open')).toBe(true);
  });

  it('dit ce que le lien EXIGE, jamais un droit qu’aucune porte ne sert', () => {
    peint();

    const texte = document.querySelector('details')?.textContent ?? '';
    expect(texte).toContain('Entrer sans compte');
    expect(texte).toContain('12 août');
    expect(texte).toContain('14 places restantes');
  });
});

describe('la langue parlée', () => {
  it('est pré-remplie depuis Accept-Language, jamais « fr » en dur', () => {
    peint({ acceptLanguage: 'yo-NG,yo;q=0.9,en;q=0.5' });

    const select = document.querySelector<HTMLSelectElement>('select#langue');
    const choisie = select?.querySelector<HTMLOptionElement>('option[selected]');

    expect(choisie?.value).toBe('yo');
  });

  it('propose aussi ce qui se parle déjà dans la conversation', () => {
    peint({ acceptLanguage: 'de' });

    const codes = [...document.querySelectorAll<HTMLOptionElement>('select#langue option')].map(
      (option) => option.value,
    );

    expect(codes[0]).toBe('de');
    expect(codes).toEqual(expect.arrayContaining(['en', 'fr', 'yo']));
  });

  it('n’offre pas un choix que le lien refuserait en 403', () => {
    peint({ acceptLanguage: 'de', lien: { languesDuLien: ['fr', 'en'] } });

    const codes = [...document.querySelectorAll<HTMLOptionElement>('select#langue option')].map(
      (option) => option.value,
    );

    // L'allemand demandé n'est pas admis : restent les langues DÉJÀ parlées
    // ici, dans leur ordre, puis celles que le lien nomme sans que personne ne
    // les parle encore.
    expect(codes).toEqual(['en', 'fr']);
  });

  it('porte une étiquette liée à son champ, pas un simple texte au-dessus', () => {
    peint();

    const etiquette = document.querySelector('label[for="langue"]');
    expect(etiquette?.textContent).toBe('Langue parlée');
  });
});

describe('les refus, un état peint par cause', () => {
  it.each(CAUSES_DE_REFUS)('peint « %s » avec son titre et sa suite', (cause: CauseDeRefus) => {
    const refus = etatDeRefus(cause);
    peint({ refus });

    const alerte = document.querySelector('[role="alert"]');
    expect(alerte?.textContent).toContain(refus.titre);
    expect(document.querySelector('form') === null).toBe(refus.reessayable === false);
  });

  /**
   * L'AUTORITÉ d'un refus, pas seulement sa forme.
   *
   * Le verdict venait de l'URL, bornée à l'union fermée des causes — donc
   * inattaquable par injection, et pourtant falsifiable : un
   * `/chats/mshy_lagos?refus=lien-desactive` collé dans une conversation
   * affichait « Ce lien a été fermé », SANS formulaire, sur une invitation
   * parfaitement ouverte. Le verdict vient désormais d'un cookie que seul le
   * serveur écrit ; ces cas gardent la relecture DÉFENSIVE de ce cookie.
   */
  it('ne peint rien pour un verdict que personne n’a prononcé', () => {
    expect(etatDuVerdictServi(null)).toBeNull();
    expect(refusServiDepuisLaValeur(null)).toBeNull();
    expect(refusServiDepuisLaValeur('pas du json')).toBeNull();
    expect(refusServiDepuisLaValeur('"lien-desactive"')).toBeNull();
    expect(refusServiDepuisLaValeur(JSON.stringify({ cause: 'vous-etes-banni' }))).toBeNull();
    expect(
      refusServiDepuisLaValeur(JSON.stringify({ cause: '<script>alert(1)</script>' })),
    ).toBeNull();
  });

  it('relit le verdict que le serveur a écrit, cause et suggestion', () => {
    const verdict = refusServiDepuisLaValeur(
      JSON.stringify({ cause: 'pseudo-pris', suggestion: 'Tolu2' }),
    );

    expect(verdict).toEqual({ cause: 'pseudo-pris', suggestion: 'Tolu2' });
    expect(etatDuVerdictServi(verdict)?.titre).toBe('Ce pseudo est déjà pris ici');
  });

  it('nomme l’indisponibilité, qui n’est PAS un refus, et laisse le formulaire ouvert', () => {
    peint({ refus: etatDuVerdictServi({ cause: 'indisponible', suggestion: null }) });

    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      'Impossible de joindre la conversation',
    );
    expect(document.querySelector('form')).not.toBeNull();
  });

  it('pré-remplit le pseudo que la passerelle propose sur un 409', () => {
    peint({ refus: etatDeRefus('pseudo-pris'), pseudo: 'Tolu2' });

    expect(document.querySelector<HTMLInputElement>('input#pseudo')?.value).toBe('Tolu2');
  });

  it('fait passer la suggestion devant ce que le visiteur avait tapé', () => {
    expect(pseudoARemplir({ suggestion: 'Tolu2', tape: 'Tolu' })).toBe('Tolu2');
    expect(pseudoARemplir({ suggestion: null, tape: 'Tolu' })).toBe('Tolu');
    expect(pseudoARemplir({ suggestion: null, tape: null })).toBe('');
  });
});

describe('un lien qui exige un compte', () => {
  it('remplace le formulaire par les deux portes, sans contrôle inerte', () => {
    peint({ lien: { exigeCompte: true } });

    expect(document.querySelector('form')).toBeNull();
    const portes = [...document.querySelectorAll<HTMLAnchorElement>('nav a')].map((a) =>
      a.getAttribute('href'),
    );
    // `returnUrl` — le paramètre que le DESTINATAIRE lit
    // (`apps/web/app/login/page.tsx`), jamais `next`, qu'aucun fichier de la
    // zone legacy ne lit. `/signup` n'en lit aucun et ouvre `/dashboard` sans
    // condition : lui en poser un serait une décoration sans effet.
    expect(portes).toEqual(['/login?returnUrl=%2Fchats%2Fmshy_lagos', '/signup']);
  });

  it('ne promet le retour que sur la porte qui revient vraiment', () => {
    expect(etatDeRefus('compte-requis').corps).toContain('Connectez-vous');
    expect(etatDeRefus('compte-requis').corps).not.toMatch(
      /créez un compte\s*:\s*vous reviendrez/i,
    );
  });
});

describe('les champs que le lien impose', () => {
  it('ne demande e-mail et date de naissance que si le lien les exige', () => {
    peint();
    expect(document.querySelector('input#email')).toBeNull();
    expect(document.querySelector('input#naissance')).toBeNull();

    peint({ lien: { exigeEmail: true, exigeNaissance: true } });
    expect(document.querySelector<HTMLInputElement>('input#email')?.required).toBe(true);
    expect(document.querySelector<HTMLInputElement>('input#naissance')?.type).toBe('date');
  });

  it('marque le pseudo obligatoire dans le HTML, pour que le navigateur le tienne seul', () => {
    peint();

    expect(document.querySelector<HTMLInputElement>('input#pseudo')?.required).toBe(true);
  });

  it('poste le formulaire, plutôt que de le lire', () => {
    peint();

    expect(document.querySelector('form')?.getAttribute('method')).toBe('post');
  });
});

// La PLACE OUVERTE — l'écran `rights` — a son propre témoin
// (`__tests__/droits.test.tsx`) : c'est là que vit la preuve que ses quatre
// droits viennent du même module que l'accordéon rendu ci-dessus.

describe('l’écran face à axe', () => {
  const etats: readonly (readonly [string, Parameters<typeof ecran>[0]])[] = [
    ['nominal', {}],
    ['avec un refus réparable', { refus: etatDeRefus('pseudo-pris'), pseudo: 'Tolu2' }],
    ['avec un refus définitif', { refus: etatDeRefus('lien-expire') }],
    ['avec un compte exigé', { lien: { exigeCompte: true } }],
    ['avec e-mail et date exigés', { lien: { exigeEmail: true, exigeNaissance: true } }],
  ];

  it.each(etats)('ne porte aucune violation grave — %s', async (_nom, parametres) => {
    peint(parametres);

    expect(await graves()).toEqual([]);
  });

  it('rougit sur une page dont la structure est fautive', async () => {
    ecrit('<div onclick="void 0" tabindex="0"><img src="x"></div>');

    expect(await graves()).not.toEqual([]);
  });
});
