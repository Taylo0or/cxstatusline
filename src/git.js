import { basename, join, resolve } from "node:path";
import { cacheDir, ensureDir, hashText, readJson, run, safeStat, writeJsonAtomic } from "./util.js";

export function getGitInfo(cwd = process.cwd(), options = {}) {
  const rootResult = git(["rev-parse", "--show-toplevel"], cwd);
  if (!rootResult.ok) {
    return { isRepo: false, cwd };
  }

  const root = rootResult.stdout.trim();
  const ttlMs = Number(options.ttlMs ?? process.env.CXSTATUSLINE_GIT_CACHE_TTL_MS ?? 1500);
  const cache = ttlMs > 0 ? readGitCache(root, ttlMs) : null;
  if (cache) return cache;

  const branchResult = git(["branch", "--show-current"], root);
  const shaResult = git(["rev-parse", "--short", "HEAD"], root);
  const statusResult = git(["status", "--porcelain=v1", "--branch"], root);
  const diffShortResult = git(["diff", "--shortstat"], root);
  const stagedShortResult = git(["diff", "--cached", "--shortstat"], root);
  const originResult = git(["config", "--get", "remote.origin.url"], root);
  const upstreamResult = git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], root);
  const upstreamRemoteResult = git(["config", "--get", "remote.upstream.url"], root);
  const gitDirResult = git(["rev-parse", "--git-dir"], root);
  const commonDirResult = git(["rev-parse", "--git-common-dir"], root);

  const status = parsePorcelainStatus(statusResult.stdout);
  const diff = parseShortStat(diffShortResult.stdout);
  const stagedDiff = parseShortStat(stagedShortResult.stdout);
  const origin = parseRemote(originResult.stdout.trim());
  const upstreamRemote = parseRemote(upstreamRemoteResult.stdout.trim());
  const gitDir = gitDirResult.stdout.trim();
  const commonDir = commonDirResult.stdout.trim();
  const branch = branchResult.stdout.trim() || "(detached)";
  const upstream = upstreamResult.ok ? upstreamResult.stdout.trim() : "";

  const info = {
    isRepo: true,
    root,
    rootName: basename(root),
    branch,
    sha: shaResult.stdout.trim(),
    origin,
    upstream,
    upstreamRemote,
    isFork: Boolean(origin.ownerRepo && upstreamRemote.ownerRepo && origin.ownerRepo !== upstreamRemote.ownerRepo),
    worktree: {
      linked: Boolean(gitDir && commonDir && gitDir !== commonDir && !gitDir.endsWith("/.git")),
      name: basename(root),
      branch,
      originalBranch: upstream ? upstream.replace(/^[^/]+\//, "") : ""
    },
    status,
    diff,
    stagedDiff
  };
  if (ttlMs > 0) writeGitCache(root, info);
  return info;
}

function git(args, cwd) {
  return run("git", ["--no-optional-locks", ...args], { cwd, timeout: 1200 });
}

export function parsePorcelainStatus(output) {
  const result = {
    staged: 0,
    unstaged: 0,
    untracked: 0,
    conflicts: 0,
    ahead: 0,
    behind: 0,
    clean: true
  };

  for (const line of String(output || "").split(/\r?\n/)) {
    if (!line) continue;
    if (line.startsWith("## ")) {
      const ahead = line.match(/ahead (\d+)/);
      const behind = line.match(/behind (\d+)/);
      if (ahead) result.ahead = Number(ahead[1]);
      if (behind) result.behind = Number(behind[1]);
      continue;
    }

    const x = line[0];
    const y = line[1];
    if (x === "?" && y === "?") {
      result.untracked += 1;
    } else {
      if (x && x !== " ") result.staged += 1;
      if (y && y !== " ") result.unstaged += 1;
      if (["U", "A", "D"].includes(x) && ["U", "A", "D"].includes(y)) result.conflicts += 1;
    }
  }

  result.clean = result.staged + result.unstaged + result.untracked + result.conflicts === 0;
  return result;
}

export function parseShortStat(output) {
  const text = String(output || "").trim();
  const files = text.match(/(\d+) files? changed/);
  const insertions = text.match(/(\d+) insertions?\(\+\)/);
  const deletions = text.match(/(\d+) deletions?\(-\)/);
  return {
    files: files ? Number(files[1]) : 0,
    insertions: insertions ? Number(insertions[1]) : 0,
    deletions: deletions ? Number(deletions[1]) : 0
  };
}

export function parseRemote(remote) {
  const text = String(remote || "").trim().replace(/\.git$/, "");
  if (!text) return {};
  const match = text.match(/(?:github\.com|gitlab\.com)[/:]([^/\s:]+)\/([^/\s]+)$/i)
    || text.match(/([^/\s:]+)\/([^/\s]+)$/);
  if (!match) return { url: text };
  const [, owner, repo] = match;
  const host = text.includes("gitlab.com") ? "gitlab.com" : text.includes("github.com") ? "github.com" : "";
  const httpsUrl = host ? `https://${host}/${owner}/${repo}` : "";
  return { url: text, host, owner, repo, ownerRepo: `${owner}/${repo}`, httpsUrl };
}

export function gitCacheKey(root) {
  return join(cacheDir(), "git-cache", `${hashText(resolve(root))}.json`);
}

export function gitInvalidationStamp(root) {
  const gitDirResult = git(["rev-parse", "--git-dir"], root);
  const gitDir = gitDirResult.ok ? gitDirResult.stdout.trim() : join(root, ".git");
  const absoluteGitDir = gitDir.startsWith("/") ? gitDir : join(root, gitDir);
  const head = safeStat(join(absoluteGitDir, "HEAD"));
  const index = safeStat(join(absoluteGitDir, "index"));
  return {
    headMtimeMs: head?.mtimeMs || 0,
    indexMtimeMs: index?.mtimeMs || 0
  };
}

function readGitCache(root, ttlMs) {
  const path = gitCacheKey(root);
  const cached = readJson(path, null);
  if (!cached?.info || !cached?.createdAt || !cached?.stamp) return null;
  if (Date.now() - cached.createdAt > ttlMs) return null;
  const current = gitInvalidationStamp(root);
  if (current.headMtimeMs !== cached.stamp.headMtimeMs || current.indexMtimeMs !== cached.stamp.indexMtimeMs) return null;
  return { ...cached.info, cached: true };
}

function writeGitCache(root, info) {
  const path = gitCacheKey(root);
  ensureDir(join(cacheDir(), "git-cache"));
  writeJsonAtomic(path, {
    createdAt: Date.now(),
    stamp: gitInvalidationStamp(root),
    info
  });
}
