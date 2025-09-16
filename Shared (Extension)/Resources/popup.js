const api = typeof browser !== "undefined" ? browser : chrome;
const EMAIL = "guillaume.claverie@mail.com";

const form = document.getElementById("settingsForm");
const statusElement = document.getElementById("status");
const contactEmailLink = document.getElementById("contactEmail");
const controls = new Map(
    Array.from(form.querySelectorAll("input[type='checkbox']"))
        .map((control) => [control.name, control])
);

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
    controls.forEach((control, key) => {
        control.checked = Boolean(settings[key]);
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
        const response = await sendMessage({ type: "getSettings" });
        renderSettings(response?.settings ?? {});
        setStatus("", "idle");
    } catch (error) {
        console.error("No Reel For Instagram: unable to load settings", error);
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

    pendingSave = sendMessage({
        type: "saveSettings",
        payload
    }).then((response) => {
        renderSettings(response?.settings ?? payload);
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
