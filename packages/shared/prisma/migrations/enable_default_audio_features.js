/**
 * MongoDB Migration Script: Enable Default Audio Features for All Users
 *
 * This script enables the following features for all existing UserFeature records:
 * - voiceDataConsentAt (consent for voice data processing)
 * - audioTranscriptionEnabledAt (audio transcription feature)
 * - dataProcessingConsentAt (consent for data processing)
 * - textTranslationEnabledAt (text translation feature)
 *
 * Run with: mongosh "mongodb://localhost:27017/meeshy" enable_default_audio_features.js
 * Or: DATABASE_URL="mongodb://..." node enable_default_audio_features.js
 */

const now = new Date();

// =====================================================
// FOR USE WITH MONGOSH (MongoDB Shell)
// Run: mongosh "mongodb://localhost:27017/meeshy" enable_default_audio_features.js
// =====================================================

if (typeof db !== 'undefined') {
  print('Starting migration: Enable default audio features...');
  print('');

  // Update all existing UserFeature records that don't have these features enabled
  const result = db.UserFeature.updateMany(
    {
      $or: [
        { voiceDataConsentAt: null },
        { audioTranscriptionEnabledAt: null },
        { dataProcessingConsentAt: null },
        { textTranslationEnabledAt: null }
      ]
    },
    {
      $set: {
        voiceDataConsentAt: now,
        audioTranscriptionEnabledAt: now,
        dataProcessingConsentAt: now,
        textTranslationEnabledAt: now,
        updatedAt: now
      }
    }
  );

  print(`Updated ${result.modifiedCount} UserFeature records`);
  print('');

  // Also create UserFeature records for users that don't have one
  const usersWithoutFeatures = db.User.aggregate([
    {
      $lookup: {
        from: 'UserFeature',
        localField: '_id',
        foreignField: 'userId',
        as: 'userFeature'
      }
    },
    {
      $match: {
        userFeature: { $size: 0 }
      }
    },
    {
      $project: { _id: 1 }
    }
  ]).toArray();

  print(`Found ${usersWithoutFeatures.length} users without UserFeature records`);

  let created = 0;
  for (const user of usersWithoutFeatures) {
    try {
      db.UserFeature.insertOne({
        userId: user._id,
        voiceDataConsentAt: now,
        audioTranscriptionEnabledAt: now,
        dataProcessingConsentAt: now,
        textTranslationEnabledAt: now,
        encryptionPreference: 'optional',
        autoTranslateEnabled: true,
        translateToSystemLanguage: true,
        translateToRegionalLanguage: false,
        useCustomDestination: false,
        transcriptionSource: 'auto',
        translatedAudioFormat: 'mp3',
        dataRetentionDays: 365,
        voiceDataRetentionDays: 180,
        createdAt: now,
        updatedAt: now
      });
      created++;
    } catch (e) {
      print(`ERROR creating UserFeature for user ${user._id}: ${e.message}`);
    }
  }

  print(`Created ${created} new UserFeature records`);
  print('');
  print('Migration complete!');
}

// =====================================================
// FOR USE WITH NODE.JS (mongodb driver)
// Run: DATABASE_URL="mongodb://..." node enable_default_audio_features.js
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

      console.log('Starting migration: Enable default audio features...');
      console.log('');

      // Update all existing UserFeature records
      const updateResult = await db.collection('UserFeature').updateMany(
        {
          $or: [
            { voiceDataConsentAt: null },
            { audioTranscriptionEnabledAt: null },
            { dataProcessingConsentAt: null },
            { textTranslationEnabledAt: null }
          ]
        },
        {
          $set: {
            voiceDataConsentAt: now,
            audioTranscriptionEnabledAt: now,
            dataProcessingConsentAt: now,
            textTranslationEnabledAt: now,
            updatedAt: now
          }
        }
      );

      console.log(`Updated ${updateResult.modifiedCount} UserFeature records`);
      console.log('');

      // Find users without UserFeature records
      const usersWithoutFeatures = await db.collection('User').aggregate([
        {
          $lookup: {
            from: 'UserFeature',
            localField: '_id',
            foreignField: 'userId',
            as: 'userFeature'
          }
        },
        {
          $match: {
            userFeature: { $size: 0 }
          }
        },
        {
          $project: { _id: 1 }
        }
      ]).toArray();

      console.log(`Found ${usersWithoutFeatures.length} users without UserFeature records`);

      let created = 0;
      for (const user of usersWithoutFeatures) {
        try {
          await db.collection('UserFeature').insertOne({
            userId: user._id,
            voiceDataConsentAt: now,
            audioTranscriptionEnabledAt: now,
            dataProcessingConsentAt: now,
            textTranslationEnabledAt: now,
            encryptionPreference: 'optional',
            autoTranslateEnabled: true,
            translateToSystemLanguage: true,
            translateToRegionalLanguage: false,
            useCustomDestination: false,
            transcriptionSource: 'auto',
            translatedAudioFormat: 'mp3',
            dataRetentionDays: 365,
            voiceDataRetentionDays: 180,
            createdAt: now,
            updatedAt: now
          });
          created++;
        } catch (e) {
          console.log(`ERROR creating UserFeature for user ${user._id}: ${e.message}`);
        }
      }

      console.log(`Created ${created} new UserFeature records`);
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
  module.exports = { description: 'Enable default audio features for all users' };
}
