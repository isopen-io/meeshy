#!/usr/bin/env ruby
# Script to remove TargetLanguageResolver from the Xcode project

require 'xcodeproj'

project_path = 'Meeshy.xcodeproj'
project = Xcodeproj::Project.open(project_path)

# Get the main target
target = project.targets.find { |t| t.name == 'Meeshy' }

unless target
  puts "Error: Target 'Meeshy' not found"
  exit 1
end

# Find and remove the file reference
removed = false

project.main_group.recursive_children.each do |child|
  if child.is_a?(Xcodeproj::Project::Object::PBXFileReference)
    if child.name == 'TargetLanguageResolver.swift' || (child.path && child.path.end_with?('TargetLanguageResolver.swift'))
      puts "Found TargetLanguageResolver.swift, removing..."

      # Remove from build phase
      target.source_build_phase.files.each do |build_file|
        if build_file.file_ref == child
          build_file.remove_from_project
          puts "  Removed from build phase"
        end
      end

      # Remove file reference
      child.remove_from_project
      puts "  Removed file reference"
      removed = true
    end
  end
end

if removed
  project.save
  puts "Project saved successfully!"
else
  puts "TargetLanguageResolver.swift not found in project"
end
