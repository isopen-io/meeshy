/**
 * La carte des visiteurs d'un lien de suivi (#19412, client #19282).
 *
 * Le détail d'un lien recalculait pays, villes et « N pays » sur UNE page de
 * 50 clics. La passerelle sert désormais ces agrégats depuis la MÊME passe
 * `$facet` que les autres histogrammes — jamais une ligne de clic.
 *
 * Trois propriétés gardées :
 *   1. le lieu est un AGRÉGAT (pays, ville, compte) — ni IP, ni empreinte, ni
 *      coordonnée (#9609) ne sont lues par la tranche ;
 *   2. une ville sous le plancher de k-anonymat se replie dans son PAYS : un
 *      clic isolé ne désigne pas une personne (#19175) ;
 *   3. le lien d'une ADRESSE de fiche ne sert jamais de ville, quel que soit
 *      le compte : son lecteur peut être unique (#19175).
 *
 * @jest-environment node
 */

import {
  CLICK_CITY_K_ANONYMITY,
  clickStatsPipeline,
  foldClickStatsFacet,
} from '../../../services/trackingLinkClickAggregation';

const LINK_ID = '507f1f77bcf86cd799439099';

type Facet = Record<string, unknown[]>;

function trancheLieu(): unknown[] {
  const pipeline = clickStatsPipeline({ trackingLinkId: LINK_ID }) as unknown as Array<{ $facet?: Facet }>;
  return pipeline[1].$facet!.place;
}

const ligne = (country: string, city: string | null, n: number) => ({ _id: { country, city }, n });

describe('clickStatsPipeline — la tranche des lieux', () => {
  it('groupe par pays et ville, sans lire aucune colonne identifiante', () => {
    const tranche = JSON.stringify(trancheLieu());

    expect(tranche).toContain('$country');
    expect(tranche).toContain('$city');
    for (const interdit of ['ipAddress', 'deviceFingerprint', 'userAgent', 'latitude', 'longitude', 'region']) {
      expect(tranche).not.toContain(interdit);
    }
  });
});

describe('foldClickStatsFacet — clicksByPlace et countryCount', () => {
  it('sert une ville au-dessus du plancher, et replie dans le pays une ville sous le plancher', () => {
    const k = CLICK_CITY_K_ANONYMITY;
    const agrege = foldClickStatsFacet({
      place: [ligne('SN', 'Dakar', k + 3), ligne('SN', 'Thiès', 1), ligne('SN', null, 2), ligne('FR', 'Lyon', k - 1)],
      country: [{ _id: 'SN', n: k + 6 }, { _id: 'FR', n: k - 1 }],
    });

    expect(agrege.clicksByPlace).toEqual([
      { country: 'SN', city: 'Dakar', count: k + 3 },
      { country: 'FR', city: null, count: k - 1 },
      { country: 'SN', city: null, count: 3 },
    ]);
  });

  it('compte les pays distincts servis', () => {
    const agrege = foldClickStatsFacet({
      country: [{ _id: 'SN', n: 3 }, { _id: 'FR', n: 1 }, { _id: 'CI', n: 1 }],
    });

    expect(agrege.countryCount).toBe(3);
  });

  it("ne sert AUCUNE ville pour le lien d'une adresse de fiche, même au-dessus du plancher", () => {
    const agrege = foldClickStatsFacet(
      { place: [ligne('SN', 'Dakar', CLICK_CITY_K_ANONYMITY * 10), ligne('SN', 'Thiès', 1)] },
      { citiesServed: false },
    );

    expect(agrege.clicksByPlace).toEqual([{ country: 'SN', city: null, count: CLICK_CITY_K_ANONYMITY * 10 + 1 }]);
  });

  it('traite une ville vide comme absente', () => {
    const agrege = foldClickStatsFacet({ place: [ligne('PT', '', 2)] });

    expect(agrege.clicksByPlace).toEqual([{ country: 'PT', city: null, count: 2 }]);
  });

  it('rend des listes vides sur une facette absente', () => {
    const agrege = foldClickStatsFacet(undefined);

    expect(agrege.clicksByPlace).toEqual([]);
    expect(agrege.countryCount).toBe(0);
  });
});
