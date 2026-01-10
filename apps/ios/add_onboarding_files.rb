require "xcodeproj"

project_path = "Meeshy.xcodeproj"
project = Xcodeproj::Project.open(project_path)
target = project.targets.find { |t| t.name == "Meeshy" }

# Find Auth Views group by traversing the hierarchy
def find_auth_views_group(project)
  meeshy_group = project.main_group["Meeshy"]
  return nil unless meeshy_group

  features_group = meeshy_group["Features"]
  return nil unless features_group

  auth_group = features_group["Auth"]
  return nil unless auth_group

  auth_group["Views"]
end

auth_views_group = find_auth_views_group(project)

if auth_views_group.nil?
  puts "Could not find Auth/Views group"
  exit 1
end

puts "Found Auth/Views group"

# Check if Onboarding group already exists
onboarding_group = auth_views_group.children.find { |c| c.display_name == "Onboarding" }

if onboarding_group.nil?
  puts "Creating Onboarding group"
  onboarding_group = auth_views_group.new_group("Onboarding", "Meeshy/Features/Auth/Views/Onboarding")
else
  puts "Using existing Onboarding group"
end

# Check for Components subgroup
components_group = onboarding_group.children.find { |c| c.display_name == "Components" }
if components_group.nil?
  components_group = onboarding_group.new_group("Components", "Meeshy/Features/Auth/Views/Onboarding/Components")
end

# Base paths
onboarding_path = "Meeshy/Features/Auth/Views/Onboarding"
components_path = "Meeshy/Features/Auth/Views/Onboarding/Components"

# Main onboarding files
main_files = %w[
  OnboardingViewModel.swift
  OnboardingFlowView.swift
  OnboardingStep1IdentityView.swift
  OnboardingStep2ContactView.swift
  OnboardingStep3LanguagesView.swift
  OnboardingStep4ProfileView.swift
  OnboardingStep5CompleteView.swift
]

# Component files
component_files = %w[
  ConfettiView.swift
  OnboardingFieldCard.swift
  OnboardingInfoBubble.swift
  OnboardingProgressBar.swift
  ShimmerButton.swift
]

# Helper to check if file already in build phase
def file_in_build_phase?(build_phase, name)
  build_phase.files.any? do |bf|
    bf.file_ref && bf.file_ref.display_name == name
  end
end

build_phase = target.source_build_phase

# Add main files
main_files.each do |file|
  full_path = File.join(onboarding_path, file)
  if File.exist?(full_path)
    if file_in_build_phase?(build_phase, file)
      puts "Skipping: #{file} (already in build phase)"
    else
      file_ref = onboarding_group.new_reference(full_path)
      file_ref.last_known_file_type = "sourcecode.swift"
      build_phase.add_file_reference(file_ref)
      puts "Added: #{file}"
    end
  else
    puts "Missing file: #{full_path}"
  end
end

# Add component files
component_files.each do |file|
  full_path = File.join(components_path, file)
  if File.exist?(full_path)
    if file_in_build_phase?(build_phase, file)
      puts "Skipping component: #{file} (already in build phase)"
    else
      file_ref = components_group.new_reference(full_path)
      file_ref.last_known_file_type = "sourcecode.swift"
      build_phase.add_file_reference(file_ref)
      puts "Added component: #{file}"
    end
  else
    puts "Missing component file: #{full_path}"
  end
end

project.save
puts "Project saved!"
