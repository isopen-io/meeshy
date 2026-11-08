#!/usr/bin/env ruby
require 'xcodeproj'

project_path = '/Users/smpceo/Documents/Services/Meeshy/ios/Meeshy.xcodeproj'
project = Xcodeproj::Project.open(project_path)

# Find or create MLModels group
meeshy_group = project.main_group.find_subpath('Meeshy', false)
resources_group = meeshy_group.find_subpath('Resources', false) || meeshy_group.new_group('Resources')
ml_models_group = resources_group.find_subpath('MLModels', false) || resources_group.new_group('MLModels')

# Set source tree for the group
ml_models_group.set_source_tree('SOURCE_ROOT')
ml_models_group.set_path('Meeshy/Resources/MLModels')

# Get the main target
main_target = project.targets.find { |t| t.name == 'Meeshy' }

# Model files to add
models = [
  # OpenVoice V2 models (with REAL pretrained weights)
  'SpeakerEmbeddingExtractor.mlpackage',   # Extracts 256-dim speaker embedding from spectrogram
  'VoiceConverterForward.mlpackage',       # Split model: spec + g_src → z_p (deterministic)
  'VoiceConverterReverse.mlpackage',       # Split model: z_p + g_tgt → audio (deterministic)
  'VoiceConverterPipeline.mlpackage',      # Legacy: Full voice conversion (not used)
  'SimplifiedVoiceCloner.mlpackage',       # Simplified mel-to-waveform cloner
  'HiFiGANVocoder.mlpackage',              # HiFi-GAN vocoder with speaker conditioning
  'ToneColorConverter.mlpackage',          # FiLM-based tone converter
  # NLLB Translation models
  'NLLBEncoder_seq64.mlpackage',
  'NLLBDecoder_seq64.mlpackage'
]

# Folder references to add (for tokenizer data)
folders = [
  'NLLBTokenizer'
]

# First remove existing references
ml_models_group.files.each do |file|
  file.remove_from_project
end

models.each do |model_name|
  # Add file reference with correct relative path
  file_ref = ml_models_group.new_reference(model_name)
  file_ref.set_source_tree('<group>')

  # Add to target's resources
  main_target.resources_build_phase.add_file_reference(file_ref)

  puts "Added model: #{model_name}"
end

# Add folder references for tokenizer data
folders.each do |folder_name|
  # Create folder reference (not group)
  folder_path = "Meeshy/Resources/MLModels/#{folder_name}"
  file_ref = ml_models_group.new_reference(folder_name)
  file_ref.set_source_tree('<group>')
  file_ref.set_last_known_file_type('folder')

  # Add to target's resources
  main_target.resources_build_phase.add_file_reference(file_ref)

  puts "Added folder: #{folder_name}"
end

project.save
puts "Project saved successfully!"
