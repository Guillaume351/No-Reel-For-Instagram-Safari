const EMAIL = "guillaume.claverie@mail.com";
const IOS_INSTALLATION_VIDEO_URL = "https://nextcloud.d1.guillaumeclaverie.com/s/tMNzFji7m9Ka8ZX/download";
let preferencesErrorMessage = "Safari couldn’t open its extension settings. Open Safari > Settings > Extensions, then choose No Reel For Instagram.";

function getUILocale() {
    if (window.noReelHostLocale) return window.noReelHostLocale;
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
        if (window.noReelHostStrings?.[candidate]) {
            return { locale: candidate, data: window.noReelHostStrings[candidate] };
        }
    }

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
    const staticIds = ['scopeNotice', 'iosIntro', 'macStateOn', 'macStateOff', 'macStateUnknown', 'openPreferences', 'preferencesStatus'];

    document.getElementById('scopeNotice').textContent = strings?.scope
        || 'Use instagram.com in Safari. No Reel does not change the Instagram app.';
    document.getElementById('iosIntro').textContent = ios.intro
        || "Enable the Safari extension to hide selected distractions on instagram.com.";
    document.getElementById('macStateOn').textContent = mac.stateOn
        || "The extension is enabled. Allow instagram.com in Safari, then check your filters on the website.";
    document.getElementById('macStateOff').textContent = mac.stateOff
        || "No Reel For Instagram is off. Enable it in Safari Settings > Extensions.";
    document.getElementById('macStateUnknown').textContent = mac.stateUnknown
        || "Turn on No Reel For Instagram in Safari Settings > Extensions.";
    document.getElementById('openPreferences').textContent = mac.openPreferences
        || "Quit and Open Safari Settings…";
    preferencesErrorMessage = mac.preferencesError
        || "Safari couldn’t open its extension settings. Open Safari > Settings > Extensions, then choose No Reel For Instagram.";
    if (document.getElementById('preferencesStatus').textContent) {
        document.getElementById('preferencesStatus').textContent = preferencesErrorMessage;
    }

    staticIds.forEach((id) => {
        document.getElementById(id).dir = isRTL(locale) ? 'rtl' : 'ltr';
    });

    document.body.classList.add(`platform-${platform}`);
    document.documentElement.lang = locale;
    document.documentElement.dir = isRTL(locale) ? 'rtl' : 'ltr';
}

let hostRenderRevision = 0;

async function show(platform, enabled, useSettingsInsteadOfPreferences) {
    const revision = ++hostRenderRevision;
    const { data, locale } = await loadHostStrings(getUILocale());
    if (revision !== hostRenderRevision) {
        return;
    }
    localizeStaticStrings(platform, data, locale);
    renderInstructions(platform, data, locale);
    renderRecoveryHelp(data, locale);

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
            body: "Use instagram.com in Safari to keep useful browsing while hiding selected distractions. No Reel does not change the Instagram app. Some native publishing and notification features may not be available on the website."
        },
        contact: {
            title: "Contact",
            description: "Questions or feedback? Email me at"
        },
        ios: {
            intro: "Enable the Safari extension to hide selected distractions on instagram.com.",
            steps: [
                "Open Settings, find Safari (under Apps on recent iOS versions), then Extensions.",
                "Enable No Reel For Instagram and allow access to instagram.com.",
                "Open instagram.com in Safari, choose your filters from the extension menu, then reload the page."
            ],
            video: {
                title: "Watch the iOS installation video",
                cta: "Open the tutorial in Safari"
            }
        },
        mac: {
            stateOn: "The extension is enabled. Allow instagram.com in Safari, then check your filters on the website.",
            stateOff: "No Reel For Instagram is off. Enable it in Safari Settings > Extensions.",
            stateUnknown: "Turn on No Reel For Instagram in Safari Settings > Extensions.",
            openPreferences: "Quit and Open Safari Settings…",
            steps: [
                "Open Safari ▸ Settings ▸ Extensions.",
                "Enable No Reel For Instagram and allow access to instagram.com.",
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

function renderRecoveryHelp(strings, locale) {
    const fallback = {
        title: "Need help?",
        scope: "No Reel works on instagram.com in Safari. It cannot change the Instagram app or other browsers.",
        steps: [
            "Nothing changes? Check that the extension is enabled and allowed on instagram.com, then reload the Safari tab.",
            "Too much is hidden? Choose Show everything from No Reel’s Safari popup. “Keep a collapsed Reel row” is kept. Undo restores your previous choices while that popup stays open, or enable filters individually.",
            "Still having trouble? Turn the extension off for instagram.com and reload to compare. Contact me with your device, Safari version, page and affected filter. Do not send passwords or private messages."
        ]
    };
    const help = strings?.recovery || fallback;
    const section = document.getElementById('recoveryHelp');
    section.dir = isRTL(locale) ? 'rtl' : 'ltr';
    document.getElementById('recoveryTitle').textContent = help.title || fallback.title;
    document.getElementById('recoveryScope').textContent = help.scope || fallback.scope;
    const list = document.getElementById('recoverySteps');
    list.textContent = '';
    (help.steps || fallback.steps).forEach((step) => {
        const item = document.createElement('li');
        item.textContent = step;
        list.appendChild(item);
    });
}

// Kept in this file (not Locales/*/host.json) so the card is localized even when
// fetch() of the local JSON files is unavailable in the app's WKWebView.
const BROWSEKIND_PROMO_STRINGS = {
    en: {
        title: "Want the same calm on YouTube and X?",
        body: "BrowseKind is a focused browser that hides Shorts, Reels and feeds on YouTube, Instagram and X — free to start.",
        button: "View on the App Store",
        note: "A separate iPhone app by the same developer. Not affiliated with YouTube, Instagram or X.",
        dismiss: "Hide this suggestion",
    },
    fr: {
        title: "Envie du même calme sur YouTube et X ?",
        body: "BrowseKind est un navigateur épuré qui masque les Shorts, les Reels et les fils sur YouTube, Instagram et X. Gratuit pour commencer.",
        button: "Voir dans l’App Store",
        note: "App iPhone distincte, du même développeur. Non affiliée à YouTube, Instagram ou X.",
        dismiss: "Masquer cette suggestion",
    },
    es: {
        title: "¿Quieres la misma calma en YouTube y X?",
        body: "BrowseKind es un navegador centrado que oculta Shorts, Reels y feeds en YouTube, Instagram y X. Gratis para empezar.",
        button: "Ver en el App Store",
        note: "App para iPhone independiente, del mismo desarrollador. Sin afiliación con YouTube, Instagram ni X.",
        dismiss: "Ocultar esta sugerencia",
    },
    de: {
        title: "Dieselbe Ruhe auch auf YouTube und X?",
        body: "BrowseKind ist ein fokussierter Browser, der Shorts, Reels und Feeds auf YouTube, Instagram und X ausblendet. Der Einstieg ist kostenlos.",
        button: "Im App Store ansehen",
        note: "Eigenständige iPhone-App vom selben Entwickler. Nicht mit YouTube, Instagram oder X verbunden.",
        dismiss: "Vorschlag ausblenden",
    },
    ar: {
        title: "هل تريد الهدوء نفسه على YouTube وX؟",
        body: "BrowseKind متصفح مركّز يُخفي Shorts وReels والخلاصات على YouTube وInstagram وX. البدء مجاني.",
        button: "عرض في App Store",
        note: "تطبيق iPhone مستقل من المطوّر نفسه. غير تابع لـ YouTube أو Instagram أو X.",
        dismiss: "إخفاء هذا الاقتراح",
    },
};

// Called by the iOS app only (iPhone, iOS 17+, not previously dismissed).
function showBrowseKindPromo() {
    const promo = document.getElementById('browseKindPromo');
    if (!promo) {
        return;
    }

    const locale = getUILocale().toLowerCase().split("-")[0];
    const strings = BROWSEKIND_PROMO_STRINGS[locale] || BROWSEKIND_PROMO_STRINGS.en;
    const dir = isRTL(locale) ? 'rtl' : 'ltr';

    document.getElementById('browseKindPromoTitle').textContent = strings.title;
    document.getElementById('browseKindPromoBody').textContent = strings.body;
    document.getElementById('browseKindPromoOpen').textContent = strings.button;
    document.getElementById('browseKindPromoNote').textContent = strings.note;
    document.getElementById('browseKindPromoDismiss').setAttribute('aria-label', strings.dismiss);

    promo.dir = dir;
    promo.hidden = false;
}

function openBrowseKind() {
    webkit.messageHandlers.controller.postMessage("open-browsekind");
}

function dismissBrowseKindPromo() {
    const promo = document.getElementById('browseKindPromo');
    if (promo) {
        promo.hidden = true;
    }
    webkit.messageHandlers.controller.postMessage("dismiss-browsekind-promo");
}

function showPreferencesError() {
    document.getElementById('preferencesStatus').textContent = preferencesErrorMessage;
}

function openPreferences() {
    document.getElementById('preferencesStatus').textContent = "";
    try {
        webkit.messageHandlers.controller.postMessage("open-preferences");
    } catch (error) {
        showPreferencesError();
    }
}

document.querySelector("button.open-preferences").addEventListener("click", openPreferences);
document.getElementById("browseKindPromoOpen")?.addEventListener("click", openBrowseKind);
document.getElementById("browseKindPromoDismiss")?.addEventListener("click", dismissBrowseKindPromo);
