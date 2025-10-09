const api = typeof browser !== "undefined" ? browser : chrome;
const isBrowserApi = typeof browser !== "undefined";
const EMAIL = "guillaume.claverie@mail.com";

const defaultSettings = Object.freeze({
    hideReels: true,
    hideExploreTab: true,
    hideSuggestedPosts: true,
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
    if (storage.local && typeof storage.local.get === "function") {
        candidates.push({ name: "local", area: storage.local });
    }
    return candidates;
})();

let activeStorage = storageCandidates[0] || null;

const form = document.getElementById("settingsForm");
const statusElement = document.getElementById("status");
const contactEmailLink = document.getElementById("contactEmail");
const controls = new Map(
    Array.from(form.querySelectorAll("input[type='checkbox']"))
        .map((control) => [control.name, control])
);

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

function sanitizeSettings(partial = {}) {
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
    try {
        const stored = await storageGet(Object.keys(defaultSettings));
        return sanitizeSettings(stored);
    } catch (error) {
        console.warn("No Reel For Instagram: storage.get failed while loading popup settings", error);
        return sanitizeSettings({});
    }
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
        const response = await sendMessage({ type: "getSettings" });
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

    return sanitizeSettings(partialSettings);
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
    const uiLang = api?.i18n?.getUILanguage ? api.i18n.getUILanguage() : navigator.language;
    if (uiLang) {
        document.documentElement.lang = uiLang;
    }

    const langCode = (document.documentElement.lang || "en").toLowerCase();
    document.documentElement.dir = langCode.startsWith("ar") ? "rtl" : "ltr";

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
    controls.forEach((control) => {
        control.disabled = isDisabled;
    });
}

function setStatus(message, state = "idle") {
    statusElement.textContent = message;
    statusElement.dataset.state = state;
}

async function loadSettings() {
    setStatus(getMessage("status_loading"));

    try {
        const settings = await loadSettingsWithFallback();
        renderSettings(settings);
        setStatus("", "idle");
    } catch (error) {
        console.error("No Reel For Instagram: unable to load settings", error);
        renderSettings(defaultSettings);
        setStatus(getMessage("status_load_error"), "error");
    }
}

let pendingSave = null;

async function persistSettings() {
    if (pendingSave) {
        return pendingSave;
    }

    const payload = collectSettings();
    setFormDisabled(true);
    setStatus(getMessage("status_saving"), "pending");

    pendingSave = saveSettingsWithFallback(payload).then((settings) => {
        renderSettings(settings);
        setStatus(getMessage("status_success"), "success");
        window.setTimeout(() => {
            if (statusElement.dataset.state === "success") {
                setStatus("", "idle");
            }
        }, 1200);
    }).catch((error) => {
        console.error("No Reel For Instagram: save failed", error);
        setStatus(getMessage("status_save_error"), "error");
    }).finally(() => {
        setFormDisabled(false);
        pendingSave = null;
    });

    return pendingSave;
}

form.addEventListener("change", () => {
    persistSettings();
});

localize();
loadSettings();
