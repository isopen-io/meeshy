require "xcodeproj"

project_path = "Meeshy.xcodeproj"
project = Xcodeproj::Project.open(project_path)
target = project.targets.find { |t| t.name == "Meeshy" }

# Models to remove
ml_models = [
  "SimplifiedVoiceCloner.mlpackage",
  "VoiceConverterForward.mlpackage",
  "VoiceConverterReverse.mlpackage",
  "VoiceConverterPipeline.mlpackage",
  "SpeakerEmbeddingExtractor.mlpackage",
  "HiFiGANVocoder.mlpackage",
  "ToneColorConverter.mlpackage",
  "NLLBEncoder_seq64.mlpackage",
  "NLLBDecoder_seq64.mlpackage",
  "NLLBTokenizer"
]

# Remove from build phases
removed_build_files = 0
target.build_phases.each do |phase|
  files_to_remove = phase.files.select do |bf|
    bf.file_ref && ml_models.any? { |m| bf.file_ref.path&.include?(m) }
  end
  
  files_to_remove.each do |bf|
    puts "Removing from build phase: #{bf.file_ref.path}"
    bf.remove_from_project
    removed_build_files += 1
  end
end

# Remove file references
removed_refs = 0
project.files.each do |file|
  if ml_models.any? { |m| file.path&.include?(m) }
    puts "Removing file reference: #{file.path}"
    file.remove_from_project
    removed_refs += 1
  end
end

# Find and remove MLModels group if empty
def find_group(project, name, parent = nil)
  parent ||= project.main_group
  parent.children.each do |child|
    return child if child.display_name == name || child.path == name
    if child.is_a?(Xcodeproj::Project::Object::PBXGroup)
      result = find_group(project, name, child)
      return result if result
    end
  end
  nil
end

ml_group = find_group(project, "MLModels")
if ml_group && ml_group.children.empty?
  puts "Removing empty MLModels group"
  ml_group.remove_from_project
end

project.save
puts "\nDone! Removed #{removed_build_files} build files and #{removed_refs} file references."
