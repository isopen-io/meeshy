require "xcodeproj"

project_path = "Meeshy.xcodeproj"
project = Xcodeproj::Project.open(project_path)
target = project.targets.find { |t| t.name == "Meeshy" }

# Find or create the group
def find_or_create_group(project, path_components)
  current = project.main_group
  path_components.each do |component|
    child = current.children.find { |c| c.display_name == component }
    if child.nil?
      child = current.new_group(component)
      puts "Created group: #{component}"
    end
    current = child
  end
  current
end

# Add files to the DesignSystem/Components group
components_group = find_or_create_group(project, ["Meeshy", "DesignSystem", "Components"])
build_phase = target.source_build_phase

# Files in DesignSystem/Components
component_files = %w[
  ConversationAnimatedBackground.swift
  BubbleAnimations.swift
  ModernBubbleShape.swift
]

base_path = "Meeshy/DesignSystem/Components"

component_files.each do |file|
  full_path = File.join(base_path, file)
  if File.exist?(full_path)
    already_exists = build_phase.files.any? { |bf| bf.file_ref && bf.file_ref.display_name == file }
    unless already_exists
      file_ref = components_group.new_reference(file)
      file_ref.last_known_file_type = "sourcecode.swift"
      build_phase.add_file_reference(file_ref)
      puts "Added: #{file}"
    else
      puts "Already exists: #{file}"
    end
  else
    puts "Missing: #{full_path}"
  end
end

# Add files to the DesignSystem/Theme group
theme_group = find_or_create_group(project, ["Meeshy", "DesignSystem", "Theme"])
theme_files = %w[
  BubbleAnimations.swift
  MessageBubbleColors.swift
  ModernBubbleShape.swift
]

base_path = "Meeshy/DesignSystem/Theme"

theme_files.each do |file|
  full_path = File.join(base_path, file)
  if File.exist?(full_path)
    already_exists = build_phase.files.any? { |bf| bf.file_ref && bf.file_ref.display_name == file }
    unless already_exists
      file_ref = theme_group.new_reference(file)
      file_ref.last_known_file_type = "sourcecode.swift"
      build_phase.add_file_reference(file_ref)
      puts "Added: #{file}"
    else
      puts "Already exists: #{file}"
    end
  else
    puts "Missing: #{full_path}"
  end
end

project.save
puts "Done!"
