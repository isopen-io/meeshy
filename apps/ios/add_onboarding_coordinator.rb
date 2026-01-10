require "xcodeproj"

project_path = "Meeshy.xcodeproj"
project = Xcodeproj::Project.open(project_path)
target = project.targets.find { |t| t.name == "Meeshy" }
build_phase = target.source_build_phase

# Find the Onboarding/Views group
def find_or_create_group(project, path_components)
  current = project.main_group
  path_components.each do |component|
    child = current.children.find { |c| c.display_name == component || c.path == component }
    if child.nil?
      child = current.new_group(component)
      puts "Created group: #{component}"
    end
    current = child
  end
  current
end

# Navigate to Meeshy/Features/Onboarding/Views
views_group = find_or_create_group(project, ["Meeshy", "Features", "Onboarding", "Views"])

# Check if file reference already exists in this group
existing = views_group.children.find { |c| c.path == "OnboardingCoordinatorView.swift" }

if existing
  puts "File reference already exists in group"
  # Make sure it's in build phase
  already_in_build = build_phase.files.any? { |bf| bf.file_ref == existing }
  unless already_in_build
    build_phase.add_file_reference(existing)
    puts "Added to build phase"
  else
    puts "Already in build phase"
  end
else
  # Create new file reference
  file_ref = views_group.new_reference("OnboardingCoordinatorView.swift")
  file_ref.last_known_file_type = "sourcecode.swift"
  build_phase.add_file_reference(file_ref)
  puts "Created and added OnboardingCoordinatorView.swift"
end

project.save
puts "Done!"
