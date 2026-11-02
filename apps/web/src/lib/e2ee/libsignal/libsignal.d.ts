/*
 * Déclarations de la colle wasm-bindgen (`libsignal.js`, généré par
 * `packages/libsignal-wasm/build.sh`). Suivies par git malgré la règle
 * des fichiers de déclaration du `.gitignore` racine (`git add -f`) : sans elles, `tsc`
 * ne type pas l'import dynamique du moteur. Les signatures sont celles que
 * le moteur appelle (`LibsignalGlue`), une seule source.
 */
import type { LibsignalGlue } from '../libsignal-engine';

export declare const identityGenerate: LibsignalGlue['identityGenerate'];
export declare const identityPublicKey: LibsignalGlue['identityPublicKey'];
export declare const identitySign: LibsignalGlue['identitySign'];
export declare const identityVerify: LibsignalGlue['identityVerify'];
export declare const kyberPreKeyGenerate: LibsignalGlue['kyberPreKeyGenerate'];
export declare const preKeyGenerate: LibsignalGlue['preKeyGenerate'];
export declare const sessionDecrypt: LibsignalGlue['sessionDecrypt'];
export declare const sessionEncrypt: LibsignalGlue['sessionEncrypt'];
export declare const sessionRemoteRegistrationId: LibsignalGlue['sessionRemoteRegistrationId'];
export declare const sessionStart: LibsignalGlue['sessionStart'];
export declare const signedPreKeyGenerate: LibsignalGlue['signedPreKeyGenerate'];

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export declare function initSync(module: { module: BufferSource | WebAssembly.Module } | BufferSource | WebAssembly.Module): unknown;

export default function init(
  moduleOrPath?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>,
): Promise<unknown>;
