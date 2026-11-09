//! Le pont WASM de libsignal pour le web (#17114).
//!
//! Aucune primitive ici : chaque opération appelle `libsignal-protocol` au tag
//! de la version commune (PQXDH, Double Ratchet, signatures XEdDSA, ML-KEM).
//! Le pont ne garde AUCUN état entre deux appels : l'appelant remplit un
//! `ProtocolStore` éphémère depuis ce qu'il a persisté (identité, pré-clés,
//! session, identité connue du pair), opère, relit la session mise à jour et
//! libère le magasin. Les clés privées ne sortent jamais du navigateur qui les
//! a tirées : le pont n'ouvre aucune connexion.

use std::future::Future;
use std::pin::pin;
use std::task::{Context, Poll, Waker};
use std::time::{Duration, SystemTime};

use libsignal_protocol::{
    CiphertextMessage, CiphertextMessageType, DeviceId, GenericSignedPreKey, IdentityKey,
    IdentityKeyPair, IdentityKeyStore, KeyPair, KyberPreKeyId, KyberPreKeyRecord,
    KyberPreKeyStore, PreKeyBundle, PreKeyId, PreKeyRecord, PreKeySignalMessage, PreKeyStore,
    ProtocolAddress, PublicKey, SessionRecord, SessionStore, SignalMessage, SignedPreKeyId,
    SignedPreKeyRecord, SignedPreKeyStore, Timestamp, InMemSignalProtocolStore, kem,
    message_decrypt, message_encrypt, process_prekey_bundle,
};
use rand::TryRngCore;
use rand::rngs::OsRng;
use wasm_bindgen::prelude::*;

const REGISTRATION_ID_MAX: u32 = 16380;

type Bridged<T> = Result<T, JsError>;

fn fail(error: impl std::fmt::Display) -> JsError {
    JsError::new(&format!("libsignal: {error}"))
}

/// Les magasins en mémoire de libsignal répondent sans jamais suspendre : un
/// seul `poll` suffit, et une suspension inattendue est une erreur, jamais une
/// attente.
fn ready<T>(future: impl Future<Output = T>) -> Bridged<T> {
    let mut future = pin!(future);
    match future.as_mut().poll(&mut Context::from_waker(Waker::noop())) {
        Poll::Ready(value) => Ok(value),
        Poll::Pending => Err(fail("opération suspendue sur un magasin en mémoire")),
    }
}

fn instant(epoch_millis: f64) -> SystemTime {
    SystemTime::UNIX_EPOCH + Duration::from_millis(epoch_millis.max(0.0) as u64)
}

fn address(name: &str, device_id: u32) -> Bridged<ProtocolAddress> {
    let device = DeviceId::try_from(device_id).map_err(fail)?;
    Ok(ProtocolAddress::new(name.to_owned(), device))
}

fn identity_pair(serialized: &[u8]) -> Bridged<IdentityKeyPair> {
    IdentityKeyPair::try_from(serialized).map_err(fail)
}

#[wasm_bindgen(js_name = libsignalVersion)]
pub fn libsignal_version() -> String {
    env!("CARGO_PKG_VERSION").to_owned()
}

#[wasm_bindgen(getter_with_clone)]
pub struct GeneratedIdentity {
    #[wasm_bindgen(js_name = identityKeyPair)]
    pub identity_key_pair: Vec<u8>,
    #[wasm_bindgen(js_name = identityKey)]
    pub identity_key: Vec<u8>,
    #[wasm_bindgen(js_name = registrationId)]
    pub registration_id: u32,
}

#[wasm_bindgen(js_name = generateIdentity)]
pub fn generate_identity() -> Bridged<GeneratedIdentity> {
    let mut rng = OsRng.unwrap_err();
    let pair = IdentityKeyPair::generate(&mut rng);
    let registration_id = 1 + rand::Rng::random_range(&mut rng, 0..REGISTRATION_ID_MAX);
    Ok(GeneratedIdentity {
        identity_key_pair: pair.serialize().into_vec(),
        identity_key: pair.identity_key().serialize().into_vec(),
        registration_id,
    })
}

/// Une pré-clé tirée : l'enregistrement PRIVÉ (qui reste dans l'appareil) et
/// sa partie PUBLIQUE (clé et signature) que le serveur publie dans le bundle.
#[wasm_bindgen(getter_with_clone)]
pub struct GeneratedPreKey {
    pub id: u32,
    pub record: Vec<u8>,
    #[wasm_bindgen(js_name = publicKey)]
    pub public_key: Vec<u8>,
    pub signature: Vec<u8>,
}

#[wasm_bindgen(js_name = generateSignedPreKey)]
pub fn generate_signed_pre_key(identity_key_pair: &[u8], id: u32, epoch_millis: f64) -> Bridged<GeneratedPreKey> {
    let mut rng = OsRng.unwrap_err();
    let identity = identity_pair(identity_key_pair)?;
    let pair = KeyPair::generate(&mut rng);
    let public_key = pair.public_key.serialize().into_vec();
    let signature = identity.private_key().calculate_signature(&public_key, &mut rng).map_err(fail)?.into_vec();
    let record = SignedPreKeyRecord::new(SignedPreKeyId::from(id), Timestamp::from_epoch_millis(epoch_millis.max(0.0) as u64), &pair, &signature);
    Ok(GeneratedPreKey { id, record: record.serialize().map_err(fail)?, public_key, signature })
}

#[wasm_bindgen(js_name = generateKyberPreKey)]
pub fn generate_kyber_pre_key(identity_key_pair: &[u8], id: u32, epoch_millis: f64) -> Bridged<GeneratedPreKey> {
    let mut rng = OsRng.unwrap_err();
    let identity = identity_pair(identity_key_pair)?;
    let pair = kem::KeyPair::generate(kem::KeyType::Kyber1024, &mut rng);
    let public_key = pair.public_key.serialize().into_vec();
    let signature = identity.private_key().calculate_signature(&public_key, &mut rng).map_err(fail)?.into_vec();
    let record = KyberPreKeyRecord::new(KyberPreKeyId::from(id), Timestamp::from_epoch_millis(epoch_millis.max(0.0) as u64), &pair, &signature);
    Ok(GeneratedPreKey { id, record: record.serialize().map_err(fail)?, public_key, signature })
}

#[wasm_bindgen(js_name = generatePreKey)]
pub fn generate_pre_key(id: u32) -> Bridged<GeneratedPreKey> {
    let mut rng = OsRng.unwrap_err();
    let pair = KeyPair::generate(&mut rng);
    let record = PreKeyRecord::new(PreKeyId::from(id), &pair);
    Ok(GeneratedPreKey {
        id,
        record: record.serialize().map_err(fail)?,
        public_key: pair.public_key.serialize().into_vec(),
        signature: Vec::new(),
    })
}

#[wasm_bindgen(getter_with_clone)]
pub struct Sealed {
    #[wasm_bindgen(js_name = messageType)]
    pub message_type: u8,
    pub body: Vec<u8>,
}

#[wasm_bindgen(getter_with_clone)]
pub struct Opened {
    pub plaintext: Vec<u8>,
    #[wasm_bindgen(js_name = preKeyId)]
    pub pre_key_id: Option<u32>,
    #[wasm_bindgen(js_name = kyberPreKeyId)]
    pub kyber_pre_key_id: Option<u32>,
}

/// Le magasin ÉPHÉMÈRE d'un appareil, rempli par l'appelant pour UNE opération.
#[wasm_bindgen]
pub struct ProtocolStore {
    inner: InMemSignalProtocolStore,
    local: ProtocolAddress,
}

#[wasm_bindgen]
impl ProtocolStore {
    #[wasm_bindgen(constructor)]
    pub fn new(identity_key_pair: &[u8], registration_id: u32, local_name: &str, local_device_id: u32) -> Bridged<ProtocolStore> {
        let inner = InMemSignalProtocolStore::new(identity_pair(identity_key_pair)?, registration_id).map_err(fail)?;
        Ok(ProtocolStore { inner, local: address(local_name, local_device_id)? })
    }

    #[wasm_bindgen(js_name = addSignedPreKey)]
    pub fn add_signed_pre_key(&mut self, id: u32, record: &[u8]) -> Bridged<()> {
        let record = SignedPreKeyRecord::deserialize(record).map_err(fail)?;
        ready(self.inner.save_signed_pre_key(SignedPreKeyId::from(id), &record))?.map_err(fail)
    }

    #[wasm_bindgen(js_name = addKyberPreKey)]
    pub fn add_kyber_pre_key(&mut self, id: u32, record: &[u8]) -> Bridged<()> {
        let record = KyberPreKeyRecord::deserialize(record).map_err(fail)?;
        ready(self.inner.save_kyber_pre_key(KyberPreKeyId::from(id), &record))?.map_err(fail)
    }

    #[wasm_bindgen(js_name = addPreKey)]
    pub fn add_pre_key(&mut self, id: u32, record: &[u8]) -> Bridged<()> {
        let record = PreKeyRecord::deserialize(record).map_err(fail)?;
        ready(self.inner.save_pre_key(PreKeyId::from(id), &record))?.map_err(fail)
    }

    /// Pose l'identité CONNUE du pair : toute clé différente présentée ensuite
    /// (bundle ou message) est refusée — c'est la garde contre la substitution
    /// de clé, que l'appelant ne lève qu'après vérification du numéro de sécurité.
    #[wasm_bindgen(js_name = trustIdentity)]
    pub fn trust_identity(&mut self, name: &str, device_id: u32, identity_key: &[u8]) -> Bridged<()> {
        let key = IdentityKey::decode(identity_key).map_err(fail)?;
        ready(self.inner.save_identity(&address(name, device_id)?, &key))?.map_err(fail).map(|_| ())
    }

    #[wasm_bindgen(js_name = setSession)]
    pub fn set_session(&mut self, name: &str, device_id: u32, record: &[u8]) -> Bridged<()> {
        let record = SessionRecord::deserialize(record).map_err(fail)?;
        ready(self.inner.store_session(&address(name, device_id)?, &record))?.map_err(fail)
    }

    pub fn session(&self, name: &str, device_id: u32) -> Bridged<Option<Vec<u8>>> {
        ready(self.inner.load_session(&address(name, device_id)?))?
            .map_err(fail)?
            .map(|record| record.serialize().map_err(fail))
            .transpose()
    }

    pub fn identity(&self, name: &str, device_id: u32) -> Bridged<Option<Vec<u8>>> {
        Ok(ready(self.inner.get_identity(&address(name, device_id)?))?
            .map_err(fail)?
            .map(|key| key.serialize().into_vec()))
    }

    #[wasm_bindgen(js_name = processPreKeyBundle)]
    #[allow(clippy::too_many_arguments)]
    pub fn process_pre_key_bundle(
        &mut self,
        name: &str,
        device_id: u32,
        registration_id: u32,
        identity_key: &[u8],
        signed_pre_key_id: u32,
        signed_pre_key_public: &[u8],
        signed_pre_key_signature: &[u8],
        kyber_pre_key_id: u32,
        kyber_pre_key_public: &[u8],
        kyber_pre_key_signature: &[u8],
        pre_key_id: Option<u32>,
        pre_key_public: Option<Vec<u8>>,
        epoch_millis: f64,
    ) -> Bridged<()> {
        let remote = address(name, device_id)?;
        let pre_key = match (pre_key_id, pre_key_public) {
            (Some(id), Some(public)) => Some((PreKeyId::from(id), PublicKey::deserialize(&public).map_err(fail)?)),
            (None, None) => None,
            _ => return Err(fail("pré-clé à usage unique incomplète")),
        };
        let bundle = PreKeyBundle::new(
            registration_id,
            remote.device_id(),
            pre_key,
            SignedPreKeyId::from(signed_pre_key_id),
            PublicKey::deserialize(signed_pre_key_public).map_err(fail)?,
            signed_pre_key_signature.to_vec(),
            KyberPreKeyId::from(kyber_pre_key_id),
            kem::PublicKey::deserialize(kyber_pre_key_public).map_err(fail)?,
            kyber_pre_key_signature.to_vec(),
            IdentityKey::decode(identity_key).map_err(fail)?,
        )
        .map_err(fail)?;
        let mut rng = OsRng.unwrap_err();
        let store = &mut self.inner;
        ready(process_prekey_bundle(
            &remote,
            &self.local,
            &mut store.session_store,
            &mut store.identity_store,
            &bundle,
            instant(epoch_millis),
            &mut rng,
        ))?
        .map_err(fail)
    }

    pub fn seal(&mut self, name: &str, device_id: u32, plaintext: &[u8], epoch_millis: f64) -> Bridged<Sealed> {
        let remote = address(name, device_id)?;
        let mut rng = OsRng.unwrap_err();
        let store = &mut self.inner;
        let message = ready(message_encrypt(
            plaintext,
            &remote,
            &self.local,
            &mut store.session_store,
            &mut store.identity_store,
            instant(epoch_millis),
            &mut rng,
        ))?
        .map_err(fail)?;
        Ok(Sealed { message_type: message.message_type() as u8, body: message.serialize().to_vec() })
    }

    pub fn open(&mut self, name: &str, device_id: u32, message_type: u8, body: &[u8]) -> Bridged<Opened> {
        let remote = address(name, device_id)?;
        let (message, pre_key_id, kyber_pre_key_id) = parse(message_type, body)?;
        let mut rng = OsRng.unwrap_err();
        let store = &mut self.inner;
        let plaintext = ready(message_decrypt(
            &message,
            &remote,
            &self.local,
            &mut store.session_store,
            &mut store.identity_store,
            &mut store.pre_key_store,
            &store.signed_pre_key_store,
            &mut store.kyber_pre_key_store,
            &mut rng,
        ))?
        .map_err(fail)?;
        Ok(Opened { plaintext, pre_key_id, kyber_pre_key_id })
    }
}

fn parse(message_type: u8, body: &[u8]) -> Bridged<(CiphertextMessage, Option<u32>, Option<u32>)> {
    if message_type == CiphertextMessageType::PreKey as u8 {
        let message = PreKeySignalMessage::try_from(body).map_err(fail)?;
        let pre_key_id = message.pre_key_id().map(u32::from);
        let kyber_pre_key_id = message.kyber_pre_key_id().map(u32::from);
        return Ok((CiphertextMessage::PreKeySignalMessage(message), pre_key_id, kyber_pre_key_id));
    }
    if message_type == CiphertextMessageType::Whisper as u8 {
        return Ok((CiphertextMessage::SignalMessage(SignalMessage::try_from(body).map_err(fail)?), None, None));
    }
    Err(fail(format!("type de message {message_type} hors du protocole à deux")))
}
