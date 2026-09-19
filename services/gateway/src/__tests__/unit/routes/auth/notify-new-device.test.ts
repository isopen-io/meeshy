import { notifyIfLoginFromNewDevice } from '../../../../routes/auth/notify-new-device';

/**
 * #7035 — le site UNIQUE qui décide si une connexion mérite une alerte.
 *
 * Ces témoins assertent sur l'EFFET — la notification est-elle émise ? — jamais
 * sur un retour d'état. Et le double de session REFUSE ce que le vrai client
 * refuserait : il exige que l'appelant exclue la session courante, sans quoi
 * elle se reconnaîtrait elle-même et aucune alerte ne partirait jamais.
 */

const IPHONE = {
  deviceType: 'mobile',
  deviceVendor: 'Apple',
  deviceModel: 'iPhone',
  osName: 'iOS',
  browserName: 'Meeshy',
  userAgent: 'Meeshy/1.0.9 (iPhone; iOS 26.6.2)',
};

const contexte = (extra: Record<string, unknown> = {}) => ({
  userId: 'u-1',
  currentSessionId: 's-neuve',
  deviceInfo: { type: 'mobile', vendor: 'Apple', model: 'iPhone', os: 'iOS', browser: 'Meeshy' },
  userAgent: 'Meeshy/1.0.9 (iPhone; iOS 26.6.2)',
  ipAddress: '176.187.76.108',
  geoData: null,
  ...extra,
});

/** Un lecteur de sessions qui EXIGE l'exclusion de la session courante. */
function lecteur(anterieures: unknown[]) {
  return {
    findMany: jest.fn(async (args: any) => {
      expect(args?.where?.id).toEqual({ not: 's-neuve' });
      expect(args?.take).toBeGreaterThan(0);
      return anterieures as never;
    }),
  };
}

type ChargeAlerte = { recipientUserId: string; ipAddress: string; revokeToken: string };

function notificateur() {
  return {
    createLoginNewDeviceNotification: jest.fn(async (_p: ChargeAlerte) => undefined),
  };
}

describe("notifyIfLoginFromNewDevice — l'effet, pas le statut", () => {
  it("n'émet RIEN quand l'appareil est déjà connu du compte", async () => {
    const notif = notificateur();
    const verdict = await notifyIfLoginFromNewDevice(lecteur([IPHONE]), notif, 'secret', contexte());

    expect(verdict).toBe('appareil-connu');
    expect(notif.createLoginNewDeviceNotification).not.toHaveBeenCalled();
  });

  it('émet UNE alerte pour un appareil inconnu', async () => {
    const notif = notificateur();
    const verdict = await notifyIfLoginFromNewDevice(lecteur([]), notif, 'secret', contexte());

    expect(verdict).toBe('alerte-emise');
    expect(notif.createLoginNewDeviceNotification).toHaveBeenCalledTimes(1);
    const charge = notif.createLoginNewDeviceNotification.mock.calls[0]![0];
    expect(charge.recipientUserId).toBe('u-1');
    expect(charge.ipAddress).toBe('176.187.76.108');
    expect(typeof charge.revokeToken).toBe('string');
    expect(charge.revokeToken.length).toBeGreaterThan(0);
  });

  it('EXCLUT la session qui vient de naître — sinon aucune alerte ne partirait jamais', async () => {
    // Le double le vérifie dans son `findMany` ; ce témoin prouve que le chemin
    // y passe bien, et nomme la conséquence si on l'omettait.
    const lect = lecteur([]);
    await notifyIfLoginFromNewDevice(lect, notificateur(), 'secret', contexte());
    expect(lect.findMany).toHaveBeenCalledTimes(1);
  });

  it("dix reconnexions du même appareil n'émettent qu'une alerte", async () => {
    const notif = notificateur();
    const historique: unknown[] = [];
    for (let i = 0; i < 10; i++) {
      await notifyIfLoginFromNewDevice(lecteur([...historique]), notif, 'secret', contexte());
      historique.push(IPHONE);
    }
    expect(notif.createLoginNewDeviceNotification).toHaveBeenCalledTimes(1);
  });

  it("se tait proprement quand la base ou le service de notification manquent", async () => {
    // Une connexion valide ne doit pas échouer parce qu'on n'a pas su décider.
    await expect(
      notifyIfLoginFromNewDevice(undefined, notificateur(), 'secret', contexte())
    ).resolves.toBe('indisponible');
    await expect(
      notifyIfLoginFromNewDevice(lecteur([]), undefined, 'secret', contexte())
    ).resolves.toBe('indisponible');
  });
});
