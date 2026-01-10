require "xcodeproj"

project_path = "Meeshy.xcodeproj"
project = Xcodeproj::Project.open(project_path)
target = project.targets.find { |t| t.name == "Meeshy" }

build_phase = target.source_build_phase

# Find files to remove (old OnboardingViewModel references)
files_to_remove = []
build_phase.files.each do |bf|
  if bf.file_ref && bf.file_ref.path == "OnboardingViewModel.swift"
    files_to_remove << bf
  end
end

# Remove old references
files_to_remove.each do |bf|
  puts "Removing build file: #{bf.file_ref.path}"
  bf.remove_from_project
end

# Find file references to update
project.files.each do |file|
  if file.path == "OnboardingViewModel.swift" && file.parent&.path&.include?("Auth/Views/Onboarding")
    puts "Found old file ref: #{file.path} - updating to RegistrationFlowViewModel.swift"
    file.path = "RegistrationFlowViewModel.swift"
    file.name = "RegistrationFlowViewModel.swift"
  end
end

project.save
puts "Done!"
