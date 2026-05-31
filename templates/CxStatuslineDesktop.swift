import AppKit
import Foundation
import SwiftUI

struct CommandResult {
    let status: Int32
    let output: String
}

final class CommandRunner {
    let nodePath: String
    let scriptPath: String

    init() {
        let env = ProcessInfo.processInfo.environment
        self.nodePath = env["CXSTATUSLINE_DESKTOP_NODE"] ?? "/usr/bin/env"
        self.scriptPath = env["CXSTATUSLINE_DESKTOP_SCRIPT"] ?? "cxstatusline"
    }

    func run(_ args: [String], completion: @escaping (CommandResult) -> Void) {
        DispatchQueue.global(qos: .userInitiated).async {
            let process = Process()
            process.executableURL = URL(fileURLWithPath: self.nodePath)
            process.arguments = [self.scriptPath] + args

            let stdout = Pipe()
            let stderr = Pipe()
            process.standardOutput = stdout
            process.standardError = stderr

            do {
                try process.run()
                process.waitUntilExit()
            } catch {
                DispatchQueue.main.async {
                    completion(CommandResult(status: 1, output: error.localizedDescription))
                }
                return
            }

            let out = String(data: stdout.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
            let err = String(data: stderr.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
            let output = [out, err]
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }
                .joined(separator: "\n")

            DispatchQueue.main.async {
                completion(CommandResult(status: process.terminationStatus, output: output))
            }
        }
    }
}

struct StatusSnapshot {
    var agent = "Auto"
    var client = ""
    var model = "Waiting for local activity"
    var project = "No project"
    var branch = ""
    var runState = "Ready"
    var title = "No active session yet"
    var preview = "Start Codex, Claude, or Gemini, then refresh this panel."
    var tokens = "-"
    var context = "-"
    var alerts = 0
}

final class DesktopModel: ObservableObject {
    let agents = ["auto", "codex", "claude", "gemini"]

    @Published var selectedAgent = "auto"
    @Published var refreshSeconds = 1.0
    @Published var statusWidth = 120.0
    @Published var status = StatusSnapshot()
    @Published var log = "Ready.\n"
    @Published var isBusy = false
    @Published var lastError = ""

    private let runner = CommandRunner()

    func startIsland() {
        runCommand("Start Island", [
            "island",
            "--detach",
            "--agent", selectedAgent,
            "--preset", "compact",
            "--refresh", String(Int(refreshSeconds)),
            "--width", String(Int(statusWidth))
        ])
    }

    func stopIsland() {
        runCommand("Stop Island", ["island", "--stop"])
    }

    func oneClickSetup() {
        runCommand("Configure compact statusline", ["configure", "--preset", "compact", "--theme", "powerline", "--yes"]) { [weak self] in
            self?.runCommand("Install Codex hooks", ["install", "hooks"]) {
                self?.runCommand("Install native statusline", ["install", "native"]) {
                    self?.startIsland()
                }
            }
        }
    }

    func installHooks() {
        runCommand("Install Codex hooks", ["install", "hooks"])
    }

    func installNative() {
        runCommand("Install native statusline", ["install", "native"])
    }

    func importCcstatusline() {
        runCommand("Import ccstatusline", ["import", "ccstatusline"])
    }

    func openConfigFolder() {
        let url = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".config/cxstatusline")
        NSWorkspace.shared.open(url)
        appendLog("Opened \(url.path)")
    }

    func refreshStatus() {
        runCommand("Refresh Status", [
            "island-status",
            "--agent", selectedAgent,
            "--preset", "compact",
            "--width", String(Int(statusWidth))
        ], quiet: true)
    }

    private func runCommand(_ title: String, _ args: [String], quiet: Bool = false, next: (() -> Void)? = nil) {
        if isBusy && !quiet {
            appendLog("Busy; wait for the current action to finish.")
            return
        }

        if !quiet {
            isBusy = true
            lastError = ""
        }

        appendLog("$ cxstatusline \(args.joined(separator: " "))")

        runner.run(args) { [weak self] result in
            guard let self else { return }
            if !quiet {
                self.isBusy = false
            }

            if args.first == "island-status" {
                self.updateStatus(from: result.output)
            } else {
                self.appendLog(result.output.isEmpty ? "Done." : result.output)
                self.refreshStatus()
            }

            if result.status == 0 {
                next?()
            } else if !quiet {
                self.lastError = "\(title) failed with status \(result.status)."
                self.appendLog(self.lastError)
            }
        }
    }

    private func updateStatus(from raw: String) {
        guard
            let data = raw.data(using: .utf8),
            let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let summary = payload["summary"] as? [String: Any]
        else {
            status = StatusSnapshot(title: raw.trimmingCharacters(in: .whitespacesAndNewlines), preview: "")
            return
        }

        let alerts = (payload["alerts"] as? [[String: Any]])?.count ?? 0
        status = StatusSnapshot(
            agent: string(summary["agent"], fallback: "Auto"),
            client: string(summary["client"]),
            model: string(summary["model"], fallback: "Unknown model"),
            project: string(summary["project"], fallback: "No project"),
            branch: string(summary["branch"]),
            runState: string(summary["runState"], fallback: "Ready"),
            title: string(summary["title"], fallback: "No active prompt"),
            preview: string(summary["preview"]),
            tokens: string(summary["tokens"], fallback: "-"),
            context: string(summary["contextPercent"], fallback: "-"),
            alerts: alerts
        )
    }

    private func string(_ value: Any?, fallback: String = "") -> String {
        if let text = value as? String, !text.isEmpty {
            return text
        }
        if let number = value as? NSNumber {
            return number.stringValue
        }
        return fallback
    }

    private func appendLog(_ value: String) {
        let text = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        log += "\(text)\n"
        if log.count > 20_000 {
            log = String(log.suffix(16_000))
        }
    }
}

enum AppSection: String, CaseIterable, Identifiable, Hashable {
    case overview
    case island
    case statusline
    case activity

    var id: String { rawValue }

    var title: String {
        switch self {
        case .overview: return "Overview"
        case .island: return "Island"
        case .statusline: return "Statusline"
        case .activity: return "Activity"
        }
    }

    var subtitle: String {
        switch self {
        case .overview: return "Live status, quick setup, and local runtime health."
        case .island: return "Control the floating macOS Dynamic Island overlay."
        case .statusline: return "Configure Codex hooks and native terminal statusline."
        case .activity: return "Inspect recent commands and app output."
        }
    }

    var symbol: String {
        switch self {
        case .overview: return "rectangle.grid.2x2"
        case .island: return "capsule.tophalf.filled"
        case .statusline: return "terminal"
        case .activity: return "list.bullet.rectangle"
        }
    }
}

struct DesktopAppView: View {
    @StateObject private var model = DesktopModel()
    @State private var selection: AppSection? = .overview

    private var activeSection: AppSection {
        selection ?? .overview
    }

    var body: some View {
        NavigationView {
            sidebar
            detail
        }
        .frame(minWidth: 940, minHeight: 660)
        .background(WindowConfigurator())
        .onAppear {
            model.refreshStatus()
        }
        .onChange(of: model.selectedAgent) { _ in
            model.refreshStatus()
        }
    }

    private var sidebar: some View {
        List(selection: $selection) {
            Section {
                ForEach(AppSection.allCases) { item in
                    Label(item.title, systemImage: item.symbol)
                        .tag(item)
                        .padding(.vertical, 3)
                }
            } header: {
                VStack(alignment: .leading, spacing: 6) {
                    Image(systemName: "sparkles.rectangle.stack")
                        .font(.system(size: 26, weight: .semibold))
                        .foregroundColor(.accentColor)
                    Text("CxStatusline")
                        .font(.headline)
                    Text("Local control center")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                .padding(.top, 12)
                .padding(.bottom, 10)
            }
        }
        .listStyle(.sidebar)
        .frame(minWidth: 220, idealWidth: 230)
    }

    private var detail: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                pageHeader

                switch activeSection {
                case .overview:
                    StatusHero(status: model.status, isBusy: model.isBusy)
                    HStack(alignment: .top, spacing: 16) {
                        quickSetupCard
                        islandCard
                    }
                    HStack(alignment: .top, spacing: 16) {
                        statuslineCard
                        configurationCard
                    }
                    activityCard(height: 150)
                case .island:
                    StatusHero(status: model.status, isBusy: model.isBusy)
                    islandCard
                    activityCard(height: 220)
                case .statusline:
                    statuslineCard
                    configurationCard
                    activityCard(height: 220)
                case .activity:
                    StatusHero(status: model.status, isBusy: model.isBusy)
                    activityCard(height: 380)
                }
            }
            .padding(28)
            .frame(maxWidth: 980, alignment: .leading)
        }
        .background(Color(nsColor: .windowBackgroundColor))
    }

    private var pageHeader: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 6) {
                Text(activeSection.title)
                    .font(.system(size: 30, weight: .bold, design: .default))
                Text(activeSection.subtitle)
                    .font(.callout)
                    .foregroundColor(.secondary)
            }
            Spacer()
            if model.isBusy {
                ProgressView()
                    .controlSize(.small)
            }
            Button {
                model.refreshStatus()
            } label: {
                Label("Refresh", systemImage: "arrow.clockwise")
            }
            .keyboardShortcut("r", modifiers: [.command])
        }
    }

    private var quickSetupCard: some View {
        SettingsCard(title: "One-click Setup", subtitle: "Apply the recommended local setup.", symbol: "wand.and.stars") {
            VStack(alignment: .leading, spacing: 14) {
                Text("Installs the compact Powerline statusline, Codex hooks, native Codex footer, and starts the island.")
                    .font(.callout)
                    .foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)

                Button {
                    model.oneClickSetup()
                } label: {
                    Label("Run Setup", systemImage: "checkmark.circle.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .disabled(model.isBusy)
            }
        }
    }

    private var islandCard: some View {
        SettingsCard(title: "Dynamic Island", subtitle: "Select the source agent and live refresh behavior.", symbol: "capsule.tophalf.filled") {
            VStack(alignment: .leading, spacing: 16) {
                Picker("Agent", selection: $model.selectedAgent) {
                    ForEach(model.agents, id: \.self) { agent in
                        Text(agent.capitalized).tag(agent)
                    }
                }
                .pickerStyle(.segmented)

                ControlRow(title: "Refresh", subtitle: "How often the floating island polls local state.") {
                    Stepper("\(Int(model.refreshSeconds)) sec", value: $model.refreshSeconds, in: 1...60, step: 1)
                        .frame(width: 140)
                }

                ControlRow(title: "Status width", subtitle: "Rendering width used by the compact preview.") {
                    Stepper("\(Int(model.statusWidth)) columns", value: $model.statusWidth, in: 80...220, step: 10)
                        .frame(width: 170)
                }

                HStack(spacing: 10) {
                    Button {
                        model.startIsland()
                    } label: {
                        Label("Start", systemImage: "play.fill")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(model.isBusy)

                    Button {
                        model.stopIsland()
                    } label: {
                        Label("Stop", systemImage: "stop.fill")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    .disabled(model.isBusy)
                }
            }
        }
    }

    private var statuslineCard: some View {
        SettingsCard(title: "Codex Statusline", subtitle: "Install the terminal integration without touching Claude config.", symbol: "terminal") {
            VStack(alignment: .leading, spacing: 12) {
                Button {
                    model.installHooks()
                } label: {
                    Label("Install Codex Hooks", systemImage: "link.badge.plus")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .disabled(model.isBusy)

                Button {
                    model.installNative()
                } label: {
                    Label("Install Native Footer", systemImage: "dock.rectangle")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .disabled(model.isBusy)
            }
        }
    }

    private var configurationCard: some View {
        SettingsCard(title: "Configuration", subtitle: "Import, inspect, and maintain local files.", symbol: "gearshape") {
            VStack(alignment: .leading, spacing: 12) {
                Button {
                    model.importCcstatusline()
                } label: {
                    Label("Import ccstatusline", systemImage: "square.and.arrow.down")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .disabled(model.isBusy)

                Button {
                    model.openConfigFolder()
                } label: {
                    Label("Open Config Folder", systemImage: "folder")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
            }
        }
    }

    private func activityCard(height: CGFloat) -> some View {
        SettingsCard(title: "Activity Log", subtitle: model.lastError.isEmpty ? "Recent commands and output." : model.lastError, symbol: "list.bullet.rectangle") {
            ScrollViewReader { proxy in
                ScrollView {
                    Text(model.log)
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundColor(.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .id("log-end")
                }
                .frame(height: height)
                .padding(12)
                .background(Color(nsColor: .textBackgroundColor), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .stroke(Color(nsColor: .separatorColor).opacity(0.5))
                )
                .onChange(of: model.log) { _ in
                    proxy.scrollTo("log-end", anchor: .bottom)
                }
            }
        }
    }
}

struct StatusHero: View {
    let status: StatusSnapshot
    let isBusy: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .top, spacing: 16) {
                ZStack {
                    Circle()
                        .fill(agentColor.opacity(0.16))
                    Image(systemName: agentSymbol)
                        .font(.system(size: 23, weight: .semibold))
                        .foregroundColor(agentColor)
                }
                .frame(width: 52, height: 52)

                VStack(alignment: .leading, spacing: 5) {
                    HStack(spacing: 8) {
                        Text(status.agent)
                            .font(.title3.weight(.semibold))
                        StatusBadge(text: status.runState, color: status.runState.lowercased() == "ready" ? .green : .orange)
                        if status.alerts > 0 {
                            StatusBadge(text: "\(status.alerts) alerts", color: .orange)
                        }
                    }
                    Text(status.model)
                        .font(.callout)
                        .foregroundColor(.secondary)
                    Text(status.title)
                        .font(.body)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Spacer()

                VStack(alignment: .trailing, spacing: 5) {
                    Text(status.tokens)
                        .font(.title3.monospacedDigit().weight(.semibold))
                    Text(status.project)
                        .font(.caption)
                        .foregroundColor(.secondary)
                    if !status.branch.isEmpty {
                        Label(status.branch, systemImage: "arrow.triangle.branch")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
            }

            if !status.preview.isEmpty {
                Text(status.preview)
                    .font(.callout)
                    .foregroundColor(.secondary)
                    .lineLimit(3)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(20)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(Color(nsColor: .separatorColor).opacity(0.42))
        )
    }

    private var agentColor: Color {
        switch status.agent.lowercased() {
        case "codex": return .blue
        case "claude": return .orange
        case "gemini": return .purple
        default: return .accentColor
        }
    }

    private var agentSymbol: String {
        switch status.agent.lowercased() {
        case "codex": return "command"
        case "claude": return "sparkles"
        case "gemini": return "diamond"
        default: return "circle.hexagongrid"
        }
    }
}

struct StatusBadge: View {
    let text: String
    let color: Color

    var body: some View {
        Text(text)
            .font(.caption.weight(.medium))
            .foregroundColor(color)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(color.opacity(0.12), in: Capsule())
    }
}

struct SettingsCard<Content: View>: View {
    let title: String
    let subtitle: String
    let symbol: String
    let content: Content

    init(title: String, subtitle: String, symbol: String, @ViewBuilder content: () -> Content) {
        self.title = title
        self.subtitle = subtitle
        self.symbol = symbol
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: symbol)
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundColor(.accentColor)
                    .frame(width: 28, height: 28)
                    .background(Color.accentColor.opacity(0.12), in: RoundedRectangle(cornerRadius: 7, style: .continuous))

                VStack(alignment: .leading, spacing: 3) {
                    Text(title)
                        .font(.headline)
                    Text(subtitle)
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer()
            }

            content
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(Color(nsColor: .separatorColor).opacity(0.35))
        )
    }
}

struct ControlRow<Content: View>: View {
    let title: String
    let subtitle: String
    let content: Content

    init(title: String, subtitle: String, @ViewBuilder content: () -> Content) {
        self.title = title
        self.subtitle = subtitle
        self.content = content()
    }

    var body: some View {
        HStack(alignment: .center, spacing: 14) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.callout.weight(.medium))
                Text(subtitle)
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer()
            content
        }
    }
}

struct WindowConfigurator: NSViewRepresentable {
    func makeNSView(context: Context) -> NSView {
        let view = NSView()
        DispatchQueue.main.async {
            if let window = view.window {
                window.title = "CxStatusline"
                window.titlebarAppearsTransparent = true
                window.titleVisibility = .hidden
                window.toolbarStyle = .unified
                window.minSize = NSSize(width: 940, height: 660)
                window.isMovableByWindowBackground = true
            }
        }
        return view
    }

    func updateNSView(_ nsView: NSView, context: Context) {}
}

@main
struct CxStatuslineDesktopApp: App {
    var body: some Scene {
        WindowGroup {
            DesktopAppView()
        }
        .commands {
            CommandGroup(replacing: .newItem) {}
        }
    }
}
