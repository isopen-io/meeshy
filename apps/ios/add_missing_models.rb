#!/usr/bin/env ruby
# Script to add missing model files to the Xcode project

require 'xcodeproj'

project_path = 'Meeshy.xcodeproj'
project = Xcodeproj::Project.open(project_path)

# Get the main target
target = project.targets.find { |t| t.name == 'Meeshy' }

unless target
  puts "Error: Target 'Meeshy' not found"
  exit 1
end

# Find the Models group
models_group = nil

project.main_group.recursive_children.each do |child|
  if child.is_a?(Xcodeproj::Project::Object::PBXGroup)
    if child.name == 'Models' || child.path == 'Models'
      parent = child.parent
      if parent && (parent.name == 'Core' || parent.path == 'Core')
        models_group = child
        puts "Found Models group"
        break
      end
    end
  end
end

unless models_group
  puts "Error: Could not find Models group under Core"
  exit 1
end

# Files to add
files_to_add = [
  'EncryptionMode.swift',
  'MessageSentiment.swift'
]

added_count = 0
skipped_count = 0

files_to_add.each do |file_name|
  puts "\nProcessing: #{file_name}"

  # Check if file already exists in the group
  existing_file = models_group.files.find { |f|
    f.name == file_name || (f.path && f.path.end_with?(file_name))
  }

  if existing_file
    puts "  Skipping (already exists): #{file_name}"
    skipped_count += 1
    next
  end

  # Add the file reference
  file_ref = models_group.new_file(file_name)

  # Add to target's source build phase
  target.source_build_phase.add_file_reference(file_ref)

  puts "  Added: #{file_name}"
  added_count += 1
end

# Save the project
project.save

puts "\n=== Summary ==="
puts "Added: #{added_count} files"
puts "Skipped: #{skipped_count} files (already in project)"
puts "Project saved successfully!"
