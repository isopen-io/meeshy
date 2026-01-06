//
//  DataExportView.swift
//  Meeshy
//
//  Data export view
//  Swift 6 compliant
//

import SwiftUI

struct DataExportView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var exportMessages = true
    @State private var exportMedia = false
    @State private var exportContacts = true
    @State private var isExporting = false
    @State private var showingSuccessAlert = false

    var body: some View {
        List {
            Section {
                Text("Export your Meeshy data to a JSON file that you can download and keep.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            Section("Data to Export") {
                Toggle("Messages", isOn: $exportMessages)
                Toggle("Media Files", isOn: $exportMedia)
                Toggle("Contacts", isOn: $exportContacts)
            }

            Section {
                Text("Export size: ~\(estimatedSize) MB")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            Section {
                Button {
                    isExporting = true
                    // Simulate export
                    DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                        isExporting = false
                        showingSuccessAlert = true
                    }
                } label: {
                    HStack {
                        if isExporting {
                            ProgressView()
                                .padding(.trailing, 8)
                        }
                        Text(isExporting ? "Exporting..." : "Export Data")
                    }
                    .frame(maxWidth: .infinity, alignment: .center)
                }
                .disabled(isExporting || !hasSelection)
            } footer: {
                Text("The export file will be saved to your Files app in the Meeshy folder.")
            }
        }
        .navigationTitle("Export Data")
        .alert("Export Successful", isPresented: $showingSuccessAlert) {
            Button("OK") {
                dismiss()
            }
        } message: {
            Text("Your data has been exported successfully.")
        }
    }

    private var hasSelection: Bool {
        exportMessages || exportMedia || exportContacts
    }

    private var estimatedSize: Int {
        var size = 0
        if exportMessages { size += 50 }
        if exportMedia { size += 200 }
        if exportContacts { size += 5 }
        return size
    }
}

#Preview {
    NavigationStack {
        DataExportView()
    }
}
