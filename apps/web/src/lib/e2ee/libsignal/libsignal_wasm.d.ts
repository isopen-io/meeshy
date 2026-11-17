/* tslint:disable */
/* eslint-disable */

export class GeneratedIdentity {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    get identityKeyPair(): Uint8Array;
    set identityKeyPair(value: Uint8Array | number[]);
    get identityKey(): Uint8Array;
    set identityKey(value: Uint8Array | number[]);
    registrationId: number;
}

/**
 * Une pré-clé tirée : l'enregistrement PRIVÉ (qui reste dans l'appareil) et
 * sa partie PUBLIQUE (clé et signature) que le serveur publie dans le bundle.
 */
export class GeneratedPreKey {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    id: number;
    get publicKey(): Uint8Array;
    set publicKey(value: Uint8Array | number[]);
    get record(): Uint8Array;
    set record(value: Uint8Array | number[]);
    get signature(): Uint8Array;
    set signature(value: Uint8Array | number[]);
}

export class Opened {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    get baseKey(): Uint8Array | undefined;
    set baseKey(value: Uint8Array | number[] | null | undefined);
    get kyberPreKeyId(): number | undefined;
    set kyberPreKeyId(value: number | null | undefined);
    get plaintext(): Uint8Array;
    set plaintext(value: Uint8Array | number[]);
    get preKeyId(): number | undefined;
    set preKeyId(value: number | null | undefined);
    get signedPreKeyId(): number | undefined;
    set signedPreKeyId(value: number | null | undefined);
}

/**
 * L'en-tête d'un premier message (`PreKeySignalMessage`), lu SANS le déchiffrer.
 */
export class PreKeyMessageInfo {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    get identityKey(): Uint8Array;
    set identityKey(value: Uint8Array | number[]);
    get kyberPreKeyId(): number | undefined;
    set kyberPreKeyId(value: number | null | undefined);
    get preKeyId(): number | undefined;
    set preKeyId(value: number | null | undefined);
    registrationId: number;
    signedPreKeyId: number;
}

/**
 * Le magasin ÉPHÉMÈRE d'un appareil, rempli par l'appelant pour UNE opération.
 */
export class ProtocolStore {
    free(): void;
    [Symbol.dispose](): void;
    addKyberPreKey(id: number, record: Uint8Array | number[]): void;
    addPreKey(id: number, record: Uint8Array | number[]): void;
    /**
     * Réinjecte une clé de base déjà acceptée sur ce couple de pré-clés (Kyber,
     * signée) : libsignal refuse alors tout PreKeySignalMessage qui la
     * présente de nouveau (`mark_kyber_pre_key_used`). Sans elle, un magasin
     * éphémère accepterait le rejeu d'un premier message sur une pré-clé Kyber
     * de dernier recours, vers son expéditeur comme vers une autre adresse.
     *
     * IDEMPOTENTE (#18994) : `mark_kyber_pre_key_used` ne rend `InvalidMessage`
     * que pour une clé DÉJÀ présente (`storage/inmem.rs`). Un doublon persisté
     * — deux onglets, une reprise après crash — rendait le magasin
     * inconstructible pour TOUTE opération : le navigateur ne déchiffrait plus
     * rien. Ce refus-là est ignoré ICI, à l'injection, et seulement ici : le
     * rejeu d'un premier message reste refusé au déchiffrement.
     */
    addSeenBaseKey(kyber_pre_key_id: number, signed_pre_key_id: number, base_key: Uint8Array | number[]): void;
    addSignedPreKey(id: number, record: Uint8Array | number[]): void;
    identity(name: string, device_id: number): Uint8Array | undefined;
    constructor(identity_key_pair: Uint8Array | number[], registration_id: number, local_name: string, local_device_id: number);
    open(name: string, device_id: number, message_type: number, body: Uint8Array | number[]): Opened;
    processPreKeyBundle(name: string, device_id: number, registration_id: number, identity_key: Uint8Array | number[], signed_pre_key_id: number, signed_pre_key_public: Uint8Array | number[], signed_pre_key_signature: Uint8Array | number[], kyber_pre_key_id: number, kyber_pre_key_public: Uint8Array | number[], kyber_pre_key_signature: Uint8Array | number[], pre_key_id: number | null | undefined, pre_key_public: Uint8Array | number[] | null | undefined, epoch_millis: number): void;
    seal(name: string, device_id: number, plaintext: Uint8Array | number[], epoch_millis: number): Sealed;
    session(name: string, device_id: number): Uint8Array | undefined;
    setSession(name: string, device_id: number, record: Uint8Array | number[]): void;
    /**
     * Pose l'identité CONNUE du pair : toute clé différente présentée ensuite
     * (bundle ou message) est refusée — c'est la garde contre la substitution
     * de clé, que l'appelant ne lève qu'après vérification du numéro de sécurité.
     */
    trustIdentity(name: string, device_id: number, identity_key: Uint8Array | number[]): void;
}

export class Sealed {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    get body(): Uint8Array;
    set body(value: Uint8Array | number[]);
    messageType: number;
}

export function generateIdentity(): GeneratedIdentity;

export function generateKyberPreKey(identity_key_pair: Uint8Array | number[], id: number, epoch_millis: number): GeneratedPreKey;

export function generatePreKey(id: number): GeneratedPreKey;

export function generateSignedPreKey(identity_key_pair: Uint8Array | number[], id: number, epoch_millis: number): GeneratedPreKey;

export function libsignalVersion(): string;

/**
 * Les pré-clés qu'un premier message engage, la génération et la clé
 * d'identité de son expéditeur (#18992) : l'ouvreur ne charge du coffre que
 * les pré-clés utiles, et confronte l'expéditeur avant tout déchiffrement.
 */
export function preKeyMessageInfo(body: Uint8Array | number[]): PreKeyMessageInfo;

/**
 * La `registrationId` du pair qu'une session vise (#18992) — lue dans
 * l'ENREGISTREMENT, seule source de vérité : une session dont la génération
 * diffère de l'annuaire se jette et se rouvre (Sesame), et l'enveloppe
 * s'adresse à cette génération.
 */
export function sessionRemoteRegistrationId(session: Uint8Array | number[]): number;

/**
 * La signature XEdDSA d'un message ARBITRAIRE par la clé d'identité de
 * l'appareil (#18992) — la preuve de liaison que `POST /e2ee/devices` exige
 * (`deviceBindingMessage`, `packages/shared/types/e2ee-directory.ts`), que
 * l'iPhone produit par `privateKey.generateSignature` et que la passerelle
 * vérifie par `PublicKey.verify`. XEdDSA est aléatoire : deux signatures du
 * même message diffèrent, et toutes deux se vérifient.
 */
export function signWithIdentity(identity_key_pair: Uint8Array | number[], message: Uint8Array | number[]): Uint8Array;

/**
 * La vérification d'une signature XEdDSA par une clé d'identité publique
 * (33 octets) — `false` pour une signature fausse, une erreur pour une clé
 * qui ne se décode pas.
 */
export function verifyWithIdentity(identity_key: Uint8Array | number[], message: Uint8Array | number[], signature: Uint8Array | number[]): boolean;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_generatedidentity_free: (a: number, b: number) => void;
    readonly __wbg_generatedprekey_free: (a: number, b: number) => void;
    readonly __wbg_get_generatedidentity_identityKey: (a: number) => [number, number];
    readonly __wbg_get_generatedidentity_identityKeyPair: (a: number) => [number, number];
    readonly __wbg_get_generatedidentity_registrationId: (a: number) => number;
    readonly __wbg_get_generatedprekey_id: (a: number) => number;
    readonly __wbg_get_generatedprekey_publicKey: (a: number) => [number, number];
    readonly __wbg_get_generatedprekey_record: (a: number) => [number, number];
    readonly __wbg_get_generatedprekey_signature: (a: number) => [number, number];
    readonly __wbg_get_opened_baseKey: (a: number) => [number, number];
    readonly __wbg_get_opened_kyberPreKeyId: (a: number) => number;
    readonly __wbg_get_opened_plaintext: (a: number) => [number, number];
    readonly __wbg_get_opened_preKeyId: (a: number) => number;
    readonly __wbg_get_opened_signedPreKeyId: (a: number) => number;
    readonly __wbg_get_prekeymessageinfo_identityKey: (a: number) => [number, number];
    readonly __wbg_get_prekeymessageinfo_kyberPreKeyId: (a: number) => number;
    readonly __wbg_get_prekeymessageinfo_preKeyId: (a: number) => number;
    readonly __wbg_get_prekeymessageinfo_registrationId: (a: number) => number;
    readonly __wbg_get_prekeymessageinfo_signedPreKeyId: (a: number) => number;
    readonly __wbg_get_sealed_body: (a: number) => [number, number];
    readonly __wbg_get_sealed_messageType: (a: number) => number;
    readonly __wbg_opened_free: (a: number, b: number) => void;
    readonly __wbg_prekeymessageinfo_free: (a: number, b: number) => void;
    readonly __wbg_protocolstore_free: (a: number, b: number) => void;
    readonly __wbg_sealed_free: (a: number, b: number) => void;
    readonly __wbg_set_generatedidentity_identityKey: (a: number, b: number, c: number) => void;
    readonly __wbg_set_generatedidentity_identityKeyPair: (a: number, b: number, c: number) => void;
    readonly __wbg_set_generatedidentity_registrationId: (a: number, b: number) => void;
    readonly __wbg_set_generatedprekey_id: (a: number, b: number) => void;
    readonly __wbg_set_generatedprekey_publicKey: (a: number, b: number, c: number) => void;
    readonly __wbg_set_generatedprekey_record: (a: number, b: number, c: number) => void;
    readonly __wbg_set_generatedprekey_signature: (a: number, b: number, c: number) => void;
    readonly __wbg_set_opened_baseKey: (a: number, b: number, c: number) => void;
    readonly __wbg_set_opened_kyberPreKeyId: (a: number, b: number) => void;
    readonly __wbg_set_opened_plaintext: (a: number, b: number, c: number) => void;
    readonly __wbg_set_opened_preKeyId: (a: number, b: number) => void;
    readonly __wbg_set_opened_signedPreKeyId: (a: number, b: number) => void;
    readonly __wbg_set_prekeymessageinfo_identityKey: (a: number, b: number, c: number) => void;
    readonly __wbg_set_prekeymessageinfo_kyberPreKeyId: (a: number, b: number) => void;
    readonly __wbg_set_prekeymessageinfo_preKeyId: (a: number, b: number) => void;
    readonly __wbg_set_prekeymessageinfo_registrationId: (a: number, b: number) => void;
    readonly __wbg_set_prekeymessageinfo_signedPreKeyId: (a: number, b: number) => void;
    readonly __wbg_set_sealed_body: (a: number, b: number, c: number) => void;
    readonly __wbg_set_sealed_messageType: (a: number, b: number) => void;
    readonly generateIdentity: () => [number, number, number];
    readonly generateKyberPreKey: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly generatePreKey: (a: number) => [number, number, number];
    readonly generateSignedPreKey: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly libsignalVersion: () => [number, number];
    readonly preKeyMessageInfo: (a: number, b: number) => [number, number, number];
    readonly protocolstore_addKyberPreKey: (a: number, b: number, c: number, d: number) => [number, number];
    readonly protocolstore_addPreKey: (a: number, b: number, c: number, d: number) => [number, number];
    readonly protocolstore_addSeenBaseKey: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly protocolstore_addSignedPreKey: (a: number, b: number, c: number, d: number) => [number, number];
    readonly protocolstore_identity: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly protocolstore_new: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
    readonly protocolstore_open: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number, number];
    readonly protocolstore_processPreKeyBundle: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number, o: number, p: number, q: number, r: number, s: number, t: number, u: number) => [number, number];
    readonly protocolstore_seal: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number, number];
    readonly protocolstore_session: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly protocolstore_setSession: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
    readonly protocolstore_trustIdentity: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
    readonly sessionRemoteRegistrationId: (a: number, b: number) => [number, number, number];
    readonly signWithIdentity: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly verifyWithIdentity: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
