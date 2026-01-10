require "xcodeproj"

project_path = "Meeshy.xcodeproj"
project = Xcodeproj::Project.open(project_path)
target = project.targets.find { |t| t.name == "Meeshy" }
build_phase = target.source_build_phase

# Helper to find group by path
def find_group(project, path_components)
  current = project.main_group
  path_components.each do |component|
    child = current.children.find { |c| c.display_name == component || c.path == component }
    return nil unless child
    current = child
  end
  current
end

# Files we need to add to build phase if not already there
files_to_check = [
  { path: "Meeshy/Features/Auth/Views/Onboarding/RegistrationFlowViewModel.swift", group_path: ["Meeshy", "Features", "Auth", "Views", "Onboarding"] },
  { path: "Meeshy/Features/Onboarding/Views/OnboardingCoordinatorView.swift", group_path: ["Meeshy", "Features", "Onboarding", "Views"] },
]

files_to_check.each do |file_info|
  file_path = file_info[:path]
  file_name = File.basename(file_path)
  
  # Check if already in build phase
  already_in_build = build_phase.files.any? { |bf| bf.file_ref && bf.file_ref.real_path.to_s.end_with?(file_name) }
  
  if already_in_build
    puts "Already in build phase: #{file_name}"
    next
  end
  
  # Find the file reference
  file_ref = project.files.find { |f| f.real_path.to_s.end_with?(file_path) || f.path == file_name }
  
  if file_ref.nil?
    # Need to create file reference
    group = find_group(project, file_info[:group_path])
    if group
      file_ref = group.new_reference(file_name)
      file_ref.last_known_file_type = "sourcecode.swift"
      puts "Created file reference: #{file_name}"
    else
      puts "Could not find group for: #{file_name}"
      next
    end
  end
  
  # Add to build phase
  build_phase.add_file_reference(file_ref)
  puts "Added to build phase: #{file_name}"
end

project.save
puts "Done!"
