/**
 * @jest-environment node
 */
import { adresseCarte, adresseGeo, lieuDeGeoUri, lieuDeMessage } from '@/lib/api/lieu';

/**
 * UN LIEU PARTAGÉ (#5061) — `lieuDeMessage` lit `brut.location` D'ABORD (la
 * forme HISSÉE par `sharedPlaceFromMetadata`, servie par la liste REST ET
 * `message:new`), `brut.metadata.location` EN REPLI (un message rattrapé par
 * `GET /sync`, qui ne hisse rien — § 2.2 de la spécification). `adresseGeo`
 * est la SEULE adresse qui n'engage aucune requête ; `lieuDeGeoUri` en est
 * l'inverse, ce que `bullesDuDocument` relit pour reconstruire l'état sans un
 * second appel réseau.
 */
describe('lieuDeMessage — le hoist REST/socket d’abord, metadata.location en repli', () => {
  it('lit brut.location tel que la liste et message:new le servent', () => {
    const lieu = lieuDeMessage({ location: { latitude: 48.8566, longitude: 2.3522, name: 'Café Le Central', address: '12 rue de Rivoli' } });
    expect(lieu).toEqual({ latitude: 48.8566, longitude: 2.3522, nom: 'Café Le Central', adresse: '12 rue de Rivoli' });
  });

  it('retombe sur metadata.location — un message rattrapé par /sync ne hisse rien', () => {
    const lieu = lieuDeMessage({ metadata: { location: { latitude: 6.5244, longitude: 3.3792 } } });
    expect(lieu).toEqual({ latitude: 6.5244, longitude: 3.3792, nom: null, adresse: null });
  });

  it('rend null sans coordonnées valides — jamais une valeur devinée', () => {
    expect(lieuDeMessage({})).toBeNull();
    expect(lieuDeMessage({ location: {} })).toBeNull();
    expect(lieuDeMessage({ location: { latitude: 'x', longitude: 2 } })).toBeNull();
    expect(lieuDeMessage({ location: null })).toBeNull();
  });

  it('nom et adresse absents (chaînes vides) rendent null, jamais une chaîne vide', () => {
    const lieu = lieuDeMessage({ location: { latitude: 1, longitude: 2, name: '', address: '' } });
    expect(lieu).toEqual({ latitude: 1, longitude: 2, nom: null, adresse: null });
  });
});

describe('adresseGeo — la seule adresse qui n’engage aucune requête (§ 12.6)', () => {
  it('compose geo:lat,lng', () => {
    expect(adresseGeo({ latitude: 48.8566, longitude: 2.3522 })).toBe('geo:48.8566,2.3522');
  });

  it('lieuDeGeoUri est l’inverse exact d’adresseGeo', () => {
    const lieu = { latitude: -6.1751, longitude: 106.865 };
    expect(lieuDeGeoUri(adresseGeo(lieu))).toEqual(lieu);
  });

  it('rend null sur une adresse qui n’est pas geo: — jamais un nombre deviné', () => {
    expect(lieuDeGeoUri('https://example.com')).toBeNull();
    expect(lieuDeGeoUri('geo:pas-un-nombre,2')).toBeNull();
    expect(lieuDeGeoUri('')).toBeNull();
  });
});

describe('adresseCarte — le repli, dans un onglet, zéro tuile de carte', () => {
  it('ouvre OpenStreetMap centré sur le point — un lien texte, jamais une <img>', () => {
    const cible = adresseCarte({ latitude: 48.8566, longitude: 2.3522 });
    expect(cible).toBe('https://www.openstreetmap.org/?mlat=48.8566&mlon=2.3522#map=16/48.8566/2.3522');
  });
});
