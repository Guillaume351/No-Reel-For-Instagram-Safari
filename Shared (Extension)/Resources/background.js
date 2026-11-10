const api = typeof browser !== "undefined" ? browser : chrome;
const isBrowserApi = typeof browser !== "undefined";

const storageCandidates = (() => {
    const storage = api?.storage;
    if (!storage) {
        return [];
    }

    const candidates = [];
    if (storage.sync && typeof storage.sync.get === "function") {
        candidates.push({ name: "sync", area: storage.sync });
    }
    // Use one canonical area based on API availability, never on write errors.
    else if (storage.local && typeof storage.local.get === "function") {
        candidates.push({ name: "local", area: storage.local });
    }
    return candidates;
})();

let activeStorage = storageCandidates[0] || null;

const defaultSettings = Object.freeze({
    hideReels: true,
    hideFeedReels: true,
    keepReelsCollapsed: true,
    hideSearchReels: true,
    hideExploreTab: true,
    hideExploreRecommendations: true,
    hideSuggestedPosts: true,
    hideSponsoredPosts: true,
    hideSuggestedUsers: true,
    hideStories: true
});

function invokeStorage(area, method, payload) {
    if (!area || typeof area[method] !== "function") {
        return Promise.reject(new Error("storage method unavailable"));
    }

    if (isBrowserApi) {
        return area[method](payload);
    }

    return new Promise((resolve, reject) => {
        area[method](payload, (result) => {
            const error = api.runtime?.lastError;
            if (error) {
                reject(error);
            } else {
                resolve(result);
            }
        });
    });
}

async function storageGet(keys) {
    const attempts = activeStorage
        ? [activeStorage, ...storageCandidates.filter((candidate) => candidate !== activeStorage)]
        : storageCandidates;

    if (attempts.length === 0) throw new Error("storage unavailable");

    let lastError = null;

    for (const candidate of attempts) {
        if (!candidate) {
            continue;
        }

        try {
            const result = await invokeStorage(candidate.area, "get", keys);
            activeStorage = candidate;
            return result && typeof result === "object" ? result : {};
        } catch (error) {
            lastError = error;
        }
    }

    if (lastError) {
        throw lastError;
    }

    return {};
}

async function storageSet(items) {
    const attempts = activeStorage
        ? [activeStorage, ...storageCandidates.filter((candidate) => candidate !== activeStorage)]
        : storageCandidates;

    if (attempts.length === 0) {
        throw new Error("storage unavailable");
    }

    let lastError = null;

    for (const candidate of attempts) {
        if (!candidate) {
            continue;
        }

        try {
            await invokeStorage(candidate.area, "set", items);
            activeStorage = candidate;
            return;
        } catch (error) {
            lastError = error;
        }
    }

    if (lastError) {
        throw lastError;
    }
}

function migrateCombinedSettings(settings = {}) {
    const migrated = { ...settings };
    for (const [key, legacyKey] of [
        ["hideFeedReels", "hideReels"],
        ["hideExploreRecommendations", "hideExploreTab"]
    ]) {
        if (typeof migrated[key] === "undefined" && typeof settings[legacyKey] === "boolean") {
            migrated[key] = settings[legacyKey];
        }
    }
    return migrated;
}

function withDefaults(settings) {
    return {
        ...defaultSettings,
        ...migrateCombinedSettings(settings)
    };
}

// Defaults and legacy combined choices are normalized on read. Do not seed
// storage here: popup recovery can write directly while a background read is
// pending, and a later migration write would overwrite that explicit choice.

async function getSettingsPayload() {
    try {
        const current = await storageGet(Object.keys(defaultSettings));
        return { ok: true, settings: withDefaults(current) };
    } catch (error) {
        console.error("No Reel For Instagram: failed to load settings", error);
        return { ok: false, error: "settings_load_failed", settings: { ...defaultSettings } };
    }
}

async function saveSettingsPayload(partialSettings) {
    partialSettings = migrateCombinedSettings(partialSettings);
    const sanitized = {};

    for (const [key, defaultValue] of Object.entries(defaultSettings)) {
        if (Object.prototype.hasOwnProperty.call(partialSettings, key)) {
            sanitized[key] = Boolean(partialSettings[key]);
        } else {
            sanitized[key] = Boolean(defaultValue);
        }
    }

    await storageSet(sanitized);
    return { ok: true, settings: withDefaults(sanitized) };
}

api.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message !== "object") {
        return;
    }

    if (message.type === "getSettings") {
        getSettingsPayload().then(sendResponse).catch((error) => {
            console.error("No Reel For Instagram: getSettings failed", error);
            sendResponse({ ok: false, error: "settings_load_failed", settings: { ...defaultSettings } });
        });
        return true;
    }

    if (message.type === "saveSettings") {
        saveSettingsPayload(message.payload || {}).then(sendResponse).catch((error) => {
            console.error("No Reel For Instagram: saveSettings failed", error);
            sendResponse({ ok: false, error: "settings_save_failed" });
        });
        return true;
    }

    return undefined;
});
