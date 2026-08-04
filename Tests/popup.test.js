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
    "keepReelsCollapsed",
    "hideSearchReels",
    "hideExploreTab",
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
    assert.equal(
        Array.from(window.document.querySelectorAll('input[type="checkbox"]')).every((control) => control.checked),
        true
    );
});
