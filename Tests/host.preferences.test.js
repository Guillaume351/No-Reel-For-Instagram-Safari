const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { JSDOM, VirtualConsole } = require("jsdom");

const resources = process.env.NRFI_HOST_RESOURCES_PATH || path.resolve(__dirname, "../Shared (App)/Resources");
const html = fs.readFileSync(path.join(resources, "Base.lproj/Main.html"), "utf8");
const script = fs.readFileSync(path.join(resources, "Script.js"), "utf8");
const style = fs.readFileSync(path.join(resources, "Style.css"), "utf8");

async function host(t, locale = "en", unavailable = false) {
    const dom = new JSDOM(html, { runScripts: "outside-only", url: "file:///app/Base.lproj/Main.html", virtualConsole: new VirtualConsole() });
    t.after(() => dom.window.close());
    const { window } = dom;
    window.HTMLMediaElement.prototype.load = () => {};
    const sheet = window.document.createElement("style");
    sheet.textContent = style;
    window.document.head.append(sheet);
    window.noReelHostLocale = locale;
    if (!unavailable) {
        window.noReelHostStrings = { [locale]: JSON.parse(fs.readFileSync(path.join(resources, "Locales", locale, "host.json"), "utf8")) };
    }
    window.fetch = async () => { throw new Error("local strings unavailable"); };
    window.nativeMessages = [];
    window.webkit = { messageHandlers: { controller: { postMessage: (message) => window.nativeMessages.push(message) } } };
    window.eval(script);
    await window.show("mac");
    return window;
}

test("Mac settings click sends the exact native request and starts without an error", async (t) => {
    const window = await host(t);
    assert.equal(window.document.querySelector("#preferencesStatus").textContent, "");
    assert.equal(window.document.querySelector("#preferencesStatus").hidden, false);
    assert.equal(window.getComputedStyle(window.document.querySelector("#preferencesStatus")).position, "absolute");
    window.document.querySelector("#openPreferences").click();
    assert.deepEqual(window.nativeMessages, ["open-preferences"]);
    assert.equal(window.document.querySelector("#preferencesStatus").textContent, "");
});

test("native settings failure exposes the local manual path accessibly in all five languages", async (t) => {
    for (const locale of ["en", "fr", "es", "de", "ar"]) {
        const window = await host(t, locale);
        const strings = window.noReelHostStrings[locale];
        const guideBefore = window.document.querySelector("#instructionsList").textContent;
        window.showPreferencesError();
        const status = window.document.querySelector("#preferencesStatus");
        assert.equal(status.hidden, false);
        assert.notEqual(window.getComputedStyle(status).display, "none");
        assert.notEqual(window.getComputedStyle(status).position, "absolute");
        assert.equal(status.textContent, strings.mac.preferencesError);
        assert.equal(status.getAttribute("role"), "status");
        assert.equal(status.getAttribute("aria-live"), "polite");
        assert.equal(status.getAttribute("aria-atomic"), "true");
        assert.equal(status.dir, locale === "ar" ? "rtl" : "ltr");
        assert.match(status.textContent, /Safari/);
        assert.match(status.textContent, /No Reel For Instagram/);
        assert.equal(window.document.querySelector("#instructionsList").textContent, guideBefore);
    }
});

test("retry clears the previous message and makes one native settings request", async (t) => {
    const window = await host(t, "fr");
    window.showPreferencesError();
    window.document.querySelector("#openPreferences").click();
    assert.equal(window.document.querySelector("#preferencesStatus").textContent, "");
    assert.deepEqual(window.nativeMessages, ["open-preferences"]);
});

test("an unavailable native bridge leaves the same helpful visible message", async (t) => {
    const window = await host(t);
    delete window.webkit;
    assert.doesNotThrow(() => window.openPreferences());
    assert.equal(window.document.querySelector("#preferencesStatus").hidden, false);
    assert.match(window.document.querySelector("#preferencesStatus").textContent, /Safari > Settings > Extensions/);
});

test("each failed retry inserts new text into the existing live region", async (t) => {
    const window = await host(t);
    const status = window.document.querySelector("#preferencesStatus");
    window.showPreferencesError();
    const firstNode = status.firstChild;
    window.openPreferences();
    assert.equal(status.childNodes.length, 0);
    window.showPreferencesError();
    assert.notEqual(status.firstChild, firstNode);
    assert.equal(status.textContent, window.noReelHostStrings.en.mac.preferencesError);
});

test("unavailable bundled strings retain the English manual settings fallback", async (t) => {
    const window = await host(t, "fr", true);
    window.showPreferencesError();
    assert.equal(window.document.querySelector("#preferencesStatus").textContent,
        "Safari couldn’t open its extension settings. Open Safari > Settings > Extensions, then choose No Reel For Instagram.");
});
