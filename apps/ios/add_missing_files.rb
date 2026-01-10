require "xcodeproj"

project_path = "Meeshy.xcodeproj"
project = Xcodeproj::Project.open(project_path)
target = project.targets.find { |t| t.name == "Meeshy" }

# Find or create the Onboarding Views group
def find_or_create_group(project, path_components)
  current = project.main_group
  path_components.each do |component|
    child = current.children.find { |c| c.display_name == component }
    if child.nil?
      # Create the group
      child = current.new_group(component)
      puts "Created group: #{component}"
    end
    current = child
  end
  current
end

# The path is: Meeshy/Features/Onboarding/Views
views_group = find_or_create_group(project, ["Meeshy", "Features", "Onboarding", "Views"])

# Files to ensure are in the project
files_to_add = %w[
  OnboardingCoordinatorView.swift
  PermissionsView.swift
  ProfileSetupView.swift
  WelcomeView.swift
]

build_phase = target.source_build_phase
base_path = "Meeshy/Features/Onboarding/Views"

files_to_add.each do |file|
  full_path = File.join(base_path, file)
  if File.exist?(full_path)
    # Check if already in build phase
    already_exists = build_phase.files.any? { |bf| bf.file_ref && bf.file_ref.display_name == file }
    unless already_exists
      file_ref = views_group.new_reference(file)
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
