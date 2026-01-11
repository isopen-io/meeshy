/**
 * MongoDB Migration Script: Rename Collections to PascalCase
 *
 * This script renames all snake_case collections to PascalCase to normalize
 * the naming convention across the database.
 *
 * Run with: mongosh "mongodb://localhost:27017/meeshy" rename_collections_to_pascalcase.js
 * Or: node rename_collections_to_pascalcase.js (with mongodb driver)
 */

const collectionMappings = [
  { from: 'message_status_entries', to: 'MessageStatusEntry' },
  { from: 'attachment_status_entries', to: 'AttachmentStatusEntry' },
  { from: 'attachment_reactions', to: 'AttachmentReaction' },
  { from: 'conversation_read_cursors', to: 'ConversationReadCursor' },
  { from: 'notification_preferences', to: 'NotificationPreference' },
  { from: 'call_sessions', to: 'CallSession' },
  { from: 'call_participants', to: 'CallParticipant' },
  { from: 'transcriptions', to: 'Transcription' },
  { from: 'translation_calls', to: 'TranslationCall' },
  { from: 'user_conversation_preferences', to: 'UserConversationPreferences' },
  { from: 'user_conversation_categories', to: 'UserConversationCategory' },
  { from: 'password_reset_tokens', to: 'PasswordResetToken' },
  { from: 'password_history', to: 'PasswordHistory' },
  { from: 'security_events', to: 'SecurityEvent' },
  { from: 'user_sessions', to: 'UserSession' },
  { from: 'signal_pre_key_bundles', to: 'SignalPreKeyBundle' },
  { from: 'conversation_public_keys', to: 'ConversationPublicKey' },
  { from: 'server_encryption_keys', to: 'ServerEncryptionKey' },
  { from: 'dma_sessions', to: 'DMASession' },
  { from: 'dma_enrollments', to: 'DMAEnrollment' },
  { from: 'dma_pre_keys', to: 'PreKey' },
  { from: 'message_audio_transcriptions', to: 'MessageAudioTranscription' },
  { from: 'message_translated_audios', to: 'MessageTranslatedAudio' },
  { from: 'user_voice_models', to: 'UserVoiceModel' },
  { from: 'user_message_deletions', to: 'UserMessageDeletion' }
];

// =====================================================
// FOR USE WITH MONGOSH (MongoDB Shell)
// Run: mongosh "mongodb://localhost:27017/meeshy" rename_collections_to_pascalcase.js
// =====================================================

if (typeof db !== 'undefined') {
  // Running in mongosh
  print('Starting collection rename migration (mongosh)...');
  print('');

  const existingCollections = db.getCollectionNames();
  let renamed = 0;
  let skipped = 0;
  let errors = 0;

  for (const mapping of collectionMappings) {
    if (existingCollections.includes(mapping.from)) {
      if (existingCollections.includes(mapping.to)) {
        print(`SKIP: Target ${mapping.to} already exists, cannot rename from ${mapping.from}`);
        skipped++;
      } else {
        try {
          db.getCollection(mapping.from).renameCollection(mapping.to);
          print(`OK: ${mapping.from} -> ${mapping.to}`);
          renamed++;
        } catch (e) {
          print(`ERROR: Failed to rename ${mapping.from} -> ${mapping.to}: ${e.message}`);
          errors++;
        }
      }
    } else {
      print(`SKIP: ${mapping.from} does not exist (may already be renamed)`);
      skipped++;
    }
  }

  print('');
  print(`Migration complete: ${renamed} renamed, ${skipped} skipped, ${errors} errors`);
}

// =====================================================
// FOR USE WITH NODE.JS (mongodb driver)
// Run: DATABASE_URL="mongodb://..." node rename_collections_to_pascalcase.js
// =====================================================

if (typeof process !== 'undefined' && process.env && process.env.DATABASE_URL) {
  const { MongoClient } = require('mongodb');

  async function runMigration() {
    const client = new MongoClient(process.env.DATABASE_URL);

    try {
      await client.connect();
      console.log('Connected to MongoDB');

      const db = client.db();
      const existingCollections = (await db.listCollections().toArray()).map(c => c.name);

      console.log('Starting collection rename migration...');
      console.log('');

      let renamed = 0;
      let skipped = 0;
      let errors = 0;

      for (const mapping of collectionMappings) {
        if (existingCollections.includes(mapping.from)) {
          if (existingCollections.includes(mapping.to)) {
            console.log(`SKIP: Target ${mapping.to} already exists, cannot rename from ${mapping.from}`);
            skipped++;
          } else {
            try {
              await db.collection(mapping.from).rename(mapping.to);
              console.log(`OK: ${mapping.from} -> ${mapping.to}`);
              renamed++;
            } catch (e) {
              console.log(`ERROR: Failed to rename ${mapping.from} -> ${mapping.to}: ${e.message}`);
              errors++;
            }
          }
        } else {
          console.log(`SKIP: ${mapping.from} does not exist (may already be renamed)`);
          skipped++;
        }
      }

      console.log('');
      console.log(`Migration complete: ${renamed} renamed, ${skipped} skipped, ${errors} errors`);
    } finally {
      await client.close();
    }
  }

  runMigration().catch(console.error);
}

// Export for programmatic use
if (typeof module !== 'undefined') {
  module.exports = { collectionMappings };
}
