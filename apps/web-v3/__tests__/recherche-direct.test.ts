import { documentDeLaRecherche, type EtatDeLaRecherche } from '@/app/connecte/recherche-vue';

/**
 * LES FENTES DU DIRECT DE `/search` (issue #4897) — opposées au document que
 * le SERVEUR sert. Le module (`lib/realtime/recherche.ts`) échange la région
 * `#resultats` contre celle d'un document redemandé : la région doit donc être
 * SERVIE, identifiée, et le formulaire rester un GET — le chemin sans
 * JavaScript et l'adresse partageable sont le même objet.
 */

const ETAT = (attributs: Partial<EtatDeLaRecherche> = {}): EtatDeLaRecherche => ({
  requete: 'mar',
  conversations: [],
  personnes: [],
  encoreDesPersonnes: false,
  tempsReel: { module: '/__v3/rt/recherche.abcd.js' },
  ...attributs,
});

const peint = (etat: EtatDeLaRecherche): void => {
  document.open();
  document.write(documentDeLaRecherche(etat));
  document.close();
};

describe('le document de la recherche porte ses fentes de direct', () => {
  it('sert la région échangeable, IDENTIFIÉE — un module qui ne la trouve pas ne touche à rien', () => {
    peint(ETAT());

    expect(document.querySelector('main[data-participation="recherche"] #resultats')).not.toBeNull();
  });

  it('nomme son module — et s’en abstient quand il n’est pas compilé', () => {
    peint(ETAT());
    expect(document.querySelector<HTMLElement>('main')!.dataset.module).toBe('/__v3/rt/recherche.abcd.js');

    peint(ETAT({ tempsReel: null }));
    expect(document.querySelector('main[data-participation]')).toBeNull();
    expect(document.querySelector('#resultats')).not.toBeNull();
  });

  it('le formulaire reste un GET — l’adresse partageable EST le chemin sans JavaScript', () => {
    peint(ETAT());
    const formulaire = document.querySelector<HTMLFormElement>('form.chercher')!;

    expect(formulaire.method).toBe('get');
  });
});
