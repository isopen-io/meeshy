//
//  CountryPicker.swift
//  Meeshy
//
//  Country picker component with search and browse functionality
//

import SwiftUI

// MARK: - CountryPicker

struct CountryPicker: View {
    @Binding var selectedCountry: Country?
    @State private var isPresented: Bool = false

    let placeholder: String
    let isRequired: Bool

    init(
        selectedCountry: Binding<Country?>,
        placeholder: String = "Sélectionner un pays",
        isRequired: Bool = true
    ) {
        self._selectedCountry = selectedCountry
        self.placeholder = placeholder
        self.isRequired = isRequired
    }

    var body: some View {
        Button {
            isPresented = true
        } label: {
            HStack(spacing: 12) {
                if let country = selectedCountry {
                    Text(country.flag)
                        .font(.title2)

                    VStack(alignment: .leading, spacing: 2) {
                        Text(country.name)
                            .font(.subheadline)
                            .fontWeight(.medium)
                            .foregroundColor(.primary)

                        Text(country.dialCode)
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                } else {
                    Image(systemName: "globe")
                        .font(.title2)
                        .foregroundColor(.secondary)

                    Text(placeholder)
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }

                Spacer()

                Image(systemName: "chevron.down")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .background(Color(.systemGray6))
            .cornerRadius(12)
        }
        .sheet(isPresented: $isPresented) {
            CountryPickerSheet(
                selectedCountry: $selectedCountry,
                isPresented: $isPresented
            )
        }
    }
}

// MARK: - CountryPickerSheet

struct CountryPickerSheet: View {
    @Binding var selectedCountry: Country?
    @Binding var isPresented: Bool

    @State private var searchText: String = ""
    @State private var selectedSection: String? = nil
    @FocusState private var isSearchFocused: Bool

    private var filteredCountries: [Country] {
        if searchText.isEmpty {
            return Country.allCountries
        }
        return Country.search(searchText)
    }

    private var groupedCountries: [(letter: String, countries: [Country])] {
        let grouped = Dictionary(grouping: filteredCountries) { country in
            String(country.name.prefix(1)).uppercased()
        }
        return grouped.sorted { $0.key < $1.key }.map { (letter: $0.key, countries: $0.value) }
    }

    private var sectionLetters: [String] {
        groupedCountries.map { $0.letter }
    }

    var body: some View {
        NavigationView {
            VStack(spacing: 0) {
                // Search bar
                searchBar

                // Content
                if filteredCountries.isEmpty {
                    emptyState
                } else {
                    countryList
                }
            }
            .navigationTitle("Choisir un pays")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Annuler") {
                        isPresented = false
                    }
                }
            }
        }
    }

    // MARK: - Search Bar

    private var searchBar: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass")
                .foregroundColor(.secondary)

            TextField("Rechercher un pays...", text: $searchText)
                .focused($isSearchFocused)
                .textFieldStyle(.plain)
                .autocorrectionDisabled()

            if !searchText.isEmpty {
                Button {
                    searchText = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundColor(.secondary)
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(Color(.systemGray6))
        .cornerRadius(10)
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    // MARK: - Country List

    private var countryList: some View {
        ZStack(alignment: .trailing) {
            ScrollViewReader { proxy in
                List {
                    // Popular countries section
                    if searchText.isEmpty {
                        Section {
                            ForEach(Country.popularCountries) { country in
                                countryRow(country)
                            }
                        } header: {
                            Text("Pays populaires")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }

                    // All countries by letter
                    ForEach(groupedCountries, id: \.letter) { group in
                        Section {
                            ForEach(group.countries) { country in
                                countryRow(country)
                            }
                        } header: {
                            Text(group.letter)
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                        .id(group.letter)
                    }
                }
                .listStyle(.plain)
                .onChange(of: selectedSection) { _, newValue in
                    if let section = newValue {
                        withAnimation {
                            proxy.scrollTo(section, anchor: .top)
                        }
                        selectedSection = nil
                    }
                }
            }

            // Alphabet index (only when not searching)
            if searchText.isEmpty {
                alphabetIndex
            }
        }
    }

    // MARK: - Country Row

    private func countryRow(_ country: Country) -> some View {
        Button {
            selectedCountry = country
            isPresented = false
        } label: {
            HStack(spacing: 12) {
                Text(country.flag)
                    .font(.title2)

                VStack(alignment: .leading, spacing: 2) {
                    Text(country.name)
                        .font(.subheadline)
                        .fontWeight(.medium)
                        .foregroundColor(.primary)

                    if country.nameNative != country.name {
                        Text(country.nameNative)
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }

                Spacer()

                Text(country.dialCode)
                    .font(.subheadline)
                    .foregroundColor(.secondary)

                if selectedCountry?.id == country.id {
                    Image(systemName: "checkmark")
                        .foregroundColor(.blue)
                        .fontWeight(.semibold)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    // MARK: - Alphabet Index

    private var alphabetIndex: some View {
        VStack(spacing: 2) {
            ForEach(sectionLetters, id: \.self) { letter in
                Button {
                    selectedSection = letter
                } label: {
                    Text(letter)
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundColor(.blue)
                        .frame(width: 16, height: 14)
                }
            }
        }
        .padding(.trailing, 4)
        .padding(.vertical, 8)
    }

    // MARK: - Empty State

    private var emptyState: some View {
        VStack(spacing: 16) {
            Spacer()

            Image(systemName: "globe")
                .font(.system(size: 48))
                .foregroundColor(.secondary)

            Text("Aucun pays trouvé")
                .font(.headline)
                .foregroundColor(.primary)

            Text("Essayez avec un autre terme de recherche")
                .font(.subheadline)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)

            Spacer()
        }
        .padding()
    }
}

// MARK: - Popular Countries Extension

extension Country {
    /// Most commonly selected countries for quick access
    static var popularCountries: [Country] {
        let popularCodes = ["FR", "US", "GB", "DE", "ES", "IT", "CA", "BE", "CH", "MA", "SN", "CI"]
        return popularCodes.compactMap { code in
            allCountries.first { $0.code == code }
        }
    }
}

// MARK: - Preview

#Preview {
    struct PreviewWrapper: View {
        @State private var selectedCountry: Country? = nil

        var body: some View {
            VStack(spacing: 20) {
                CountryPicker(selectedCountry: $selectedCountry)

                if let country = selectedCountry {
                    Text("Selected: \(country.name) \(country.dialCode)")
                }
            }
            .padding()
        }
    }

    return PreviewWrapper()
}
