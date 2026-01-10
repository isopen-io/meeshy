#!/usr/bin/env ruby
# Script to fix incorrectly added bubble files in the Xcode project

require 'xcodeproj'

project_path = 'Meeshy.xcodeproj'
project = Xcodeproj::Project.open(project_path)

# Get the main target
target = project.targets.find { |t| t.name == 'Meeshy' }

unless target
  puts "Error: Target 'Meeshy' not found"
  exit 1
end

# Files with incorrect paths that need to be removed
bad_paths = [
  'Meeshy/Features/Chat/Views/Meeshy',
  'Meeshy/DesignSystem/Components/Meeshy',
  'Meeshy/DesignSystem/Theme/Meeshy',
  'Meeshy/Features/Chat/Views/MeeshyMessageBubble.swift',
  'Meeshy/DesignSystem/Components/ModernBubbleShape.swift',
  'Meeshy/DesignSystem/Components/BubbleAnimations.swift',
  'Meeshy/DesignSystem/Theme/MessageBubbleColors.swift',
  'Meeshy/DesignSystem/Theme/ModernBubbleShape.swift',
  'Meeshy/DesignSystem/Theme/BubbleAnimations.swift'
]

# Remove bad file references
def remove_bad_refs(group, bad_paths, target, removed_count = 0)
  return removed_count unless group

  # Check files in this group
  group.files.dup.each do |file_ref|
    path = file_ref.real_path.to_s rescue file_ref.path.to_s
    name = file_ref.name || file_ref.path

    # Check if this is a bad reference
    should_remove = bad_paths.any? { |bad| path.include?(bad) || (name && name.include?(bad)) }

    # Also check for doubled paths
    if path.include?('Meeshy/Meeshy') || path.include?('Features/Chat/Views/Meeshy/')
      should_remove = true
    end

    if should_remove
      # Remove from build phases
      target.source_build_phase.files.each do |build_file|
        if build_file.file_ref == file_ref
          target.source_build_phase.files.delete(build_file)
          puts "Removed from build phase: #{path}"
        end
      end

      # Remove file reference
      file_ref.remove_from_project
      puts "Removed file reference: #{path}"
      removed_count += 1
    end
  end

  # Check subgroups
  group.groups.dup.each do |subgroup|
    removed_count = remove_bad_refs(subgroup, bad_paths, target, removed_count)

    # Remove empty groups named "Meeshy" that are inside another group (not the root)
    if subgroup.name == 'Meeshy' && subgroup.children.empty?
      subgroup.remove_from_project
      puts "Removed empty group: #{subgroup.name}"
    end
  end

  removed_count
end

puts "Scanning for incorrectly added files..."
removed = remove_bad_refs(project.main_group, bad_paths, target)
puts "\nRemoved #{removed} bad file references"

# Save the project
project.save
puts "Project saved successfully!"
