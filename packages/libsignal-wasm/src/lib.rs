//! Le pont WASM de libsignal pour le web (#17114).
//!
//! Aucune primitive ici : chaque opération appelle `libsignal-protocol` au tag
//! de la version commune (PQXDH, Double Ratchet, signatures XEdDSA, ML-KEM).
//!
//! Pont v2 (#18992, #18993, #18994) : la signature XEdDSA d'un message
//! arbitraire par la clé d'identité (la preuve de liaison de l'enrôlement) et
//! sa vérification, la `registrationId` distante d'une session, l'en-tête d'un
//! premier message, des erreurs qui portent un `code` stable (jamais lu dans
//! un texte), et l'injection idempotente des clés de base déjà vues.
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
    ProtocolAddress, PublicKey, SessionRecord, SessionStore, SignalMessage, SignalProtocolError,
    SignedPreKeyId, SignedPreKeyRecord, SignedPreKeyStore, Timestamp, InMemSignalProtocolStore, kem,
    message_decrypt, message_encrypt, process_prekey_bundle,
};
use rand::TryRngCore;
use rand::rngs::OsRng;
use wasm_bindgen::prelude::*;

const REGISTRATION_ID_MAX: u32 = 16380;

type Bridged<T> = Result<T, JsValue>;

#[wasm_bindgen]
extern "C" {
    /// Le constructeur `Error` du contexte JavaScript, déclaré ici plutôt que
    /// tiré de `js-sys` : mesuré, `js_sys::Error` et `js_sys::Reflect`
    /// coûtaient 2,4 Ko gzip au binaire pour deux appels.
    #[wasm_bindgen(js_name = Error)]
    type CodedError;
    #[wasm_bindgen(constructor, js_class = "Error")]
    fn new(message: &str) -> CodedError;
    #[wasm_bindgen(method, setter = code)]
    fn set_code(this: &CodedError, code: &str);
}

/// Une erreur du pont : un `Error` JavaScript qui porte son `code` STABLE en
/// propriété. La façade décide « acquitter ou réessayer » sur ce code, jamais
/// sur le texte d'affichage de libsignal, qui n'est pas un contrat.
fn bridge_error(code: &'static str, detail: &dyn std::fmt::Display) -> JsValue {
    let error = CodedError::new(&format!("libsignal[{code}]: {detail}"));
    error.set_code(code);
    error.into()
}

/// Le code d'une erreur du PROTOCOLE — un `match` sur les variantes publiques
/// de `SignalProtocolError`, rien d'autre.
fn code_of(error: &SignalProtocolError) -> &'static str {
    match error {
        SignalProtocolError::UntrustedIdentity(_) => "UNTRUSTED_IDENTITY",
        SignalProtocolError::InvalidPreKeyId => "INVALID_PREKEY_ID",
        SignalProtocolError::InvalidSignedPreKeyId => "INVALID_SIGNED_PREKEY_ID",
        SignalProtocolError::InvalidKyberPreKeyId => "INVALID_KYBER_PREKEY_ID",
        SignalProtocolError::DuplicatedMessage(_, _) => "DUPLICATED_MESSAGE",
        SignalProtocolError::InvalidMessage(_, _)
        | SignalProtocolError::InvalidProtobufEncoding
        | SignalProtocolError::CiphertextMessageTooShort(_) => "INVALID_MESSAGE",
        SignalProtocolError::SessionNotFound(_) => "SESSION_NOT_FOUND",
        SignalProtocolError::UnrecognizedMessageVersion(_)
        | SignalProtocolError::UnrecognizedCiphertextVersion(_)
        | SignalProtocolError::LegacyCiphertextVersion(_) => "UNRECOGNIZED_VERSION",
        SignalProtocolError::SignatureValidationFailed => "SIGNATURE_INVALID",
        SignalProtocolError::InvalidArgument(_)
        | SignalProtocolError::NoKeyTypeIdentifier
        | SignalProtocolError::BadKeyType(_)
        | SignalProtocolError::BadKeyLength(_, _)
        | SignalProtocolError::BadKEMKeyType(_)
        | SignalProtocolError::WrongKEMKeyType(_, _)
        | SignalProtocolError::BadKEMKeyLength(_, _)
        | SignalProtocolError::BadKEMCiphertextLength(_, _)
        | SignalProtocolError::InvalidKeyAgreement => "INVALID_KEY",
        _ => "PROTOCOL",
    }
}

/// Une erreur de libsignal sur une donnée REÇUE (message, bundle, clé) : son
/// code de protocole. Une `CurveError` (clé qui ne se décode pas) passe par la
/// conversion de libsignal elle-même (`From<CurveError> for SignalProtocolError`).
fn fail_protocol(error: impl Into<SignalProtocolError>) -> JsValue {
    let error = error.into();
    bridge_error(code_of(&error), &error)
}

/// Une donnée que l'APPAREIL a rangée (identité, pré-clés, session) et qui ne se
/// relit pas : l'enveloppe en cours n'y est pour rien, elle ne se juge pas.
fn fail_local(error: impl std::fmt::Display) -> JsValue {
    bridge_error("LOCAL_STATE_INVALID", &error)
}

/// Une entrée de l'appelant hors du protocole (adresse, type de message, pré-clé incomplète).
fn fail_argument(error: impl std::fmt::Display) -> JsValue {
    bridge_error("INVALID_ARGUMENT", &error)
}

/// Les magasins en mémoire de libsignal répondent sans jamais suspendre : un
/// seul `poll` suffit, et une suspension inattendue est une erreur, jamais une
/// attente.
fn ready<T>(future: impl Future<Output = T>) -> Bridged<T> {
    let mut future = pin!(future);
    match future.as_mut().poll(&mut Context::from_waker(Waker::noop())) {
        Poll::Ready(value) => Ok(value),
        Poll::Pending => Err(bridge_error("BRIDGE_SUSPENDED", &"opération suspendue sur un magasin en mémoire")),
    }
}

fn instant(epoch_millis: f64) -> SystemTime {
    SystemTime::UNIX_EPOCH + Duration::from_millis(epoch_millis.max(0.0) as u64)
}

fn address(name: &str, device_id: u32) -> Bridged<ProtocolAddress> {
    let device = DeviceId::try_from(device_id).map_err(fail_argument)?;
    Ok(ProtocolAddress::new(name.to_owned(), device))
}

fn identity_pair(serialized: &[u8]) -> Bridged<IdentityKeyPair> {
    IdentityKeyPair::try_from(serialized).map_err(fail_local)
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
    let signature = identity.private_key().calculate_signature(&public_key, &mut rng).map_err(fail_protocol)?.into_vec();
    let record = SignedPreKeyRecord::new(SignedPreKeyId::from(id), Timestamp::from_epoch_millis(epoch_millis.max(0.0) as u64), &pair, &signature);
    Ok(GeneratedPreKey { id, record: record.serialize().map_err(fail_protocol)?, public_key, signature })
}

#[wasm_bindgen(js_name = generateKyberPreKey)]
pub fn generate_kyber_pre_key(identity_key_pair: &[u8], id: u32, epoch_millis: f64) -> Bridged<GeneratedPreKey> {
    let mut rng = OsRng.unwrap_err();
    let identity = identity_pair(identity_key_pair)?;
    let pair = kem::KeyPair::generate(kem::KeyType::Kyber1024, &mut rng);
    let public_key = pair.public_key.serialize().into_vec();
    let signature = identity.private_key().calculate_signature(&public_key, &mut rng).map_err(fail_protocol)?.into_vec();
    let record = KyberPreKeyRecord::new(KyberPreKeyId::from(id), Timestamp::from_epoch_millis(epoch_millis.max(0.0) as u64), &pair, &signature);
    Ok(GeneratedPreKey { id, record: record.serialize().map_err(fail_protocol)?, public_key, signature })
}

#[wasm_bindgen(js_name = generatePreKey)]
pub fn generate_pre_key(id: u32) -> Bridged<GeneratedPreKey> {
    let mut rng = OsRng.unwrap_err();
    let pair = KeyPair::generate(&mut rng);
    let record = PreKeyRecord::new(PreKeyId::from(id), &pair);
    Ok(GeneratedPreKey {
        id,
        record: record.serialize().map_err(fail_protocol)?,
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
    #[wasm_bindgen(js_name = signedPreKeyId)]
    pub signed_pre_key_id: Option<u32>,
    #[wasm_bindgen(js_name = baseKey)]
    pub base_key: Option<Vec<u8>>,
}

/// Ce qu'un PreKeySignalMessage engage : les pré-clés qu'il consomme et sa clé
/// de base, que l'appelant persiste pour refuser son rejeu (`addSeenBaseKey`).
struct PreKeyUse {
    pre_key_id: Option<u32>,
    kyber_pre_key_id: Option<u32>,
    signed_pre_key_id: Option<u32>,
    base_key: Option<Vec<u8>>,
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
        let inner = InMemSignalProtocolStore::new(identity_pair(identity_key_pair)?, registration_id).map_err(fail_local)?;
        Ok(ProtocolStore { inner, local: address(local_name, local_device_id)? })
    }

    #[wasm_bindgen(js_name = addSignedPreKey)]
    pub fn add_signed_pre_key(&mut self, id: u32, record: &[u8]) -> Bridged<()> {
        let record = SignedPreKeyRecord::deserialize(record).map_err(fail_local)?;
        ready(self.inner.save_signed_pre_key(SignedPreKeyId::from(id), &record))?.map_err(fail_local)
    }

    #[wasm_bindgen(js_name = addKyberPreKey)]
    pub fn add_kyber_pre_key(&mut self, id: u32, record: &[u8]) -> Bridged<()> {
        let record = KyberPreKeyRecord::deserialize(record).map_err(fail_local)?;
        ready(self.inner.save_kyber_pre_key(KyberPreKeyId::from(id), &record))?.map_err(fail_local)
    }

    /// Réinjecte une clé de base déjà acceptée sur ce couple de pré-clés (Kyber,
    /// signée) : libsignal refuse alors tout PreKeySignalMessage qui la
    /// présente de nouveau (`mark_kyber_pre_key_used`). Sans elle, un magasin
    /// éphémère accepterait le rejeu d'un premier message sur une pré-clé Kyber
    /// de dernier recours, vers son expéditeur comme vers une autre adresse.
    ///
    /// IDEMPOTENTE (#18994) : `mark_kyber_pre_key_used` ne rend `InvalidMessage`
    /// que pour une clé DÉJÀ présente (`storage/inmem.rs`). Un doublon persisté
    /// — deux onglets, une reprise après crash — rendait le magasin
    /// inconstructible pour TOUTE opération : le navigateur ne déchiffrait plus
    /// rien. Ce refus-là est ignoré ICI, à l'injection, et seulement ici : le
    /// rejeu d'un premier message reste refusé au déchiffrement.
    #[wasm_bindgen(js_name = addSeenBaseKey)]
    pub fn add_seen_base_key(&mut self, kyber_pre_key_id: u32, signed_pre_key_id: u32, base_key: &[u8]) -> Bridged<()> {
        let base_key = PublicKey::deserialize(base_key).map_err(fail_local)?;
        match ready(self.inner.mark_kyber_pre_key_used(KyberPreKeyId::from(kyber_pre_key_id), SignedPreKeyId::from(signed_pre_key_id), &base_key))? {
            Ok(()) | Err(SignalProtocolError::InvalidMessage(_, _)) => Ok(()),
            Err(error) => Err(fail_local(error)),
        }
    }

    #[wasm_bindgen(js_name = addPreKey)]
    pub fn add_pre_key(&mut self, id: u32, record: &[u8]) -> Bridged<()> {
        let record = PreKeyRecord::deserialize(record).map_err(fail_local)?;
        ready(self.inner.save_pre_key(PreKeyId::from(id), &record))?.map_err(fail_local)
    }

    /// Pose l'identité CONNUE du pair : toute clé différente présentée ensuite
    /// (bundle ou message) est refusée — c'est la garde contre la substitution
    /// de clé, que l'appelant ne lève qu'après vérification du numéro de sécurité.
    #[wasm_bindgen(js_name = trustIdentity)]
    pub fn trust_identity(&mut self, name: &str, device_id: u32, identity_key: &[u8]) -> Bridged<()> {
        let key = IdentityKey::decode(identity_key).map_err(fail_local)?;
        ready(self.inner.save_identity(&address(name, device_id)?, &key))?.map_err(fail_local).map(|_| ())
    }

    #[wasm_bindgen(js_name = setSession)]
    pub fn set_session(&mut self, name: &str, device_id: u32, record: &[u8]) -> Bridged<()> {
        let record = SessionRecord::deserialize(record).map_err(fail_local)?;
        ready(self.inner.store_session(&address(name, device_id)?, &record))?.map_err(fail_local)
    }

    pub fn session(&self, name: &str, device_id: u32) -> Bridged<Option<Vec<u8>>> {
        ready(self.inner.load_session(&address(name, device_id)?))?
            .map_err(fail_local)?
            .map(|record| record.serialize().map_err(fail_local))
            .transpose()
    }

    pub fn identity(&self, name: &str, device_id: u32) -> Bridged<Option<Vec<u8>>> {
        Ok(ready(self.inner.get_identity(&address(name, device_id)?))?
            .map_err(fail_local)?
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
            (Some(id), Some(public)) => Some((PreKeyId::from(id), PublicKey::deserialize(&public).map_err(fail_protocol)?)),
            (None, None) => None,
            _ => return Err(fail_argument("pré-clé à usage unique incomplète")),
        };
        let bundle = PreKeyBundle::new(
            registration_id,
            remote.device_id(),
            pre_key,
            SignedPreKeyId::from(signed_pre_key_id),
            PublicKey::deserialize(signed_pre_key_public).map_err(fail_protocol)?,
            signed_pre_key_signature.to_vec(),
            KyberPreKeyId::from(kyber_pre_key_id),
            kem::PublicKey::deserialize(kyber_pre_key_public).map_err(fail_protocol)?,
            kyber_pre_key_signature.to_vec(),
            IdentityKey::decode(identity_key).map_err(fail_protocol)?,
        )
        .map_err(fail_protocol)?;
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
        .map_err(fail_protocol)
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
        .map_err(fail_protocol)?;
        Ok(Sealed { message_type: message.message_type() as u8, body: message.serialize().to_vec() })
    }

    pub fn open(&mut self, name: &str, device_id: u32, message_type: u8, body: &[u8]) -> Bridged<Opened> {
        let remote = address(name, device_id)?;
        let (message, used) = parse(message_type, body)?;
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
        .map_err(fail_protocol)?;
        Ok(Opened {
            plaintext,
            pre_key_id: used.pre_key_id,
            kyber_pre_key_id: used.kyber_pre_key_id,
            signed_pre_key_id: used.signed_pre_key_id,
            base_key: used.base_key,
        })
    }
}

fn parse(message_type: u8, body: &[u8]) -> Bridged<(CiphertextMessage, PreKeyUse)> {
    if message_type == CiphertextMessageType::PreKey as u8 {
        let message = PreKeySignalMessage::try_from(body).map_err(fail_protocol)?;
        let used = PreKeyUse {
            pre_key_id: message.pre_key_id().map(u32::from),
            kyber_pre_key_id: message.kyber_pre_key_id().map(u32::from),
            signed_pre_key_id: Some(u32::from(message.signed_pre_key_id())),
            base_key: Some(message.base_key().serialize().into_vec()),
        };
        return Ok((CiphertextMessage::PreKeySignalMessage(message), used));
    }
    if message_type == CiphertextMessageType::Whisper as u8 {
        let used = PreKeyUse { pre_key_id: None, kyber_pre_key_id: None, signed_pre_key_id: None, base_key: None };
        return Ok((CiphertextMessage::SignalMessage(SignalMessage::try_from(body).map_err(fail_protocol)?), used));
    }
    Err(bridge_error("INVALID_MESSAGE", &format_args!("type de message {message_type} hors du protocole à deux")))
}

/// La signature XEdDSA d'un message ARBITRAIRE par la clé d'identité de
/// l'appareil (#18992) — la preuve de liaison que `POST /e2ee/devices` exige
/// (`deviceBindingMessage`, `packages/shared/types/e2ee-directory.ts`), que
/// l'iPhone produit par `privateKey.generateSignature` et que la passerelle
/// vérifie par `PublicKey.verify`. XEdDSA est aléatoire : deux signatures du
/// même message diffèrent, et toutes deux se vérifient.
#[wasm_bindgen(js_name = signWithIdentity)]
pub fn sign_with_identity(identity_key_pair: &[u8], message: &[u8]) -> Bridged<Vec<u8>> {
    let mut rng = OsRng.unwrap_err();
    Ok(identity_pair(identity_key_pair)?.private_key().calculate_signature(message, &mut rng).map_err(fail_protocol)?.into_vec())
}

/// La vérification d'une signature XEdDSA par une clé d'identité publique
/// (33 octets) — `false` pour une signature fausse, une erreur pour une clé
/// qui ne se décode pas.
#[wasm_bindgen(js_name = verifyWithIdentity)]
pub fn verify_with_identity(identity_key: &[u8], message: &[u8], signature: &[u8]) -> Bridged<bool> {
    Ok(IdentityKey::decode(identity_key).map_err(fail_protocol)?.public_key().verify_signature(message, signature))
}

/// La `registrationId` du pair qu'une session vise (#18992) — lue dans
/// l'ENREGISTREMENT, seule source de vérité : une session dont la génération
/// diffère de l'annuaire se jette et se rouvre (Sesame), et l'enveloppe
/// s'adresse à cette génération.
#[wasm_bindgen(js_name = sessionRemoteRegistrationId)]
pub fn session_remote_registration_id(session: &[u8]) -> Bridged<u32> {
    SessionRecord::deserialize(session).map_err(fail_local)?.remote_registration_id().map_err(fail_protocol)
}

/// L'en-tête d'un premier message (`PreKeySignalMessage`), lu SANS le déchiffrer.
#[wasm_bindgen(getter_with_clone)]
pub struct PreKeyMessageInfo {
    #[wasm_bindgen(js_name = registrationId)]
    pub registration_id: u32,
    #[wasm_bindgen(js_name = preKeyId)]
    pub pre_key_id: Option<u32>,
    #[wasm_bindgen(js_name = kyberPreKeyId)]
    pub kyber_pre_key_id: Option<u32>,
    #[wasm_bindgen(js_name = signedPreKeyId)]
    pub signed_pre_key_id: u32,
    #[wasm_bindgen(js_name = identityKey)]
    pub identity_key: Vec<u8>,
}

/// Les pré-clés qu'un premier message engage, la génération et la clé
/// d'identité de son expéditeur (#18992) : l'ouvreur ne charge du coffre que
/// les pré-clés utiles, et confronte l'expéditeur avant tout déchiffrement.
#[wasm_bindgen(js_name = preKeyMessageInfo)]
pub fn pre_key_message_info(body: &[u8]) -> Bridged<PreKeyMessageInfo> {
    let message = PreKeySignalMessage::try_from(body).map_err(fail_protocol)?;
    Ok(PreKeyMessageInfo {
        registration_id: message.registration_id(),
        pre_key_id: message.pre_key_id().map(u32::from),
        kyber_pre_key_id: message.kyber_pre_key_id().map(u32::from),
        signed_pre_key_id: u32::from(message.signed_pre_key_id()),
        identity_key: message.identity_key().serialize().into_vec(),
    })
}
