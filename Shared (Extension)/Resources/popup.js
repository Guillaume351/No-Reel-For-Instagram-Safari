const api = typeof browser !== "undefined" ? browser : chrome;
const form = document.getElementById("settingsForm");
const statusElement = document.getElementById("status");
const controls = new Map(
    Array.from(form.querySelectorAll("input[type='checkbox']"))
        .map((control) => [control.name, control])
);

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
    setStatus("Loading settings…");

    try {
        const response = await sendMessage({ type: "getSettings" });
        renderSettings(response?.settings ?? {});
        setStatus("", "idle");
    } catch (error) {
        console.error("No Reel For Instagram: unable to load settings", error);
        setStatus("Couldn't reach the extension. Try again.", "error");
    }
}

let pendingSave = null;

async function persistSettings() {
    if (pendingSave) {
        return pendingSave;
    }

    const payload = collectSettings();
    setFormDisabled(true);
    setStatus("Saving…", "pending");

    pendingSave = sendMessage({
        type: "saveSettings",
        payload
    }).then((response) => {
        renderSettings(response?.settings ?? payload);
        setStatus("All set!", "success");
        window.setTimeout(() => {
            if (statusElement.dataset.state === "success") {
                setStatus("", "idle");
            }
        }, 1200);
    }).catch((error) => {
        console.error("No Reel For Instagram: save failed", error);
        setStatus("Couldn't save changes.", "error");
    }).finally(() => {
        setFormDisabled(false);
        pendingSave = null;
    });

    return pendingSave;
}

form.addEventListener("change", () => {
    persistSettings();
});

loadSettings();
