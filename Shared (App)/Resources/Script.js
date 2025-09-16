const EMAIL = "guillaume.claverie@mail.com";

function getUILocale() {
    if (navigator.languages && navigator.languages.length) {
        return navigator.languages[0];
    }
    return navigator.language || "en";
}

async function loadHostStrings(locale) {
    const lang = locale.toLowerCase();
    const base = lang.split("-")[0];
    const candidates = [lang, base, "en"];

    for (const candidate of candidates) {
        try {
            const response = await fetch(`../Locales/${candidate}/host.json`);
            if (response.ok) {
                return { locale: candidate, data: await response.json() };
            }
        } catch (error) {
            console.error("No Reel For Instagram: failed to load host strings", candidate, error);
        }
    }

    return { locale: "en", data: null };
}

function localizeStaticStrings(platform, useSettingsInsteadOfPreferences) {
    if (useSettingsInsteadOfPreferences) {
        document.getElementsByClassName('platform-mac state-on')[0].innerText = "No Reel For Instagram is active. Manage it in Safari Settings > Extensions to keep Reels blocked.";
        document.getElementsByClassName('platform-mac state-off')[0].innerText = "No Reel For Instagram is off. Enable it in Safari Settings > Extensions to remove Reels, Stories, and For You feeds.";
        document.getElementsByClassName('platform-mac state-unknown')[0].innerText = "Turn on No Reel For Instagram from Safari Settings > Extensions to hide Reels, Stories, and suggested content.";
        document.getElementsByClassName('platform-mac open-preferences')[0].innerText = "Quit and Open Safari Settings…";
    }

    document.body.classList.add(`platform-${platform}`);
}

async function show(platform, enabled, useSettingsInsteadOfPreferences) {
    localizeStaticStrings(platform, useSettingsInsteadOfPreferences);

    const { data, locale } = await loadHostStrings(getUILocale());
    renderInstructions(platform, data, locale);

    if (typeof enabled === "boolean") {
        document.body.classList.toggle(`state-on`, enabled);
        document.body.classList.toggle(`state-off`, !enabled);
    } else {
        document.body.classList.remove(`state-on`);
        document.body.classList.remove(`state-off`);
    }
}

function renderInstructions(platform, strings, locale) {
    const instructionsTitle = document.getElementById('instructionsTitle');
    const instructionsList = document.getElementById('instructionsList');
    const contactSection = document.getElementById('contactSection');

    const defaults = {
        title: "Activation guide",
        contact: {
            title: "Contact",
            description: "Questions or feedback? Email me at"
        },
        ios: {
            steps: [
                "Open Settings ▸ Safari ▸ Extensions.",
                "Enable No Reel For Instagram and allow it on the sites you browse.",
                "Reload instagram.com to apply your preferences."
            ]
        },
        mac: {
            steps: [
                "Open Safari ▸ Settings ▸ Extensions.",
                "Enable No Reel For Instagram and allow it on the sites you browse.",
                "Reload instagram.com to apply your preferences."
            ]
        }
    };

    const bundle = strings || defaults;
    const section = platform === 'ios' ? (bundle.ios || defaults.ios) : (bundle.mac || defaults.mac);

    instructionsTitle.textContent = bundle.title || defaults.title;
    instructionsTitle.dir = isRTL(locale) ? 'rtl' : 'ltr';

    instructionsList.textContent = '';
    instructionsList.dir = isRTL(locale) ? 'rtl' : 'ltr';

    (section.steps || defaults.ios.steps).forEach((step) => {
        const li = document.createElement('li');
        li.textContent = step;
        instructionsList.appendChild(li);
    });

    contactSection.textContent = '';
    const contactBundle = bundle.contact || defaults.contact;

    const contactTitle = document.createElement('h2');
    contactTitle.textContent = contactBundle.title || defaults.contact.title;
    contactTitle.dir = isRTL(locale) ? 'rtl' : 'ltr';
    contactSection.appendChild(contactTitle);

    const contactParagraph = document.createElement('p');
    contactParagraph.dir = isRTL(locale) ? 'rtl' : 'ltr';
    const descriptionText = document.createTextNode(`${contactBundle.description || defaults.contact.description} `);
    contactParagraph.appendChild(descriptionText);
    const link = document.createElement('a');
    link.href = `mailto:${EMAIL}`;
    link.textContent = EMAIL;
    contactParagraph.appendChild(link);
    contactSection.appendChild(contactParagraph);
}

function isRTL(locale) {
    return locale && locale.toLowerCase().startsWith('ar');
}

function openPreferences() {
    webkit.messageHandlers.controller.postMessage("open-preferences");
}

document.querySelector("button.open-preferences").addEventListener("click", openPreferences);
