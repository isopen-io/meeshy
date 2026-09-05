import { documentDesLiens, SAISIE_NEUVE, type EtatDesLiens } from '@/app/connecte/liens-vue';

/**
 * LES FENTES DU DIRECT DE `/links` (issue #5090) — opposées au document servi.
 * Le module poste la feuille par `fetch` et échange `#carnet` contre celui du
 * document redemandé ; en refus il pose la feuille SERVIE ; en panne il parle
 * dans la voix de la feuille. Chaque surface qu'il touche doit être SERVIE.
 */

const ETAT = (attributs: Partial<EtatDesLiens> = {}): EtatDesLiens => ({
  liens: [],
  actifs: 0,
  avis: null,
  tempsReel: { module: '/__v3/rt/liens.abcd.js' },
  ...attributs,
});

const peint = (etat: EtatDesLiens): void => {
  document.open();
  document.write(documentDesLiens(etat));
  document.close();
};

describe('le document des liens porte ses fentes de direct', () => {
  it('sert la région du carnet, IDENTIFIÉE — l’avis « créé » vit DEDANS et voyage avec elle', () => {
    peint(ETAT({ avis: 'cree' }));

    const carnet = document.querySelector<HTMLElement>('main[data-participation="liens"] #carnet')!;
    expect(carnet).not.toBeNull();
    expect(carnet.querySelector('.avis[role="status"]')).not.toBeNull();
  });

  it('nomme son module — et s’en abstient quand il n’est pas compilé', () => {
    peint(ETAT());
    expect(document.querySelector<HTMLElement>('main')!.dataset.module).toBe('/__v3/rt/liens.abcd.js');

    peint(ETAT({ tempsReel: null }));
    expect(document.querySelector('main[data-participation]')).toBeNull();
    expect(document.querySelector('#carnet')).not.toBeNull();
  });

  it('la feuille sert sa VOIX, muette — une région créée après coup n’est annoncée par personne', () => {
    peint(ETAT({ nouveau: true, saisie: SAISIE_NEUVE }));

    const voix = document.querySelector<HTMLElement>('dialog.nouveau-lien .avis-feuille')!;
    expect(voix.getAttribute('role')).toBe('status');
    expect(voix.hidden).toBe(true);
    expect(voix.textContent).toBe('');
    // Et le formulaire reste un POST — le chemin sans JavaScript est entier.
    expect(document.querySelector<HTMLFormElement>('dialog.nouveau-lien form')!.method).toBe('post');
  });

  /** #4933 — LE GESTE DE FERMETURE : la ligne IDENTIFIÉE, le menu que le module intercepte. */
  it('identifie chaque ligne pour le module, et porte un menu de fermeture sur une ligne active', () => {
    peint(
      ETAT({
        liens: [
          {
            identifiant: 'mshy_lagos',
            nom: 'Ops Lagos',
            utilisations: 4,
            conversation: 'c1',
            actif: true,
            capacite: null,
            expireA: null,
          },
        ],
        actifs: 1,
      }),
    );

    const ligne = document.querySelector<HTMLElement>('li[data-lien="mshy_lagos"]')!;
    expect(ligne).not.toBeNull();
    const forme = ligne.querySelector<HTMLFormElement>('details.actions form')!;
    expect(forme.method).toBe('post');
    expect((forme.elements.namedItem('geste') as HTMLInputElement).value).toBe('fermer');
    expect((forme.elements.namedItem('lien') as HTMLInputElement).value).toBe('mshy_lagos');
  });

  it('la voix du carnet est servie, muette, prête à porter le refus de fermeture', () => {
    peint(ETAT());

    const alerte = document.querySelector<HTMLElement>('#carnet > .avis.alerte')!;
    // La région existe AVANT qu'on n'y écrive — une `role="alert"` insérée avec
    // son texte n'est annoncée par aucun lecteur d'écran de façon fiable.
    expect(alerte).not.toBeNull();
    expect(alerte.hidden).toBe(true);
    expect(alerte.querySelector<HTMLElement>('.motif')!.textContent).toBe('');
  });
});
