import { api } from "./tauri";

export const APP_VERSION = "0.1.0";
export const GITHUB_REPO = "sasaiber/Savio---Cloud-Backup-for-Game-Saves";

export interface UpdateInfo {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseName: string;
  releaseNotes: string;
  publishedAt: string;
  htmlUrl: string;
  zipDownloadUrl?: string;
  exeDownloadUrl?: string;
  checkedAt: number;
}

/**
 * Normalizes version strings ("v0.1.0" or "0.1.0") into comparable numeric arrays.
 */
export function parseSemver(v: string): number[] {
  const clean = v.replace(/^v/i, "").trim();
  return clean.split(".").map((n) => {
    const parsed = parseInt(n, 10);
    return isNaN(parsed) ? 0 : parsed;
  });
}

/**
 * Returns true if remoteVersion is strictly newer than currentVersion.
 */
export function isNewerVersion(remote: string, current: string): boolean {
  const r = parseSemver(remote);
  const c = parseSemver(current);
  const maxLen = Math.max(r.length, c.length);

  for (let i = 0; i < maxLen; i++) {
    const rVal = r[i] ?? 0;
    const cVal = c[i] ?? 0;
    if (rVal > cVal) return true;
    if (rVal < cVal) return false;
  }
  return false;
}

/**
 * Fetches the latest release from the GitHub Releases API.
 */
export async function checkForAppUpdates(currentVersion: string = APP_VERSION): Promise<UpdateInfo> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      signal: controller.signal,
      headers: {
        Accept: "application/vnd.github.v3+json",
      },
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      if (res.status === 404) {
        throw new Error("No public releases found yet");
      }
      if (res.status === 403) {
        throw new Error("GitHub rate limit reached, please try again in a few minutes");
      }
      throw new Error(`GitHub API error (${res.status})`);
    }

    const data = await res.json();
    const latestVersion = (data.tag_name || "").replace(/^v/i, "");
    const hasUpdate = isNewerVersion(latestVersion, currentVersion);

    let zipUrl: string | undefined;
    let exeUrl: string | undefined;

    if (Array.isArray(data.assets)) {
      for (const asset of data.assets) {
        if (asset.name?.endsWith(".zip")) {
          zipUrl = asset.browser_download_url;
        } else if (asset.name?.endsWith(".exe")) {
          exeUrl = asset.browser_download_url;
        }
      }
    }

    return {
      hasUpdate,
      currentVersion,
      latestVersion: latestVersion || currentVersion,
      releaseName: data.name || `Savio v${latestVersion}`,
      releaseNotes: data.body || "",
      publishedAt: data.published_at || new Date().toISOString(),
      htmlUrl: data.html_url || `https://github.com/${GITHUB_REPO}/releases`,
      zipDownloadUrl: zipUrl,
      exeDownloadUrl: exeUrl,
      checkedAt: Date.now(),
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/**
 * Opens the release URL in the user's default browser via Windows shell.
 */
export async function openReleasePage(url: string): Promise<void> {
  try {
    await api.openFolder(url);
  } catch (e) {
    window.open(url, "_blank");
  }
}
