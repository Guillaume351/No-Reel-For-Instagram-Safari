const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const { JSDOM, VirtualConsole } = require("jsdom");

// Execute the actual three extension scripts against two distinct storage areas.
// NRFI_RESOURCES_PATH also runs this contract on an exported candidate's resources.
// This is integration coverage, not evidence of a physical Safari session.
const resources = process.env.NRFI_RESOURCES_PATH
    || path.resolve(__dirname, "../Shared (Extension)/Resources");
const read = (file) => fs.readFileSync(path.join(resources, file), "utf8");
const popupHtml = read("popup.html");
const popupScript = read("popup.js");
const backgroundScript = read("background.js");
const contentScript = read("content.js");
const locale = JSON.parse(read("_locales/en/messages.json"));
const keys = [
    "hideReels", "hideFeedReels", "keepReelsCollapsed", "hideSearchReels", "hideExploreTab", "hideExploreRecommendations",
    "hideSuggestedPosts", "hideSponsoredPosts", "hideSuggestedUsers", "hideStories"
];
const all = (value) => Object.fromEntries(keys.map((key) => [key, value]));
const inactive = (baseline) => ({ ...all(false), keepReelsCollapsed: baseline.keepReelsCollapsed });
const homeHtml = fs.readFileSync(path.join(__dirname, "fixtures/mobile-home.html"), "utf8")
    .replace("</main>", `<section id="suggested-accounts"><h2>Suggestions pour vous</h2>
        <div><a href="/alice/">Alice</a><button>Suivre</button></div>
        <div><a href="/bob/">Bob</a><button>Suivre</button></div>
    </section></main>`);
const searchHtml = `<!doctype html><html><head></head><body><main role="main">
    <div id="results"><a id="search-reel" href="/reel/123/">Reel</a>
    <a id="search-photo" href="/p/456/">Photo</a></div>
</main></body></html>`;

function snapshot(settings) {
    return Object.fromEntries(keys.map((key) => [key, settings[key]]));
}

async function settle(window, predicate = () => true) {
    for (let attempt = 0; attempt < 25; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 20));
        if (predicate()) return;
    }
    assert.fail("extension contexts did not settle");
}

async function session(t, initialSettings, { backgroundUnavailable = false, rejectWrites = false,
    rejectSyncWrites = false, rejectSyncReads = false, withoutSync = false, localSettings = null,
    deferBackgroundReads = false } = {}) {
    const stored = { sync: { ...initialSettings }, local: { ...(localSettings || initialSettings) } };
    const storageListeners = [];
    const errors = [];
    const area = (name) => ({
        get: async (requested) => {
            if (name === "sync" && rejectSyncReads) throw new Error("test read failure");
            return Object.fromEntries(requested.map((key) => [key, stored[name][key]]));
        },
        set: async (items) => {
            if (rejectWrites || (name === "sync" && rejectSyncWrites)) throw new Error("test persistence failure");
            const changes = {};
            for (const [key, value] of Object.entries(items)) {
                if (stored[name][key] !== value) changes[key] = { oldValue: stored[name][key], newValue: value };
            }
            stored[name] = { ...stored[name], ...items };
            queueMicrotask(() => storageListeners.forEach((listener) => listener(changes, name)));
        }
    });
    const local = area("local");
    let messageListener;
    const storage = { ...(withoutSync ? {} : { sync: area("sync") }), local,
        onChanged: { addListener: (listener) => storageListeners.push(listener) } };
    let releaseBackgroundRead;
    const canonicalArea = withoutSync ? "local" : "sync";
    const backgroundStorage = { ...storage, [canonicalArea]: { ...storage[canonicalArea],
        get: async (requested) => {
            const snapshot = await storage[canonicalArea].get(requested);
            if (!deferBackgroundReads) return snapshot;
            return new Promise((resolve) => { releaseBackgroundRead = () => resolve(snapshot); });
        }
    } };
    const background = vm.createContext({
        browser: { storage: backgroundStorage, runtime: {
            onInstalled: { addListener: () => {} },
            onMessage: { addListener: (listener) => { messageListener = listener; } }
        } },
        console: { error: (...args) => errors.push(args) }
    });
    vm.runInContext(backgroundScript, background, { filename: "background.js" });
    const browserApi = {
        storage,
        runtime: { sendMessage: async (message) => {
            if (backgroundUnavailable) throw new Error("test background suspended");
            return new Promise((resolve) => messageListener(message, {}, resolve));
        } },
        i18n: {
            getUILanguage: () => "en",
            getMessage: (key) => locale[key]?.message || key
        }
    };

    function context(html, url, script) {
        const virtualConsole = new VirtualConsole();
        virtualConsole.on("jsdomError", (error) => errors.push(error));
        const dom = new JSDOM(html, { pretendToBeVisual: true, runScripts: "outside-only", url, virtualConsole });
        t.after(() => dom.window.close());
        dom.window.browser = browserApi;
        // Prevent fixture links from starting JSDOM navigation; they contain no real account.
        dom.window.document.addEventListener("click", (event) => {
            if (event.target.closest?.("a[href]")) event.preventDefault();
        }, true);
        dom.window.eval(script);
        return dom.window;
    }
    const home = context(homeHtml, "https://www.instagram.com/?variant=following", contentScript);
    const search = context(searchHtml, "https://www.instagram.com/explore/", contentScript);
    const popup = () => context(popupHtml, "safari-web-extension://candidate/popup.html", popupScript);
    const window = popup();
    await settle(window, () => !window.document.querySelector("#showEverything").disabled
        || window.document.querySelector("#status").dataset.state === "error");
    await settle(home);
    const newHome = () => context(homeHtml, "https://www.instagram.com/?variant=following", contentScript);
    return { window, home, search, popup, newHome, stored: () => snapshot(stored[withoutSync ? "local" : "sync"]),
        storedLocal: () => snapshot(stored.local), writeLocal: (items) => local.set(items), errors,
        releaseDeferredBackgroundRead: () => releaseBackgroundRead?.(),
        setRejectWrites: (value) => { rejectWrites = value; },
        setRejectSyncReads: (value) => { rejectSyncReads = value; } };
}

function displayed(window) {
    return Object.fromEntries(keys.map((key) => [key,
        window.document.querySelector(`[name="${key}"]`).checked]));
}

async function saveControl(window, key, value) {
    const control = window.document.querySelector(`[name="${key}"]`);
    assert.equal(control.disabled, false, `${key} must be available before click`);
    if (control.checked !== value) control.click();
    await settle(window, () => !window.document.querySelector("#showEverything").disabled);
}

async function restoreExactly(window, baseline) {
    // The collapsed-row preference is disabled while Home Reels are shown.
    // Temporarily enable its parent if that hidden preference must be restored.
    if (baseline.keepReelsCollapsed) {
        await saveControl(window, "hideFeedReels", true);
        await saveControl(window, "keepReelsCollapsed", true);
    }
    for (const key of keys) {
        if (key !== "hideFeedReels" && key !== "keepReelsCollapsed") {
            await saveControl(window, key, baseline[key]);
        }
    }
    await saveControl(window, "hideFeedReels", baseline.hideFeedReels);
}

function assertHomeFiltered(window) {
    const document = window.document;
    assert.equal(document.querySelector("#reels-link").dataset.nrfiHiddenNav, "true");
    assert.equal(document.querySelector("#explore-link").dataset.nrfiHiddenNav, "true");
    assert.equal(document.querySelector('[data-pagelet="story_tray"]').dataset.nrfiHiddenStories, "true");
    assert.ok(document.querySelector('[data-nrfi-hidden-feed-reel="true"]'));
    assert.ok(document.querySelector('[data-nrfi-hidden-suggested-post="true"]'));
    assert.ok(document.querySelector('[data-nrfi-hidden-sponsored-post="true"]'));
    assert.equal(document.querySelector("#suggested-accounts").dataset.nrfiHiddenUsers, "true");
    assert.equal(document.querySelector("#normal-post [data-nrfi-hidden-feed-reel]"), null);
    assert.equal(document.querySelector("#normal-video-post [data-nrfi-hidden-feed-reel]"), null);
}

function assertUnfiltered(window) {
    assert.equal(window.document.querySelector('[data-nrfi-hidden-nav="true"]'), null);
    assert.equal(window.document.querySelector('[data-nrfi-hidden-stories="true"]'), null);
    assert.equal(window.document.querySelector('[data-nrfi-hidden-feed-reel="true"]'), null);
    assert.equal(window.document.querySelector('[data-nrfi-hidden-suggested-post="true"]'), null);
    assert.equal(window.document.querySelector('[data-nrfi-hidden-sponsored-post="true"]'), null);
    assert.equal(window.document.querySelector('[data-nrfi-hidden-users="true"]'), null);
    assert.equal(window.document.querySelector('[data-nrfi-hidden-search-reel="true"]'), null);
    assert.equal(window.document.querySelector('[data-nrfi-hidden-explore-content="true"]'), null);
}

test("candidate scripts restore all eight persisted filters and both open page contexts", async (t) => {
    const baseline = all(true);
    const s = await session(t, baseline);
    assertHomeFiltered(s.home);
    assert.ok(s.search.document.querySelector('[data-nrfi-hidden-search-reel="true"]'));
    s.window.document.querySelector("#showEverything").click();
    await settle(s.window, () => !s.window.document.querySelector("#showEverything").disabled);
    assert.deepEqual(s.stored(), inactive(baseline));
    assertUnfiltered(s.home);
    assertUnfiltered(s.search);
    const reopened = s.popup();
    await settle(reopened, () => !reopened.document.querySelector("#showEverything").disabled);
    assert.deepEqual(displayed(reopened), inactive(baseline));
    await restoreExactly(reopened, baseline);
    assert.deepEqual(s.stored(), baseline);
    assertHomeFiltered(s.home);
    assert.ok(s.search.document.querySelector('[data-nrfi-hidden-search-reel="true"]'));
    const finalPopup = s.popup();
    await settle(finalPopup, () => !finalPopup.document.querySelector("#showEverything").disabled);
    assert.deepEqual(displayed(finalPopup), baseline);
    assert.deepEqual(s.errors, []);
});

test("exact restoration preserves a mixed baseline including the disabled collapsed-row preference", async (t) => {
    const baseline = { ...all(false), keepReelsCollapsed: true, hideSearchReels: true,
        hideSuggestedPosts: true, hideSuggestedUsers: true };
    const s = await session(t, baseline);
    s.window.document.querySelector("#showEverything").click();
    await settle(s.window, () => !s.window.document.querySelector("#showEverything").disabled);
    assert.deepEqual(s.stored(), inactive(baseline));
    await restoreExactly(s.window, baseline);
    assert.deepEqual(s.stored(), baseline);
    assert.deepEqual(displayed(s.window), baseline);
    assert.equal(s.window.document.querySelector('[name="keepReelsCollapsed"]').disabled, true);
    assert.equal(s.home.document.querySelector("#reels-link").dataset.nrfiHiddenNav, undefined);
    assert.equal(s.home.document.querySelector('[data-pagelet="story_tray"]').dataset.nrfiHiddenStories, undefined);
    assert.deepEqual(s.errors, []);
});

test("direct-storage fallback propagates Show everything to the actual content controllers", async (t) => {
    const baseline = all(true);
    const s = await session(t, baseline, { backgroundUnavailable: true });
    assertHomeFiltered(s.home);
    s.window.document.querySelector("#showEverything").click();
    await settle(s.window, () => !s.window.document.querySelector("#showEverything").disabled);
    assert.deepEqual(s.stored(), inactive(baseline));
    assertUnfiltered(s.home);
    assertUnfiltered(s.search);
    const reopened = s.popup();
    await settle(reopened, () => !reopened.document.querySelector("#showEverything").disabled);
    assert.deepEqual(displayed(reopened), inactive(baseline));
    assert.deepEqual(s.errors, []);
});

test("a failed real background save and failed fallback leave page filters and saved values unchanged", async (t) => {
    const baseline = all(true);
    const s = await session(t, baseline, { rejectWrites: true });
    s.window.document.querySelector("#showEverything").click();
    await settle(s.window, () => !s.window.document.querySelector("#showEverything").disabled);
    assert.deepEqual(s.stored(), baseline);
    assert.deepEqual(displayed(s.window), baseline);
    assertHomeFiltered(s.home);
    assert.equal(s.window.document.querySelector("#status").dataset.state, "error");
    assert.equal(s.errors.length, 1); // The actual background reports its rejected write.
});


test("Undo restores exact settings and both real content controllers, surviving popup reopen", async (t) => {
    const baseline = all(true);
    const s = await session(t, baseline);
    s.window.document.querySelector("#showEverything").click();
    await settle(s.window, () => !s.window.document.querySelector("#showEverything").disabled);
    assertUnfiltered(s.home);
    s.window.document.querySelector("#undoEverything").click();
    await settle(s.window, () => !s.window.document.querySelector("#showEverything").disabled);
    assert.deepEqual(s.stored(), baseline);
    assertHomeFiltered(s.home);
    assert.ok(s.search.document.querySelector('[data-nrfi-hidden-search-reel="true"]'));
    const reopened = s.popup();
    await settle(reopened, () => !reopened.document.querySelector("#showEverything").disabled);
    assert.deepEqual(displayed(reopened), baseline);
    assert.deepEqual(s.errors, []);
});

test("failed Undo leaves content unfiltered and retains the exact baseline for retry", async (t) => {
    const baseline = { ...all(false), keepReelsCollapsed: true, hideStories: true, hideSearchReels: true };
    const s = await session(t, baseline);
    s.window.document.querySelector("#showEverything").click();
    await settle(s.window, () => !s.window.document.querySelector("#showEverything").disabled);
    s.setRejectWrites(true);
    s.window.document.querySelector("#undoEverything").click();
    await settle(s.window, () => !s.window.document.querySelector("#showEverything").disabled);
    assert.deepEqual(s.stored(), inactive(baseline));
    assertUnfiltered(s.home);
    assert.equal(s.window.document.querySelector("#status").dataset.state, "error");
    s.setRejectWrites(false);
    s.window.document.querySelector("#undoEverything").click();
    await settle(s.window, () => !s.window.document.querySelector("#showEverything").disabled);
    assert.deepEqual(s.stored(), baseline);
    assert.equal(s.home.document.querySelector('[data-pagelet="story_tray"]').dataset.nrfiHiddenStories, "true");
    const reopened = s.popup();
    await settle(reopened, () => !reopened.document.querySelector("#showEverything").disabled);
    assert.deepEqual(displayed(reopened), baseline);
});


test("sync write failure never resets a distinct local store or a newly opened page", async (t) => {
    const baseline = all(true);
    const localBaseline = all(false);
    const s = await session(t, baseline, { rejectSyncWrites: true, localSettings: localBaseline });
    s.window.document.querySelector("#showEverything").click();
    await settle(s.window, () => !s.window.document.querySelector("#showEverything").disabled);
    assert.deepEqual(s.stored(), baseline);
    assert.deepEqual(s.storedLocal(), localBaseline);
    assert.equal(s.window.document.querySelector("#status").dataset.state, "error");
    assertHomeFiltered(s.home);
    const newlyOpened = s.newHome();
    await settle(newlyOpened);
    assertHomeFiltered(newlyOpened);
    assert.equal(s.window.document.querySelector("#undoEverything").hidden, true);
});

test("local-only API supports reset, exact Undo and newly opened pages", async (t) => {
    const baseline = all(true);
    const s = await session(t, baseline, { withoutSync: true });
    assertHomeFiltered(s.home);
    s.window.document.querySelector("#showEverything").click();
    await settle(s.window, () => !s.window.document.querySelector("#showEverything").disabled);
    assert.deepEqual(s.stored(), inactive(baseline));
    assertUnfiltered(s.home);
    const fresh = s.newHome();
    await settle(fresh);
    assertUnfiltered(fresh);
    s.window.document.querySelector("#undoEverything").click();
    await settle(s.window, () => !s.window.document.querySelector("#showEverything").disabled);
    assert.deepEqual(s.stored(), baseline);
    assertHomeFiltered(s.home);
    assertHomeFiltered(fresh);
    assert.deepEqual(s.errors, []);
});

test("events from a distinct unselected local store cannot override sync filters", async (t) => {
    const baseline = all(true);
    const s = await session(t, baseline, { localSettings: all(false) });
    await s.writeLocal({ hideStories: true });
    await s.writeLocal(all(false));
    await settle(s.home);
    assertHomeFiltered(s.home);
    assert.deepEqual(s.stored(), baseline);
});

test("sync read failure cannot present a distinct local baseline; Retry recovers without writing", async (t) => {
    const baseline = all(true);
    const localBaseline = all(false);
    const s = await session(t, baseline, { rejectSyncReads: true, localSettings: localBaseline });
    const retry = s.window.document.querySelector("#retrySettings");
    assert.equal(retry.hidden, false);
    assert.equal(s.window.document.querySelector("#showEverything").disabled, true);
    assert.equal(s.window.document.querySelector("#undoEverything").hidden, true);
    s.window.document.querySelector("#showEverything").click();
    assert.deepEqual(s.stored(), baseline);
    assert.deepEqual(s.storedLocal(), localBaseline);
    s.setRejectSyncReads(false);
    retry.click();
    await settle(s.window, () => !s.window.document.querySelector("#showEverything").disabled);
    assert.deepEqual(displayed(s.window), baseline);
    assert.equal(retry.hidden, true);
    assert.deepEqual(s.stored(), baseline);
    assert.deepEqual(s.storedLocal(), localBaseline);
});


test("direct popup fallback cannot be overwritten by an older background migration read", async (t) => {
    const legacy = { ...all(true) };
    delete legacy.hideFeedReels;
    delete legacy.hideExploreRecommendations;
    const s = await session(t, legacy, { backgroundUnavailable: true, deferBackgroundReads: true });
    // The message transport rejects, but a prior worker storage read may still
    // complete. Exercise the actual popup's direct-storage fallback save.
    await saveControl(s.window, "hideFeedReels", false);
    await saveControl(s.window, "hideExploreRecommendations", false);
    assert.equal(s.stored().hideFeedReels, false);
    assert.equal(s.stored().hideExploreRecommendations, false);
    s.releaseDeferredBackgroundRead();
    await settle(s.window);
    assert.equal(s.stored().hideReels, true);
    assert.equal(s.stored().hideFeedReels, false);
    assert.equal(s.stored().hideExploreTab, true);
    assert.equal(s.stored().hideExploreRecommendations, false);
    const reopened = s.popup();
    await settle(reopened, () => !reopened.document.querySelector("#showEverything").disabled);
    assert.equal(displayed(reopened).hideFeedReels, false);
    assert.equal(displayed(reopened).hideExploreRecommendations, false);
    assert.equal(s.home.document.querySelector('[data-nrfi-hidden-feed-reel="true"]'), null);
    assert.equal(s.search.document.querySelector('[data-nrfi-hidden-explore-content="true"]'), null);
});
