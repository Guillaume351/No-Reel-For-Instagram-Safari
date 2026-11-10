const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { JSDOM, VirtualConsole } = require("jsdom");

const repositoryRoot = path.resolve(__dirname, "..");
const popupHtml = fs.readFileSync(
    path.join(repositoryRoot, "Shared (Extension)/Resources/popup.html"),
    "utf8"
);
const popupScript = fs.readFileSync(
    path.join(repositoryRoot, "Shared (Extension)/Resources/popup.js"),
    "utf8"
);
const contentScript = fs.readFileSync(
    path.join(repositoryRoot, "Shared (Extension)/Resources/content.js"),
    "utf8"
);
const backgroundScript = fs.readFileSync(
    path.join(repositoryRoot, "Shared (Extension)/Resources/background.js"),
    "utf8"
);
const expectedSettingKeys = [
    "hideReels",
    "hideFeedReels",
    "keepReelsCollapsed",
    "hideSearchReels",
    "hideExploreTab",
    "hideExploreRecommendations",
    "hideSuggestedPosts",
    "hideSponsoredPosts",
    "hideSuggestedUsers",
    "hideStories"
];

function waitForPopup(window) {
    return new Promise((resolve) => window.setTimeout(resolve, 20));
}

test("popup, page script, and background expose the same settings", () => {
    const dom = new JSDOM(popupHtml);
    const checkboxNames = Array.from(dom.window.document.querySelectorAll('input[type="checkbox"]'))
        .map((control) => control.name);
    dom.window.close();

    assert.deepEqual(checkboxNames, expectedSettingKeys);
    expectedSettingKeys.forEach((key) => {
        assert.match(popupScript, new RegExp(`\\b${key}:`));
        assert.match(contentScript, new RegExp(`\\b${key}:`));
        assert.match(backgroundScript, new RegExp(`\\b${key}:`));
    });
});

test("the popup reports a settings read failure instead of silently presenting defaults", async (t) => {
    const dom = new JSDOM(popupHtml, {
        runScripts: "outside-only",
        url: "safari-web-extension://no-reel/popup.html",
        virtualConsole: new VirtualConsole()
    });
    t.after(() => dom.window.close());
    const { window } = dom;
    const unavailable = async () => {
        throw new Error("storage unavailable in test");
    };

    window.browser = {
        i18n: {
            getMessage: (key) => key,
            getUILanguage: () => "en"
        },
        runtime: {
            sendMessage: unavailable
        },
        storage: {
            sync: { get: unavailable, set: unavailable },
            local: { get: unavailable, set: unavailable }
        }
    };

    window.eval(popupScript);
    await waitForPopup(window);

    const status = window.document.querySelector("#status");
    assert.equal(status.dataset.state, "error");
    assert.equal(status.textContent, "status_load_error");
    assert.equal(window.document.querySelector("#showEverything").disabled, true);
    assert.equal(window.document.querySelector("#retrySettings").hidden, false);
    assert.equal(Array.from(window.document.querySelectorAll('input[type="checkbox"]'))
        .every((control) => control.disabled), true);
    assert.equal(
        Array.from(window.document.querySelectorAll('input[type="checkbox"]')).every((control) => control.checked),
        true
    );
});

async function recoveryPopup(t, { rejectWrites = false, rejectBackground = false, initialSettings = null } = {}) {
    const dom = new JSDOM(popupHtml, {
        runScripts: "outside-only",
        url: "safari-web-extension://no-reel/popup.html",
        virtualConsole: new VirtualConsole()
    });
    t.after(() => dom.window.close());
    const { window } = dom;
    let stored = initialSettings || Object.fromEntries(expectedSettingKeys.map((key) => [key, true]));
    const save = async (payload) => {
        if (rejectWrites) throw new Error("write rejected");
        stored = { ...stored, ...payload };
        return stored;
    };
    window.browser = {
        i18n: { getMessage: (key) => key, getUILanguage: () => "en" },
        runtime: { sendMessage: async (message) => {
            if (rejectBackground) throw new Error("background unavailable");
            if (message.type === "getSettings") return { settings: stored };
            return { settings: await save(message.payload) };
        } },
        storage: { sync: { get: async () => stored, set: save } }
    };
    window.eval(popupScript);
    await waitForPopup(window);
    return { window, stored: () => stored, setRejectWrites: (value) => { rejectWrites = value; } };
}

test("Show everything persists active filters off and a single filter can be restored", async (t) => {
    const session = await recoveryPopup(t);
    const { window } = session;
    window.document.querySelector("#showEverything").click();
    await waitForPopup(window);
    assert.equal(expectedSettingKeys.filter((key) => key !== "keepReelsCollapsed")
        .every((key) => session.stored()[key] === false), true);
    assert.equal(window.document.querySelector("#status").textContent, "status_restored");
    const reels = window.document.querySelector('[name="hideReels"]');
    reels.checked = true;
    reels.dispatchEvent(new window.Event("change", { bubbles: true }));
    await waitForPopup(window);
    assert.equal(session.stored().hideReels, true);
    assert.equal(session.stored().hideStories, false);
    assert.equal(session.stored().hideSearchReels, false);
});

test("Show everything also restores persisted settings when the background is unavailable", async (t) => {
    const session = await recoveryPopup(t, { rejectBackground: true });
    session.window.document.querySelector("#showEverything").click();
    await waitForPopup(session.window);
    assert.equal(expectedSettingKeys.filter((key) => key !== "keepReelsCollapsed")
        .every((key) => session.stored()[key] === false), true);
    assert.equal(session.window.document.querySelector("#status").dataset.state, "success");
});

test("a rejected restore keeps the last saved filters visible and reports failure", async (t) => {
    const session = await recoveryPopup(t, { rejectWrites: true });
    session.window.document.querySelector("#showEverything").click();
    await waitForPopup(session.window);
    assert.equal(Object.values(session.stored()).every(Boolean), true);
    assert.equal(Array.from(session.window.document.querySelectorAll('input[type="checkbox"]'))
        .every((control) => control.checked), true);
    assert.equal(session.window.document.querySelector("#status").dataset.state, "error");
    assert.equal(session.window.document.querySelector("#showEverything").disabled, false);
});


test("Show everything preserves the dormant Reels display choice and turning its parent on restores it", async (t) => {
    const s = await recoveryPopup(t);
    s.window.document.querySelector("#showEverything").click();
    await waitForPopup(s.window);
    assert.equal(s.stored().keepReelsCollapsed, true);
    const child = s.window.document.querySelector('[name="keepReelsCollapsed"]');
    assert.equal(child.checked, true);
    assert.equal(child.disabled, true);
    s.window.document.querySelector('[name="hideFeedReels"]').click();
    await waitForPopup(s.window);
    assert.equal(s.stored().keepReelsCollapsed, true);
    assert.equal(child.disabled, false);
});

test("Undo restores every exact mixed setting and cannot be clicked while saving", async (t) => {
    const baseline = Object.fromEntries(expectedSettingKeys.map((key, index) => [key, index % 2 === 1]));
    const s = await recoveryPopup(t, { initialSettings: baseline });
    s.window.document.querySelector("#showEverything").click();
    await waitForPopup(s.window);
    const undo = s.window.document.querySelector("#undoEverything");
    assert.equal(undo.hidden, false);
    undo.click();
    assert.equal(undo.disabled, true);
    await waitForPopup(s.window);
    assert.deepEqual(s.stored(), baseline);
    assert.equal(undo.hidden, true);
    assert.equal(s.window.document.querySelector('[name="keepReelsCollapsed"]').disabled, !baseline.hideFeedReels);
    assert.equal(s.window.document.querySelector("#status").textContent, "status_undone");
    assert.equal(s.window.document.activeElement, s.window.document.querySelector("#showEverything"));
});

test("Retry reads the exact unknown baseline before enabling any settings write", async (t) => {
    const dom = new JSDOM(popupHtml, { runScripts: "outside-only", url: "safari-web-extension://no-reel/popup.html",
        virtualConsole: new VirtualConsole() });
    t.after(() => dom.window.close());
    const { window } = dom;
    const baseline = Object.fromEntries(expectedSettingKeys.map((key, index) => [key, index % 2 === 0]));
    let unavailable = true;
    let writes = 0;
    window.browser = {
        i18n: { getMessage: (key) => key, getUILanguage: () => "en" },
        runtime: { sendMessage: async () => { throw new Error("background unavailable"); } },
        storage: { sync: {
            get: async () => { if (unavailable) throw new Error("read unavailable"); return baseline; },
            set: async () => { writes += 1; }
        } }
    };
    window.eval(popupScript);
    await waitForPopup(window);
    window.document.querySelector("#showEverything").click();
    assert.equal(writes, 0);
    const retry = window.document.querySelector("#retrySettings");
    assert.equal(retry.hidden, false);
    unavailable = false;
    retry.click();
    await waitForPopup(window);
    assert.equal(retry.hidden, true);
    assert.equal(window.document.querySelector("#showEverything").disabled, false);
    assert.deepEqual(Object.fromEntries(expectedSettingKeys.map((key) => [key,
        window.document.querySelector(`[name="${key}"]`).checked])), baseline);
    assert.equal(writes, 0);
});

test("failed Undo retains the before-reset snapshot and retries without losing current settings", async (t) => {
    const s = await recoveryPopup(t);
    const baseline = { ...s.stored() };
    s.window.document.querySelector("#showEverything").click();
    await waitForPopup(s.window);
    const off = { ...s.stored() };
    s.setRejectWrites(true);
    s.window.document.querySelector("#undoEverything").click();
    await waitForPopup(s.window);
    assert.deepEqual(s.stored(), off);
    assert.equal(s.window.document.querySelector("#status").dataset.state, "error");
    assert.equal(s.window.document.querySelector("#undoEverything").hidden, false);
    s.setRejectWrites(false);
    s.window.document.querySelector("#undoEverything").click();
    await waitForPopup(s.window);
    assert.deepEqual(s.stored(), baseline);
});

test("a previous success timeout cannot erase the persistent recovery status", async (t) => {
    const s = await recoveryPopup(t);
    const scheduled = [];
    const timeout = s.window.setTimeout.bind(s.window);
    s.window.setTimeout = (callback, delay, ...args) => {
        if (delay === 1200) { scheduled.push(callback); return 0; }
        return timeout(callback, delay, ...args);
    };
    s.window.document.querySelector('[name="hideStories"]').click();
    await waitForPopup(s.window);
    s.window.document.querySelector("#showEverything").click();
    await waitForPopup(s.window);
    scheduled.forEach((callback) => callback());
    assert.equal(s.window.document.querySelector("#status").textContent, "status_restored");
    assert.equal(s.window.document.querySelector("#undoEverything").hidden, false);
});

for (const legacy of [false, true]) {
    test(`popup inherits ${legacy} legacy combined settings without resetting other preferences`, async (t) => {
        const session = await recoveryPopup(t, { initialSettings: {
            hideReels: legacy, hideExploreTab: legacy, hideStories: false,
            hideSuggestedPosts: false, hideSponsoredPosts: false, hideSuggestedUsers: false, hideSearchReels: false
        } });
        const { document } = session.window;
        assert.equal(document.querySelector('[name="hideFeedReels"]').checked, legacy);
        assert.equal(document.querySelector('[name="hideExploreRecommendations"]').checked, legacy);
        document.querySelector('[name="hideStories"]').click();
        await waitForPopup(session.window);
        assert.equal(session.stored().hideReels, legacy);
        assert.equal(session.stored().hideFeedReels, legacy);
        assert.equal(session.stored().hideExploreTab, legacy);
        assert.equal(session.stored().hideExploreRecommendations, legacy);
        assert.equal(session.stored().hideSuggestedPosts, false);
    });
}

test("popup preserves explicit split choices and enables the collapsed row based on Home filtering", async (t) => {
    const settings = Object.fromEntries(expectedSettingKeys.map((key) => [key, false]));
    settings.hideReels = true;
    settings.hideExploreRecommendations = true;
    settings.keepReelsCollapsed = true;
    const session = await recoveryPopup(t, { initialSettings: settings });
    const { document } = session.window;
    assert.equal(document.querySelector('[name="hideFeedReels"]').checked, false);
    assert.equal(document.querySelector('[name="hideExploreTab"]').checked, false);
    assert.equal(document.querySelector('[name="hideExploreRecommendations"]').checked, true);
    assert.equal(document.querySelector('[name="keepReelsCollapsed"]').disabled, true);
    document.querySelector('[name="hideFeedReels"]').click();
    await waitForPopup(session.window);
    assert.equal(document.querySelector('[name="keepReelsCollapsed"]').disabled, false);
    assert.equal(session.stored().hideReels, true);
    assert.equal(session.stored().hideExploreTab, false);
});

test("background reads infer legacy choices without writes and explicit saves persist the complete settings", async () => {
    const vm = require("node:vm");
    const stored = { hideReels: false, hideExploreTab: false, hideStories: false };
    let listener;
    let writes = 0;
    const api = { storage: { sync: {
        get: async () => ({ ...stored }),
        set: async (items) => { writes += 1; Object.assign(stored, items); }
    } }, runtime: {
        onInstalled: { addListener() {} },
        onMessage: { addListener(callback) { listener = callback; } }
    } };
    vm.runInNewContext(backgroundScript, { browser: api, console });
    const read = await new Promise((resolve) => listener({ type: "getSettings" }, {}, resolve));
    assert.equal(read.settings.hideFeedReels, false);
    assert.equal(read.settings.hideExploreRecommendations, false);
    assert.equal(read.settings.hideStories, false);
    assert.equal(writes, 0);
    assert.deepEqual(stored, { hideReels: false, hideExploreTab: false, hideStories: false });
    const choices = Object.fromEntries(expectedSettingKeys.map((key) => [key, false]));
    choices.hideFeedReels = true;
    choices.hideExploreRecommendations = true;
    const saved = await new Promise((resolve) => listener({ type: "saveSettings", payload: choices }, {}, resolve));
    assert.equal(saved.ok, true);
    assert.equal(writes, 1);
    assert.deepEqual(stored, choices);
    const reopened = await new Promise((resolve) => listener({ type: "getSettings" }, {}, resolve));
    assert.equal(reopened.settings.hideReels, false);
    assert.equal(reopened.settings.hideFeedReels, true);
    assert.equal(reopened.settings.hideExploreTab, false);
    assert.equal(reopened.settings.hideExploreRecommendations, true);
});
