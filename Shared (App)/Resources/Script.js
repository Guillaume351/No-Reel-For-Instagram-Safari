const EMAIL = "guillaume.claverie@mail.com";
const IOS_INSTALLATION_VIDEO_URL = "https://nextcloud.d1.guillaumeclaverie.com/s/tMNzFji7m9Ka8ZX/download";

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

function localizeStaticStrings(platform, strings, locale) {
    const ios = strings?.ios || {};
    const mac = strings?.mac || {};
    const staticIds = ['iosIntro', 'macStateOn', 'macStateOff', 'macStateUnknown', 'openPreferences'];

    document.getElementById('iosIntro').textContent = ios.intro
        || "Enable the Safari extension to hide selected distractions on instagram.com.";
    document.getElementById('macStateOn').textContent = mac.stateOn
        || "No Reel For Instagram is active. Choose what to hide from its Safari toolbar button.";
    document.getElementById('macStateOff').textContent = mac.stateOff
        || "No Reel For Instagram is off. Enable it in Safari Settings > Extensions.";
    document.getElementById('macStateUnknown').textContent = mac.stateUnknown
        || "Turn on No Reel For Instagram in Safari Settings > Extensions.";
    document.getElementById('openPreferences').textContent = mac.openPreferences
        || "Quit and Open Safari Settings…";

    staticIds.forEach((id) => {
        document.getElementById(id).dir = isRTL(locale) ? 'rtl' : 'ltr';
    });

    document.body.classList.add(`platform-${platform}`);
}

async function show(platform, enabled, useSettingsInsteadOfPreferences) {
    const { data, locale } = await loadHostStrings(getUILocale());
    localizeStaticStrings(platform, data, locale);
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
    const wellbeingSection = document.getElementById('wellbeingSection');
    const wellbeingTitle = document.getElementById('wellbeingTitle');
    const wellbeingBody = document.getElementById('wellbeingBody');
    const contactSection = document.getElementById('contactSection');
    const iosVideoSection = document.getElementById('iosVideoSection');

    const defaults = {
        title: "Activation guide",
        wellbeing: {
            title: "Reduce unintended screen time",
            body: "No Reel For Instagram is a Safari extension for Instagram Web. To reduce unintended screen time, the most effective setup is to uninstall the Instagram app, use instagram.com in Safari, and use an app like Beeper (or an equivalent) to keep message notifications."
        },
        contact: {
            title: "Contact",
            description: "Questions or feedback? Email me at"
        },
        ios: {
            intro: "Enable the Safari extension to hide selected distractions on instagram.com.",
            steps: [
                "Open Settings ▸ Safari ▸ Extensions.",
                "Enable No Reel For Instagram and allow it on the sites you browse.",
                "Reload instagram.com to apply your preferences."
            ],
            video: {
                title: "Watch the iOS installation video",
                cta: "Open the tutorial in Safari"
            }
        },
        mac: {
            stateOn: "No Reel For Instagram is active. Choose what to hide from its Safari toolbar button.",
            stateOff: "No Reel For Instagram is off. Enable it in Safari Settings > Extensions.",
            stateUnknown: "Turn on No Reel For Instagram in Safari Settings > Extensions.",
            openPreferences: "Quit and Open Safari Settings…",
            steps: [
                "Open Safari ▸ Settings ▸ Extensions.",
                "Enable No Reel For Instagram and allow it on the sites you browse.",
                "Reload instagram.com to apply your preferences."
            ]
        }
    };

    const bundle = strings || defaults;
    const section = platform === 'ios' ? (bundle.ios || defaults.ios) : (bundle.mac || defaults.mac);

    const rtl = isRTL(locale);

    instructionsTitle.textContent = bundle.title || defaults.title;
    instructionsTitle.dir = rtl ? 'rtl' : 'ltr';

    instructionsList.textContent = '';
    instructionsList.dir = rtl ? 'rtl' : 'ltr';

    (section.steps || defaults.ios.steps).forEach((step) => {
        const li = document.createElement('li');
        li.textContent = step;
        instructionsList.appendChild(li);
    });

    const wellbeingBundle = bundle.wellbeing || defaults.wellbeing;
    if (wellbeingSection && wellbeingTitle && wellbeingBody) {
        wellbeingSection.hidden = false;
        wellbeingTitle.textContent = wellbeingBundle.title || defaults.wellbeing.title;
        wellbeingBody.textContent = wellbeingBundle.body || defaults.wellbeing.body;
        wellbeingTitle.dir = rtl ? 'rtl' : 'ltr';
        wellbeingBody.dir = rtl ? 'rtl' : 'ltr';
    }

    contactSection.textContent = '';
    const contactBundle = bundle.contact || defaults.contact;

    const contactTitle = document.createElement('h2');
    contactTitle.textContent = contactBundle.title || defaults.contact.title;
    contactTitle.dir = rtl ? 'rtl' : 'ltr';
    contactSection.appendChild(contactTitle);

    const contactParagraph = document.createElement('p');
    contactParagraph.dir = rtl ? 'rtl' : 'ltr';
    const descriptionText = document.createTextNode(`${contactBundle.description || defaults.contact.description} `);
    contactParagraph.appendChild(descriptionText);
    const link = document.createElement('a');
    link.href = `mailto:${EMAIL}`;
    link.textContent = EMAIL;
    contactParagraph.appendChild(link);
    contactSection.appendChild(contactParagraph);

    if (iosVideoSection) {
        if (platform === 'ios') {
            const videoBundle = section.video || defaults.ios.video;
            const titleElement = document.getElementById('iosVideoTitle');
            const fallbackParagraph = iosVideoSection.querySelector('.video-fallback');
            const linkElement = document.getElementById('iosVideoLink');
            const sourceElement = document.getElementById('iosVideoSource');
            const videoElement = document.getElementById('iosInstallationVideo');

            iosVideoSection.hidden = false;

            if (titleElement) {
                titleElement.textContent = videoBundle?.title || defaults.ios.video.title;
                titleElement.dir = rtl ? 'rtl' : 'ltr';
            }

            if (fallbackParagraph instanceof HTMLElement) {
                fallbackParagraph.dir = rtl ? 'rtl' : 'ltr';
            }

            if (linkElement) {
                linkElement.href = IOS_INSTALLATION_VIDEO_URL;
                linkElement.textContent = videoBundle?.cta || defaults.ios.video.cta;
                linkElement.dir = rtl ? 'rtl' : 'ltr';
            }

            if (sourceElement && sourceElement.getAttribute('src') !== IOS_INSTALLATION_VIDEO_URL) {
                sourceElement.setAttribute('src', IOS_INSTALLATION_VIDEO_URL);
                videoElement?.load();
            }
        } else {
            iosVideoSection.hidden = true;
        }
    }
}

function isRTL(locale) {
    return locale && locale.toLowerCase().startsWith('ar');
}

function openPreferences() {
    webkit.messageHandlers.controller.postMessage("open-preferences");
}

document.querySelector("button.open-preferences").addEventListener("click", openPreferences);
