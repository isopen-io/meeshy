import {
  deviceFingerprint,
  deviceIdentityFromInfo,
  isLoginFromNewDevice,
  type DeviceIdentity,
} from '../../../utils/new-device';

/**
 * #7035 — « nouvelle connexion » se juge sur l'APPAREIL.
 *
 * Le défaut mesuré : 60 notifications `login_new_device` sur 100, toutes depuis
 * le même appareil et la même IP. La garde regardait `session.isTrusted` sur la
 * session qui vient de naître — toujours fausse à cet instant.
 */

const iphone = (extra: Partial<DeviceIdentity> = {}): DeviceIdentity => ({
  deviceType: 'mobile',
  deviceVendor: 'Apple',
  deviceModel: 'iPhone',
  osName: 'iOS',
  osVersion: undefined,
  browserName: 'Meeshy',
  userAgent: 'Meeshy/1.0.9 (iPhone; iOS 26.6.2)',
  ...extra,
}) as DeviceIdentity;

describe("isLoginFromNewDevice — l'appareil, pas la session", () => {
  it('se reconnecter depuis un appareil DÉJÀ VU ne déclenche rien', () => {
    const connu = [iphone(), iphone(), iphone()];
    expect(isLoginFromNewDevice(connu, iphone())).toBe(false);
  });

  it('dix reconnexions de suite ne produisent AUCUNE alerte après la première', () => {
    // Le critère de fin de l'issue, littéralement : « se reconnecter dix fois
    // de suite depuis le même appareil produit UNE notification, pas dix ».
    const historique: DeviceIdentity[] = [];
    let alertes = 0;
    for (let i = 0; i < 10; i++) {
      if (isLoginFromNewDevice(historique, iphone())) alertes += 1;
      historique.push(iphone());
    }
    expect(alertes).toBe(1);
  });

  it("CONTRE-ÉPREUVE — un appareil réellement INCONNU alerte toujours", () => {
    const connu = [iphone()];
    const pixel: DeviceIdentity = {
      deviceType: 'mobile',
      deviceVendor: 'Google',
      deviceModel: 'Pixel 8',
      osName: 'Android',
      browserName: 'Chrome',
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)',
    };
    expect(isLoginFromNewDevice(connu, pixel)).toBe(true);
  });

  it('la PREMIÈRE connexion du compte alerte — aucun historique', () => {
    expect(isLoginFromNewDevice([], iphone())).toBe(true);
  });
});

describe("ce qui ne doit PAS faire croire à un nouvel appareil", () => {
  it("une mise à jour d'iOS ne change pas l'empreinte", () => {
    // Inclure osVersion ferait crier une fois par mise à jour système :
    // le même défaut, à une autre cadence.
    const avant = iphone({ userAgent: 'Meeshy/1.0.9 (iPhone; iOS 26.6.2)' });
    const apres = iphone({ userAgent: 'Meeshy/1.0.9 (iPhone; iOS 26.7.0)' });
    expect(deviceFingerprint(avant)).toBe(deviceFingerprint(apres));
    expect(isLoginFromNewDevice([avant], apres)).toBe(false);
  });

  it("changer de réseau ne change pas l'empreinte — l'IP n'en fait pas partie", () => {
    // L'empreinte ne porte aucune adresse : deux sessions identiques par
    // ailleurs sont le même appareil, où qu'il se connecte.
    expect(deviceFingerprint(iphone())).toBe(deviceFingerprint(iphone()));
  });

  it("la casse et les espaces ne distinguent pas deux fois le même appareil", () => {
    const a = iphone({ deviceVendor: 'Apple', osName: 'iOS' });
    const b = iphone({ deviceVendor: '  APPLE ', osName: 'ios' });
    expect(isLoginFromNewDevice([a], b)).toBe(false);
  });
});

describe('quand on ne sait rien de l\'appareil', () => {
  const muet: DeviceIdentity = {};

  it("une empreinte vide n'est PAS une égalité : on alerte", () => {
    // Deux inconnues ne font pas un « même appareil ». Se taire à tort sur une
    // intrusion coûte plus cher que crier une fois de trop.
    expect(deviceFingerprint(muet)).toBe('');
    expect(isLoginFromNewDevice([muet], muet)).toBe(true);
  });

  it("l'agent utilisateur brut sert de dernier recours", () => {
    const sansChamps: DeviceIdentity = { userAgent: 'curl/8.4.0' };
    expect(deviceFingerprint(sansChamps)).toBe('');
    expect(isLoginFromNewDevice([sansChamps], sansChamps)).toBe(false);
    expect(isLoginFromNewDevice([sansChamps], { userAgent: 'curl/9.0.0' })).toBe(true);
  });

  it("un appareil IDENTIFIÉ ne se compare jamais à un muet par son agent brut", () => {
    // Sans cette règle, un appareil connu dont l'agent brut ressemble à celui
    // d'un autre passerait pour lui.
    const connu = iphone();
    const autre = iphone({ deviceModel: 'iPad' });
    expect(isLoginFromNewDevice([connu], autre)).toBe(true);
  });
});

describe('la conversion depuis le contexte de requête', () => {
  it("relie CHAQUE champ à sa colonne de session — une correspondance muette ferait tout crier", () => {
    // Si un seul champ n'était pas relié, l'empreinte perdrait une composante
    // et, dans le pire cas, deviendrait vide : chaque connexion serait alors
    // « nouvel appareil », le défaut #7035 restauré sans qu'un test de la loi
    // ne tombe.
    const identite = deviceIdentityFromInfo(
      { type: 'mobile', vendor: 'Apple', model: 'iPhone', os: 'iOS', browser: 'Meeshy' },
      'Meeshy/1.0.9 (iPhone; iOS 26.6.2)'
    );
    expect(identite).toEqual({
      deviceType: 'mobile',
      deviceVendor: 'Apple',
      deviceModel: 'iPhone',
      osName: 'iOS',
      browserName: 'Meeshy',
      userAgent: 'Meeshy/1.0.9 (iPhone; iOS 26.6.2)',
    });
    expect(deviceFingerprint(identite)).not.toBe('');
  });

  it("un contexte ABSENT ne fabrique pas une fausse égalité", () => {
    const identite = deviceIdentityFromInfo(null, null);
    expect(deviceFingerprint(identite)).toBe('');
    expect(isLoginFromNewDevice([identite], identite)).toBe(true);
  });
});
