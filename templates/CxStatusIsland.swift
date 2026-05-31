import AppKit
import Foundation

struct Segment {
    let text: String
    let foreground: NSColor
    let background: NSColor
}

struct IslandAlert {
    let id: String
    let title: String
    let message: String
    let action: String
    let severity: String
    let foreground: NSColor
    let background: NSColor
}

struct IslandSummary {
    let agent: String
    let client: String
    let title: String
    let subtitle: String
    let project: String
    let branch: String
    let model: String
    let runState: String
    let lastEvent: String
    let lastTool: String
    let permissionMode: String
    let elapsed: String
    let tokens: String
    let inputTokens: String
    let outputTokens: String
    let contextPercent: Double?
    let contextWindow: String
    let primaryLimitPercent: Double?
    let weeklyLimitPercent: Double?
    let preview: String

    static let empty = IslandSummary(
        agent: "Codex",
        client: "Codex Terminal",
        title: "Codex session",
        subtitle: "Ready",
        project: "",
        branch: "",
        model: "",
        runState: "Ready",
        lastEvent: "",
        lastTool: "",
        permissionMode: "",
        elapsed: "",
        tokens: "",
        inputTokens: "",
        outputTokens: "",
        contextPercent: nil,
        contextWindow: "",
        primaryLimitPercent: nil,
        weeklyLimitPercent: nil,
        preview: ""
    )
}

final class IslandView: NSView {
    var segments: [Segment] = [] {
        didSet { needsDisplay = true }
    }
    var alert: IslandAlert? {
        didSet { needsDisplay = true }
    }
    var summary: IslandSummary = .empty {
        didSet { needsDisplay = true }
    }
    var detail: String = "" {
        didSet { needsDisplay = true }
    }
    var expanded = false {
        didSet { needsDisplay = true }
    }
    var onToggle: (() -> Void)?
    var onDismissAlert: (() -> Void)?
    var onQuit: (() -> Void)?
    private var closeButtonRect = NSRect.zero

    override var isFlipped: Bool { true }

    override func acceptsFirstMouse(for event: NSEvent?) -> Bool {
        true
    }

    override func mouseDown(with event: NSEvent) {
        let point = convert(event.locationInWindow, from: nil)
        if closeButtonRect.width > 0 && closeButtonRect.contains(point) {
            if alert != nil {
                onDismissAlert?()
            } else {
                onQuit?()
            }
            return
        }
        expanded.toggle()
        onToggle?()
    }

    override func rightMouseDown(with event: NSEvent) {
        let menu = NSMenu()
        if alert != nil {
            let dismiss = NSMenuItem(title: "Dismiss Alert", action: #selector(dismissAlertFromMenu), keyEquivalent: "")
            dismiss.target = self
            menu.addItem(dismiss)
        }
        if expanded {
            let collapse = NSMenuItem(title: "Collapse", action: #selector(collapseFromMenu), keyEquivalent: "")
            collapse.target = self
            menu.addItem(collapse)
        }
        if menu.items.count > 0 {
            menu.addItem(.separator())
        }
        let quit = NSMenuItem(title: "Quit CxStatus Island", action: #selector(quitFromMenu), keyEquivalent: "q")
        quit.target = self
        menu.addItem(quit)
        NSMenu.popUpContextMenu(menu, with: event, for: self)
    }

    func desiredSize(maxWidth: CGFloat) -> CGSize {
        let hasAlert = alert != nil
        let baseHeight: CGFloat = expanded ? (hasAlert ? 378 : 300) : (hasAlert ? 108 : 54)
        let titleWidth = textWidth(summary.title, font: Self.titleFont) + textWidth(summary.runState, font: Self.pillFont) + 170
        let compactWidth = max(CGFloat(360), min(CGFloat(620), titleWidth))
        let expandedWidth = max(CGFloat(520), min(CGFloat(700), titleWidth + 70))
        return CGSize(width: min(expanded ? expandedWidth : compactWidth, maxWidth), height: baseHeight)
    }

    override func draw(_ dirtyRect: NSRect) {
        super.draw(dirtyRect)
        NSColor.clear.setFill()
        dirtyRect.fill()

        let bounds = self.bounds.insetBy(dx: 0, dy: 0)
        drawShell(in: bounds)
        drawHeader(in: bounds)
        if let alert {
            drawAlert(alert, in: bounds, y: 62)
        }
        if expanded {
            drawExpandedBody(in: bounds)
        }
    }

    private func drawShell(in bounds: NSRect) {
        let radius = min(bounds.height / 2, expanded ? 28 : 27)
        let path = NSBezierPath(roundedRect: bounds, xRadius: radius, yRadius: radius)
        NSGraphicsContext.saveGraphicsState()
        path.addClip()
        NSGradient(colors: [
            NSColor(calibratedWhite: 0.02, alpha: 0.96),
            NSColor(calibratedRed: 0.05, green: 0.06, blue: 0.08, alpha: 0.96),
            NSColor(calibratedWhite: 0.015, alpha: 0.98)
        ])?.draw(in: bounds, angle: -90)
        NSGraphicsContext.restoreGraphicsState()

        NSColor(calibratedWhite: 1, alpha: 0.13).setStroke()
        path.lineWidth = 1
        path.stroke()

        let shine = NSBezierPath(roundedRect: bounds.insetBy(dx: 1.5, dy: 1.5), xRadius: max(10, radius - 2), yRadius: max(10, radius - 2))
        NSColor(calibratedWhite: 1, alpha: 0.045).setStroke()
        shine.lineWidth = 1
        shine.stroke()
    }

    private func drawHeader(in bounds: NSRect) {
        let logoRect = NSRect(x: 13, y: 11, width: 32, height: 32)
        let logoPath = NSBezierPath(ovalIn: logoRect)
        NSGradient(colors: [
            NSColor(calibratedRed: 0.16, green: 0.82, blue: 0.56, alpha: 1),
            NSColor(calibratedRed: 0.19, green: 0.55, blue: 0.97, alpha: 1)
        ])?.draw(in: logoPath, angle: -35)

        let logoAttributes: [NSAttributedString.Key: Any] = [
            .font: NSFont.systemFont(ofSize: 15, weight: .black),
            .foregroundColor: NSColor(calibratedWhite: 0.04, alpha: 1)
        ]
        let logo = String((summary.agent.isEmpty ? "C" : summary.agent).prefix(1)).uppercased()
        let logoSize = logo.size(withAttributes: logoAttributes)
        logo.draw(at: NSPoint(x: logoRect.midX - logoSize.width / 2, y: logoRect.midY - logoSize.height / 2 - 0.5), withAttributes: logoAttributes)

        let dotColor = stateColor(summary.runState)
        let dotRect = NSRect(x: 39, y: 34, width: 9, height: 9)
        dotColor.withAlphaComponent(0.18).setFill()
        NSBezierPath(ovalIn: dotRect.insetBy(dx: -4, dy: -4)).fill()
        dotColor.setFill()
        NSBezierPath(ovalIn: dotRect).fill()

        drawCloseButton(in: bounds)
        let stateText = summary.runState.isEmpty ? "Ready" : summary.runState
        let pillWidth = min(max(textWidth(stateText, font: Self.pillFont) + 24, 72), CGFloat(132))
        let pillRect = NSRect(x: closeButtonRect.minX - pillWidth - 8, y: 13, width: pillWidth, height: 28)
        drawPill(text: stateText, rect: pillRect, foreground: dotColor, background: dotColor.withAlphaComponent(0.15))

        let titleMaxX = pillRect.minX - 12
        let textX: CGFloat = 57
        let title = truncate(summary.title.isEmpty ? "Codex session" : summary.title, font: Self.titleFont, maxWidth: titleMaxX - textX)
        let subtitle = truncate(headerSubtitle(), font: Self.subtitleFont, maxWidth: titleMaxX - textX)

        title.draw(at: NSPoint(x: textX, y: 8), withAttributes: [
            .font: Self.titleFont,
            .foregroundColor: NSColor(calibratedWhite: 0.96, alpha: 1)
        ])
        subtitle.draw(at: NSPoint(x: textX, y: 29), withAttributes: [
            .font: Self.subtitleFont,
            .foregroundColor: NSColor(calibratedWhite: 0.68, alpha: 1)
        ])

        if !expanded {
            let lineWidth = max(CGFloat(24), min(bounds.width - 30, metricPercent(summary.contextPercent) * (bounds.width - 30)))
            let lineRect = NSRect(x: 15, y: bounds.height - 4, width: lineWidth, height: 2)
            let linePath = NSBezierPath(roundedRect: lineRect, xRadius: 1, yRadius: 1)
            dotColor.withAlphaComponent(0.75).setFill()
            linePath.fill()
        }
    }

    private func drawSegments(in bounds: NSRect) {
        var x: CGFloat = 12
        let y: CGFloat = 8
        let height: CGFloat = 26
        let maxX = bounds.maxX - 46

        for segment in segments {
            let available = max(32, maxX - x)
            let label = truncate(segment.text, font: Self.segmentFont, maxWidth: available - 22)
            let width = min(textWidth(label, font: Self.segmentFont) + 22, available)
            if width < 24 { break }

            let rect = NSRect(x: x, y: y, width: width, height: height)
            let path = NSBezierPath(roundedRect: rect, xRadius: 13, yRadius: 13)
            segment.background.setFill()
            path.fill()

            let attributes: [NSAttributedString.Key: Any] = [
                .font: Self.segmentFont,
                .foregroundColor: segment.foreground
            ]
            let size = label.size(withAttributes: attributes)
            label.draw(at: NSPoint(x: rect.midX - size.width / 2, y: rect.midY - size.height / 2), withAttributes: attributes)
            x += width + 6
            if x >= maxX { break }
        }
    }

    private func drawAlert(_ alert: IslandAlert, in bounds: NSRect, y: CGFloat) {
        let rect = NSRect(x: 12, y: y, width: bounds.width - 24, height: expanded ? 58 : 34)
        let path = NSBezierPath(roundedRect: rect, xRadius: 17, yRadius: 17)
        alert.background.setFill()
        path.fill()

        let titleAttributes: [NSAttributedString.Key: Any] = [
            .font: Self.alertTitleFont,
            .foregroundColor: alert.foreground
        ]
        let bodyAttributes: [NSAttributedString.Key: Any] = [
            .font: Self.alertBodyFont,
            .foregroundColor: alert.foreground.withAlphaComponent(0.90)
        ]

        if expanded {
            NSString(string: alert.title).draw(in: NSRect(x: rect.minX + 16, y: rect.minY + 9, width: rect.width - 32, height: 18), withAttributes: titleAttributes)
            NSString(string: alert.message).draw(in: NSRect(x: rect.minX + 16, y: rect.minY + 31, width: rect.width - 32, height: 18), withAttributes: bodyAttributes)
        } else {
            let text = alert.title.isEmpty ? alert.message : "\(alert.title): \(alert.message)"
            let label = truncate(text, font: Self.alertBodyFont, maxWidth: rect.width - 32)
            let size = label.size(withAttributes: bodyAttributes)
            label.draw(at: NSPoint(x: rect.minX + 16, y: rect.midY - size.height / 2), withAttributes: bodyAttributes)
        }
    }

    private func drawExpandedBody(in bounds: NSRect) {
        let top: CGFloat = alert == nil ? 62 : 132
        let card = NSRect(x: 12, y: top, width: bounds.width - 24, height: 88)
        drawCard(card)

        let title = truncate("You: \(summary.title)", font: Self.cardTitleFont, maxWidth: card.width - 28)
        title.draw(at: NSPoint(x: card.minX + 14, y: card.minY + 12), withAttributes: [
            .font: Self.cardTitleFont,
            .foregroundColor: NSColor(calibratedWhite: 0.94, alpha: 1)
        ])

        let meta = truncate("\(summary.client.isEmpty ? summary.agent : summary.client) · \(summary.model) · \(summary.elapsed.isEmpty ? "live" : summary.elapsed)", font: Self.subtitleFont, maxWidth: card.width - 28)
        meta.draw(at: NSPoint(x: card.minX + 14, y: card.minY + 37), withAttributes: [
            .font: Self.subtitleFont,
            .foregroundColor: NSColor(calibratedWhite: 0.62, alpha: 1)
        ])

        let previewText = summary.preview.isEmpty ? detail : summary.preview
        let preview = truncate(previewText, font: Self.previewFont, maxWidth: card.width - 28)
        preview.draw(at: NSPoint(x: card.minX + 14, y: card.minY + 61), withAttributes: [
            .font: Self.previewFont,
            .foregroundColor: NSColor(calibratedWhite: 0.76, alpha: 1)
        ])

        let metricY = card.maxY + 12
        let gap: CGFloat = 8
        let metricWidth = (bounds.width - 24 - gap * 2) / 3
        let metricHeight: CGFloat = 84
        drawMetricCard(
            title: "Tokens",
            value: summary.tokens.isEmpty ? "0" : summary.tokens,
            detail: tokenDetail(),
            rect: NSRect(x: 12, y: metricY, width: metricWidth, height: metricHeight),
            accent: NSColor(calibratedRed: 0.22, green: 0.72, blue: 0.96, alpha: 1),
            percent: nil
        )
        drawMetricCard(
            title: "Context",
            value: percentageText(summary.contextPercent),
            detail: summary.contextWindow.isEmpty ? "window unknown" : "\(summary.contextWindow) window",
            rect: NSRect(x: 12 + metricWidth + gap, y: metricY, width: metricWidth, height: metricHeight),
            accent: NSColor(calibratedRed: 0.52, green: 0.42, blue: 0.98, alpha: 1),
            percent: summary.contextPercent
        )
        drawMetricCard(
            title: "Limits",
            value: limitText(),
            detail: weeklyLimitText(),
            rect: NSRect(x: 12 + (metricWidth + gap) * 2, y: metricY, width: metricWidth, height: metricHeight),
            accent: NSColor(calibratedRed: 0.96, green: 0.62, blue: 0.16, alpha: 1),
            percent: summary.primaryLimitPercent
        )

        drawStatusStrip(in: NSRect(x: 12, y: metricY + metricHeight + 12, width: bounds.width - 24, height: 24))
    }

    private func drawCloseButton(in bounds: NSRect) {
        let rect = NSRect(x: bounds.maxX - 34, y: 8, width: 26, height: 26)
        closeButtonRect = rect
        let path = NSBezierPath(roundedRect: rect, xRadius: 13, yRadius: 13)
        NSColor(calibratedWhite: 1, alpha: 0.12).setFill()
        path.fill()

        let attributes: [NSAttributedString.Key: Any] = [
            .font: Self.closeFont,
            .foregroundColor: NSColor(calibratedWhite: 0.86, alpha: 1)
        ]
        let label = "x"
        let size = label.size(withAttributes: attributes)
        label.draw(at: NSPoint(x: rect.midX - size.width / 2, y: rect.midY - size.height / 2 - 0.5), withAttributes: attributes)
    }

    private func drawCard(_ rect: NSRect) {
        let path = NSBezierPath(roundedRect: rect, xRadius: 18, yRadius: 18)
        NSColor(calibratedWhite: 1, alpha: 0.065).setFill()
        path.fill()
        NSColor(calibratedWhite: 1, alpha: 0.10).setStroke()
        path.lineWidth = 1
        path.stroke()
    }

    private func drawMetricCard(title: String, value: String, detail: String, rect: NSRect, accent: NSColor, percent: Double?) {
        drawCard(rect)
        title.draw(at: NSPoint(x: rect.minX + 11, y: rect.minY + 10), withAttributes: [
            .font: Self.metricLabelFont,
            .foregroundColor: NSColor(calibratedWhite: 0.58, alpha: 1)
        ])
        let displayValue = truncate(value, font: Self.metricValueFont, maxWidth: rect.width - 20)
        displayValue.draw(at: NSPoint(x: rect.minX + 11, y: rect.minY + 31), withAttributes: [
            .font: Self.metricValueFont,
            .foregroundColor: NSColor(calibratedWhite: 0.96, alpha: 1)
        ])
        let line = NSRect(x: rect.minX + 10, y: rect.maxY - 12, width: rect.width - 20, height: 4)
        let track = NSBezierPath(roundedRect: line, xRadius: 2, yRadius: 2)
        NSColor(calibratedWhite: 1, alpha: 0.10).setFill()
        track.fill()
        let fillWidth = max(6, line.width * metricPercent(percent))
        let fill = NSBezierPath(roundedRect: NSRect(x: line.minX, y: line.minY, width: fillWidth, height: line.height), xRadius: 2, yRadius: 2)
        accent.setFill()
        fill.fill()

        if !detail.isEmpty {
            let detailText = truncate(detail, font: Self.microFont, maxWidth: rect.width - 20)
            detailText.draw(at: NSPoint(x: rect.minX + 11, y: rect.minY + 58), withAttributes: [
                .font: Self.microFont,
                .foregroundColor: NSColor(calibratedWhite: 0.60, alpha: 1)
            ])
        }
    }

    private func drawStatusStrip(in rect: NSRect) {
        var x = rect.minX
        let chips = [
            summary.lastTool.isEmpty ? "" : "Tool \(summary.lastTool)",
            summary.permissionMode.isEmpty ? "" : summary.permissionMode,
            summary.branch.isEmpty ? summary.project : summary.branch
        ].filter { !$0.isEmpty }

        for chip in chips.prefix(3) {
            let width = min(textWidth(chip, font: Self.microFont) + 18, rect.maxX - x)
            if width < 36 { break }
            drawPill(
                text: truncate(chip, font: Self.microFont, maxWidth: width - 14),
                rect: NSRect(x: x, y: rect.minY, width: width, height: 22),
                foreground: NSColor(calibratedWhite: 0.72, alpha: 1),
                background: NSColor(calibratedWhite: 1, alpha: 0.075),
                font: Self.microFont
            )
            x += width + 6
        }
    }

    private func drawPill(text: String, rect: NSRect, foreground: NSColor, background: NSColor, font: NSFont? = nil) {
        let drawFont = font ?? Self.pillFont
        let path = NSBezierPath(roundedRect: rect, xRadius: rect.height / 2, yRadius: rect.height / 2)
        background.setFill()
        path.fill()
        let label = truncate(text, font: drawFont, maxWidth: rect.width - 14)
        let attributes: [NSAttributedString.Key: Any] = [
            .font: drawFont,
            .foregroundColor: foreground
        ]
        let size = label.size(withAttributes: attributes)
        label.draw(at: NSPoint(x: rect.midX - size.width / 2, y: rect.midY - size.height / 2), withAttributes: attributes)
    }

    private func headerSubtitle() -> String {
        let parts = [
            summary.agent,
            summary.model,
            summary.project,
            summary.branch
        ].filter { !$0.isEmpty }
        if !parts.isEmpty { return parts.joined(separator: " · ") }
        return summary.subtitle.isEmpty ? "Codex" : summary.subtitle
    }

    private func tokenDetail() -> String {
        let parts = [
            summary.inputTokens.isEmpty ? "" : "in \(summary.inputTokens)",
            summary.outputTokens.isEmpty ? "" : "out \(summary.outputTokens)"
        ].filter { !$0.isEmpty }
        return parts.joined(separator: " · ")
    }

    private func limitText() -> String {
        if let primary = summary.primaryLimitPercent {
            return "\(Int(round(primary)))%"
        }
        return "--"
    }

    private func weeklyLimitText() -> String {
        if let weekly = summary.weeklyLimitPercent {
            return "weekly \(Int(round(weekly)))%"
        }
        return "usage window"
    }

    private func percentageText(_ value: Double?) -> String {
        guard let value else { return "--" }
        return "\(Int(round(value)))%"
    }

    private func metricPercent(_ value: Double?) -> CGFloat {
        guard let value else { return 0.18 }
        return CGFloat(max(0, min(100, value)) / 100)
    }

    private func stateColor(_ value: String) -> NSColor {
        let lower = value.lowercased()
        if lower.contains("permission") || lower.contains("auth") { return NSColor(calibratedRed: 0.98, green: 0.22, blue: 0.28, alpha: 1) }
        if lower.contains("work") || lower.contains("think") { return NSColor(calibratedRed: 0.22, green: 0.72, blue: 0.96, alpha: 1) }
        if lower.contains("compact") { return NSColor(calibratedRed: 0.96, green: 0.62, blue: 0.16, alpha: 1) }
        return NSColor(calibratedRed: 0.22, green: 0.84, blue: 0.48, alpha: 1)
    }

    private func truncate(_ value: String, font: NSFont, maxWidth: CGFloat) -> String {
        if textWidth(value, font: font) <= maxWidth { return value }
        var output = value
        while output.count > 4 && textWidth(output + "...", font: font) > maxWidth {
            output.removeLast()
        }
        return output + "..."
    }

    private func textWidth(_ value: String, font: NSFont) -> CGFloat {
        value.size(withAttributes: [.font: font]).width
    }

    private static let segmentFont = NSFont.systemFont(ofSize: 13, weight: .semibold)
    private static let detailFont = NSFont.systemFont(ofSize: 12, weight: .regular)
    private static let titleFont = NSFont.systemFont(ofSize: 14, weight: .semibold)
    private static let subtitleFont = NSFont.systemFont(ofSize: 11, weight: .regular)
    private static let pillFont = NSFont.systemFont(ofSize: 11, weight: .semibold)
    private static let cardTitleFont = NSFont.systemFont(ofSize: 13, weight: .semibold)
    private static let previewFont = NSFont.systemFont(ofSize: 11, weight: .regular)
    private static let metricLabelFont = NSFont.systemFont(ofSize: 10, weight: .medium)
    private static let metricValueFont = NSFont.monospacedDigitSystemFont(ofSize: 16, weight: .semibold)
    private static let microFont = NSFont.systemFont(ofSize: 10, weight: .medium)
    private static let alertTitleFont = NSFont.systemFont(ofSize: 12, weight: .semibold)
    private static let alertBodyFont = NSFont.systemFont(ofSize: 11, weight: .regular)
    private static let closeFont = NSFont.systemFont(ofSize: 13, weight: .bold)

    @objc private func dismissAlertFromMenu() {
        onDismissAlert?()
    }

    @objc private func collapseFromMenu() {
        expanded = false
        onToggle?()
    }

    @objc private func quitFromMenu() {
        onQuit?()
    }
}

final class IslandController: NSObject, NSApplicationDelegate {
    private let panel: NSPanel
    private let view: IslandView
    private var timer: Timer?
    private let nodePath: String
    private let scriptPath: String
    private let workingDirectory: String
    private let renderArgs: [String]
    private let renderWidth: Int
    private let refreshInterval: TimeInterval
    private var dismissedAlertID: String?

    override init() {
        self.view = IslandView(frame: NSRect(x: 0, y: 0, width: 360, height: 42))
        self.panel = NSPanel(
            contentRect: NSRect(x: 0, y: 0, width: 360, height: 42),
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )

        let environment = ProcessInfo.processInfo.environment
        self.nodePath = environment["CXSTATUSLINE_ISLAND_NODE"] ?? "/usr/bin/env"
        self.scriptPath = environment["CXSTATUSLINE_ISLAND_SCRIPT"] ?? "cxstatusline"
        self.workingDirectory = environment["CXSTATUSLINE_ISLAND_CWD"] ?? FileManager.default.currentDirectoryPath
        self.renderWidth = Int(environment["CXSTATUSLINE_ISLAND_WIDTH"] ?? "120") ?? 120
        self.refreshInterval = max(0.25, Double(environment["CXSTATUSLINE_ISLAND_REFRESH"] ?? "1") ?? 1)
        self.renderArgs = IslandController.decodeArgs(environment["CXSTATUSLINE_ISLAND_ARGS"])

        super.init()
        self.view.onToggle = { [weak self] in self?.layoutPanel() }
        self.view.onDismissAlert = { [weak self] in self?.dismissAlert() }
        self.view.onQuit = { NSApp.terminate(nil) }
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = true
        panel.level = .statusBar
        panel.collectionBehavior = [.canJoinAllSpaces, .stationary, .fullScreenAuxiliary]
        panel.contentView = view
        panel.orderFrontRegardless()

        refresh()
        timer = Timer.scheduledTimer(withTimeInterval: refreshInterval, repeats: true) { [weak self] _ in
            self?.refresh()
        }
    }

    private func refresh() {
        let response = renderStatus()
        view.segments = response.segments
        view.detail = response.detail
        view.summary = response.summary
        if let alert = response.alert {
            view.alert = alert.id == dismissedAlertID ? nil : alert
        } else {
            dismissedAlertID = nil
            view.alert = nil
        }
        layoutPanel()
    }

    private func dismissAlert() {
        dismissedAlertID = view.alert?.id
        view.alert = nil
        layoutPanel()
    }

    private func layoutPanel() {
        guard let screen = NSScreen.main else { return }
        let visible = screen.visibleFrame
        let size = view.desiredSize(maxWidth: min(visible.width - 40, 920))
        let x = visible.midX - size.width / 2
        let y = visible.maxY - size.height - 8
        panel.setFrame(NSRect(x: x, y: y, width: size.width, height: size.height), display: true, animate: false)
        view.frame = NSRect(origin: .zero, size: size)
    }

    private func renderStatus() -> (segments: [Segment], detail: String, alert: IslandAlert?, summary: IslandSummary) {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: nodePath)
        process.arguments = [scriptPath, "island-status", "--width=\(renderWidth)", "--cwd", workingDirectory] + renderArgs
        process.currentDirectoryURL = URL(fileURLWithPath: workingDirectory)

        let stdout = Pipe()
        process.standardOutput = stdout
        process.standardError = Pipe()

        do {
            try process.run()
            process.waitUntilExit()
        } catch {
            return ([fallbackSegment("cxstatusline unavailable")], error.localizedDescription, nil, .empty)
        }

        guard process.terminationStatus == 0 else {
            return ([fallbackSegment("cxstatusline error")], "Renderer exited with status \(process.terminationStatus)", nil, .empty)
        }

        let data = stdout.fileHandleForReading.readDataToEndOfFile()
        guard
            let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let rawSegments = payload["segments"] as? [[String: Any]]
        else {
            return ([fallbackSegment("waiting for agent state")], workingDirectory, nil, .empty)
        }

        let segments = rawSegments.compactMap(segmentFromPayload)
        let detail = payload["detail"] as? String ?? workingDirectory
        let alert = (payload["alerts"] as? [[String: Any]])?.compactMap(alertFromPayload).first
        let summary = summaryFromPayload(payload["summary"] as? [String: Any])
        return (segments.isEmpty ? [fallbackSegment("Ready")] : segments, detail, alert, summary)
    }

    private func segmentFromPayload(_ payload: [String: Any]) -> Segment? {
        guard let text = payload["text"] as? String, !text.isEmpty else { return nil }
        return Segment(
            text: text,
            foreground: color(payload["fg"] as? String, fallback: "#f8fafc"),
            background: color(payload["bg"] as? String, fallback: "#334155")
        )
    }

    private func fallbackSegment(_ text: String) -> Segment {
        Segment(text: text, foreground: .white, background: NSColor(calibratedRed: 0.22, green: 0.25, blue: 0.30, alpha: 1))
    }

    private func alertFromPayload(_ payload: [String: Any]) -> IslandAlert? {
        let title = payload["title"] as? String ?? ""
        let message = payload["message"] as? String ?? ""
        guard !title.isEmpty || !message.isEmpty else { return nil }
        let severity = payload["severity"] as? String ?? "warning"
        let colors = alertColors(severity)
        return IslandAlert(
            id: payload["id"] as? String ?? "\(severity):\(title):\(message)",
            title: title,
            message: message,
            action: payload["action"] as? String ?? "",
            severity: severity,
            foreground: colors.foreground,
            background: colors.background
        )
    }

    private func summaryFromPayload(_ payload: [String: Any]?) -> IslandSummary {
        guard let payload else { return .empty }
        return IslandSummary(
            agent: payload["agent"] as? String ?? "Codex",
            client: payload["client"] as? String ?? "Codex Terminal",
            title: payload["title"] as? String ?? "Codex session",
            subtitle: payload["subtitle"] as? String ?? "Ready",
            project: payload["project"] as? String ?? "",
            branch: payload["branch"] as? String ?? "",
            model: payload["model"] as? String ?? "",
            runState: payload["runState"] as? String ?? "Ready",
            lastEvent: payload["lastEvent"] as? String ?? "",
            lastTool: payload["lastTool"] as? String ?? "",
            permissionMode: payload["permissionMode"] as? String ?? "",
            elapsed: payload["elapsed"] as? String ?? "",
            tokens: payload["tokens"] as? String ?? "",
            inputTokens: payload["inputTokens"] as? String ?? "",
            outputTokens: payload["outputTokens"] as? String ?? "",
            contextPercent: numberFromPayload(payload["contextPercent"]),
            contextWindow: payload["contextWindow"] as? String ?? "",
            primaryLimitPercent: numberFromPayload(payload["primaryLimitPercent"]),
            weeklyLimitPercent: numberFromPayload(payload["weeklyLimitPercent"]),
            preview: payload["preview"] as? String ?? ""
        )
    }

    private func numberFromPayload(_ value: Any?) -> Double? {
        if let number = value as? NSNumber {
            return number.doubleValue
        }
        if let string = value as? String {
            return Double(string)
        }
        return nil
    }

    private func alertColors(_ severity: String) -> (foreground: NSColor, background: NSColor) {
        if severity == "danger" {
            return (
                NSColor(calibratedRed: 1.0, green: 0.95, blue: 0.95, alpha: 1),
                NSColor(calibratedRed: 0.82, green: 0.12, blue: 0.12, alpha: 0.95)
            )
        }
        return (
            NSColor(calibratedRed: 0.13, green: 0.08, blue: 0.02, alpha: 1),
            NSColor(calibratedRed: 0.96, green: 0.62, blue: 0.04, alpha: 0.95)
        )
    }

    private func color(_ value: String?, fallback: String) -> NSColor {
        let hex = (value?.hasPrefix("#") == true ? value! : fallback).trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        guard hex.count == 6, let number = Int(hex, radix: 16) else {
            return .white
        }
        return NSColor(
            calibratedRed: CGFloat((number >> 16) & 0xff) / 255,
            green: CGFloat((number >> 8) & 0xff) / 255,
            blue: CGFloat(number & 0xff) / 255,
            alpha: 1
        )
    }

    private static func decodeArgs(_ raw: String?) -> [String] {
        guard
            let data = raw?.data(using: .utf8),
            let array = try? JSONSerialization.jsonObject(with: data) as? [String]
        else {
            return []
        }
        return array
    }
}

let app = NSApplication.shared
let delegate = IslandController()
app.delegate = delegate
app.run()
