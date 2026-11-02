// Copyright (C) 2026 Meeshy. SPDX-License-Identifier: AGPL-3.0-only
//
// Le pont navigateur de libsignal (#14592). Aucune primitive ici : PQXDH,
// Double Ratchet, XEdDSA et ML-KEM sont ceux du crate `libsignal-protocol` du
// tag épinglé. Ce fichier n'écrit que les STORES, miroir de
// `packages/MeeshySDK/Sources/MeeshyE2EE/MeeshySignalProtocolStore.swift`, sur
// une transaction d'enregistrements que le navigateur lit (`load`) et scelle
// (les écritures rendues). Une opération rend ses écritures avec son résultat :
// le navigateur les range dans UNE transaction IndexedDB, ou rien.

use std::cell::RefCell;
use std::collections::BTreeMap;
use std::time::{Duration, SystemTime};

use async_trait::async_trait;
use futures_util::FutureExt;
use js_sys::{Array, Function, Object, Reflect, Uint8Array};
use libsignal_protocol::kem::{self, KeyType};
use libsignal_protocol::*;
use rand::TryRngCore;
use wasm_bindgen::prelude::*;

type Rng = rand::rand_core::UnwrapErr<rand::rngs::OsRng>;

fn rng() -> Rng {
    rand::rngs::OsRng.unwrap_err()
}

fn fail(error: impl std::fmt::Display) -> JsError {
    JsError::new(&error.to_string())
}

fn ready<T>(future: impl std::future::Future<Output = T>) -> T {
    future.now_or_never().expect("les stores sont synchrones")
}

fn at(millis: f64) -> SystemTime {
    SystemTime::UNIX_EPOCH + Duration::from_millis(millis as u64)
}

fn set(target: &Object, key: &str, value: &JsValue) -> Result<(), JsError> {
    Reflect::set(target, &JsValue::from_str(key), value).map_err(|_| JsError::new("reflect"))?;
    Ok(())
}

fn bytes(value: &[u8]) -> JsValue {
    Uint8Array::from(value).into()
}

fn address(name: &str, device_id: u32) -> Result<ProtocolAddress, JsError> {
    let device = DeviceId::try_from(device_id).map_err(|_| JsError::new("deviceId hors plage"))?;
    Ok(ProtocolAddress::new(name.to_owned(), device))
}

fn address_key(address: &ProtocolAddress) -> String {
    format!("{}.{}", address.name(), u32::from(address.device_id()))
}

const SESSION: &str = "session";
const REMOTE_IDENTITY: &str = "remoteIdentity";
const PRE_KEY: &str = "preKey";
const SIGNED_PRE_KEY: &str = "signedPreKey";
const KYBER_PRE_KEY: &str = "kyberPreKey";
const KYBER_LAST_RESORT: &str = "kyberLastResortMarker";
const KYBER_BASE_KEY_SEEN: &str = "kyberBaseKeySeen";
const SENDER_KEY: &str = "senderKey";
const OWN_DEVICE_PIN: &str = "ownDevicePin";

/// La transaction d'enregistrements : lectures par `load(kind, key)`, écritures
/// gardées ici et rendues au navigateur.
struct Records {
    load: Function,
    writes: RefCell<BTreeMap<(String, String), Option<Vec<u8>>>>,
}

impl Records {
    fn new(load: Function) -> Self {
        Self { load, writes: RefCell::new(BTreeMap::new()) }
    }

    fn get(&self, kind: &str, key: &str) -> Result<Option<Vec<u8>>, SignalProtocolError> {
        if let Some(written) = self.writes.borrow().get(&(kind.to_owned(), key.to_owned())) {
            return Ok(written.clone());
        }
        let value = self
            .load
            .call2(&JsValue::NULL, &JsValue::from_str(kind), &JsValue::from_str(key))
            .map_err(|_| SignalProtocolError::InvalidState("load", "le navigateur a refusé la lecture".into()))?;
        if value.is_undefined() || value.is_null() {
            return Ok(None);
        }
        Ok(Some(Uint8Array::new(&value).to_vec()))
    }

    fn put(&self, kind: &str, key: &str, value: Option<Vec<u8>>) {
        self.writes.borrow_mut().insert((kind.to_owned(), key.to_owned()), value);
    }

    fn into_writes(self) -> Array {
        self.writes
            .into_inner()
            .into_iter()
            .map(|((kind, key), value)| {
                let entry = Array::new();
                entry.push(&JsValue::from_str(&kind));
                entry.push(&JsValue::from_str(&key));
                entry.push(&value.map(|v| bytes(&v)).unwrap_or(JsValue::NULL));
                JsValue::from(entry)
            })
            .collect()
    }
}

/// Les six stores sur la transaction. Confiance : TOFU avec alerte pour un
/// contact (l'envoi continue, comme iOS) ; un ENVOI vers un de MES appareils
/// n'est permis que sous la clé épinglée à son approbation (spec § 3.5).
struct Store {
    identity: IdentityKeyPair,
    registration_id: u32,
    own_user_id: String,
    records: Records,
}

#[async_trait(?Send)]
impl IdentityKeyStore for Store {
    async fn get_identity_key_pair(&self) -> Result<IdentityKeyPair, SignalProtocolError> {
        Ok(self.identity)
    }

    async fn get_local_registration_id(&self) -> Result<u32, SignalProtocolError> {
        Ok(self.registration_id)
    }

    async fn save_identity(&mut self, address: &ProtocolAddress, identity: &IdentityKey) -> Result<IdentityChange, SignalProtocolError> {
        let key = address_key(address);
        let previous = self.records.get(REMOTE_IDENTITY, &key)?;
        let serialized = identity.serialize().to_vec();
        let changed = previous.as_ref().is_some_and(|p| *p != serialized);
        self.records.put(REMOTE_IDENTITY, &key, Some(serialized));
        Ok(IdentityChange::from_changed(changed))
    }

    async fn is_trusted_identity(&self, address: &ProtocolAddress, identity: &IdentityKey, direction: Direction) -> Result<bool, SignalProtocolError> {
        if !matches!(direction, Direction::Sending) || address.name() != self.own_user_id {
            return Ok(true);
        }
        let pinned = self.records.get(OWN_DEVICE_PIN, &u32::from(address.device_id()).to_string())?;
        Ok(pinned.is_some_and(|p| p == identity.serialize().to_vec()))
    }

    async fn get_identity(&self, address: &ProtocolAddress) -> Result<Option<IdentityKey>, SignalProtocolError> {
        self.records
            .get(REMOTE_IDENTITY, &address_key(address))?
            .map(|raw| IdentityKey::decode(&raw))
            .transpose()
    }
}

#[async_trait(?Send)]
impl PreKeyStore for Store {
    async fn get_pre_key(&self, id: PreKeyId) -> Result<PreKeyRecord, SignalProtocolError> {
        let raw = self.records.get(PRE_KEY, &u32::from(id).to_string())?.ok_or(SignalProtocolError::InvalidPreKeyId)?;
        PreKeyRecord::deserialize(&raw)
    }

    async fn save_pre_key(&mut self, id: PreKeyId, record: &PreKeyRecord) -> Result<(), SignalProtocolError> {
        self.records.put(PRE_KEY, &u32::from(id).to_string(), Some(record.serialize()?));
        Ok(())
    }

    async fn remove_pre_key(&mut self, id: PreKeyId) -> Result<(), SignalProtocolError> {
        self.records.put(PRE_KEY, &u32::from(id).to_string(), None);
        Ok(())
    }
}

#[async_trait(?Send)]
impl SignedPreKeyStore for Store {
    async fn get_signed_pre_key(&self, id: SignedPreKeyId) -> Result<SignedPreKeyRecord, SignalProtocolError> {
        let raw = self
            .records
            .get(SIGNED_PRE_KEY, &u32::from(id).to_string())?
            .ok_or(SignalProtocolError::InvalidSignedPreKeyId)?;
        SignedPreKeyRecord::deserialize(&raw)
    }

    async fn save_signed_pre_key(&mut self, id: SignedPreKeyId, record: &SignedPreKeyRecord) -> Result<(), SignalProtocolError> {
        self.records.put(SIGNED_PRE_KEY, &u32::from(id).to_string(), Some(record.serialize()?));
        Ok(())
    }
}

#[async_trait(?Send)]
impl KyberPreKeyStore for Store {
    async fn get_kyber_pre_key(&self, id: KyberPreKeyId) -> Result<KyberPreKeyRecord, SignalProtocolError> {
        let raw = self
            .records
            .get(KYBER_PRE_KEY, &u32::from(id).to_string())?
            .ok_or(SignalProtocolError::InvalidKyberPreKeyId)?;
        KyberPreKeyRecord::deserialize(&raw)
    }

    async fn save_kyber_pre_key(&mut self, id: KyberPreKeyId, record: &KyberPreKeyRecord) -> Result<(), SignalProtocolError> {
        self.records.put(KYBER_PRE_KEY, &u32::from(id).to_string(), Some(record.serialize()?));
        Ok(())
    }

    /// La Kyber de DERNIER RECOURS se réutilise, jamais avec la même clé de
    /// base ; une Kyber UNIQUE s'efface à son premier usage (PQXDH § 2.4).
    async fn mark_kyber_pre_key_used(&mut self, id: KyberPreKeyId, signed_id: SignedPreKeyId, base_key: &PublicKey) -> Result<(), SignalProtocolError> {
        let id = u32::from(id);
        let seen = format!("{}.{}.{}", id, u32::from(signed_id), hex(&base_key.serialize()));
        if self.records.get(KYBER_BASE_KEY_SEEN, &seen)?.is_some() {
            return Err(SignalProtocolError::InvalidMessage(CiphertextMessageType::PreKey, "reused base key".to_owned()));
        }
        self.records.put(KYBER_BASE_KEY_SEEN, &seen, Some(vec![1]));
        if self.records.get(KYBER_LAST_RESORT, &id.to_string())?.is_none() {
            self.records.put(KYBER_PRE_KEY, &id.to_string(), None);
        }
        Ok(())
    }
}

fn hex(value: &[u8]) -> String {
    value.iter().map(|b| format!("{b:02x}")).collect()
}

#[async_trait(?Send)]
impl SessionStore for Store {
    async fn load_session(&self, address: &ProtocolAddress) -> Result<Option<SessionRecord>, SignalProtocolError> {
        self.records
            .get(SESSION, &address_key(address))?
            .map(|raw| SessionRecord::deserialize(&raw))
            .transpose()
    }

    async fn store_session(&mut self, address: &ProtocolAddress, record: &SessionRecord) -> Result<(), SignalProtocolError> {
        self.records.put(SESSION, &address_key(address), Some(record.serialize()?));
        Ok(())
    }
}

#[async_trait(?Send)]
impl SenderKeyStore for Store {
    async fn store_sender_key(&mut self, sender: &ProtocolAddress, distribution_id: uuid::Uuid, record: &SenderKeyRecord) -> Result<(), SignalProtocolError> {
        self.records
            .put(SENDER_KEY, &format!("{}.{}", address_key(sender), distribution_id), Some(record.serialize()?));
        Ok(())
    }

    async fn load_sender_key(&mut self, sender: &ProtocolAddress, distribution_id: uuid::Uuid) -> Result<Option<SenderKeyRecord>, SignalProtocolError> {
        self.records
            .get(SENDER_KEY, &format!("{}.{}", address_key(sender), distribution_id))?
            .map(|raw| SenderKeyRecord::deserialize(&raw))
            .transpose()
    }
}

/// L'appareil local d'une opération : sa paire d'identité, sa génération, son
/// adresse, et la lecture des enregistrements.
fn store(identity: &[u8], registration_id: u32, own_user_id: &str, load: Function) -> Result<Store, JsError> {
    Ok(Store {
        identity: IdentityKeyPair::try_from(identity).map_err(fail)?,
        registration_id,
        own_user_id: own_user_id.to_owned(),
        records: Records::new(load),
    })
}

fn identity_pair(identity: &[u8]) -> Result<IdentityKeyPair, JsError> {
    IdentityKeyPair::try_from(identity).map_err(fail)
}

/// Une paire d'identité neuve, sérialisée par libsignal (privée comprise :
/// elle ne quitte jamais l'appareil et se range scellée).
#[wasm_bindgen(js_name = identityGenerate)]
pub fn identity_generate() -> Vec<u8> {
    IdentityKeyPair::generate(&mut rng()).serialize().to_vec()
}

/// La clé d'identité PUBLIQUE (33 octets, préfixe de type 0x05).
#[wasm_bindgen(js_name = identityPublicKey)]
pub fn identity_public_key(identity: &[u8]) -> Result<Vec<u8>, JsError> {
    Ok(identity_pair(identity)?.identity_key().serialize().to_vec())
}

/// Signature XEdDSA d'un message par la clé d'identité.
#[wasm_bindgen(js_name = identitySign)]
pub fn identity_sign(identity: &[u8], message: &[u8]) -> Result<Vec<u8>, JsError> {
    Ok(identity_pair(identity)?
        .private_key()
        .calculate_signature(message, &mut rng())
        .map_err(fail)?
        .to_vec())
}

/// Vérifie une signature XEdDSA sous une clé d'identité publique.
#[wasm_bindgen(js_name = identityVerify)]
pub fn identity_verify(public_identity: &[u8], message: &[u8], signature: &[u8]) -> Result<bool, JsError> {
    Ok(IdentityKey::decode(public_identity).map_err(fail)?.public_key().verify_signature(message, signature))
}

fn signed(record: Vec<u8>, public_key: Vec<u8>, signature: Vec<u8>) -> Result<Object, JsError> {
    let out = Object::new();
    set(&out, "record", &bytes(&record))?;
    set(&out, "publicKey", &bytes(&public_key))?;
    set(&out, "signature", &bytes(&signature))?;
    Ok(out)
}

/// Une pré-clé signée EC neuve : l'enregistrement (privé, à sceller), la clé
/// publique et sa signature XEdDSA par l'identité.
#[wasm_bindgen(js_name = signedPreKeyGenerate)]
pub fn signed_pre_key_generate(identity: &[u8], id: u32, timestamp_ms: f64) -> Result<Object, JsError> {
    let pair = identity_pair(identity)?;
    let key = KeyPair::generate(&mut rng());
    let public_key = key.public_key.serialize().to_vec();
    let signature = pair.private_key().calculate_signature(&public_key, &mut rng()).map_err(fail)?.to_vec();
    let record = SignedPreKeyRecord::new(id.into(), Timestamp::from_epoch_millis(timestamp_ms as u64), &key, &signature);
    signed(record.serialize().map_err(fail)?, public_key, signature)
}

/// Une pré-clé Kyber1024 neuve (la même nature que `KEMKeyPair.generate()` iOS).
#[wasm_bindgen(js_name = kyberPreKeyGenerate)]
pub fn kyber_pre_key_generate(identity: &[u8], id: u32, timestamp_ms: f64) -> Result<Object, JsError> {
    let pair = identity_pair(identity)?;
    let key = kem::KeyPair::generate(KeyType::Kyber1024, &mut rng());
    let public_key = key.public_key.serialize().to_vec();
    let signature = pair.private_key().calculate_signature(&public_key, &mut rng()).map_err(fail)?.to_vec();
    let record = KyberPreKeyRecord::new(id.into(), Timestamp::from_epoch_millis(timestamp_ms as u64), &key, &signature);
    signed(record.serialize().map_err(fail)?, public_key, signature)
}

/// Une pré-clé unique EC neuve.
#[wasm_bindgen(js_name = preKeyGenerate)]
pub fn pre_key_generate(id: u32) -> Result<Object, JsError> {
    let key = KeyPair::generate(&mut rng());
    let record = PreKeyRecord::new(id.into(), &key);
    let out = Object::new();
    set(&out, "record", &bytes(&record.serialize().map_err(fail)?))?;
    set(&out, "publicKey", &bytes(&key.public_key.serialize()))?;
    Ok(out)
}

/// La génération (`registrationId`) que vise une session, `undefined` sans état courant.
#[wasm_bindgen(js_name = sessionRemoteRegistrationId)]
pub fn session_remote_registration_id(session: &[u8]) -> Result<Option<u32>, JsError> {
    let record = SessionRecord::deserialize(session).map_err(fail)?;
    if !record.has_usable_sender_chain(SystemTime::UNIX_EPOCH, SessionUsabilityRequirements::empty()).map_err(fail)? {
        return Ok(None);
    }
    Ok(Some(record.remote_registration_id().map_err(fail)?))
}

/// PQXDH (spec § 4.1) : libsignal vérifie les signatures XEdDSA de la pré-clé
/// signée et de la Kyber avant d'ouvrir la session. Rend les écritures.
#[wasm_bindgen(js_name = sessionStart)]
#[allow(clippy::too_many_arguments)]
pub fn session_start(
    identity: &[u8],
    registration_id: u32,
    local_name: &str,
    local_device_id: u32,
    load: Function,
    remote_name: &str,
    remote_device_id: u32,
    remote_registration_id: u32,
    remote_identity: &[u8],
    pre_key_id: Option<u32>,
    pre_key: Option<Vec<u8>>,
    signed_pre_key_id: u32,
    signed_pre_key: &[u8],
    signed_pre_key_signature: &[u8],
    kyber_pre_key_id: u32,
    kyber_pre_key: &[u8],
    kyber_pre_key_signature: &[u8],
    now_ms: f64,
) -> Result<Array, JsError> {
    let mut store = store(identity, registration_id, local_name, load)?;
    let remote = address(remote_name, remote_device_id)?;
    let ours = address(local_name, local_device_id)?;
    let one_time = match (pre_key_id, pre_key) {
        (Some(id), Some(key)) => Some((id.into(), PublicKey::deserialize(&key).map_err(fail)?)),
        _ => None,
    };
    let bundle = PreKeyBundle::new(
        remote_registration_id,
        DeviceId::try_from(remote_device_id).map_err(|_| JsError::new("deviceId hors plage"))?,
        one_time,
        signed_pre_key_id.into(),
        PublicKey::deserialize(signed_pre_key).map_err(fail)?,
        signed_pre_key_signature.to_vec(),
        kyber_pre_key_id.into(),
        kem::PublicKey::deserialize(kyber_pre_key).map_err(fail)?,
        kyber_pre_key_signature.to_vec(),
        IdentityKey::decode(remote_identity).map_err(fail)?,
    )
    .map_err(fail)?;
    {
        let shared = RefCell::new(&mut store);
        ready(process_prekey_bundle(&remote, &ours, &mut Shared(&shared), &mut Shared(&shared), &bundle, at(now_ms), &mut rng()))
            .map_err(fail)?;
    }
    Ok(store.records.into_writes())
}

/// Chiffre pour un appareil : rend `{ type, body, writes }`.
#[wasm_bindgen(js_name = sessionEncrypt)]
#[allow(clippy::too_many_arguments)]
pub fn session_encrypt(
    identity: &[u8],
    registration_id: u32,
    local_name: &str,
    local_device_id: u32,
    load: Function,
    remote_name: &str,
    remote_device_id: u32,
    plaintext: &[u8],
    now_ms: f64,
) -> Result<Object, JsError> {
    let mut store = store(identity, registration_id, local_name, load)?;
    let remote = address(remote_name, remote_device_id)?;
    let ours = address(local_name, local_device_id)?;
    let message = {
        let shared = RefCell::new(&mut store);
        ready(message_encrypt(plaintext, &remote, &ours, &mut Shared(&shared), &mut Shared(&shared), at(now_ms), &mut rng()))
            .map_err(fail)?
    };
    let out = Object::new();
    set(&out, "type", &JsValue::from(message.message_type() as u8))?;
    set(&out, "body", &bytes(message.serialize()))?;
    set(&out, "writes", &store.records.into_writes().into())?;
    Ok(out)
}

/// Déchiffre une enveloppe (3 = PreKey, 2 = Signal) : rend `{ plaintext, writes }`.
#[wasm_bindgen(js_name = sessionDecrypt)]
#[allow(clippy::too_many_arguments)]
pub fn session_decrypt(
    identity: &[u8],
    registration_id: u32,
    local_name: &str,
    local_device_id: u32,
    load: Function,
    remote_name: &str,
    remote_device_id: u32,
    message_type: u8,
    body: &[u8],
) -> Result<Object, JsError> {
    let mut store = store(identity, registration_id, local_name, load)?;
    let remote = address(remote_name, remote_device_id)?;
    let ours = address(local_name, local_device_id)?;
    let plaintext = match message_type {
        3 => {
            let message = PreKeySignalMessage::try_from(body).map_err(fail)?;
            ready(decrypt_prekey(&mut store, &message, &remote, &ours))
        }
        2 => {
            let message = SignalMessage::try_from(body).map_err(fail)?;
            let shared = RefCell::new(&mut store);
            ready(message_decrypt_signal(&message, &remote, &ours, &mut Shared(&shared), &mut Shared(&shared), &mut rng()))
        }
        other => return Err(JsError::new(&format!("type de message inconnu {other}"))),
    }
    .map_err(fail)?;
    let out = Object::new();
    set(&out, "plaintext", &bytes(&plaintext))?;
    set(&out, "writes", &store.records.into_writes().into())?;
    Ok(out)
}

async fn decrypt_prekey(store: &mut Store, message: &PreKeySignalMessage, remote: &ProtocolAddress, ours: &ProtocolAddress) -> Result<Vec<u8>, SignalProtocolError> {
    let shared = RefCell::new(store);
    let mut sessions = Shared(&shared);
    let mut identities = Shared(&shared);
    let mut pre_keys = Shared(&shared);
    let signed = Shared(&shared);
    let mut kyber = Shared(&shared);
    message_decrypt_prekey(message, remote, ours, &mut sessions, &mut identities, &mut pre_keys, &signed, &mut kyber, &mut rng()).await
}

// libsignal demande un emprunt mutable distinct par store ; tous partagent ici
// la même transaction. `Shared` relaie vers `Store` par un `RefCell` : les
// stores sont synchrones et libsignal les appelle l'un après l'autre, aucun
// emprunt ne se chevauche.

struct Shared<'a, 'b>(&'a RefCell<&'b mut Store>);

macro_rules! relay_session {
    ($t:ty, $s:ident, $get:expr, $get_mut:expr) => {
        #[async_trait(?Send)]
        impl SessionStore for $t {
            async fn load_session(&self, address: &ProtocolAddress) -> Result<Option<SessionRecord>, SignalProtocolError> {
                let $s = self;
                ($get).load_session(address).await
            }
            async fn store_session(&mut self, address: &ProtocolAddress, record: &SessionRecord) -> Result<(), SignalProtocolError> {
                let $s = self;
                ($get_mut).store_session(address, record).await
            }
        }
    };
}

relay_session!(Shared<'_, '_>, s, &**s.0.borrow(), &mut **s.0.borrow_mut());

macro_rules! relay_identity {
    ($t:ty, $s:ident, $get:expr, $get_mut:expr) => {
        #[async_trait(?Send)]
        impl IdentityKeyStore for $t {
            async fn get_identity_key_pair(&self) -> Result<IdentityKeyPair, SignalProtocolError> {
                let $s = self;
                ($get).get_identity_key_pair().await
            }
            async fn get_local_registration_id(&self) -> Result<u32, SignalProtocolError> {
                let $s = self;
                ($get).get_local_registration_id().await
            }
            async fn save_identity(&mut self, address: &ProtocolAddress, identity: &IdentityKey) -> Result<IdentityChange, SignalProtocolError> {
                let $s = self;
                ($get_mut).save_identity(address, identity).await
            }
            async fn is_trusted_identity(&self, address: &ProtocolAddress, identity: &IdentityKey, direction: Direction) -> Result<bool, SignalProtocolError> {
                let $s = self;
                ($get).is_trusted_identity(address, identity, direction).await
            }
            async fn get_identity(&self, address: &ProtocolAddress) -> Result<Option<IdentityKey>, SignalProtocolError> {
                let $s = self;
                ($get).get_identity(address).await
            }
        }
    };
}

relay_identity!(Shared<'_, '_>, s, &**s.0.borrow(), &mut **s.0.borrow_mut());

#[async_trait(?Send)]
impl PreKeyStore for Shared<'_, '_> {
    async fn get_pre_key(&self, id: PreKeyId) -> Result<PreKeyRecord, SignalProtocolError> {
        self.0.borrow().get_pre_key(id).await
    }
    async fn save_pre_key(&mut self, id: PreKeyId, record: &PreKeyRecord) -> Result<(), SignalProtocolError> {
        self.0.borrow_mut().save_pre_key(id, record).await
    }
    async fn remove_pre_key(&mut self, id: PreKeyId) -> Result<(), SignalProtocolError> {
        self.0.borrow_mut().remove_pre_key(id).await
    }
}

#[async_trait(?Send)]
impl SignedPreKeyStore for Shared<'_, '_> {
    async fn get_signed_pre_key(&self, id: SignedPreKeyId) -> Result<SignedPreKeyRecord, SignalProtocolError> {
        self.0.borrow().get_signed_pre_key(id).await
    }
    async fn save_signed_pre_key(&mut self, id: SignedPreKeyId, record: &SignedPreKeyRecord) -> Result<(), SignalProtocolError> {
        self.0.borrow_mut().save_signed_pre_key(id, record).await
    }
}

#[async_trait(?Send)]
impl KyberPreKeyStore for Shared<'_, '_> {
    async fn get_kyber_pre_key(&self, id: KyberPreKeyId) -> Result<KyberPreKeyRecord, SignalProtocolError> {
        self.0.borrow().get_kyber_pre_key(id).await
    }
    async fn save_kyber_pre_key(&mut self, id: KyberPreKeyId, record: &KyberPreKeyRecord) -> Result<(), SignalProtocolError> {
        self.0.borrow_mut().save_kyber_pre_key(id, record).await
    }
    async fn mark_kyber_pre_key_used(&mut self, id: KyberPreKeyId, signed_id: SignedPreKeyId, base_key: &PublicKey) -> Result<(), SignalProtocolError> {
        self.0.borrow_mut().mark_kyber_pre_key_used(id, signed_id, base_key).await
    }
}
