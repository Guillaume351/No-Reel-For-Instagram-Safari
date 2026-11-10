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
// Product names stay in English: they are the App Store names.
const SISTER_APPS_PROMO_STRINGS = {
    en: {
        title: "Same calm on YouTube?",
        body: "No Shorts hides YouTube Shorts in Safari, the same way No Reel hides Reels.",
        button: "View No Shorts on the App Store",
        bundle: "Want all three? The Social Media : Dopamine Detox bundle includes No Shorts, No Reel and No Algorithm For X. The App Store lowers its price by what you already paid for apps in the bundle.",
        bundleButton: "View the bundle",
        note: "Separate apps by the same developer. Not affiliated with YouTube, Instagram or X.",
        dismiss: "Hide this suggestion",
    },
    fr: {
        title: "Le même calme sur YouTube ?",
        body: "No Shorts masque les Shorts YouTube dans Safari, comme No Reel masque les Reels.",
        button: "Voir No Shorts dans l’App Store",
        bundle: "Les trois ensemble ? Le pack Social Media : Dopamine Detox réunit No Shorts, No Reel et No Algorithm For X. L’App Store déduit de son prix ce que vous avez déjà payé pour les apps du pack.",
        bundleButton: "Voir le pack",
        note: "Apps distinctes, du même développeur. Non affiliées à YouTube, Instagram ou X.",
        dismiss: "Masquer cette suggestion",
    },
    es: {
        title: "¿La misma calma en YouTube?",
        body: "No Shorts oculta los Shorts de YouTube en Safari, igual que No Reel oculta los Reels.",
        button: "Ver No Shorts en el App Store",
        bundle: "¿Quieres las tres? El paquete Social Media : Dopamine Detox incluye No Shorts, No Reel y No Algorithm For X. El App Store descuenta de su precio lo que ya pagaste por las apps del paquete.",
        bundleButton: "Ver el paquete",
        note: "Apps independientes, del mismo desarrollador. Sin afiliación con YouTube, Instagram ni X.",
        dismiss: "Ocultar esta sugerencia",
    },
    de: {
        title: "Dieselbe Ruhe auf YouTube?",
        body: "No Shorts blendet YouTube Shorts in Safari aus, so wie No Reel die Reels ausblendet.",
        button: "No Shorts im App Store ansehen",
        bundle: "Alle drei? Das Paket Social Media : Dopamine Detox enthält No Shorts, No Reel und No Algorithm For X. Der App Store rechnet an, was du für Apps aus dem Paket schon bezahlt hast.",
        bundleButton: "Paket ansehen",
        note: "Eigenständige Apps vom selben Entwickler. Nicht mit YouTube, Instagram oder X verbunden.",
        dismiss: "Vorschlag ausblenden",
    },
    ar: {
        title: "الهدوء نفسه على YouTube؟",
        body: "يُخفي No Shorts مقاطع YouTube Shorts في Safari، كما يُخفي No Reel مقاطع Reels.",
        button: "عرض No Shorts في App Store",
        bundle: "هل تريد التطبيقات الثلاثة؟ تضم حزمة Social Media : Dopamine Detox كلًّا من No Shorts وNo Reel وNo Algorithm For X. يخصم App Store من سعرها ما دفعته سابقًا مقابل تطبيقات الحزمة.",
        bundleButton: "عرض الحزمة",
        note: "تطبيقات مستقلة من المطوّر نفسه. غير تابعة لـ YouTube أو Instagram أو X.",
        dismiss: "إخفاء هذا الاقتراح",
    },    ja: {
        title: "YouTubeにも同じ静けさを？",
        body: "No ShortsはSafariでYouTubeのショートを非表示にします。No Reelがリールを隠すのと同じしくみです。",
        button: "App StoreでNo Shortsを見る",
        bundle: "3つともほしいですか？Social Media : Dopamine Detoxバンドルには、No Shorts、No Reel、No Algorithm For Xが含まれます。バンドル内のアプリをすでに購入済みなら、App Storeがその支払い分を価格から差し引きます。",
        bundleButton: "バンドルを見る",
        note: "同じデベロッパによる別々のアプリです。YouTube、Instagram、Xとは提携していません。",
        dismiss: "この提案を非表示",
    },
    it: {
        title: "La stessa calma su YouTube?",
        body: "No Shorts nasconde gli Shorts di YouTube in Safari, proprio come No Reel nasconde i Reels.",
        button: "Vedi No Shorts sull’App Store",
        bundle: "Le vuoi tutte e tre? Il pacchetto Social Media : Dopamine Detox include No Shorts, No Reel e No Algorithm For X. L’App Store ne riduce il prezzo di quanto hai già pagato per le app del pacchetto.",
        bundleButton: "Vedi il pacchetto",
        note: "App distinte dello stesso sviluppatore. Non affiliate a YouTube, Instagram o X.",
        dismiss: "Nascondi questo suggerimento",
    },
    nl: {
        title: "Dezelfde rust op YouTube?",
        body: "No Shorts verbergt YouTube Shorts in Safari, net zoals No Reel Reels verbergt.",
        button: "Bekijk No Shorts in de App Store",
        bundle: "Wil je ze alle drie? De bundel Social Media : Dopamine Detox bevat No Shorts, No Reel en No Algorithm For X. De App Store verlaagt de prijs met wat je al hebt betaald voor apps uit de bundel.",
        bundleButton: "Bekijk de bundel",
        note: "Afzonderlijke apps van dezelfde ontwikkelaar. Niet gelieerd aan YouTube, Instagram of X.",
        dismiss: "Verberg deze suggestie",
    },
    tr: {
        title: "YouTube’da da aynı huzur?",
        body: "No Reel’in Reels’i gizlediği gibi, No Shorts da Safari’de YouTube Shorts’u gizler.",
        button: "No Shorts’u App Store’da görüntüle",
        bundle: "Üçünü birden mi istiyorsunuz? Social Media : Dopamine Detox paketi No Shorts, No Reel ve No Algorithm For X uygulamalarını içerir. App Store, paketteki uygulamalar için daha önce ödediğiniz tutarı paketin fiyatından düşer.",
        bundleButton: "Paketi görüntüle",
        note: "Aynı geliştiricinin ayrı uygulamalarıdır. YouTube, Instagram veya X ile bağlantılı değildir.",
        dismiss: "Bu öneriyi gizle",
    },
    pl: {
        title: "Taki sam spokój na YouTube?",
        body: "No Shorts ukrywa YouTube Shorts w Safari, tak jak No Reel ukrywa rolki.",
        button: "Zobacz No Shorts w App Store",
        bundle: "Chcesz wszystkie trzy? Pakiet Social Media : Dopamine Detox zawiera No Shorts, No Reel i No Algorithm For X. App Store obniża jego cenę o kwotę wydaną już na aplikacje z tego pakietu.",
        bundleButton: "Zobacz pakiet",
        note: "Osobne aplikacje tego samego twórcy. Niepowiązane z YouTube, Instagramem ani X.",
        dismiss: "Ukryj tę propozycję",
    },
    sv: {
        title: "Samma lugn på YouTube?",
        body: "No Shorts döljer YouTube Shorts i Safari, på samma sätt som No Reel döljer Reels.",
        button: "Visa No Shorts i App Store",
        bundle: "Vill du ha alla tre? Paketet Social Media : Dopamine Detox innehåller No Shorts, No Reel och No Algorithm For X. App Store sänker priset med det du redan har betalat för appar i paketet.",
        bundleButton: "Visa paketet",
        note: "Separata appar från samma utvecklare. Inte anknutna till YouTube, Instagram eller X.",
        dismiss: "Dölj det här förslaget",
    },
    da: {
        title: "Samme ro på YouTube?",
        body: "No Shorts skjuler YouTube Shorts i Safari, på samme måde som No Reel skjuler Reels.",
        button: "Se No Shorts i App Store",
        bundle: "Vil du have alle tre? Pakken Social Media : Dopamine Detox indeholder No Shorts, No Reel og No Algorithm For X. App Store sænker prisen med det, du allerede har betalt for apps i pakken.",
        bundleButton: "Se pakken",
        note: "Separate apps fra samme udvikler. Ikke tilknyttet YouTube, Instagram eller X.",
        dismiss: "Skjul dette forslag",
    },
    nb: {
        title: "Samme ro på YouTube?",
        body: "No Shorts skjuler YouTube Shorts i Safari, på samme måte som No Reel skjuler Reels.",
        button: "Se No Shorts i App Store",
        bundle: "Vil du ha alle tre? Pakken Social Media : Dopamine Detox inneholder No Shorts, No Reel og No Algorithm For X. App Store senker prisen med det du allerede har betalt for apper i pakken.",
        bundleButton: "Se pakken",
        note: "Separate apper fra samme utvikler. Ikke tilknyttet YouTube, Instagram eller X.",
        dismiss: "Skjul dette forslaget",
    },
    fi: {
        title: "Samaa rauhaa YouTubeen?",
        body: "No Shorts piilottaa YouTube Shorts -videot Safarissa samaan tapaan kuin No Reel piilottaa Reels-videot.",
        button: "Katso No Shorts App Storessa",
        bundle: "Haluatko kaikki kolme? Social Media : Dopamine Detox -paketissa ovat No Shorts, No Reel ja No Algorithm For X. App Store vähentää paketin hinnasta sen, mitä olet jo maksanut paketin apeista.",
        bundleButton: "Katso paketti",
        note: "Saman kehittäjän erillisiä appeja. Ei sidoksissa YouTubeen, Instagramiin tai X:ään.",
        dismiss: "Piilota tämä ehdotus",
    },
};

// Called by the native app once the first activation is behind the user (see ViewController.swift).
function showSisterAppsPromo(platform) {
    const promo = document.getElementById('sisterAppsPromo');
    if (!promo) {
        return;
    }

    const locale = (getUILocale() || "en").toLowerCase().split(/[-_]/)[0];
    const strings = SISTER_APPS_PROMO_STRINGS[locale] || SISTER_APPS_PROMO_STRINGS.en;
    const dir = isRTL(locale) ? 'rtl' : 'ltr';

    document.getElementById('sisterAppsPromoTitle').textContent = strings.title;
    document.getElementById('sisterAppsPromoBody').textContent = strings.body;
    document.getElementById('sisterAppsPromoOpen').textContent = strings.button;
    document.getElementById('sisterAppsPromoBundle').textContent = strings.bundle;
    document.getElementById('sisterAppsPromoBundleOpen').textContent = strings.bundleButton;
    document.getElementById('sisterAppsPromoNote').textContent = strings.note;
    document.getElementById('sisterAppsPromoDismiss').setAttribute('aria-label', strings.dismiss);

    // The Dopamine Detox bundle is sold on iPhone and iPad only.
    promo.dataset.platform = platform === 'mac' ? 'mac' : 'ios';
    promo.lang = SISTER_APPS_PROMO_STRINGS[locale] ? locale : 'en';
    promo.dir = dir;
    promo.hidden = false;
}

function openNoShorts() {
    webkit.messageHandlers.controller.postMessage("open-no-shorts");
}

function openSisterAppsBundle() {
    webkit.messageHandlers.controller.postMessage("open-bundle");
}

function dismissSisterAppsPromo() {
    const promo = document.getElementById('sisterAppsPromo');
    if (promo) {
        promo.hidden = true;
    }
    webkit.messageHandlers.controller.postMessage("dismiss-sister-apps-promo");
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
document.getElementById("sisterAppsPromoOpen")?.addEventListener("click", openNoShorts);
document.getElementById("sisterAppsPromoBundleOpen")?.addEventListener("click", openSisterAppsBundle);
document.getElementById("sisterAppsPromoDismiss")?.addEventListener("click", dismissSisterAppsPromo);
