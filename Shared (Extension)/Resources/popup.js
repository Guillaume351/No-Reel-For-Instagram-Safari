const api = typeof browser !== "undefined" ? browser : chrome;
const isBrowserApi = typeof browser !== "undefined";
const EMAIL = "guillaume.claverie@mail.com";

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

const storageCandidates = (() => {
    const storage = api?.storage;
    if (!storage) {
        return [];
    }

    const candidates = [];
    if (storage.sync && typeof storage.sync.get === "function") {
        candidates.push({ name: "sync", area: storage.sync });
    }
    // sync and local are distinct stores. Only use local when sync is absent;
    // a rejected operation must not overwrite or display a different baseline.
    else if (storage.local && typeof storage.local.get === "function") {
        candidates.push({ name: "local", area: storage.local });
    }
    return candidates;
})();

let activeStorage = storageCandidates[0] || null;

const form = document.getElementById("settingsForm");
const statusElement = document.getElementById("status");
const contactEmailLink = document.getElementById("contactEmail");
const showEverythingButton = document.getElementById("showEverything");
const retrySettingsButton = document.getElementById("retrySettings");
let savedSettings = null;
let undoSettings = null;
const undoEverythingButton = document.getElementById("undoEverything");
let statusRevision = 0;
const controls = new Map(
    Array.from(form.querySelectorAll("input[type='checkbox']"))
        .map((control) => [control.name, control])
);

// A stalled Safari read must not leave the popup permanently disabled.
// Time out reads only: never retry an uncertain write or replace unknown settings.
const SETTINGS_READ_TIMEOUT_MS = 10000;

function readWithTimeout(operation) {
    return new Promise((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error("settings read timed out")), SETTINGS_READ_TIMEOUT_MS);
        Promise.resolve().then(operation).then((result) => {
            window.clearTimeout(timeout);
            resolve(result);
        }, (error) => {
            window.clearTimeout(timeout);
            reject(error);
        });
    });
}

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

    if (attempts.length === 0) {
        throw new Error("storage unavailable");
    }

    let lastError = null;

    for (const candidate of attempts) {
        if (!candidate) {
            continue;
        }

        try {
            const result = await readWithTimeout(() => invokeStorage(candidate.area, "get", keys));
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

function sanitizeSettings(partial = {}) {
    partial = migrateCombinedSettings(partial);
    const sanitized = {};

    for (const [key, defaultValue] of Object.entries(defaultSettings)) {
        if (Object.prototype.hasOwnProperty.call(partial, key)) {
            sanitized[key] = Boolean(partial[key]);
        } else {
            sanitized[key] = Boolean(defaultValue);
        }
    }

    return sanitized;
}

async function readSettingsFromStorage() {
    const stored = await storageGet(Object.keys(defaultSettings));
    return sanitizeSettings(stored);
}

async function writeSettingsToStorage(settings) {
    try {
        await storageSet(settings);
    } catch (error) {
        console.warn("No Reel For Instagram: storage.set failed while saving popup settings", error);
        throw error;
    }
}

async function loadSettingsWithFallback() {
    try {
        const response = await readWithTimeout(() => sendMessage({ type: "getSettings" }));
        if (response?.ok === false) {
            throw new Error(response.error || "background rejected settings load");
        }

        const settings = response?.settings;
        if (settings && typeof settings === "object") {
            return sanitizeSettings(settings);
        }
    } catch (error) {
        console.warn("No Reel For Instagram: background settings load failed", error);
    }

    return readSettingsFromStorage();
}

async function saveSettingsWithFallback(partialSettings) {
    try {
        const response = await sendMessage({
            type: "saveSettings",
            payload: partialSettings
        });
        if (response?.ok === false) {
            throw new Error(response.error || "background rejected settings save");
        }

        const settings = response?.settings;
        if (settings && typeof settings === "object") {
            return sanitizeSettings(settings);
        }
    } catch (error) {
        console.warn("No Reel For Instagram: background settings save failed, writing directly", error);
        const sanitized = sanitizeSettings(partialSettings);
        await writeSettingsToStorage(sanitized);
        return sanitized;
    }

    const sanitized = sanitizeSettings(partialSettings);
    await writeSettingsToStorage(sanitized);
    return sanitized;
}

function getMessage(key, substitutions) {
    if (api?.i18n?.getMessage) {
        if (typeof substitutions !== "undefined") {
            return api.i18n.getMessage(key, substitutions);
        }

        return api.i18n.getMessage(key);
    }

    return key;
}

function localize() {
    // Use the locale of the actual message bundle: Safari can report an English
    // UI language while getMessage supplies Arabic text.
    const messageLocale = (getMessage("popup_locale") || "").replace(/_/g, "-").toLowerCase();
    const hasMessageLocale = /^(en|fr|de|es|ar)(?:-[a-z0-9]+)*$/.test(messageLocale);
    const uiLang = hasMessageLocale ? messageLocale
        : (api?.i18n?.getUILanguage ? api.i18n.getUILanguage() : navigator.language);
    const langCode = (uiLang || "en").replace(/_/g, "-").toLowerCase();
    document.documentElement.lang = langCode;

    const messageDirection = getMessage("popup_direction");
    document.documentElement.dir = hasMessageLocale && ["rtl", "ltr"].includes(messageDirection)
        ? messageDirection : (/^ar(?:-|$)/.test(langCode) ? "rtl" : "ltr");

    document.querySelectorAll("[data-i18n]").forEach((element) => {
        const key = element.getAttribute("data-i18n");
        if (!key) {
            return;
        }

        let message;
        if (key === "contact_email_label") {
            message = getMessage(key, EMAIL) || EMAIL;
        } else if (key === "contact_description") {
            message = getMessage(key);
        } else {
            message = getMessage(key);
        }

        if (!message || message === key) {
            if (key === "contact_email_label") {
                message = EMAIL;
            } else {
                return;
            }
        }

        const attr = element.getAttribute("data-i18n-attr");
        if (attr) {
            element.setAttribute(attr, message);
        } else {
            element.textContent = message;
        }
    });

    if (contactEmailLink) {
        contactEmailLink.href = `mailto:${EMAIL}`;
    }
}

function sendMessage(message) {
    if (typeof browser !== "undefined") {
        return api.runtime.sendMessage(message);
    }

    return new Promise((resolve, reject) => {
        api.runtime.sendMessage(message, (response) => {
            const error = api.runtime.lastError;
            if (error) {
                reject(error);
            } else {
                resolve(response);
            }
        });
    });
}

function renderSettings(settings) {
    const sanitized = sanitizeSettings(settings);
    controls.forEach((control, key) => {
        control.checked = Boolean(sanitized[key]);
    });
}

function collectSettings() {
    const result = {};

    controls.forEach((control, key) => {
        result[key] = control.checked;
    });

    return result;
}

function setFormDisabled(isDisabled) {
    showEverythingButton.disabled = isDisabled || !savedSettings;
    undoEverythingButton.disabled = isDisabled || !undoSettings;
    undoEverythingButton.hidden = !undoSettings;
    controls.forEach((control) => {
        control.disabled = isDisabled || !savedSettings;
    });

    if (!isDisabled) {
        const hideReelsControl = controls.get("hideFeedReels");
        const collapsedControl = controls.get("keepReelsCollapsed");
        if (collapsedControl) {
            collapsedControl.disabled = !savedSettings || !hideReelsControl?.checked;
            collapsedControl.closest(".setting")?.toggleAttribute(
                "data-disabled",
                collapsedControl.disabled
            );
        }
    }
}

function setStatus(message, state = "idle") {
    statusRevision += 1;
    statusElement.textContent = message;
    statusElement.dataset.state = state;
}

async function loadSettings() {
    setFormDisabled(true);
    retrySettingsButton.disabled = true;
    setStatus(getMessage("status_loading"));

    try {
        const settings = await loadSettingsWithFallback();
        savedSettings = sanitizeSettings(settings);
        retrySettingsButton.hidden = true;
        renderSettings(settings);
        setFormDisabled(false);
        setStatus("", "idle");
    } catch (error) {
        console.error("No Reel For Instagram: unable to load settings", error);
        savedSettings = null;
        retrySettingsButton.hidden = false;
        renderSettings(defaultSettings);
        setFormDisabled(false);
        setStatus(getMessage("status_load_error"), "error");
    } finally {
        retrySettingsButton.disabled = false;
    }
}

let pendingSave = null;

async function persistSettings(successMessageKey = "status_success", afterSuccess = null) {
    if (!savedSettings) return;
    if (pendingSave) {
        return pendingSave;
    }

    const payload = collectSettings();
    setFormDisabled(true);
    setStatus(getMessage("status_saving"), "pending");

    pendingSave = saveSettingsWithFallback(payload).then((settings) => {
        savedSettings = sanitizeSettings(settings);
        renderSettings(settings);
        afterSuccess?.();
        setStatus(getMessage(successMessageKey), "success");
        if (successMessageKey === "status_success") {
            const revision = statusRevision;
            window.setTimeout(() => {
                if (statusRevision === revision && statusElement.dataset.state === "success") {
                    setStatus("", "idle");
                }
            }, 1200);
        }
    }).catch((error) => {
        console.error("No Reel For Instagram: save failed", error);
        if (savedSettings) {
            renderSettings(savedSettings);
        }
        setStatus(getMessage("status_save_error"), "error");
    }).finally(() => {
        setFormDisabled(false);
        pendingSave = null;
    });

    return pendingSave;
}

form.addEventListener("change", () => {
    if (!savedSettings) return;
    setFormDisabled(false);
    persistSettings("status_success", () => { undoSettings = null; });
});

showEverythingButton.addEventListener("click", () => {
    if (pendingSave) {
        return;
    }
    if (!savedSettings) return;
    // This child choice is dormant while its parent is off; do not erase it.
    const before = undoSettings || { ...savedSettings };
    controls.forEach((control, key) => {
        if (key !== "keepReelsCollapsed") control.checked = false;
    });
    persistSettings("status_restored", () => { undoSettings = before; });
});

undoEverythingButton.addEventListener("click", () => {
    if (pendingSave || !undoSettings) return;
    renderSettings(undoSettings);
    persistSettings("status_undone", () => {
        undoSettings = null;
    }).then(() => {
        // persistSettings settles after its finally re-enables this button.
        if (!undoSettings) showEverythingButton.focus();
    });
});

retrySettingsButton.addEventListener("click", () => {
    loadSettings().then(() => {
        if (savedSettings) showEverythingButton.focus();
    });
});

setFormDisabled(true);

localize();
loadSettings();
