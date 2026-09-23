/**
 * Témoin de COMPORTEMENT pour #7490, en complément de la garde de fichiers
 * (`auth-console-identifiers-guard.test.ts`).
 *
 * La garde dit « ces fichiers n'appellent pas `console.log` » — une propriété
 * du texte. Celui-ci dit « en faisant réellement une demande de récupération de
 * compte, l'adresse saisie n'atteint aucun canal de console » : c'est la
 * propriété qui compte pour la personne qui tape son e-mail, et elle survivrait
 * à un contournement que la garde ne verrait pas (une aide de journalisation
 * intermédiaire, un `console['log']`, un helper importé).
 *
 * `logger` est volontairement laissé RÉEL : en environnement de test,
 * `NODE_ENV` n'est pas 'development' et `NEXT_PUBLIC_DEBUG_LOGS` n'est pas
 * 'true', donc il se tait — et c'est précisément le comportement de PRODUCTION
 * qu'on veut prouver. Le mocker prouverait seulement que le mock ne parle pas.
 */
jest.mock('@/services/magic-link.service', () => ({
  magicLinkService: {
    requestMagicLink: jest.fn(async () => ({ success: true })),
  },
}));

jest.mock('@/services/phone-password-reset.service', () => ({
  phonePasswordResetService: { requestReset: jest.fn() },
}));

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

import { useRecoverySubmission } from '@/hooks/use-recovery-submission';

const EMAIL = 'marie.durand@exemple.fr';

const CONSOLE_CHANNELS = ['log', 'info', 'debug', 'warn', 'error'] as const;

/**
 * Préfixe `use` volontaire : `useRecoverySubmission` n'ouvre aucun état React
 * (elle ne fait que refermer des callbacks sur ses paramètres), mais son nom la
 * déclare hook — `react-hooks/rules-of-hooks` exige donc que son appelant en
 * soit un aussi.
 */
function useRecoveryUnderTest() {
  const noop = () => {};
  return useRecoverySubmission({
    setIsLoading: noop,
    setError: noop,
    setStep: noop,
    setStoredEmail: noop,
    setPhoneResetTokenId: noop,
    setMaskedUserInfo: noop,
    setTokenId: noop,
    setResendCooldown: noop,
    setOtpCode: noop,
    resetBotProtection: noop,
    isSessionExpiredError: () => false,
    handleSessionExpired: noop,
    t: (_key: string, fallback?: string) => fallback ?? '',
    router: { push: noop },
    onClose: noop,
  });
}

describe("la récupération de compte ne met pas l'adresse en console", () => {
  const captured: unknown[][] = [];
  const originals = new Map<string, unknown>();

  beforeEach(() => {
    captured.length = 0;
    CONSOLE_CHANNELS.forEach((channel) => {
      originals.set(channel, console[channel]);
      console[channel] = ((...args: unknown[]) => {
        captured.push(args);
      }) as typeof console.log;
    });
  });

  afterEach(() => {
    CONSOLE_CHANNELS.forEach((channel) => {
      console[channel] = originals.get(channel) as typeof console.log;
    });
  });

  it("ne fait apparaître l'adresse saisie dans aucun canal de console", async () => {
    const { handleEmailRecovery } = useRecoveryUnderTest();

    await handleEmailRecovery(EMAIL);

    const everythingPrinted = captured.map((args) => args.map(String).join(' ')).join('\n');
    expect(everythingPrinted).not.toContain(EMAIL);
    expect(everythingPrinted).not.toContain('marie.durand');
  });

  it("ne fait rien apparaître du tout sur les canaux de mise au point", async () => {
    const { handleEmailRecovery } = useRecoveryUnderTest();

    await handleEmailRecovery(EMAIL);

    expect(captured).toEqual([]);
  });
});
