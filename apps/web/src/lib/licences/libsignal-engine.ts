/**
 * LE MOTEUR libsignal DU BUNDLE WEB (#14628, #14592). Un bundle web n'est une
 * œuvre sous AGPL-3.0 que s'il embarque le pont WASM de libsignal
 * (`packages/libsignal-wasm`, écrit dans `src/lib/e2ee/libsignal/`). Tant
 * qu'il ne l'embarque pas, l'écran Licences dit MIT et n'affiche ni la mention
 * AGPL ni les avis de libsignal.
 *
 * Le lot qui livre le pont pose cette constante dans le MÊME commit ; la garde
 * `libsignal-engine.test.ts` rougit si le binaire est là et la constante non.
 */
export type LibsignalEngine = {
  readonly version: string;
  readonly acknowledgmentsUrl: string;
};

export const LIBSIGNAL_WASM_DIRECTORY = 'src/lib/e2ee/libsignal';

export const LIBSIGNAL_WASM_FILE = `${LIBSIGNAL_WASM_DIRECTORY}/libsignal_wasm_bg.wasm`;

export const libsignalEngineAt = (version: string): LibsignalEngine => ({
  version,
  acknowledgmentsUrl: `https://github.com/signalapp/libsignal/tree/v${version}/acknowledgments`,
});

export const WEB_LIBSIGNAL_ENGINE: LibsignalEngine | null = libsignalEngineAt('0.106.2');
