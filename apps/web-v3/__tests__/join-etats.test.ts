import { pointsDuLien } from '@/app/(public)/chats/[lien]/etats';
import { languesProposees } from '@/app/(public)/chats/[lien]/langues';
import type { LienDadhesion } from '@/lib/api/adhesion';
import type { CleDeLien } from '@/lib/api/guest-session';

/**
 * Les POINTS de l'accordéon : ce que le lien impose, dit une fois par ligne.
 *
 * Chacun se lit sur la réponse de la passerelle. Le témoin de fond est donc
 * toujours le même — un point qui change de sens quand la donnée change, et
 * jamais un texte constant qui aurait l'air de dire quelque chose.
 */

const LIEN: LienDadhesion = {
  cle: 'mshy_lagos' as CleDeLien,
  nom: 'Équipe Lagos',
  invitation: null,
  exigePseudo: true,
  exigeEmail: false,
  exigeNaissance: false,
  exigeCompte: false,
  echeance: null,
  placesRestantes: null,
  languesDuLien: [],
  languesParlees: [],
};

const point = (lien: Partial<LienDadhesion>, cle: string) =>
  pointsDuLien({ ...LIEN, ...lien }).find((candidat) => candidat.cle === cle);

describe('les points d’un lien', () => {
  it('en rend quatre, dans un ordre stable', () => {
    expect(pointsDuLien(LIEN).map((p) => p.cle)).toEqual([
      'compte',
      'echeance',
      'places',
      'langues',
    ]);
  });

  it('marque le compte comme REFUSÉ quand le lien l’exige', () => {
    expect(point({ exigeCompte: true }, 'compte')).toMatchObject({
      accorde: false,
      titre: 'Un compte est demandé',
    });
    expect(point({}, 'compte')).toMatchObject({ accorde: true, titre: 'Entrer sans compte' });
  });

  it('dit la date de fin quand il y en a une, et son absence sinon', () => {
    expect(point({ echeance: Date.parse('2026-08-12T00:00:00.000Z') }, 'echeance')?.titre).toBe(
      'Ouvert jusqu’au 12 août',
    );
    expect(point({}, 'echeance')?.titre).toBe('Sans date de fin');
  });

  it('accorde ou refuse selon les places qui restent, et accorde le lien sans plafond', () => {
    expect(point({ placesRestantes: 1 }, 'places')).toMatchObject({
      accorde: true,
      titre: '1 place restante',
    });
    expect(point({ placesRestantes: 14 }, 'places')?.titre).toBe('14 places restantes');
    expect(point({ placesRestantes: 0 }, 'places')).toMatchObject({
      accorde: false,
      titre: 'Plus aucune place',
    });
    expect(point({}, 'places')?.titre).toBe('Places non comptées');
  });

  // Le nom d'une langue reste EN MINUSCULE au milieu d'une phrase française, et
  // prend sa majuscule quand il est seul dans une option de liste : c'est la même
  // source (`Intl.DisplayNames`), mise en forme par sa place.
  it('nomme les langues admises quand le lien en impose, et dit vers quoi on traduit', () => {
    expect(point({ languesDuLien: ['fr', 'en'] }, 'langues')?.titre).toBe(
      'Langues acceptées : français et anglais',
    );
    expect(point({}, 'langues')?.titre).toBe('Écrire dans votre langue');
    expect(point({ languesParlees: ['yo'] }, 'langues')?.detail).toContain('yoruba');
    expect(point({}, 'langues')?.detail).toContain('langues des participants');
  });
});

/**
 * LE DÉFAUT ET L'ENSEMBLE sont deux questions, et le témoin les sépare.
 *
 * Le critère de fin ne porte que sur le premier (« pré-remplie depuis
 * `Accept-Language`, et non `'fr'` en dur ») ; la première écriture y a répondu
 * en faisant aussi de l'en-tête l'ENSEMBLE des options, ce qui fermait à un
 * locuteur yoruba sur un téléphone emprunté la seule porte que l'écran lui
 * ouvre. Les cas ci-dessous font donc VARIER le nombre d'options, ce qu'aucun
 * témoin ne faisait.
 */
describe('les langues proposées', () => {
  const propose = (lien: Partial<LienDadhesion>, acceptLanguage: string | null) =>
    languesProposees({ lien: { ...LIEN, ...lien }, acceptLanguage });

  const codes = (lien: Partial<LienDadhesion>, acceptLanguage: string | null) =>
    propose(lien, acceptLanguage).langues.map((l) => l.code);

  it('met la préférence du navigateur en tête, puis la conversation, et la choisit', () => {
    const { langues, choisie } = propose({ languesParlees: ['fr'] }, 'en-GB,en;q=0.9');

    expect(langues.slice(0, 2).map((l) => l.code)).toEqual(['en', 'fr']);
    expect(choisie).toBe('en');
  });

  it('choisit une langue ADMISE, jamais la première demandée quand le lien la refuse', () => {
    expect(propose({ languesDuLien: ['fr'] }, 'de,en;q=0.8').choisie).toBe('fr');
  });

  /**
   * LE cas du produit : le navigateur ne déclare pas la langue du visiteur, et
   * la conversation ne la parle pas encore. Sans les langues du produit, il ne
   * lui reste qu'à se déclarer dans une langue qu'il ne parle pas — et cette
   * valeur part dans `Participant.language`, donc dans tout son Prisme.
   */
  it('laisse un locuteur yoruba se déclarer même quand rien ne demande le yoruba', () => {
    const proposees = codes({ languesParlees: ['fr', 'en'] }, 'en-US');

    expect(proposees).toContain('yo');
    expect(proposees[0]).toBe('en');
  });

  it('n’offre jamais une seule option sur un lien neuf et un navigateur monolingue', () => {
    expect(codes({}, 'en-US').length).toBeGreaterThan(1);
  });

  it('reste borné par `allowedLanguages` quand l’hôte en impose', () => {
    expect(codes({ languesDuLien: ['fr', 'yo'] }, 'en-US')).toEqual(['fr', 'yo']);
  });

  it('ne rend jamais une liste vide — le champ doit rester utilisable', () => {
    expect(codes({}, null)[0]).toBe('fr');
  });

  it('ne propose jamais deux fois la même langue', () => {
    const proposees = codes({ languesParlees: ['fr'], languesDuLien: [] }, 'fr-FR,fr;q=0.9');

    expect(new Set(proposees).size).toBe(proposees.length);
  });

  it('ignore un code que la passerelle sert et qui n’est pas une étiquette de langue', () => {
    expect(codes({ languesDuLien: ['', 'zz-!!', 'yo'] }, 'en')).toEqual(['yo']);
  });
});
