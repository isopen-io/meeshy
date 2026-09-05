import { conversation } from '@/lib/api/compte';
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
  conversationsIndisponibles: false,
  personnes: [],
  encoreDesPersonnes: false,
  personnesIndisponibles: false,
  medias: [],
  encoreDesMedias: false,
  mediasIndisponibles: false,
  liens: [],
  encoreDesLiens: false,
  liensIndisponibles: false,
  tempsReel: { module: '/__v3/rt/recherche.abcd.js' },
  ...attributs,
});

/** Un état GARNI des quatre groupes — pour prouver qu'ils vivent tous dans `#resultats`. */
const ETAT_GARNI = (): EtatDeLaRecherche =>
  ETAT({
    conversations: [conversation({ id: 'c1', title: 'Équipe Lagos', type: 'group', memberCount: 12 })!],
    personnes: [{ id: 'u-sara', nom: 'Sara Kim', pseudonyme: 'sarakim' }],
    medias: [{ id: 'am1', messageId: 'r1', conversationId: 'fil-riche', nom: 'tableau.jpg', genre: 'image' }],
    liens: [{ identifiant: 'mshy_demo', nom: 'Démo septembre', utilisations: 4, conversation: null, actif: true, capacite: null, expireA: null }],
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

  it('les QUATRE groupes vivent DANS #resultats — le module les échange sans les connaître', () => {
    peint(ETAT_GARNI());

    const region = document.querySelector('#resultats')!;
    const titres = Array.from(region.querySelectorAll('.groupe h2')).map((n) => n.textContent);

    expect(titres).toEqual(['Conversations', 'Personnes', 'Médias', 'Liens']);
  });
});
