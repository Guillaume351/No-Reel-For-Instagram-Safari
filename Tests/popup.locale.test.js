const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { JSDOM, VirtualConsole } = require("jsdom");
const resources = path.resolve(__dirname, "../Shared (Extension)/Resources");
const html = fs.readFileSync(path.join(resources, "popup.html"), "utf8");
const script = fs.readFileSync(path.join(resources, "popup.js"), "utf8");

async function popup(t, { bundle = "en", uiLanguage = "en", metadata = true, metadataLocale, metadataDirection, noUILanguage = false } = {}) {
    const messages = JSON.parse(fs.readFileSync(path.join(resources, "_locales", bundle, "messages.json"), "utf8"));
    const dom = new JSDOM(html, { runScripts: "outside-only", url: "safari-web-extension://no-reel/popup.html", virtualConsole: new VirtualConsole() });
    t.after(() => dom.window.close());
    const writes = [];
    dom.window.browser = {
        i18n: {
            getMessage(key) {
                if (key === "popup_locale") return metadata ? (metadataLocale ?? messages[key].message) : "";
                if (key === "popup_direction") return metadata ? (metadataDirection ?? messages[key].message) : "";
                return messages[key]?.message || "";
            },
            ...(noUILanguage ? {} : { getUILanguage: () => uiLanguage })
        },
        runtime: { async sendMessage(message) {
            if (message.type !== "getSettings") writes.push(message);
            return { ok: true, settings: {} };
        } },
        storage: { sync: { async get() { return {}; }, async set(value) { writes.push(value); } } }
    };
    dom.window.eval(script);
    await new Promise(resolve => dom.window.setTimeout(resolve, 20));
    return { doc: dom.window.document, writes, messages };
}

for (const bundle of fs.readdirSync(path.join(resources, "_locales"))) {
    test(`actual ${bundle} message bundle controls language and direction despite English UI API`, async t => {
        const { doc, writes, messages } = await popup(t, { bundle });
        assert.equal(doc.documentElement.lang, bundle);
        assert.equal(doc.documentElement.dir, bundle === "ar" ? "rtl" : "ltr");
        assert.equal(doc.querySelector("#showEverything").textContent, messages[doc.querySelector("#showEverything").getAttribute("data-i18n")].message);
        assert.equal(doc.querySelectorAll("input[type=checkbox]").length, 10);
        assert.deepEqual(writes, []);
    });
}
for (const uiLanguage of ["ar", "ar-SA", "ar_SA"]) {
    test(`missing message metadata safely recognizes Arabic UI locale ${uiLanguage}`, async t => {
        const { doc, writes } = await popup(t, { metadata: false, uiLanguage });
        assert.equal(doc.documentElement.lang, uiLanguage.toLowerCase().replace(/_/g, "-"));
        assert.equal(doc.documentElement.dir, "rtl");
        assert.deepEqual(writes, []);
    });
}
for (const uiLanguage of ["en", "fr-FR", "de_DE", "es_MX", "art", ""]) {
    test(`missing metadata uses bounded non-Arabic fallback ${JSON.stringify(uiLanguage)}`, async t => {
        const { doc } = await popup(t, { metadata: false, uiLanguage });
        assert.equal(doc.documentElement.dir, "ltr");
    });
}
test("localized Arabic metadata wins over a different system language", async t => {
    const { doc } = await popup(t, { bundle: "ar", uiLanguage: "fr-FR" });
    assert.equal(doc.documentElement.lang, "ar");
    assert.equal(doc.documentElement.dir, "rtl");
});
test("regional bundle metadata normalizes underscores", async t => {
    const { doc } = await popup(t, { bundle: "ar", metadataLocale: "ar_SA" });
    assert.equal(doc.documentElement.lang, "ar-sa");
    assert.equal(doc.documentElement.dir, "rtl");
});
test("invalid direction metadata falls back to the actual bundle language", async t => {
    const { doc } = await popup(t, { bundle: "ar", metadataDirection: "invalid" });
    assert.equal(doc.documentElement.dir, "rtl");
});
test("invalid locale metadata does not impose a direction", async t => {
    const { doc } = await popup(t, { metadataLocale: "popup_locale", metadataDirection: "rtl", uiLanguage: "en-US" });
    assert.equal(doc.documentElement.lang, "en-us");
    assert.equal(doc.documentElement.dir, "ltr");
});
test("navigator fallback works when getUILanguage is absent", async t => {
    const { doc } = await popup(t, { metadata: false, noUILanguage: true });
    assert.equal(doc.documentElement.lang, "en-us");
    assert.equal(doc.documentElement.dir, "ltr");
});

test("every packaged locale declares its own text language and direction", () => {
    for (const locale of fs.readdirSync(path.join(resources, "_locales"))) {
        const messages = JSON.parse(fs.readFileSync(path.join(resources, "_locales", locale, "messages.json"), "utf8"));
        assert.equal(messages.popup_locale.message, locale);
        assert.equal(messages.popup_direction.message, locale === "ar" ? "rtl" : "ltr");
    }
});
test("child indentation uses logical start without a physical left margin", () => {
    const css = fs.readFileSync(path.join(resources, "popup.css"), "utf8");
    assert.match(css, /margin-inline-start:\s*18px/);
    assert.doesNotMatch(css, /margin-left:\s*18px/);
});

test("every packaged locale fits App Store Connect's Safari extension limits", () => {
    for (const locale of fs.readdirSync(path.join(resources, "_locales"))) {
        const messages = JSON.parse(fs.readFileSync(path.join(resources, "_locales", locale, "messages.json"), "utf8"));
        // App Store Connect rejects the upload (error 90862) above these lengths.
        assert.ok(messages.extension_description.message.length <= 112, locale);
        assert.ok(messages.extension_name.message.length <= 75, locale);
    }
});
