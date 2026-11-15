/* @ts-self-types="./libsignal_wasm.d.ts" */

export class GeneratedIdentity {
    static __wrap(ptr) {
        const obj = Object.create(GeneratedIdentity.prototype);
        obj.__wbg_ptr = ptr;
        GeneratedIdentityFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        GeneratedIdentityFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_generatedidentity_free(ptr, 0);
    }
    /**
     * @returns {Uint8Array}
     */
    get identityKeyPair() {
        const ret = wasm.__wbg_get_generatedidentity_identityKeyPair(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @returns {Uint8Array}
     */
    get identityKey() {
        const ret = wasm.__wbg_get_generatedidentity_identityKey(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @returns {number}
     */
    get registrationId() {
        const ret = wasm.__wbg_get_generatedidentity_registrationId(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @param {Uint8Array | number[]} arg0
     */
    set identityKeyPair(arg0) {
        const ptr0 = passArray8ToWasm0(arg0, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_generatedidentity_identityKeyPair(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @param {Uint8Array | number[]} arg0
     */
    set identityKey(arg0) {
        const ptr0 = passArray8ToWasm0(arg0, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_generatedidentity_identityKey(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @param {number} arg0
     */
    set registrationId(arg0) {
        wasm.__wbg_set_generatedidentity_registrationId(this.__wbg_ptr, arg0);
    }
}
if (Symbol.dispose) GeneratedIdentity.prototype[Symbol.dispose] = GeneratedIdentity.prototype.free;

/**
 * Une pré-clé tirée : l'enregistrement PRIVÉ (qui reste dans l'appareil) et
 * sa partie PUBLIQUE (clé et signature) que le serveur publie dans le bundle.
 */
export class GeneratedPreKey {
    static __wrap(ptr) {
        const obj = Object.create(GeneratedPreKey.prototype);
        obj.__wbg_ptr = ptr;
        GeneratedPreKeyFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        GeneratedPreKeyFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_generatedprekey_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get id() {
        const ret = wasm.__wbg_get_generatedprekey_id(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {Uint8Array}
     */
    get publicKey() {
        const ret = wasm.__wbg_get_generatedprekey_publicKey(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @returns {Uint8Array}
     */
    get record() {
        const ret = wasm.__wbg_get_generatedprekey_record(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @returns {Uint8Array}
     */
    get signature() {
        const ret = wasm.__wbg_get_generatedprekey_signature(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @param {number} arg0
     */
    set id(arg0) {
        wasm.__wbg_set_generatedprekey_id(this.__wbg_ptr, arg0);
    }
    /**
     * @param {Uint8Array | number[]} arg0
     */
    set publicKey(arg0) {
        const ptr0 = passArray8ToWasm0(arg0, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_generatedprekey_publicKey(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @param {Uint8Array | number[]} arg0
     */
    set record(arg0) {
        const ptr0 = passArray8ToWasm0(arg0, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_generatedprekey_record(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @param {Uint8Array | number[]} arg0
     */
    set signature(arg0) {
        const ptr0 = passArray8ToWasm0(arg0, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_generatedprekey_signature(this.__wbg_ptr, ptr0, len0);
    }
}
if (Symbol.dispose) GeneratedPreKey.prototype[Symbol.dispose] = GeneratedPreKey.prototype.free;

export class Opened {
    static __wrap(ptr) {
        const obj = Object.create(Opened.prototype);
        obj.__wbg_ptr = ptr;
        OpenedFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        OpenedFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_opened_free(ptr, 0);
    }
    /**
     * @returns {Uint8Array | undefined}
     */
    get baseKey() {
        const ret = wasm.__wbg_get_opened_baseKey(this.__wbg_ptr);
        let v1;
        if (ret[0] !== 0) {
            v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * @returns {number | undefined}
     */
    get kyberPreKeyId() {
        const ret = wasm.__wbg_get_opened_kyberPreKeyId(this.__wbg_ptr);
        return ret === Number.MAX_SAFE_INTEGER ? undefined : ret;
    }
    /**
     * @returns {Uint8Array}
     */
    get plaintext() {
        const ret = wasm.__wbg_get_opened_plaintext(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @returns {number | undefined}
     */
    get preKeyId() {
        const ret = wasm.__wbg_get_opened_preKeyId(this.__wbg_ptr);
        return ret === Number.MAX_SAFE_INTEGER ? undefined : ret;
    }
    /**
     * @returns {number | undefined}
     */
    get signedPreKeyId() {
        const ret = wasm.__wbg_get_opened_signedPreKeyId(this.__wbg_ptr);
        return ret === Number.MAX_SAFE_INTEGER ? undefined : ret;
    }
    /**
     * @param {Uint8Array | number[] | null} [arg0]
     */
    set baseKey(arg0) {
        var ptr0 = isLikeNone(arg0) ? 0 : passArray8ToWasm0(arg0, wasm.__wbindgen_malloc);
        var len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_opened_baseKey(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @param {number | null} [arg0]
     */
    set kyberPreKeyId(arg0) {
        wasm.__wbg_set_opened_kyberPreKeyId(this.__wbg_ptr, isLikeNone(arg0) ? Number.MAX_SAFE_INTEGER : (arg0) >>> 0);
    }
    /**
     * @param {Uint8Array | number[]} arg0
     */
    set plaintext(arg0) {
        const ptr0 = passArray8ToWasm0(arg0, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_opened_plaintext(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @param {number | null} [arg0]
     */
    set preKeyId(arg0) {
        wasm.__wbg_set_opened_preKeyId(this.__wbg_ptr, isLikeNone(arg0) ? Number.MAX_SAFE_INTEGER : (arg0) >>> 0);
    }
    /**
     * @param {number | null} [arg0]
     */
    set signedPreKeyId(arg0) {
        wasm.__wbg_set_opened_signedPreKeyId(this.__wbg_ptr, isLikeNone(arg0) ? Number.MAX_SAFE_INTEGER : (arg0) >>> 0);
    }
}
if (Symbol.dispose) Opened.prototype[Symbol.dispose] = Opened.prototype.free;

/**
 * Le magasin ÉPHÉMÈRE d'un appareil, rempli par l'appelant pour UNE opération.
 */
export class ProtocolStore {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        ProtocolStoreFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_protocolstore_free(ptr, 0);
    }
    /**
     * @param {number} id
     * @param {Uint8Array | number[]} record
     */
    addKyberPreKey(id, record) {
        const val2 = +id;
        const ptr0 = passArray8ToWasm0(record, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.protocolstore_addKyberPreKey(this.__wbg_ptr, val2, ptr0, len0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {number} id
     * @param {Uint8Array | number[]} record
     */
    addPreKey(id, record) {
        const val2 = +id;
        const ptr0 = passArray8ToWasm0(record, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.protocolstore_addPreKey(this.__wbg_ptr, val2, ptr0, len0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Réinjecte une clé de base déjà acceptée sur ce couple de pré-clés (Kyber,
     * signée) : libsignal refuse alors tout PreKeySignalMessage qui la
     * présente de nouveau (`mark_kyber_pre_key_used`). Sans elle, un magasin
     * éphémère accepterait le rejeu d'un premier message sur une pré-clé Kyber
     * de dernier recours, vers son expéditeur comme vers une autre adresse.
     * @param {number} kyber_pre_key_id
     * @param {number} signed_pre_key_id
     * @param {Uint8Array | number[]} base_key
     */
    addSeenBaseKey(kyber_pre_key_id, signed_pre_key_id, base_key) {
        const val2 = +kyber_pre_key_id;
        const val3 = +signed_pre_key_id;
        const ptr0 = passArray8ToWasm0(base_key, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.protocolstore_addSeenBaseKey(this.__wbg_ptr, val2, val3, ptr0, len0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {number} id
     * @param {Uint8Array | number[]} record
     */
    addSignedPreKey(id, record) {
        const val2 = +id;
        const ptr0 = passArray8ToWasm0(record, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.protocolstore_addSignedPreKey(this.__wbg_ptr, val2, ptr0, len0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {string} name
     * @param {number} device_id
     * @returns {Uint8Array | undefined}
     */
    identity(name, device_id) {
        const val2 = +device_id;
        const ptr0 = passStringToWasm0(name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.protocolstore_identity(this.__wbg_ptr, ptr0, len0, val2);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        let v3;
        if (ret[0] !== 0) {
            v3 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v3;
    }
    /**
     * @param {Uint8Array | number[]} identity_key_pair
     * @param {number} registration_id
     * @param {string} local_name
     * @param {number} local_device_id
     */
    constructor(identity_key_pair, registration_id, local_name, local_device_id) {
        const val3 = +registration_id;
        const val4 = +local_device_id;
        let ptr0, len0, ptr1, len1;
        try {
            ptr0 = passArray8ToWasm0(identity_key_pair, wasm.__wbindgen_malloc);
            len0 = WASM_VECTOR_LEN;
            ptr1 = passStringToWasm0(local_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            len1 = WASM_VECTOR_LEN;
        } catch (e) {
            if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 1, 1); }
            if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 1, 1); }
            throw e;
        }
        const ret = wasm.protocolstore_new(ptr0, len0, val3, ptr1, len1, val4);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0];
        ProtocolStoreFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @param {string} name
     * @param {number} device_id
     * @param {number} message_type
     * @param {Uint8Array | number[]} body
     * @returns {Opened}
     */
    open(name, device_id, message_type, body) {
        const val3 = +device_id;
        const val4 = +message_type;
        let ptr0, len0, ptr1, len1;
        try {
            ptr0 = passStringToWasm0(name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            len0 = WASM_VECTOR_LEN;
            ptr1 = passArray8ToWasm0(body, wasm.__wbindgen_malloc);
            len1 = WASM_VECTOR_LEN;
        } catch (e) {
            if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 1, 1); }
            if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 1, 1); }
            throw e;
        }
        const ret = wasm.protocolstore_open(this.__wbg_ptr, ptr0, len0, val3, val4, ptr1, len1);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return Opened.__wrap(ret[0]);
    }
    /**
     * @param {string} name
     * @param {number} device_id
     * @param {number} registration_id
     * @param {Uint8Array | number[]} identity_key
     * @param {number} signed_pre_key_id
     * @param {Uint8Array | number[]} signed_pre_key_public
     * @param {Uint8Array | number[]} signed_pre_key_signature
     * @param {number} kyber_pre_key_id
     * @param {Uint8Array | number[]} kyber_pre_key_public
     * @param {Uint8Array | number[]} kyber_pre_key_signature
     * @param {number | null | undefined} pre_key_id
     * @param {Uint8Array | number[] | null | undefined} pre_key_public
     * @param {number} epoch_millis
     */
    processPreKeyBundle(name, device_id, registration_id, identity_key, signed_pre_key_id, signed_pre_key_public, signed_pre_key_signature, kyber_pre_key_id, kyber_pre_key_public, kyber_pre_key_signature, pre_key_id, pre_key_public, epoch_millis) {
        const val8 = +device_id;
        const val9 = +registration_id;
        const val10 = +signed_pre_key_id;
        const val11 = +kyber_pre_key_id;
        const val12 = +(isLikeNone(pre_key_id) ? Number.MAX_SAFE_INTEGER : (pre_key_id) >>> 0);
        const val13 = +epoch_millis;
        let ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4, ptr5, len5, ptr6, len6;
        try {
            ptr0 = passStringToWasm0(name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            len0 = WASM_VECTOR_LEN;
            ptr1 = passArray8ToWasm0(identity_key, wasm.__wbindgen_malloc);
            len1 = WASM_VECTOR_LEN;
            ptr2 = passArray8ToWasm0(signed_pre_key_public, wasm.__wbindgen_malloc);
            len2 = WASM_VECTOR_LEN;
            ptr3 = passArray8ToWasm0(signed_pre_key_signature, wasm.__wbindgen_malloc);
            len3 = WASM_VECTOR_LEN;
            ptr4 = passArray8ToWasm0(kyber_pre_key_public, wasm.__wbindgen_malloc);
            len4 = WASM_VECTOR_LEN;
            ptr5 = passArray8ToWasm0(kyber_pre_key_signature, wasm.__wbindgen_malloc);
            len5 = WASM_VECTOR_LEN;
            ptr6 = isLikeNone(pre_key_public) ? 0 : passArray8ToWasm0(pre_key_public, wasm.__wbindgen_malloc);
            len6 = WASM_VECTOR_LEN;
        } catch (e) {
            if (ptr6) { wasm.__wbindgen_free(ptr6, len6 * 1, 1); }
            if (ptr5) { wasm.__wbindgen_free(ptr5, len5 * 1, 1); }
            if (ptr4) { wasm.__wbindgen_free(ptr4, len4 * 1, 1); }
            if (ptr3) { wasm.__wbindgen_free(ptr3, len3 * 1, 1); }
            if (ptr2) { wasm.__wbindgen_free(ptr2, len2 * 1, 1); }
            if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 1, 1); }
            if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 1, 1); }
            throw e;
        }
        const ret = wasm.protocolstore_processPreKeyBundle(this.__wbg_ptr, ptr0, len0, val8, val9, ptr1, len1, val10, ptr2, len2, ptr3, len3, val11, ptr4, len4, ptr5, len5, val12, ptr6, len6, val13);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * @param {string} name
     * @param {number} device_id
     * @param {Uint8Array | number[]} plaintext
     * @param {number} epoch_millis
     * @returns {Sealed}
     */
    seal(name, device_id, plaintext, epoch_millis) {
        const val3 = +device_id;
        const val4 = +epoch_millis;
        let ptr0, len0, ptr1, len1;
        try {
            ptr0 = passStringToWasm0(name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            len0 = WASM_VECTOR_LEN;
            ptr1 = passArray8ToWasm0(plaintext, wasm.__wbindgen_malloc);
            len1 = WASM_VECTOR_LEN;
        } catch (e) {
            if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 1, 1); }
            if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 1, 1); }
            throw e;
        }
        const ret = wasm.protocolstore_seal(this.__wbg_ptr, ptr0, len0, val3, ptr1, len1, val4);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return Sealed.__wrap(ret[0]);
    }
    /**
     * @param {string} name
     * @param {number} device_id
     * @returns {Uint8Array | undefined}
     */
    session(name, device_id) {
        const val2 = +device_id;
        const ptr0 = passStringToWasm0(name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.protocolstore_session(this.__wbg_ptr, ptr0, len0, val2);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        let v3;
        if (ret[0] !== 0) {
            v3 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v3;
    }
    /**
     * @param {string} name
     * @param {number} device_id
     * @param {Uint8Array | number[]} record
     */
    setSession(name, device_id, record) {
        const val3 = +device_id;
        let ptr0, len0, ptr1, len1;
        try {
            ptr0 = passStringToWasm0(name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            len0 = WASM_VECTOR_LEN;
            ptr1 = passArray8ToWasm0(record, wasm.__wbindgen_malloc);
            len1 = WASM_VECTOR_LEN;
        } catch (e) {
            if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 1, 1); }
            if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 1, 1); }
            throw e;
        }
        const ret = wasm.protocolstore_setSession(this.__wbg_ptr, ptr0, len0, val3, ptr1, len1);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Pose l'identité CONNUE du pair : toute clé différente présentée ensuite
     * (bundle ou message) est refusée — c'est la garde contre la substitution
     * de clé, que l'appelant ne lève qu'après vérification du numéro de sécurité.
     * @param {string} name
     * @param {number} device_id
     * @param {Uint8Array | number[]} identity_key
     */
    trustIdentity(name, device_id, identity_key) {
        const val3 = +device_id;
        let ptr0, len0, ptr1, len1;
        try {
            ptr0 = passStringToWasm0(name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            len0 = WASM_VECTOR_LEN;
            ptr1 = passArray8ToWasm0(identity_key, wasm.__wbindgen_malloc);
            len1 = WASM_VECTOR_LEN;
        } catch (e) {
            if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 1, 1); }
            if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 1, 1); }
            throw e;
        }
        const ret = wasm.protocolstore_trustIdentity(this.__wbg_ptr, ptr0, len0, val3, ptr1, len1);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
}
if (Symbol.dispose) ProtocolStore.prototype[Symbol.dispose] = ProtocolStore.prototype.free;

export class Sealed {
    static __wrap(ptr) {
        const obj = Object.create(Sealed.prototype);
        obj.__wbg_ptr = ptr;
        SealedFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        SealedFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_sealed_free(ptr, 0);
    }
    /**
     * @returns {Uint8Array}
     */
    get body() {
        const ret = wasm.__wbg_get_sealed_body(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @returns {number}
     */
    get messageType() {
        const ret = wasm.__wbg_get_sealed_messageType(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {Uint8Array | number[]} arg0
     */
    set body(arg0) {
        const ptr0 = passArray8ToWasm0(arg0, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_sealed_body(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @param {number} arg0
     */
    set messageType(arg0) {
        wasm.__wbg_set_sealed_messageType(this.__wbg_ptr, arg0);
    }
}
if (Symbol.dispose) Sealed.prototype[Symbol.dispose] = Sealed.prototype.free;

/**
 * @returns {GeneratedIdentity}
 */
export function generateIdentity() {
    const ret = wasm.generateIdentity();
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return GeneratedIdentity.__wrap(ret[0]);
}

/**
 * @param {Uint8Array | number[]} identity_key_pair
 * @param {number} id
 * @param {number} epoch_millis
 * @returns {GeneratedPreKey}
 */
export function generateKyberPreKey(identity_key_pair, id, epoch_millis) {
    const val2 = +id;
    const val3 = +epoch_millis;
    const ptr0 = passArray8ToWasm0(identity_key_pair, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.generateKyberPreKey(ptr0, len0, val2, val3);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return GeneratedPreKey.__wrap(ret[0]);
}

/**
 * @param {number} id
 * @returns {GeneratedPreKey}
 */
export function generatePreKey(id) {
    const ret = wasm.generatePreKey(id);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return GeneratedPreKey.__wrap(ret[0]);
}

/**
 * @param {Uint8Array | number[]} identity_key_pair
 * @param {number} id
 * @param {number} epoch_millis
 * @returns {GeneratedPreKey}
 */
export function generateSignedPreKey(identity_key_pair, id, epoch_millis) {
    const val2 = +id;
    const val3 = +epoch_millis;
    const ptr0 = passArray8ToWasm0(identity_key_pair, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.generateSignedPreKey(ptr0, len0, val2, val3);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return GeneratedPreKey.__wrap(ret[0]);
}

/**
 * @returns {string}
 */
export function libsignalVersion() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.libsignalVersion();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg_Error_208446807d0d1e30: function(arg0, arg1) {
            const ret = Error(getStringFromWasm0(arg0, arg1));
            return ret;
        },
        __wbg___wbindgen_throw_4c88d8bf264fd984: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbg_getRandomValues_5d8c030b527203a6: function() { return handleError(function (arg0, arg1) {
            globalThis.crypto.getRandomValues(getArrayU8FromWasm0(arg0, arg1));
        }, arguments); },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            table.set(0, undefined);
            table.set(1024, undefined);
            table.set(1025, null);
            table.set(1026, true);
            table.set(1027, false);
        },
    };
    return {
        __proto__: null,
        "./libsignal_wasm_bg.js": import0,
    };
}

const GeneratedIdentityFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_generatedidentity_free(ptr, 1));
const GeneratedPreKeyFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_generatedprekey_free(ptr, 1));
const OpenedFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_opened_free(ptr, 1));
const ProtocolStoreFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_protocolstore_free(ptr, 1));
const SealedFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_sealed_free(ptr, 1));

function addToExternrefTable0(obj) {
    const idx = wasm.__externref_table_alloc();
    wasm.__wbindgen_externrefs.set(idx, obj);
    return idx;
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return decodeText(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        const idx = addToExternrefTable0(e);
        wasm.__wbindgen_exn_store(idx);
    }
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(bytes) {
    numBytesDecoded += bytes.length;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true });
        cachedTextDecoder.decode();
        numBytesDecoded = bytes.length;
    }
    return cachedTextDecoder.decode(bytes);
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasmInstance, wasm;
function __wbg_finalize_init(instance, module) {
    wasmInstance = instance;
    wasm = instance.exports;
    wasmModule = module;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (!module.ok) {
            throw new Error(`failed to fetch Wasm: ${module.status} ${module.statusText} fetching '${module.url}'`);
        }

        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

let __wbg_init_promise;
async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;
    if (__wbg_init_promise === undefined) {
        __wbg_init_promise = __wbg_init_once(module_or_path);
        __wbg_init_promise.catch(() => { __wbg_init_promise = undefined; });
    }
    return __wbg_init_promise;
}

async function __wbg_init_once(module_or_path) {

    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('libsignal_wasm_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
