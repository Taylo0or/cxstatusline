import readline from "node:readline";
import { basename } from "node:path";
import { stdin as input, stdout as output } from "node:process";
import { PRESETS, THEMES } from "./constants.js";
import { applyPreset } from "./config.js";
import { renderStatusLine } from "./render.js";
import { currentVersion, getUpdateStatus, runSelfUpdate } from "./update.js";
import { listWidgets, resolveWidgetType } from "./widgets.js";
import { stripAnsi, truncateEnd, visibleLength } from "./util.js";

const CSI = "\x1b[";
const RESET = "\x1b[0m";
const FLEX_MODES = ["full", "full-minus-40", "full-until-compact"];
const MODES = ["powerline", "plain"];
const BOOLEAN_TEXT = new Map([[true, "on"], [false, "off"]]);

export async function runTuiConfigEditor(options = {}) {
  if (!input.isTTY || !output.isTTY || typeof input.setRawMode !== "function") {
    throw new Error("The full-screen TUI requires an interactive terminal.");
  }
  return new TuiEditor(options).run();
}

export function getConfigLines(config) {
  if (Array.isArray(config.lines) && config.lines.length > 0) return structuredClone(config.lines);
  if (Array.isArray(config.widgets)) return [structuredClone(config.widgets)];
  return [[]];
}

export function setConfigLines(config, lines) {
  const cleaned = (Array.isArray(lines) && lines.length ? lines : [[]])
    .map((line) => Array.isArray(line) ? line.filter(Boolean) : []);
  const outputConfig = structuredClone(config);
  if (cleaned.length > 1) {
    outputConfig.lines = cleaned;
    delete outputConfig.widgets;
  } else {
    outputConfig.widgets = cleaned[0] || [];
    delete outputConfig.lines;
  }
  return outputConfig;
}

export function moveWidget(line, index, direction) {
  if (!Array.isArray(line) || line.length < 2) return { line: structuredClone(line || []), index: 0 };
  const nextLine = structuredClone(line);
  const from = wrap(index, nextLine.length);
  const to = wrap(from + direction, nextLine.length);
  const [item] = nextLine.splice(from, 1);
  nextLine.splice(to, 0, item);
  return { line: nextLine, index: to };
}

export function defaultWidgetForType(type) {
  const resolved = resolveWidgetType(type) || String(type || "text");
  if (resolved === "text") return { type: "text", text: "text" };
  if (resolved === "symbol") return { type: "symbol", symbol: "*" };
  if (resolved === "command") return { type: "command", command: "printf ok", timeout: 1000, maxWidth: 40 };
  if (resolved === "link") return { type: "link", href: "https://example.com", text: "link" };
  if (resolved === "separator") return { type: "separator", text: "|" };
  if (resolved === "spacer") return { type: "spacer" };
  if (resolved === "contextBar") return { type: resolved, width: 12 };
  if (["blockBar", "weeklyBar"].includes(resolved)) return { type: resolved, width: 16 };
  if (["tokenSpeed", "inputSpeed", "outputSpeed", "totalSpeed"].includes(resolved)) {
    return { type: resolved, windowSeconds: 120 };
  }
  return { type: resolved };
}

export function sanitizePreviewConfig(config) {
  const outputConfig = structuredClone(config);
  const sanitizeLine = (line) => line.map((widget) => {
    const item = typeof widget === "string" ? { type: widget } : structuredClone(widget);
    const resolved = resolveWidgetType(item.type);
    if (resolved !== "command") return item;
    const label = item.label ?? "";
    const text = item.command ? `$ ${String(item.command).split(/\r?\n/)[0]}` : "$ command";
    return {
      type: "text",
      text,
      label,
      fg: item.fg,
      bg: item.bg,
      color: item.color,
      background: item.background,
      bold: item.bold,
      merge: item.merge,
      maxWidth: item.maxWidth || item.width
    };
  });

  if (Array.isArray(outputConfig.lines)) {
    outputConfig.lines = outputConfig.lines.map((line) => Array.isArray(line) ? sanitizeLine(line) : line);
  }
  if (Array.isArray(outputConfig.widgets)) outputConfig.widgets = sanitizeLine(outputConfig.widgets);
  return outputConfig;
}

export function describeWidget(widget) {
  const item = typeof widget === "string" ? { type: widget } : widget || {};
  const type = resolveWidgetType(item.type) || item.type || "unknown";
  const details = [];
  if (item.label === "") details.push("raw");
  else if (item.label) details.push(`label=${item.label}`);
  if (item.text) details.push(`text=${item.text}`);
  if (item.symbol) details.push(`symbol=${item.symbol}`);
  if (item.command) details.push(`cmd=${item.command}`);
  if (item.href || item.url) details.push(`url=${item.href || item.url}`);
  if (item.merge) details.push(item.merge === true ? "merge" : `merge=${item.merge}`);
  if (item.bold) details.push("bold");
  if (item.maxWidth || item.width && type === "command") details.push(`max=${item.maxWidth || item.width}`);
  if (item.timeout && type === "command") details.push(`timeout=${item.timeout}`);
  return details.length ? `${type} (${details.join(", ")})` : String(type);
}

export function describeWidgetColors(widget) {
  const item = typeof widget === "string" ? { type: widget } : widget || {};
  const parts = [];
  const foreground = item.fg || item.color;
  const background = item.bg || item.background || item.backgroundColor;
  if (foreground) parts.push(`fg=${foreground}`);
  if (background) parts.push(`bg=${background}`);
  if (item.bold) parts.push("bold");
  return parts.join(", ") || "theme defaults";
}

export function updateWidgetColor(widget, field, value) {
  const next = typeof widget === "string" ? { type: widget } : structuredClone(widget || {});
  const clean = String(value || "").trim();
  if (field === "foreground") {
    delete next.color;
    if (clean) next.fg = clean;
    else delete next.fg;
  } else if (field === "background") {
    delete next.background;
    delete next.backgroundColor;
    if (clean) next.bg = clean;
    else delete next.bg;
  }
  return next;
}

export function clearWidgetColors(widget) {
  const next = typeof widget === "string" ? { type: widget } : structuredClone(widget || {});
  delete next.fg;
  delete next.color;
  delete next.bg;
  delete next.background;
  delete next.backgroundColor;
  delete next.bold;
  return next;
}

class TuiEditor {
  constructor(options) {
    this.originalConfig = structuredClone(options.config || {});
    this.config = structuredClone(options.config || {});
    this.context = {
      cwd: options.cwd || process.cwd(),
      state: previewState(options.state || {}),
      git: previewGit(options.git || {}, options.cwd || process.cwd()),
      codexConfig: options.codexConfig || {}
    };
    this.screen = "main";
    this.selection = 0;
    this.lineIndex = 0;
    this.itemIndex = 0;
    this.moveMode = false;
    this.choice = null;
    this.input = null;
    this.confirm = null;
    this.picker = null;
    this.updateStatus = null;
    this.installHooks = false;
    this.installNative = false;
    this.message = "";
    this.done = false;
    this.result = { saved: false, config: this.originalConfig };
    this.originalJson = stableJson(this.originalConfig);
  }

  run() {
    return new Promise((resolve, reject) => {
      const finish = (result) => {
        this.cleanup();
        resolve(result);
      };
      this.resolve = finish;
      this.reject = (error) => {
        this.cleanup();
        reject(error);
      };

      try {
        readline.emitKeypressEvents(input);
        input.setRawMode(true);
        input.resume();
        this.keyHandler = (text, key) => {
          try {
            this.handleKey(text, key || {});
            if (this.done) return finish(this.result);
            this.draw();
          } catch (error) {
            this.reject(error);
          }
        };
        input.on("keypress", this.keyHandler);
        output.write(`${CSI}?1049h${CSI}?25l`);
        this.draw();
      } catch (error) {
        this.reject(error);
      }
    });
  }

  cleanup() {
    if (this.keyHandler) input.off("keypress", this.keyHandler);
    if (typeof input.setRawMode === "function") input.setRawMode(false);
    input.pause();
    output.write(`${RESET}${CSI}?25h${CSI}?1049l`);
  }

  handleKey(text, key) {
    if (key.ctrl && key.name === "c") return this.finish(false);
    if (this.input) return this.handleInput(text, key);
    if (this.confirm) return this.handleConfirm(text, key);
    if (this.picker) return this.handlePicker(text, key);
    if (this.choice) return this.handleChoice(text, key);

    if (this.screen === "main") return this.handleMain(text, key);
    if (this.screen === "items") return this.handleItems(text, key);
    if (this.screen === "colors") return this.handleColors(text, key);
    if (this.screen === "updates") return this.handleMenuScreen("updates", text, key);
    if (this.screen === "terminal") return this.handleMenuScreen("terminal", text, key);
    if (this.screen === "global") return this.handleMenuScreen("global", text, key);
    if (this.screen === "powerline") return this.handleMenuScreen("powerline", text, key);
  }

  handleMain(text, key) {
    const items = mainMenuItems(this);
    if (this.navigate(items.length, text, key)) return;
    if (key.name === "escape" || text === "q") return this.confirmExit();
    if (text === "s") return this.finish(true);
    if (key.name !== "return" && key.name !== "right") return;

    const item = items[this.selection];
    if (!item) return;
    if (item.id === "items") this.openScreen("items");
    else if (item.id === "colors") this.openScreen("colors");
    else if (item.id === "updates") this.openScreen("updates");
    else if (item.id === "preset") this.openChoice("Preset", Object.keys(PRESETS), this.detectPreset(), (value) => {
      this.config = applyPreset(this.config, value);
      this.markChanged(`Applied preset ${value}`);
    });
    else if (item.id === "theme") this.openChoice("Theme", Object.keys(THEMES), this.config.theme, (value) => {
      this.config.theme = value;
      this.markChanged(`Theme set to ${value}`);
    });
    else if (item.id === "mode") this.openChoice("Mode", MODES, this.config.mode || "powerline", (value) => {
      this.config.mode = value;
      this.markChanged(`Mode set to ${value}`);
    });
    else if (item.id === "terminal") this.openScreen("terminal");
    else if (item.id === "global") this.openScreen("global");
    else if (item.id === "powerline") this.openScreen("powerline");
    else if (item.id === "hooks") this.installHooks = !this.installHooks;
    else if (item.id === "native") this.installNative = !this.installNative;
    else if (item.id === "save") this.finish(true);
    else if (item.id === "exit") this.confirmExit();
  }

  handleItems(text, key) {
    const lines = getConfigLines(this.config);
    const line = lines[this.lineIndex] || [];
    if (this.moveMode) {
      if (key.name === "escape" || key.name === "return") {
        this.moveMode = false;
        this.message = "Move mode off";
        return;
      }
      if (key.name === "up" || text === "k") return this.moveSelected(-1);
      if (key.name === "down" || text === "j") return this.moveSelected(1);
      return;
    }

    if (key.name === "escape") return this.openScreen("main");
    if (key.name === "tab") return this.nextLine(key.shift ? -1 : 1);
    if (key.name === "up") return this.selectItem(-1);
    if (key.name === "down") return this.selectItem(1);
    if (key.name === "left" || key.name === "right") return this.openPicker("change");
    if (key.name === "return") {
      if (line.length > 1) {
        this.moveMode = true;
        this.message = "Move mode: up/down reorders, Enter exits";
      }
      return;
    }
    if (text === "a") return this.openPicker("add");
    if (text === "i") return this.openPicker("insert");
    if (text === "k") return this.cloneSelected();
    if (text === "d") return this.deleteSelected();
    if (text === "c") return this.confirmClearLine();
    if (text === "n") return this.addLine();
    if (text === "D") return this.deleteLine();
    if (text === "l") return this.editSelectedLabel();
    if (text === "r") return this.toggleRaw();
    if (text === "m") return this.cycleMerge();
    if (text === "b") return this.toggleWidgetBoolean("bold");
    if (text === " ") return this.cycleSeparator();
    if (text === "e") return this.editPrimaryValue();
    if (text === "u") return this.editUrlOrToggleMode();
    if (text === "w") return this.editWidthLikeValue();
    if (text === "t") return this.editTimeoutOrTimestamp();
    if (text === "p") return this.toggleWidgetBoolean("preserveColors");
    if (text === "f") return this.cycleFormat();
    if (text === "h") return this.toggleWidgetBoolean("hideEmpty");
  }

  handleMenuScreen(screen, text, key) {
    const items = screenItems(screen, this);
    if (this.navigate(items.length, text, key, false)) return;
    if (key.name === "escape" || text === "q") return this.openScreen("main");
    if (key.name !== "return" && key.name !== "right" && text !== " ") return;
    const item = items[this.selection];
    if (item?.action) item.action();
  }

  handleColors(text, key) {
    const line = currentLine(this.config, this.lineIndex);
    if (key.name === "escape" || text === "q") return this.openScreen("main");
    if (key.name === "tab") return this.nextLine(key.shift ? -1 : 1);
    if (key.name === "up" || text === "k") return this.selectItem(-1);
    if (key.name === "down" || text === "j") return this.selectItem(1);
    if (!line.length) return;
    if (text === "f") {
      const widget = this.selectedWidget();
      this.openInput("Foreground color (#hex, ANSI name, or blank)", widget.fg || widget.color || "", (value) => {
        this.updateSelected((item) => updateWidgetColor(item, "foreground", value), "Updated foreground color");
      });
    } else if (text === "g") {
      const widget = this.selectedWidget();
      this.openInput("Background color (#hex, ANSI name, or blank)", widget.bg || widget.background || widget.backgroundColor || "", (value) => {
        this.updateSelected((item) => updateWidgetColor(item, "background", value), "Updated background color");
      });
    } else if (text === "b") {
      this.toggleWidgetBoolean("bold");
    } else if (text === "x") {
      this.updateSelected((item) => clearWidgetColors(item), "Cleared widget colors");
    }
  }

  handleChoice(text, key) {
    const values = this.choice.values;
    if (this.navigate(values.length, text, key)) return;
    if (key.name === "escape") {
      this.choice = null;
      this.openScreen("main");
      return;
    }
    if (key.name !== "return") return;
    const value = values[this.selection];
    this.choice.onPick(value);
    this.choice = null;
    this.openScreen("main");
  }

  handlePicker(text, key) {
    const items = this.filteredPickerItems();
    if (key.name === "escape") {
      if (this.picker.query) this.picker.query = "";
      else this.picker = null;
      this.selection = 0;
      return;
    }
    if (key.name === "backspace" || key.name === "delete") {
      this.picker.query = this.picker.query.slice(0, -1);
      this.selection = 0;
      return;
    }
    if (this.navigate(items.length, text, key)) return;
    if (key.name === "return") {
      if (items[this.selection]) this.applyPickedWidget(items[this.selection].name);
      return;
    }
    if (isPrintable(text)) {
      this.picker.query += text;
      this.selection = 0;
    }
  }

  handleInput(text, key) {
    if (key.name === "escape") {
      this.input = null;
      this.message = "Edit cancelled";
      return;
    }
    if (key.name === "return") {
      const { value, onSubmit } = this.input;
      this.input = null;
      onSubmit(value);
      return;
    }
    if (key.ctrl && key.name === "u") {
      this.input.value = "";
      return;
    }
    if (key.name === "backspace" || key.name === "delete") {
      this.input.value = this.input.value.slice(0, -1);
      return;
    }
    if (isPrintable(text)) this.input.value += text;
  }

  handleConfirm(text, key) {
    if (key.name === "escape" || text === "n" || text === "N") {
      const cancel = this.confirm.onNo;
      this.confirm = null;
      if (cancel) cancel();
      return;
    }
    if (key.name === "return" || text === "y" || text === "Y") {
      const yes = this.confirm.onYes;
      this.confirm = null;
      yes();
    }
  }

  navigate(length, text, key, vim = true) {
    if (length <= 0) {
      this.selection = 0;
      return false;
    }
    if (key.name === "up" || vim && text === "k") {
      this.selection = wrap(this.selection - 1, length);
      return true;
    }
    if (key.name === "down" || vim && text === "j") {
      this.selection = wrap(this.selection + 1, length);
      return true;
    }
    if (key.name === "home") {
      this.selection = 0;
      return true;
    }
    if (key.name === "end") {
      this.selection = length - 1;
      return true;
    }
    return false;
  }

  openScreen(screen) {
    this.screen = screen;
    this.choice = null;
    this.picker = null;
    this.input = null;
    this.confirm = null;
    this.selection = 0;
    if (screen === "items" || screen === "colors") this.clampItemSelection();
  }

  openChoice(title, values, current, onPick) {
    this.choice = { title, values, current, onPick };
    this.selection = Math.max(0, values.indexOf(current));
  }

  openInput(label, initial, onSubmit) {
    this.input = { label, value: String(initial ?? ""), onSubmit };
  }

  openPicker(action) {
    this.picker = { action, query: "" };
    this.selection = 0;
  }

  filteredPickerItems() {
    const query = normalizeSearch(this.picker?.query || "");
    const widgets = listWidgets();
    const scored = widgets.map((widget) => ({
      ...widget,
      score: widgetScore(widget, query)
    })).filter((widget) => widget.score > 0);
    scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    return scored;
  }

  applyPickedWidget(type) {
    const lines = getConfigLines(this.config);
    const line = lines[this.lineIndex] || [];
    const newWidget = defaultWidgetForType(type);
    const selected = line[this.itemIndex] && typeof line[this.itemIndex] === "object" ? line[this.itemIndex] : {};
    for (const key of ["label", "fg", "bg", "color", "background", "bold", "merge", "maxWidth"]) {
      if (selected[key] !== undefined && newWidget[key] === undefined) newWidget[key] = selected[key];
    }
    const action = this.picker.action;
    if (action === "change" && line.length) {
      line[this.itemIndex] = newWidget;
    } else {
      const at = action === "insert" ? this.itemIndex : Math.min(line.length, this.itemIndex + 1);
      line.splice(at, 0, newWidget);
      this.itemIndex = at;
    }
    lines[this.lineIndex] = line;
    this.config = setConfigLines(this.config, lines);
    this.picker = null;
    this.markChanged(`Widget ${action}`);
  }

  selectItem(delta) {
    const line = currentLine(this.config, this.lineIndex);
    this.itemIndex = line.length ? wrap(this.itemIndex + delta, line.length) : 0;
  }

  clampItemSelection() {
    const lines = getConfigLines(this.config);
    this.lineIndex = wrap(this.lineIndex, lines.length || 1);
    const line = lines[this.lineIndex] || [];
    this.itemIndex = line.length ? wrap(this.itemIndex, line.length) : 0;
  }

  nextLine(delta) {
    const lines = getConfigLines(this.config);
    this.lineIndex = wrap(this.lineIndex + delta, lines.length || 1);
    this.itemIndex = 0;
    this.message = `Line ${this.lineIndex + 1}`;
  }

  addLine() {
    const lines = getConfigLines(this.config);
    lines.splice(this.lineIndex + 1, 0, [defaultWidgetForType("text")]);
    this.lineIndex += 1;
    this.itemIndex = 0;
    this.config = setConfigLines(this.config, lines);
    this.markChanged("Added line");
  }

  deleteLine() {
    const lines = getConfigLines(this.config);
    if (lines.length <= 1) {
      this.message = "Cannot delete the only line";
      return;
    }
    lines.splice(this.lineIndex, 1);
    this.lineIndex = Math.min(this.lineIndex, lines.length - 1);
    this.itemIndex = 0;
    this.config = setConfigLines(this.config, lines);
    this.markChanged("Deleted line");
  }

  moveSelected(direction) {
    const lines = getConfigLines(this.config);
    const moved = moveWidget(lines[this.lineIndex], this.itemIndex, direction);
    lines[this.lineIndex] = moved.line;
    this.itemIndex = moved.index;
    this.config = setConfigLines(this.config, lines);
    this.markChanged("Moved widget");
  }

  cloneSelected() {
    this.updateLine((line) => {
      if (!line.length) return line;
      const clone = structuredClone(line[this.itemIndex]);
      line.splice(this.itemIndex + 1, 0, clone);
      this.itemIndex += 1;
      return line;
    }, "Cloned widget");
  }

  deleteSelected() {
    this.updateLine((line) => {
      if (!line.length) return line;
      line.splice(this.itemIndex, 1);
      this.itemIndex = line.length ? Math.min(this.itemIndex, line.length - 1) : 0;
      return line;
    }, "Deleted widget");
  }

  confirmClearLine() {
    this.confirm = {
      message: "Clear the current line?",
      onYes: () => this.updateLine(() => [], "Cleared line"),
      onNo: () => {
        this.message = "Clear cancelled";
      }
    };
  }

  editSelectedLabel() {
    const widget = this.selectedWidget();
    if (!widget) return;
    this.openInput("Label (blank means raw value)", widget.label || "", (value) => {
      this.updateSelected((item) => ({ ...item, label: value }), "Updated label");
    });
  }

  toggleRaw() {
    this.updateSelected((item) => {
      if (item.label === "") {
        const next = { ...item };
        delete next.label;
        return next;
      }
      return { ...item, label: "" };
    }, "Toggled raw label");
  }

  cycleMerge() {
    this.updateSelected((item) => {
      const next = { ...item };
      if (!next.merge) next.merge = true;
      else if (next.merge === true) next.merge = "no-padding";
      else delete next.merge;
      return next;
    }, "Cycled merge mode");
  }

  toggleWidgetBoolean(key) {
    this.updateSelected((item) => ({ ...item, [key]: !Boolean(item[key]) }), `Toggled ${key}`);
  }

  cycleSeparator() {
    const separators = ["|", "-", ",", " ", "::"];
    this.updateSelected((item) => {
      if ((resolveWidgetType(item.type) || item.type) !== "separator") return item;
      const current = item.text || item.separator || "|";
      return { ...item, text: separators[wrap(separators.indexOf(current) + 1, separators.length)] };
    }, "Cycled separator");
  }

  editPrimaryValue() {
    const widget = this.selectedWidget();
    if (!widget) return;
    const type = resolveWidgetType(widget.type) || widget.type;
    const key = primaryValueKey(type);
    this.openInput(primaryValueLabel(type), widget[key] || "", (value) => {
      this.updateSelected((item) => ({ ...item, [key]: value }), `Updated ${key}`);
    });
  }

  editUrlOrToggleMode() {
    const widget = this.selectedWidget();
    if (!widget) return;
    const type = resolveWidgetType(widget.type) || widget.type;
    if (type === "link") {
      this.openInput("URL", widget.href || widget.url || "", (value) => {
        this.updateSelected((item) => ({ ...item, href: value }), "Updated URL");
      });
      return;
    }
    this.updateSelected((item) => {
      const next = { ...item };
      next.mode = next.mode === "remaining" ? "used" : "remaining";
      return next;
    }, "Toggled used/remaining mode");
  }

  editWidthLikeValue() {
    const widget = this.selectedWidget();
    if (!widget) return;
    const type = resolveWidgetType(widget.type) || widget.type;
    const key = ["tokenSpeed", "inputSpeed", "outputSpeed", "totalSpeed"].includes(type) ? "windowSeconds" : "maxWidth";
    this.openInput(key === "windowSeconds" ? "Speed window seconds" : "Max width", widget[key] || "", (value) => {
      this.updateSelected((item) => setNumericField(item, key, value), `Updated ${key}`);
    });
  }

  editTimeoutOrTimestamp() {
    const widget = this.selectedWidget();
    if (!widget) return;
    const type = resolveWidgetType(widget.type) || widget.type;
    if (type === "command") {
      this.openInput("Command timeout ms", widget.timeout || 1000, (value) => {
        this.updateSelected((item) => setNumericField(item, "timeout", value), "Updated timeout");
      });
      return;
    }
    this.updateSelected((item) => {
      const modes = ["duration", "timestamp", "both", "bar"];
      return { ...item, mode: modes[wrap(modes.indexOf(item.mode || "duration") + 1, modes.length)] };
    }, "Cycled timer mode");
  }

  cycleFormat() {
    this.updateSelected((item) => {
      const formats = ["default", "word", "letter", "icon"];
      const current = item.format || "default";
      const next = formats[wrap(formats.indexOf(current) + 1, formats.length)];
      const outputItem = { ...item };
      if (next === "default") delete outputItem.format;
      else outputItem.format = next;
      return outputItem;
    }, "Cycled format");
  }

  refreshUpdateStatus() {
    try {
      this.updateStatus = getUpdateStatus();
      this.message = this.updateStatus.updateAvailable
        ? `Update available: ${this.updateStatus.latest}`
        : `Already current: ${this.updateStatus.current}`;
    } catch (error) {
      this.message = `Update check failed: ${error.message}`;
    }
  }

  runPinnedInstall() {
    if (!this.updateStatus) this.refreshUpdateStatus();
    if (!this.updateStatus?.latest) return;
    try {
      const result = runSelfUpdate({ tag: this.updateStatus.latest });
      this.message = result.ok ? `Pinned install complete: ${result.tag}` : `Pinned install failed: ${result.stderr || result.error?.message}`;
    } catch (error) {
      this.message = `Pinned install failed: ${error.message}`;
    }
  }

  selectedWidget() {
    const line = currentLine(this.config, this.lineIndex);
    const widget = line[this.itemIndex];
    return widget && typeof widget === "object" ? widget : widget ? { type: widget } : null;
  }

  updateSelected(mutator, message) {
    this.updateLine((line) => {
      if (!line.length) return line;
      line[this.itemIndex] = mutator(typeof line[this.itemIndex] === "string" ? { type: line[this.itemIndex] } : line[this.itemIndex]);
      return line;
    }, message);
  }

  updateLine(mutator, message) {
    const lines = getConfigLines(this.config);
    const line = structuredClone(lines[this.lineIndex] || []);
    lines[this.lineIndex] = mutator(line);
    this.config = setConfigLines(this.config, lines);
    this.clampItemSelection();
    this.markChanged(message);
  }

  detectPreset() {
    const widgets = stableJson(this.config.widgets || []);
    for (const [name, preset] of Object.entries(PRESETS)) {
      if (Array.isArray(preset) && stableJson(preset) === widgets) return name;
    }
    return "default";
  }

  markChanged(message) {
    this.message = message;
  }

  changed() {
    return stableJson(this.config) !== this.originalJson;
  }

  confirmExit() {
    if (!this.changed()) return this.finish(false);
    this.confirm = {
      message: "Exit without saving changes?",
      onYes: () => this.finish(false),
      onNo: () => {
        this.message = "Exit cancelled";
      }
    };
  }

  finish(saved) {
    this.done = true;
    this.result = saved
      ? { saved: true, config: this.config, installHooks: this.installHooks, installNative: this.installNative }
      : { saved: false, config: this.originalConfig };
  }

  draw() {
    output.write(`${CSI}H${CSI}2J${this.render()}`);
  }

  render() {
    const width = Math.max(60, output.columns || 100);
    const height = Math.max(20, output.rows || 40);
    const lines = [];
    lines.push(`${bold("cxstatusline")} ${dim("full-screen config editor")} ${this.changed() ? yellow("modified") : dim("saved")}`);
    lines.push(dim("Use arrows/j/k, Enter to select, Esc/q to go back, s to save."));
    lines.push("");
    lines.push(bold("Preview"));
    lines.push(...this.renderPreview(width).map((line) => limitLine(line, width)));
    lines.push("");

    if (this.choice) lines.push(...this.renderChoice(width));
    else if (this.picker) lines.push(...this.renderPicker(width, height - lines.length - 3));
    else if (this.screen === "main") lines.push(...this.renderMain(width));
    else if (this.screen === "items") lines.push(...this.renderItems(width, height - lines.length - 5));
    else if (this.screen === "colors") lines.push(...this.renderColors(height - lines.length - 5));
    else lines.push(...this.renderMenuScreen(this.screen, width));

    if (this.confirm) {
      lines.push("");
      lines.push(yellow(this.confirm.message));
      lines.push(dim("Enter/y confirms, Esc/n cancels"));
    }
    if (this.input) {
      lines.push("");
      lines.push(bold(this.input.label));
      lines.push(`> ${this.input.value}${inverse(" ")}`);
      lines.push(dim("Enter saves, Esc cancels, Ctrl+U clears"));
    }
    if (this.message) {
      lines.push("");
      lines.push(dim(this.message));
    }

    return lines.slice(0, height - 1).map((line) => limitLine(line, width)).join("\n");
  }

  renderPreview(width) {
    try {
      const rendered = renderStatusLine({
        ...this.context,
        config: sanitizePreviewConfig(this.config)
      }, { width: Math.max(20, width - 4), color: true });
      return String(rendered || "(empty)").split(/\r?\n/);
    } catch (error) {
      return [red(`Preview error: ${error.message}`)];
    }
  }

  renderMain() {
    return renderMenu("Main Menu", mainMenuItems(this), this.selection);
  }

  renderChoice() {
    const items = this.choice.values.map((value) => ({
      label: value,
      value: value === this.choice.current ? "current" : ""
    }));
    return renderMenu(this.choice.title, items, this.selection);
  }

  renderMenuScreen(screen) {
    return renderMenu(screenTitle(screen), screenItems(screen, this), this.selection);
  }

  renderPicker(width, maxRows) {
    const rows = [bold(`Widget Picker: ${this.picker.action}`), `Search: ${this.picker.query}${inverse(" ")}`, ""];
    const items = this.filteredPickerItems();
    const visible = items.slice(0, Math.max(3, maxRows - 4));
    visible.forEach((item, index) => {
      const selected = index === this.selection;
      const description = truncateEnd(item.description || "", Math.max(12, width - item.name.length - 8));
      rows.push(menuLine(selected, item.name, description));
    });
    if (!visible.length) rows.push(dim("No widgets match the search."));
    rows.push("");
    rows.push(dim("Type to filter, Enter applies, Esc clears/back."));
    return rows;
  }

  renderItems(width, maxRows) {
    const lines = getConfigLines(this.config);
    const line = lines[this.lineIndex] || [];
    const rows = [];
    rows.push(bold(`Line ${this.lineIndex + 1}/${lines.length}`) + (this.moveMode ? yellow("  MOVE") : ""));
    rows.push(dim("a add, i insert, left/right change, Enter move, d delete, c clear, n new line, Tab next line"));
    rows.push(dim("l label, r raw, m merge, b bold, e edit value, w width/window, t timeout/timer, u URL/mode"));
    rows.push("");
    if (!line.length) rows.push(dim("(empty line) Press a to add a widget."));
    const visible = line.slice(0, Math.max(1, maxRows - 6));
    visible.forEach((widget, index) => {
      const selected = index === this.itemIndex;
      rows.push(menuLine(selected, `${index + 1}.`, describeWidget(widget), width));
    });
    if (line.length > visible.length) rows.push(dim(`... ${line.length - visible.length} more`));
    return rows;
  }

  renderColors(maxRows) {
    const lines = getConfigLines(this.config);
    const line = lines[this.lineIndex] || [];
    const rows = [];
    rows.push(bold(`Widget Colors: line ${this.lineIndex + 1}/${lines.length}`));
    rows.push(dim("f foreground, g background, b bold, x clear, Tab next line, Esc/q back"));
    rows.push("");
    if (!line.length) rows.push(dim("(empty line) Add widgets from Edit lines first."));
    const visible = line.slice(0, Math.max(1, maxRows - 4));
    visible.forEach((widget, index) => {
      const selected = index === this.itemIndex;
      rows.push(menuLine(selected, `${index + 1}. ${describeWidget(widget)}`, describeWidgetColors(widget)));
    });
    if (line.length > visible.length) rows.push(dim(`... ${line.length - visible.length} more`));
    return rows;
  }
}

function mainMenuItems(editor) {
  return [
    { id: "items", label: "Edit lines and widgets", value: lineSummary(editor.config) },
    { id: "colors", label: "Edit widget colors", value: colorSummary(editor.config) },
    { id: "preset", label: "Preset", value: editor.detectPreset() },
    { id: "theme", label: "Theme", value: editor.config.theme || "powerline" },
    { id: "mode", label: "Mode", value: editor.config.mode || "powerline" },
    { id: "terminal", label: "Terminal width", value: editor.config.flexMode || "full" },
    { id: "global", label: "Global overrides", value: globalSummary(editor.config) },
    { id: "powerline", label: "Powerline setup", value: powerlineSummary(editor.config) },
    { id: "updates", label: "Manage install and updates", value: updateSummary(editor.updateStatus) },
    { id: "hooks", label: "Install Codex hooks after save", value: BOOLEAN_TEXT.get(editor.installHooks) },
    { id: "native", label: "Configure native Codex footer after save", value: BOOLEAN_TEXT.get(editor.installNative) },
    { id: "save", label: "Save and exit", value: editor.changed() ? "writes config" : "no changes" },
    { id: "exit", label: "Exit without saving", value: "" }
  ];
}

function screenItems(screen, editor) {
  const config = editor.config;
  if (screen === "terminal") {
    return [
      {
        label: "Flex mode",
        value: config.flexMode || "full",
        action: () => {
          config.flexMode = FLEX_MODES[wrap(FLEX_MODES.indexOf(config.flexMode || "full") + 1, FLEX_MODES.length)];
          editor.markChanged(`Flex mode set to ${config.flexMode}`);
        }
      },
      {
        label: "Compact threshold",
        value: String(config.compactThreshold || 60),
        action: () => editor.openInput("Compact threshold percent", config.compactThreshold || 60, (value) => {
          const number = boundedNumber(value, 1, 99, 60);
          config.compactThreshold = number;
          editor.markChanged(`Compact threshold set to ${number}`);
        })
      },
      { label: "Back", value: "", action: () => editor.openScreen("main") }
    ];
  }

  if (screen === "global") {
    return [
      toggleItem(editor, "Minimal labels", "minimal"),
      {
        label: "Hide empty widgets",
        value: BOOLEAN_TEXT.get(config.hideEmpty !== false),
        action: () => {
          config.hideEmpty = !(config.hideEmpty !== false);
          editor.markChanged("Toggled hide empty widgets");
        }
      },
      inputItem(editor, "Default padding", "defaultPadding", ""),
      inputItem(editor, "Default separator", "defaultSeparator", config.separator || " | ", (value) => {
        config.defaultSeparator = value;
        config.separator = value;
      }),
      toggleItem(editor, "Inherit separator colors", "inheritSeparatorColors"),
      toggleItem(editor, "Global bold", "globalBold"),
      inputItem(editor, "Override foreground", "overrideForegroundColor", ""),
      inputItem(editor, "Override background", "overrideBackgroundColor", ""),
      {
        label: "Clear color overrides",
        value: "",
        action: () => {
          delete config.overrideForegroundColor;
          delete config.overrideBackgroundColor;
          editor.markChanged("Cleared color overrides");
        }
      },
      { label: "Back", value: "", action: () => editor.openScreen("main") }
    ];
  }

  if (screen === "updates") {
    const status = editor.updateStatus;
    return [
      { label: "Current version", value: currentVersion() },
      {
        label: "Check latest GitHub release",
        value: status?.latest || "not checked",
        action: () => editor.refreshUpdateStatus()
      },
      {
        label: "Pinned npm install command",
        value: status?.installCommand || "check first",
        action: () => {
          if (!editor.updateStatus) editor.refreshUpdateStatus();
          if (editor.updateStatus?.installCommand) editor.message = editor.updateStatus.installCommand;
        }
      },
      {
        label: "Run pinned npm install",
        value: status?.latest || "check first",
        action: () => editor.runPinnedInstall()
      },
      { label: "Back", value: "", action: () => editor.openScreen("main") }
    ];
  }

  const powerline = ensurePowerline(config);
  return [
    inputItem(editor, "Separators CSV", "separators", capCsv(powerline.separators || powerline.separator || "\uE0B0"), (value) => {
      powerline.separators = csv(value);
      powerline.separator = powerline.separators[0] || powerline.separator || "\uE0B0";
    }, powerline),
    inputItem(editor, "Start caps CSV", "startCaps", capCsv(powerline.startCaps || powerline.startCap || ""), (value) => {
      powerline.startCaps = csv(value);
    }, powerline),
    inputItem(editor, "End caps CSV", "endCaps", capCsv(powerline.endCaps || powerline.endCap || ""), (value) => {
      powerline.endCaps = csv(value);
    }, powerline),
    inputItem(editor, "Invert separator backgrounds CSV", "separatorInvertBackground", boolCsv(powerline.separatorInvertBackground || []), (value) => {
      powerline.separatorInvertBackground = csv(value).map(parseBool);
    }, powerline),
    toggleItem(editor, "Auto-align columns", "autoAlign", powerline),
    toggleItem(editor, "Continue theme across lines", "continueThemeAcrossLines", powerline),
    { label: "Back", value: "", action: () => editor.openScreen("main") }
  ];
}

function toggleItem(editor, label, key, target = editor.config) {
  return {
    label,
    value: BOOLEAN_TEXT.get(Boolean(target[key])),
    action: () => {
      target[key] = !Boolean(target[key]);
      editor.markChanged(`Toggled ${label}`);
    }
  };
}

function inputItem(editor, label, key, fallback = "", setter = null, target = editor.config) {
  return {
    label,
    value: target[key] === undefined ? String(fallback) : String(target[key]),
    action: () => editor.openInput(label, target[key] ?? fallback, (value) => {
      if (setter) setter(value);
      else if (value === "") delete target[key];
      else target[key] = value;
      editor.markChanged(`Updated ${label}`);
    })
  };
}

function currentLine(config, lineIndex) {
  return getConfigLines(config)[lineIndex] || [];
}

function primaryValueKey(type) {
  if (type === "symbol") return "symbol";
  if (type === "command") return "command";
  if (type === "link") return "text";
  if (type === "separator") return "text";
  return "text";
}

function primaryValueLabel(type) {
  if (type === "command") return "Command";
  if (type === "symbol") return "Symbol";
  if (type === "link") return "Link text";
  if (type === "separator") return "Separator text";
  return "Text";
}

function setNumericField(item, key, value) {
  const number = Number(value);
  const next = { ...item };
  if (Number.isFinite(number) && number > 0) next[key] = Math.round(number);
  else delete next[key];
  return next;
}

function ensurePowerline(config) {
  if (!config.powerline || typeof config.powerline !== "object" || Array.isArray(config.powerline)) {
    config.powerline = {};
  }
  return config.powerline;
}

function renderMenu(title, items, selected) {
  const rows = [bold(title), ""];
  items.forEach((item, index) => {
    rows.push(menuLine(index === selected, item.label, item.value || ""));
  });
  return rows;
}

function menuLine(selected, label, value = "") {
  const marker = selected ? ">" : " ";
  const text = value ? `${marker} ${label} ${dim(value)}` : `${marker} ${label}`;
  return selected ? inverse(text) : text;
}

function screenTitle(screen) {
  if (screen === "terminal") return "Terminal Options";
  if (screen === "global") return "Global Overrides";
  if (screen === "powerline") return "Powerline Setup";
  if (screen === "updates") return "Install and Updates";
  return screen;
}

function previewState(state) {
  return {
    model: state.model || "gpt-5.5",
    runState: state.runState || "Ready",
    startedAt: state.startedAt || new Date(Date.now() - 7 * 60 * 1000).toISOString(),
    usage: {
      totalTokens: 123456,
      inputTokens: 42000,
      outputTokens: 8100,
      contextUsed: 64000,
      contextWindow: 200000,
      usageLimitUsed: 40,
      usageLimitRemaining: 60,
      weeklyUsageUsed: 30,
      weeklyUsageRemaining: 70,
      ...(state.usage || {})
    },
    samples: state.samples || [
      { at: new Date(Date.now() - 60_000).toISOString(), totalTokens: 100000, inputTokens: 35000, outputTokens: 7000 },
      { at: new Date().toISOString(), totalTokens: 123456, inputTokens: 42000, outputTokens: 8100 }
    ],
    ...state
  };
}

function previewGit(git, cwd) {
  if (git?.isRepo) return git;
  return {
    isRepo: true,
    branch: "main",
    sha: "abcdef0",
    rootName: basename(cwd || process.cwd()),
    status: { clean: true, staged: 0, unstaged: 0, untracked: 0, conflicts: 0, ahead: 0, behind: 0 },
    diff: { insertions: 0, deletions: 0 },
    stagedDiff: { insertions: 0, deletions: 0 },
    origin: { owner: "owner", repo: "repo", ownerRepo: "owner/repo", httpsUrl: "https://github.com/owner/repo", host: "github.com" },
    upstreamRemote: { owner: "owner", repo: "repo", ownerRepo: "owner/repo" }
  };
}

function widgetScore(widget, query) {
  if (!query) return 1;
  const name = normalizeSearch(widget.name);
  const description = normalizeSearch(widget.description);
  if (name === query) return 100;
  if (name.startsWith(query)) return 80;
  if (name.includes(query)) return 60;
  if (initialism(widget.name).startsWith(query)) return 50;
  if (fuzzyIncludes(name, query)) return 35;
  if (description.includes(query)) return 10;
  return 0;
}

function normalizeSearch(value) {
  return String(value || "").replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function initialism(value) {
  return String(value || "").split(/[^A-Za-z0-9]+|(?=[A-Z])/).filter(Boolean).map((part) => part[0]).join("").toLowerCase();
}

function fuzzyIncludes(value, query) {
  let index = 0;
  for (const char of value) {
    if (char === query[index]) index += 1;
    if (index >= query.length) return true;
  }
  return false;
}

function lineSummary(config) {
  const lines = getConfigLines(config);
  const count = lines.reduce((sum, line) => sum + line.length, 0);
  return `${lines.length} line${lines.length === 1 ? "" : "s"}, ${count} widgets`;
}

function globalSummary(config) {
  const parts = [];
  if (config.minimal) parts.push("minimal");
  if (config.defaultSeparator || config.separator) parts.push(`sep=${JSON.stringify(config.defaultSeparator || config.separator)}`);
  if (config.globalBold) parts.push("bold");
  if (config.overrideForegroundColor || config.overrideBackgroundColor) parts.push("colors");
  return parts.join(", ") || "defaults";
}

function powerlineSummary(config) {
  const powerline = config.powerline || {};
  const parts = [];
  if (powerline.autoAlign) parts.push("align");
  if (powerline.continueThemeAcrossLines) parts.push("continue");
  if (powerline.separators?.length) parts.push(`${powerline.separators.length} sep`);
  return parts.join(", ") || "defaults";
}

function updateSummary(status) {
  if (!status) return "not checked";
  return status.updateAvailable ? `update ${status.latest}` : `current ${status.current}`;
}

function colorSummary(config) {
  const count = getConfigLines(config)
    .flat()
    .filter((widget) => {
      const item = typeof widget === "string" ? { type: widget } : widget || {};
      return Boolean(item.fg || item.color || item.bg || item.background || item.backgroundColor || item.bold);
    }).length;
  return count ? `${count} styled widget${count === 1 ? "" : "s"}` : "theme defaults";
}

function boundedNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function csv(value) {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function capCsv(value) {
  return Array.isArray(value) ? value.join(",") : String(value || "");
}

function boolCsv(value) {
  return Array.isArray(value) ? value.map((item) => item ? "true" : "false").join(",") : "";
}

function parseBool(value) {
  return ["1", "true", "yes", "y", "on", "invert", "inverted"].includes(String(value).trim().toLowerCase());
}

function stableJson(value) {
  return JSON.stringify(value);
}

function wrap(index, length) {
  if (length <= 0) return 0;
  return ((index % length) + length) % length;
}

function isPrintable(text) {
  return typeof text === "string" && text.length > 0 && !/[\x00-\x1F\x7F]/.test(text);
}

function limitLine(line, width) {
  if (visibleLength(line) <= width) return line;
  return truncateEnd(stripAnsi(line), width);
}

function bold(text) {
  return `${CSI}1m${text}${RESET}`;
}

function dim(text) {
  return `${CSI}2m${text}${RESET}`;
}

function inverse(text) {
  return `${CSI}7m${text}${RESET}`;
}

function yellow(text) {
  return `${CSI}33m${text}${RESET}`;
}

function red(text) {
  return `${CSI}31m${text}${RESET}`;
}
