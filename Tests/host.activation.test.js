const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { JSDOM, VirtualConsole } = require("jsdom");

const resources = path.resolve(__dirname, "../Shared (App)/Resources");
const html = fs.readFileSync(path.join(resources, "Base.lproj/Main.html"), "utf8");
const script = fs.readFileSync(path.join(resources, "Script.js"), "utf8");

async function host(t, language, platform = "ios", unavailable = false, nativeStrings = null, nativeLocale = null) {
    const dom = new JSDOM(html, {
        runScripts: "outside-only",
        url: "file:///app/Base.lproj/Main.html",
        virtualConsole: new VirtualConsole()
    });
    t.after(() => dom.window.close());
    const { window } = dom;
    Object.defineProperty(window.navigator, "languages", { value: [language] });
    window.HTMLMediaElement.prototype.load = () => {};
    window.localFetchCalls = 0;
    window.fetch = async (url) => {
        window.localFetchCalls += 1;
        if (unavailable) throw new Error("local resource unavailable");
        const locale = url.match(/Locales\/([^/]+)\/host.json/)[1];
        const file = path.join(resources, "Locales", locale, "host.json");
        return { ok: fs.existsSync(file), json: async () => JSON.parse(fs.readFileSync(file, "utf8")) };
    };
    if (nativeStrings) window.noReelHostStrings = nativeStrings;
    if (nativeLocale) window.noReelHostLocale = nativeLocale;
    window.eval(script);
    await window.show(platform, platform === "mac" ? true : undefined);
    return window;
}

test("French activation help explains Safari scope and recovery without a sales suggestion", async (t) => {
    const window = await host(t, "fr-FR");
    const { document } = window;
    assert.equal(document.documentElement.lang, "fr");
    assert.match(document.querySelector("#recoveryScope").textContent, /ne modifie ni l’app Instagram/);
    assert.match(document.querySelector("#recoverySteps").textContent, /Tout réafficher/);
    assert.match(document.querySelector("#recoverySteps").textContent, /autorisé/);
    assert.equal(document.querySelector("#recoveryChoice"), null);
    assert.doesNotMatch(document.querySelector("#recoveryHelp").textContent, /BrowseKind/);
    assert.equal(document.querySelector("#recoveryHelp").open, false);
});

test("Mac enabled state still asks for site access and a real filter check", async (t) => {
    const window = await host(t, "en", "mac");
    const { document } = window;
    assert.equal(document.body.classList.contains("state-on"), true);
    assert.match(document.querySelector("#macStateOn").textContent, /Allow instagram.com/);
    assert.match(document.querySelector("#macStateOn").textContent, /check your filters/);
    assert.equal(document.querySelector("#iosVideoSection").hidden, true);
});

test("Arabic help follows RTL and all shipped locales provide recovery actions", async (t) => {
    const window = await host(t, "ar");
    assert.equal(window.document.documentElement.dir, "rtl");
    assert.equal(window.document.querySelector("#recoveryHelp").dir, "rtl");
    for (const locale of fs.readdirSync(path.join(resources, "Locales"))) {
        const session = await host(t, locale);
        assert.equal(session.document.querySelectorAll("#recoverySteps li").length, 3);
        assert.ok(session.document.querySelector("#recoveryScope").textContent.includes("Safari"));
        assert.equal(session.document.querySelector("#recoveryChoice"), null);
        const strings = JSON.parse(fs.readFileSync(path.join(resources, "Locales", locale, "host.json"), "utf8"));
        assert.equal(session.document.querySelector("#scopeNotice").textContent, strings.scope);
        assert.match(strings.ios.steps[1], /instagram\.com/);
        assert.doesNotMatch(strings.wellbeing.body, /Beeper/);
    }
});

test("local JSON failure keeps English activation and recovery usable", async (t) => {
    const window = await host(t, "fr-FR", "ios", true);
    assert.match(window.document.querySelector("#scopeNotice").textContent, /does not change the Instagram app/);
    assert.match(window.document.querySelector("#recoverySteps").textContent, /Show everything/);
    assert.equal(window.document.querySelector("#recoveryChoice"), null);
});


test("native bundled strings keep French help working without local file fetch", async (t) => {
    const strings = JSON.parse(fs.readFileSync(path.join(resources, "Locales/fr/host.json"), "utf8"));
    const window = await host(t, "fr-FR", "ios", true, { fr: strings });
    assert.equal(window.document.documentElement.lang, "fr");
    assert.equal(window.document.querySelector("#recoveryTitle").textContent, "Besoin d’aide ?");
    assert.match(window.document.querySelector("#recoverySteps").textContent, /Tout réafficher/);
    assert.equal(window.localFetchCalls, 0);
});

test("an older asynchronous render cannot erase the latest Mac enabled state", async (t) => {
    const window = await host(t, "en", "mac");
    let resolveOlder;
    const strings = JSON.parse(fs.readFileSync(path.join(resources, "Locales/en/host.json"), "utf8"));
    let reads = 0;
    window.fetch = async () => {
        reads += 1;
        if (reads === 1) return new Promise((resolve) => { resolveOlder = resolve; });
        return { ok: true, json: async () => strings };
    };
    const older = window.show("mac");
    await window.show("mac", true);
    resolveOlder({ ok: true, json: async () => strings });
    await older;
    assert.equal(window.document.body.classList.contains("state-on"), true);
    assert.equal(window.document.body.classList.contains("state-off"), false);
});


test("native preferred language overrides an English WKWebView navigator without local fetch", async (t) => {
    const strings = JSON.parse(fs.readFileSync(path.join(resources, "Locales/fr/host.json"), "utf8"));
    const window = await host(t, "en-US", "ios", true, { fr: strings }, "fr-FR");
    assert.equal(window.document.documentElement.lang, "fr");
    assert.equal(window.document.querySelector("#scopeNotice").textContent, strings.scope);
    assert.equal(window.localFetchCalls, 0);
});

test("recovery help on Mac stays within setup and the host viewport permits zoom", async (t) => {
    const window = await host(t, "en", "mac");
    assert.doesNotMatch(window.document.querySelector("#recoveryHelp").textContent, /BrowseKind/);
    assert.doesNotMatch(window.document.querySelector('meta[name="viewport"]').content, /user-scalable=no/);
});

test("first activation keeps the optional promo hidden and native launch gates it", async (t) => {
    const window = await host(t, "en", "ios");
    assert.equal(window.document.querySelector("#sisterAppsPromo").hidden, true);
    const controller = fs.readFileSync(path.resolve(resources, "../ViewController.swift"), "utf8");
    const calls = controller.split("showSisterAppsPromo(").length - 1;
    const gated = controller.split("if SisterAppsPromo.shouldShow(extensionIsEnabled:").length - 1;
    assert.equal(calls, 2);
    assert.equal(gated, 2);
    assert.match(controller, /extensionIsEnabled == true \|\| ReviewRequestCoordinator\.shared\.activeDayCount >= 2/);
    assert.doesNotMatch(controller + html + script, /BrowseKind|6796664167/i);
});

test("sister apps promo points to No Shorts and the Dopamine Detox bundle on iPhone only", async (t) => {
    const ios = await host(t, "en", "ios");
    const posted = [];
    ios.webkit = { messageHandlers: { controller: { postMessage: (message) => posted.push(message) } } };
    ios.showSisterAppsPromo("ios");
    const promo = ios.document.querySelector("#sisterAppsPromo");
    assert.equal(promo.hidden, false);
    assert.equal(promo.dataset.platform, "ios");
    assert.match(promo.textContent, /No Shorts/);
    assert.match(promo.textContent, /Dopamine Detox/);
    ios.document.querySelector("#sisterAppsPromoOpen").click();
    ios.document.querySelector("#sisterAppsPromoBundleOpen").click();
    ios.document.querySelector("#sisterAppsPromoDismiss").click();
    assert.deepEqual(posted, ["open-no-shorts", "open-bundle", "dismiss-sister-apps-promo"]);
    assert.equal(promo.hidden, true);

    const mac = await host(t, "en", "mac");
    mac.showSisterAppsPromo("mac");
    assert.equal(mac.document.querySelector("#sisterAppsPromo").dataset.platform, "mac");
    const css = fs.readFileSync(path.join(resources, "Style.css"), "utf8");
    assert.match(css, /\.sister-promo\[data-platform="mac"\] \.sister-promo-ios-only \{\s*display: none;/);
});

test("every host locale has its own promo strings", async (t) => {
    const controller = fs.readFileSync(path.resolve(resources, "../ViewController.swift"), "utf8");
    const nativeList = JSON.parse(controller.match(/let hostLocales = (\[[^\]]+\])/)[1]);
    assert.deepEqual([...nativeList].sort(), fs.readdirSync(path.join(resources, "Locales")).sort());
    for (const locale of nativeList) {
        const window = await host(t, locale, "ios");
        window.showSisterAppsPromo("ios");
        const promo = window.document.querySelector("#sisterAppsPromo");
        assert.equal(promo.lang, locale, locale);
        for (const id of ["Title", "Body", "Open", "Bundle", "BundleOpen", "Note"]) {
            assert.ok(window.document.querySelector(`#sisterAppsPromo${id}`).textContent.length > 0, `${locale} ${id}`);
        }
        assert.match(promo.textContent, /No Shorts/, locale);
    }
});

test("every recovery help names the exact dormant setting shown in that popup locale", async (t) => {
    for (const locale of fs.readdirSync(path.join(resources, "Locales"))) {
        const messages = JSON.parse(fs.readFileSync(path.resolve(resources,
            `../../Shared (Extension)/Resources/_locales/${locale}/messages.json`), "utf8"));
        const setting = messages.toggle_keep_reels_collapsed_title.message;
        assert.ok(messages.restore_content_desc.message.includes(setting), locale);
        assert.ok(messages.status_restored.message.includes(setting), locale);
        const window = await host(t, locale);
        assert.ok(window.document.querySelector("#recoverySteps").textContent.includes(setting), locale);
    }
});
