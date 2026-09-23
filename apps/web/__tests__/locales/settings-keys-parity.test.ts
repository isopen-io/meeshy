/**
 * Les quatre locales de `settings.json` portent les mêmes clés (#7521).
 *
 * Ce garde existe parce que le trou qu'il surveille a déjà été comblé une fois,
 * en juin 2026 (branche `claude/gallant-cerf-DkX5k`), sans jamais être livré —
 * et qu'il s'était reformé à l'identique : au relevé du 2026-09-23, `es` et `pt`
 * portaient 670 clés contre 804 en français, et il leur manquait EXACTEMENT les
 * mêmes 174. Elles avaient décroché ensemble, et rien ne l'avait signalé : une
 * clé absente ne casse aucun gate, le composant passe un repli en second
 * argument de `t()` et l'utilisateur voit simplement du français au milieu de
 * ses réglages espagnols.
 *
 * La référence est l'UNION des quatre locales, et non une langue élue : c'est
 * ce qui fait que ce garde attrape aussi bien une clé oubliée en `es` qu'une
 * clé oubliée en `en`.
 *
 * Les exemptions sont NOMMÉES, jamais un seuil : un seuil laisserait remplacer
 * une clé manquante par une autre sans que rien ne bouge.
 */
import fs from 'fs';
import path from 'path';

const LOCALES_DIR = path.join(__dirname, '..', '..', 'locales');
const LANGUES = ['en', 'fr', 'es', 'pt'] as const;

type Langue = (typeof LANGUES)[number];

const clesAPlat = (langue: Langue): Set<string> => {
  const brut = JSON.parse(
    fs.readFileSync(path.join(LOCALES_DIR, langue, 'settings.json'), 'utf8')
  ) as unknown;
  const cles = new Set<string>();
  const parcourir = (noeud: unknown, prefixe: string) => {
    if (noeud !== null && typeof noeud === 'object' && !Array.isArray(noeud)) {
      for (const [k, v] of Object.entries(noeud as Record<string, unknown>)) {
        parcourir(v, prefixe ? `${prefixe}.${k}` : k);
      }
      return;
    }
    cles.add(prefixe);
  };
  parcourir(brut, '');
  return cles;
};

/**
 * DETTE CONNUE, datée du 2026-09-23 — à résorber, pas à étendre.
 *
 * Ces écarts ne sont PAS des traductions manquantes : ce sont des DOUBLONS DE
 * CHEMIN. La même clé vit sous deux arborescences selon la locale — `fr` la
 * range sous `settings.consentDialog.*`, `en` sous `consentDialog.*` — et
 * l'union des quatre compte donc les deux formes. Mesuré : 40 des 54 écarts de
 * `en` sont l'exact miroir des 40 de `fr`.
 *
 * Les 14 restants de `en` sont, eux, de vraies clés absentes.
 *
 * Résorber cela demande de choisir UNE arborescence et d'y migrer les quatre
 * locales avec leurs appelants — un lot à soi seul, qui n'a pas sa place dans
 * celui qui comble 174 traductions. Suivi : #7521.
 */
const DETTE_CONNUE: Readonly<Record<Langue, readonly string[]>> = {
  en: [
    'settings.consentDialog.buttons.accept',
    'settings.consentDialog.buttons.cancel',
    'settings.consentDialog.buttons.submitting',
    'settings.consentDialog.description',
    'settings.consentDialog.descriptions.analytics',
    'settings.consentDialog.descriptions.audioTranscription',
    'settings.consentDialog.descriptions.biometricData',
    'settings.consentDialog.descriptions.default',
    'settings.consentDialog.descriptions.locationSharing',
    'settings.consentDialog.descriptions.videoRecording',
    'settings.consentDialog.descriptions.voiceDataConsent',
    'settings.consentDialog.errors.allRequired',
    'settings.consentDialog.errors.submitFailed',
    'settings.consentDialog.labels.analytics',
    'settings.consentDialog.labels.audioTranscription',
    'settings.consentDialog.labels.biometricData',
    'settings.consentDialog.labels.locationSharing',
    'settings.consentDialog.labels.videoRecording',
    'settings.consentDialog.labels.voiceDataConsent',
    'settings.consentDialog.legalNote',
    'settings.consentDialog.title',
    'settings.consentDialog.violationsTitle',
    'settings.emailChange.verify.backToHome',
    'settings.emailChange.verify.backToSettings',
    'settings.emailChange.verify.error',
    'settings.emailChange.verify.errorTitle',
    'settings.emailChange.verify.expired',
    'settings.emailChange.verify.expiredInfo',
    'settings.emailChange.verify.expiredTitle',
    'settings.emailChange.verify.invalid',
    'settings.emailChange.verify.invalidTitle',
    'settings.emailChange.verify.networkError',
    'settings.emailChange.verify.noPending',
    'settings.emailChange.verify.noToken',
    'settings.emailChange.verify.pleaseWait',
    'settings.emailChange.verify.success',
    'settings.emailChange.verify.successInfo',
    'settings.emailChange.verify.successMessage',
    'settings.emailChange.verify.tryAgain',
    'settings.emailChange.verify.verifying',
    'settings.profile.actions.edit',
    'settings.profile.actions.languageUpdated',
    'settings.profile.verification.email.notVerified',
    'settings.profile.verification.email.verified',
    'settings.profile.verification.phone.enterCode',
    'settings.profile.verification.phone.notVerified',
    'settings.profile.verification.phone.sendCode',
    'settings.profile.verification.phone.start',
    'settings.profile.verification.phone.verified',
    'settings.profile.verification.resend',
    'settings.profile.verification.sending',
    'settings.register.errors.emailExists',
    'settings.register.errors.phoneExists',
    'settings.register.errors.usernameExists',
  ],
  fr: [
    'consentDialog.buttons.accept',
    'consentDialog.buttons.cancel',
    'consentDialog.buttons.submitting',
    'consentDialog.description',
    'consentDialog.descriptions.analytics',
    'consentDialog.descriptions.audioTranscription',
    'consentDialog.descriptions.biometricData',
    'consentDialog.descriptions.default',
    'consentDialog.descriptions.locationSharing',
    'consentDialog.descriptions.videoRecording',
    'consentDialog.descriptions.voiceDataConsent',
    'consentDialog.errors.allRequired',
    'consentDialog.errors.submitFailed',
    'consentDialog.labels.analytics',
    'consentDialog.labels.audioTranscription',
    'consentDialog.labels.biometricData',
    'consentDialog.labels.locationSharing',
    'consentDialog.labels.videoRecording',
    'consentDialog.labels.voiceDataConsent',
    'consentDialog.legalNote',
    'consentDialog.title',
    'consentDialog.violationsTitle',
    'emailChange.verify.backToHome',
    'emailChange.verify.backToSettings',
    'emailChange.verify.error',
    'emailChange.verify.errorTitle',
    'emailChange.verify.expired',
    'emailChange.verify.expiredInfo',
    'emailChange.verify.expiredTitle',
    'emailChange.verify.invalid',
    'emailChange.verify.invalidTitle',
    'emailChange.verify.networkError',
    'emailChange.verify.noPending',
    'emailChange.verify.noToken',
    'emailChange.verify.pleaseWait',
    'emailChange.verify.success',
    'emailChange.verify.successInfo',
    'emailChange.verify.successMessage',
    'emailChange.verify.tryAgain',
    'emailChange.verify.verifying',
  ],
  es: [],
  pt: [],
};

describe('locales — les quatre langues portent les mêmes clés de réglages', () => {
  const parLangue = new Map<Langue, Set<string>>(
    LANGUES.map((langue) => [langue, clesAPlat(langue)])
  );
  const reference = new Set<string>(
    LANGUES.flatMap((langue) => [...(parLangue.get(langue) as Set<string>)])
  );

  LANGUES.forEach((langue) => {
    it(`${langue} ne manque aucune clé hors dette connue`, () => {
      const presentes = parLangue.get(langue) as Set<string>;
      const exemptees = new Set(DETTE_CONNUE[langue]);
      const manquantes = [...reference]
        .filter((cle) => !presentes.has(cle) && !exemptees.has(cle))
        .sort();

      expect(manquantes).toEqual([]);
    });

    it(`${langue} n'a pas d'exemption devenue inutile`, () => {
      // Une exemption qui ne correspond plus à rien est un mensonge qui vieillit :
      // elle laisse croire à une dette qui n'existe plus, et masquerait un vrai
      // manque si la clé revenait à disparaître sous le même nom.
      const presentes = parLangue.get(langue) as Set<string>;
      const inutiles = DETTE_CONNUE[langue].filter((cle) => presentes.has(cle)).sort();

      expect(inutiles).toEqual([]);
    });
  });

  it('la référence ne se vide pas par accident', () => {
    expect(reference.size).toBeGreaterThan(800);
  });
});
