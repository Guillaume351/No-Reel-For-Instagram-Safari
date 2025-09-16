const api = typeof browser !== "undefined" ? browser : chrome;
const defaultSettings = Object.freeze({
    hideReels: true,
    hideSuggestedPosts: true,
    hideSuggestedUsers: true,
    hideStories: true
});

function storageGet(keys) {
    if (typeof browser !== "undefined") {
        return browser.storage.sync.get(keys);
    }

    return new Promise((resolve, reject) => {
        api.storage.sync.get(keys, (items) => {
            const error = api.runtime.lastError;
            if (error) {
                reject(error);
            } else {
                resolve(items);
            }
        });
    });
}

function storageSet(items) {
    if (typeof browser !== "undefined") {
        return browser.storage.sync.set(items);
    }

    return new Promise((resolve, reject) => {
        api.storage.sync.set(items, () => {
            const error = api.runtime.lastError;
            if (error) {
                reject(error);
            } else {
                resolve();
            }
        });
    });
}

function withDefaults(settings) {
    return {
        ...defaultSettings,
        ...settings
    };
}

async function ensureDefaults() {
    try {
        const stored = await storageGet(Object.keys(defaultSettings));
        const next = {};
        let needsUpdate = false;

        for (const [key, value] of Object.entries(defaultSettings)) {
            if (typeof stored[key] === "undefined") {
                next[key] = value;
                needsUpdate = true;
            }
        }

        if (needsUpdate) {
            await storageSet(next);
        }
    } catch (error) {
        console.error("No Reel For Instagram: unable to seed default settings", error);
    }
}

async function getSettingsPayload() {
    try {
        const current = await storageGet(Object.keys(defaultSettings));
        return { settings: withDefaults(current) };
    } catch (error) {
        console.error("No Reel For Instagram: failed to load settings", error);
        return { settings: { ...defaultSettings } };
    }
}

async function saveSettingsPayload(partialSettings) {
    const sanitized = {};

    for (const [key, defaultValue] of Object.entries(defaultSettings)) {
        if (Object.prototype.hasOwnProperty.call(partialSettings, key)) {
            sanitized[key] = Boolean(partialSettings[key]);
        } else {
            sanitized[key] = Boolean(defaultValue);
        }
    }

    await storageSet(sanitized);
    return { settings: withDefaults(sanitized) };
}

ensureDefaults();

api.runtime.onInstalled.addListener(() => {
    ensureDefaults();
});

api.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message !== "object") {
        return;
    }

    if (message.type === "getSettings") {
        getSettingsPayload().then(sendResponse).catch((error) => {
            console.error("No Reel For Instagram: getSettings failed", error);
            sendResponse({ settings: { ...defaultSettings } });
        });
        return true;
    }

    if (message.type === "saveSettings") {
        saveSettingsPayload(message.payload || {}).then(sendResponse).catch((error) => {
            console.error("No Reel For Instagram: saveSettings failed", error);
            sendResponse({ settings: { ...defaultSettings } });
        });
        return true;
    }

    return undefined;
});
