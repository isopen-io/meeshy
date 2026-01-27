/**
 * MongoDB Migration Script: Enable Audio Features in UserPreferences
 *
 * This script enables audio features in UserPreferences.audio for all users:
 * - audioTranscriptionEnabledAt
 * - textTranslationEnabledAt
 * - audioTranslationEnabledAt
 * - translatedAudioGenerationEnabledAt
 *
 * AND in UserPreferences.application:
 * - voiceCloningConsentAt
 * - thirdPartyServicesConsentAt
 *
 * Run with: mongosh "mongodb://localhost:27017/meeshy" enable_audio_features_in_preferences.js
 * Or: DATABASE_URL="mongodb://..." node enable_audio_features_in_preferences.js
 */

const now = new Date();

// =====================================================
// FOR USE WITH MONGOSH (MongoDB Shell)
// Run: mongosh "mongodb://localhost:27017/meeshy" enable_audio_features_in_preferences.js
// =====================================================

if (typeof db !== 'undefined') {
  print('Starting migration: Enable audio features in UserPreferences...');
  print('');

  // Update all existing UserPreferences records
  const result = db.user_preferences.updateMany(
    {},
    {
      $set: {
        'audio.audioTranscriptionEnabledAt': now,
        'audio.textTranslationEnabledAt': now,
        'audio.audioTranslationEnabledAt': now,
        'audio.translatedAudioGenerationEnabledAt': now,
        'application.dataProcessingConsentAt': now,
        'application.voiceDataConsentAt': now,
        'application.voiceProfileConsentAt': now,
        'application.voiceCloningConsentAt': now,
        'application.voiceCloningEnabledAt': now,
        'application.thirdPartyServicesConsentAt': now,
        updatedAt: now
      }
    }
  );

  print(`Updated ${result.modifiedCount} UserPreferences records`);
  print('');

  // Create UserPreferences for users that don't have one
  const usersWithoutPreferences = db.User.aggregate([
    {
      $lookup: {
        from: 'user_preferences',
        localField: '_id',
        foreignField: 'userId',
        as: 'preferences'
      }
    },
    {
      $match: {
        preferences: { $size: 0 }
      }
    },
    {
      $project: { _id: 1 }
    }
  ]).toArray();

  print(`Found ${usersWithoutPreferences.length} users without UserPreferences records`);

  let created = 0;
  for (const user of usersWithoutPreferences) {
    try {
      db.user_preferences.insertOne({
        userId: user._id,
        audio: {
          audioTranscriptionEnabledAt: now,
          textTranslationEnabledAt: now,
          audioTranslationEnabledAt: now,
          translatedAudioGenerationEnabledAt: now
        },
        application: {
          dataProcessingConsentAt: now,
          voiceDataConsentAt: now,
          voiceProfileConsentAt: now,
          voiceCloningConsentAt: now,
          voiceCloningEnabledAt: now,
          thirdPartyServicesConsentAt: now
        },
        createdAt: now,
        updatedAt: now
      });
      created++;
    } catch (e) {
      print(`ERROR creating UserPreferences for user ${user._id}: ${e.message}`);
    }
  }

  print(`Created ${created} new UserPreferences records`);
  print('');
  print('Migration complete!');
}

// =====================================================
// FOR USE WITH NODE.JS (mongodb driver)
// Run: DATABASE_URL="mongodb://..." node enable_audio_features_in_preferences.js
// =====================================================

if (typeof process !== 'undefined' && process.env && process.env.DATABASE_URL) {
  const { MongoClient, ObjectId } = require('mongodb');

  async function runMigration() {
    const client = new MongoClient(process.env.DATABASE_URL);

    try {
      await client.connect();
      console.log('Connected to MongoDB');

      const db = client.db();
      const now = new Date();

      console.log('Starting migration: Enable audio features in UserPreferences...');
      console.log('');

      // Update all existing UserPreferences records
      const updateResult = await db.collection('user_preferences').updateMany(
        {},
        {
          $set: {
            'audio.audioTranscriptionEnabledAt': now,
            'audio.textTranslationEnabledAt': now,
            'audio.audioTranslationEnabledAt': now,
            'audio.translatedAudioGenerationEnabledAt': now,
            'application.dataProcessingConsentAt': now,
            'application.voiceDataConsentAt': now,
            'application.voiceProfileConsentAt': now,
            'application.voiceCloningConsentAt': now,
            'application.voiceCloningEnabledAt': now,
            'application.thirdPartyServicesConsentAt': now,
            updatedAt: now
          }
        }
      );

      console.log(`Updated ${updateResult.modifiedCount} UserPreferences records`);
      console.log('');

      // Find users without UserPreferences records
      const usersWithoutPreferences = await db.collection('User').aggregate([
        {
          $lookup: {
            from: 'user_preferences',
            localField: '_id',
            foreignField: 'userId',
            as: 'preferences'
          }
        },
        {
          $match: {
            preferences: { $size: 0 }
          }
        },
        {
          $project: { _id: 1 }
        }
      ]).toArray();

      console.log(`Found ${usersWithoutPreferences.length} users without UserPreferences records`);

      let created = 0;
      for (const user of usersWithoutPreferences) {
        try {
          await db.collection('user_preferences').insertOne({
            userId: user._id,
            audio: {
              audioTranscriptionEnabledAt: now,
              textTranslationEnabledAt: now,
              audioTranslationEnabledAt: now,
              translatedAudioGenerationEnabledAt: now
            },
            application: {
              dataProcessingConsentAt: now,
              voiceDataConsentAt: now,
              voiceProfileConsentAt: now,
              voiceCloningConsentAt: now,
              voiceCloningEnabledAt: now,
              thirdPartyServicesConsentAt: now
            },
            createdAt: now,
            updatedAt: now
          });
          created++;
        } catch (e) {
          console.log(`ERROR creating UserPreferences for user ${user._id}: ${e.message}`);
        }
      }

      console.log(`Created ${created} new UserPreferences records`);
      console.log('');
      console.log('Migration complete!');
    } finally {
      await client.close();
    }
  }

  runMigration().catch(console.error);
}

// Export for programmatic use
if (typeof module !== 'undefined') {
  module.exports = { description: 'Enable audio features in UserPreferences for all users' };
}
