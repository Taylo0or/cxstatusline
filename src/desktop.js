import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, normalize } from "node:path";
import { cacheDir, homePath, parseFlags, repoRoot, shellQuote } from "./util.js";

const SOURCE_PATH = join(repoRoot, "templates", "CxStatuslineDesktop.swift");
const DESKTOP_DIR = join(cacheDir(), "desktop");
const DIST_DIR = join(repoRoot, "dist");
const APP_PATH = join(DESKTOP_DIR, "CxStatusline.app");
const EXECUTABLE_NAME = "CxStatuslineDesktop";
const CONTENTS_DIR = join(APP_PATH, "Contents");
const MACOS_DIR = join(CONTENTS_DIR, "MacOS");
const RESOURCES_DIR = join(CONTENTS_DIR, "Resources");
const RUNTIME_PATH = join(RESOURCES_DIR, "runtime");
const BUNDLED_NODE_DIR = join(RESOURCES_DIR, "node");
const BUNDLED_NODE_PATH = join(BUNDLED_NODE_DIR, "node");
const WRAPPER_PATH = join(MACOS_DIR, EXECUTABLE_NAME);
const BINARY_PATH = join(RESOURCES_DIR, `${EXECUTABLE_NAME}.bin`);
const RUNTIME_ENTRIES = ["bin", "src", "templates", "package.json", "README.md", "LICENSE"];

export function runDesktop(args = []) {
  if (process.platform !== "darwin") {
    throw new Error("cxstatusline desktop is currently supported on macOS only.");
  }

  const { flags } = parseFlags(args);
  const appPath = ensureDesktopApp({
    force: Boolean(flags.rebuild || flags.force),
    bundleNode: flags["bundle-node"] !== "false" && flags.node !== "external"
  });

  if (flags.install) {
    const destination = flags.path || join(homePath("Applications"), "CxStatusline.app");
    installApp(appPath, destination);
    console.log(`desktop: installed ${destination}`);
    if (!flags.open) return;
    openApp(destination);
    return;
  }

  if (flags.dmg) {
    const dmgPath = flags.dmg === true ? join(DIST_DIR, `CxStatusline-macos-${process.arch}.dmg`) : flags.dmg;
    createDmg(appPath, dmgPath);
    console.log(`desktop: created ${dmgPath}`);
    return;
  }

  if (flags.path || flags["print-path"]) {
    console.log(appPath);
  }

  if (!flags["build-only"] && flags.open !== "false") {
    openApp(appPath);
  }
}

function ensureDesktopApp(options = {}) {
  if (!existsSync(SOURCE_PATH)) {
    throw new Error(`Missing Swift desktop source: ${SOURCE_PATH}`);
  }

  const force = Boolean(options.force);
  const needsBuild = force
    || !existsSync(APP_PATH)
    || !existsSync(BINARY_PATH)
    || statSync(BINARY_PATH).mtimeMs < statSync(SOURCE_PATH).mtimeMs;

  if (needsBuild) {
    rmSync(APP_PATH, { recursive: true, force: true });
    mkdirSync(MACOS_DIR, { recursive: true });
    mkdirSync(RESOURCES_DIR, { recursive: true });

    const result = spawnSync("swiftc", [
      "-parse-as-library",
      SOURCE_PATH,
      "-o",
      BINARY_PATH,
      "-framework",
      "AppKit",
      "-framework",
      "SwiftUI"
    ], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });

    if (result.error || result.status !== 0) {
      throw new Error([
        "Failed to build CxStatusline desktop app.",
        "Install Xcode Command Line Tools if swiftc is missing.",
        result.stderr || result.error?.message || ""
      ].filter(Boolean).join("\n"));
    }
  }

  mkdirSync(MACOS_DIR, { recursive: true });
  mkdirSync(RESOURCES_DIR, { recursive: true });
  syncRuntime(Boolean(options.bundleNode));
  writeInfoPlist();
  writeWrapper();
  writeFileSync(join(CONTENTS_DIR, "PkgInfo"), "APPL????");
  return APP_PATH;
}

function writeInfoPlist() {
  writeFileSync(join(CONTENTS_DIR, "Info.plist"), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>${EXECUTABLE_NAME}</string>
  <key>CFBundleIdentifier</key>
  <string>dev.cxstatusline.desktop</string>
  <key>CFBundleName</key>
  <string>CxStatusline</string>
  <key>CFBundleDisplayName</key>
  <string>CxStatusline</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>1.0.0</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSMinimumSystemVersion</key>
  <string>12.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
`);
}

function syncRuntime(bundleNode) {
  rmSync(RUNTIME_PATH, { recursive: true, force: true });
  mkdirSync(RUNTIME_PATH, { recursive: true });

  for (const entry of RUNTIME_ENTRIES) {
    const source = join(repoRoot, entry);
    if (!existsSync(source)) continue;
    cpSync(source, join(RUNTIME_PATH, entry), { recursive: true, dereference: true });
  }

  rmSync(dirname(BUNDLED_NODE_PATH), { recursive: true, force: true });
  if (!bundleNode) return;
  bundleNodeRuntime();
  if (!canRunBundledNode()) {
    rmSync(dirname(BUNDLED_NODE_PATH), { recursive: true, force: true });
  }
}

function bundleNodeRuntime() {
  mkdirSync(BUNDLED_NODE_DIR, { recursive: true });
  const nodeSource = realpathSync(process.execPath);
  const files = collectNodeRuntimeFiles(nodeSource);

  for (const file of files) {
    copyFileSync(file.source, file.target);
    chmodSync(file.target, 0o755);
  }

  rewriteBundledDylibPaths(files);
  signAdHoc(files.map((file) => file.target));
}

function collectNodeRuntimeFiles(nodeSource) {
  const files = [{ source: nodeSource, target: BUNDLED_NODE_PATH }];
  const bySource = new Map([[normalize(nodeSource), files[0]]]);
  const queue = [nodeSource];

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    for (const dependency of machoDependencies(current)) {
      const resolved = resolveDylibPath(dependency, current);
      if (!resolved || !shouldBundleDylib(resolved)) continue;
      const key = normalize(realpathSync(resolved));
      if (bySource.has(key)) continue;
      const file = { source: key, target: join(BUNDLED_NODE_DIR, basename(key)) };
      bySource.set(key, file);
      files.push(file);
      queue.push(key);
    }
  }

  return files;
}

function rewriteBundledDylibPaths(files) {
  const bySource = new Map(files.map((file) => [normalize(realpathSync(file.source)), file]));
  for (const file of files) {
    for (const dependency of machoDependencies(file.source)) {
      const resolved = resolveDylibPath(dependency, file.source);
      if (!resolved) continue;
      const bundled = bySource.get(normalize(realpathSync(resolved)));
      if (!bundled) continue;
      runQuiet("install_name_tool", ["-change", dependency, `@loader_path/${basename(bundled.target)}`, file.target]);
    }
    if (file.target.endsWith(".dylib")) {
      runQuiet("install_name_tool", ["-id", `@loader_path/${basename(file.target)}`, file.target]);
    }
  }
}

function machoDependencies(path) {
  const result = spawnSync("otool", ["-L", path], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.error || result.status !== 0) return [];
  return result.stdout
    .split("\n")
    .slice(1)
    .map((line) => line.trim().split(/\s+/)[0])
    .filter(Boolean);
}

function machoRpaths(path) {
  const result = spawnSync("otool", ["-l", path], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.error || result.status !== 0) return [];
  const lines = result.stdout.split("\n");
  const paths = [];
  let inRpath = false;
  for (const line of lines) {
    if (line.includes("cmd LC_RPATH")) {
      inRpath = true;
      continue;
    }
    if (!inRpath) continue;
    const match = line.match(/\spath\s+(.+?)\s+\(offset/);
    if (match) {
      paths.push(resolveLoaderToken(match[1], path));
      inRpath = false;
    }
  }
  return paths;
}

function resolveDylibPath(dependency, loaderPath) {
  if (dependency.startsWith("/")) return existsSync(dependency) ? dependency : null;
  if (dependency.startsWith("@loader_path/")) {
    const resolved = resolveLoaderToken(dependency, loaderPath);
    return existsSync(resolved) ? resolved : null;
  }
  if (dependency.startsWith("@rpath/")) {
    const suffix = dependency.slice("@rpath/".length);
    for (const rpath of machoRpaths(loaderPath)) {
      const resolved = join(rpath, suffix);
      if (existsSync(resolved)) return resolved;
    }
  }
  return null;
}

function resolveLoaderToken(value, loaderPath) {
  return normalize(value.replace("@loader_path", dirname(loaderPath)));
}

function shouldBundleDylib(path) {
  return !path.startsWith("/usr/lib/")
    && !path.startsWith("/System/Library/")
    && !path.includes("/System/iOSSupport/");
}

function canRunBundledNode() {
  const result = spawnSync(BUNDLED_NODE_PATH, ["--version"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return !result.error && result.status === 0;
}

function runQuiet(command, args) {
  spawnSync(command, args, { encoding: "utf8", stdio: ["ignore", "ignore", "ignore"] });
}

function signAdHoc(paths) {
  for (const path of paths) {
    runQuiet("codesign", ["--force", "--sign", "-", path]);
  }
}

function writeWrapper() {
  const script = `#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
BUNDLE_NODE="$DIR/../Resources/node/node"
BUNDLE_SCRIPT="$DIR/../Resources/runtime/bin/cxstatusline.js"
if [ -x "$BUNDLE_NODE" ]; then
  export CXSTATUSLINE_DESKTOP_NODE="$BUNDLE_NODE"
else
  export CXSTATUSLINE_DESKTOP_NODE=${shellQuote(process.execPath)}
fi
if [ -f "$BUNDLE_SCRIPT" ]; then
  export CXSTATUSLINE_DESKTOP_SCRIPT="$BUNDLE_SCRIPT"
else
  export CXSTATUSLINE_DESKTOP_SCRIPT=${shellQuote(join(repoRoot, "bin", "cxstatusline.js"))}
fi
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
exec "$DIR/../Resources/${EXECUTABLE_NAME}.bin"
`;
  writeFileSync(WRAPPER_PATH, script);
  chmodSync(WRAPPER_PATH, 0o755);
  chmodSync(BINARY_PATH, 0o755);
}

function installApp(source, destination) {
  mkdirSync(dirname(destination), { recursive: true });
  rmSync(destination, { recursive: true, force: true });
  cpSync(source, destination, { recursive: true });
}

function createDmg(appPath, dmgPath) {
  mkdirSync(dirname(dmgPath), { recursive: true });
  const result = spawnSync("hdiutil", [
    "create",
    "-volname",
    "CxStatusline",
    "-srcfolder",
    appPath,
    "-ov",
    "-format",
    "UDZO",
    dmgPath
  ], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (result.error || result.status !== 0) {
    throw new Error(result.stderr || result.error?.message || `Failed to create ${dmgPath}`);
  }
}

function openApp(path) {
  const result = spawnSync("open", [path], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (result.error || result.status !== 0) {
    throw new Error(result.stderr || result.error?.message || `Failed to open ${path}`);
  }
  console.log(`desktop: opened ${path}`);
}
