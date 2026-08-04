const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { JSDOM, VirtualConsole } = require("jsdom");

const repositoryRoot = path.resolve(__dirname, "..");
const contentScript = fs.readFileSync(
    path.join(repositoryRoot, "Shared (Extension)/Resources/content.js"),
    "utf8"
);
const mobileHomeFixture = fs.readFileSync(
    path.join(__dirname, "fixtures/mobile-home.html"),
    "utf8"
);
const settingKeys = [
    "hideReels",
    "keepReelsCollapsed",
    "hideSearchReels",
    "hideExploreTab",
    "hideSuggestedPosts",
    "hideSponsoredPosts",
    "hideSuggestedUsers",
    "hideStories"
];

function settingsWith(overrides = {}) {
    return Object.fromEntries(settingKeys.map((key) => [key, Boolean(overrides[key])]));
}

function waitForObservers(window) {
    return new Promise((resolve) => window.setTimeout(resolve, 20));
}

async function loadContentScript({
    html = mobileHomeFixture,
    url = "https://www.instagram.com/?variant=following",
    settings = settingsWith(),
    cleanExistingMarkers = false,
    suppressDOMContentLoaded = false,
    runtimeSendMessage = null,
    sessionStorage = {}
} = {}) {
    const storageListeners = [];
    const virtualConsole = new VirtualConsole();
    const unexpectedErrors = [];
    virtualConsole.on("jsdomError", (error) => unexpectedErrors.push(error));

    const dom = new JSDOM(html, {
        pretendToBeVisual: true,
        runScripts: "outside-only",
        url,
        virtualConsole
    });
    const { window } = dom;
    const storedSettings = { ...settings };
    const nativeSetTimeout = window.setTimeout.bind(window);
    window.setTimeout = (callback, delay = 0, ...args) => (
        nativeSetTimeout(callback, Math.min(Number(delay) || 0, 10), ...args)
    );
    // JSDOM schedules anchor navigation after HTMLElement.click(). Prevent that
    // browser-only side effect so closing a completed test cannot leave a late
    // navigation task reading a disposed window.
    window.document.addEventListener("click", (event) => {
        if (event.target instanceof window.Element && event.target.closest("a[href]")) {
            event.preventDefault();
        }
    }, true);
    Object.entries(sessionStorage).forEach(([key, value]) => {
        window.sessionStorage.setItem(key, String(value));
    });

    if (suppressDOMContentLoaded) {
        const originalAddEventListener = window.document.addEventListener.bind(window.document);
        Object.defineProperty(window.document, "readyState", {
            configurable: true,
            get: () => "loading"
        });
        window.document.addEventListener = (type, listener, options) => {
            if (type !== "DOMContentLoaded") {
                originalAddEventListener(type, listener, options);
            }
        };
    }

    if (cleanExistingMarkers) {
        window.document.querySelectorAll('[id^="nrfi-"]').forEach((element) => element.remove());
        window.document.querySelectorAll("*").forEach((element) => {
            Array.from(element.attributes).forEach((attribute) => {
                if (attribute.name.startsWith("data-nrfi-")) {
                    element.removeAttribute(attribute.name);
                }
            });
        });
    }

    window.browser = {
        runtime: {
            sendMessage: runtimeSendMessage || (async (message) => {
                if (message?.type === "getSettings") {
                    return { ok: true, settings: { ...storedSettings } };
                }
                return { ok: true };
            })
        },
        storage: {
            sync: {
                get: async () => ({ ...storedSettings })
            },
            local: {
                get: async () => ({ ...storedSettings })
            },
            onChanged: {
                addListener: (listener) => storageListeners.push(listener)
            }
        }
    };

    window.eval(contentScript);
    await waitForObservers(window);

    return {
        dom,
        unexpectedErrors,
        async changeSetting(key, value) {
            storedSettings[key] = value;
            storageListeners.forEach((listener) => listener({
                [key]: { newValue: value }
            }, "sync"));
            await waitForObservers(window);
        }
    };
}

function hiddenChild(document, articleId, attribute) {
    return document.querySelector(`#${articleId} > [${attribute}="true"]`);
}

test("all mobile Home filters match the captured Instagram DOM shapes", async (t) => {
    const session = await loadContentScript({
        settings: settingsWith({
            hideReels: true,
            keepReelsCollapsed: true,
            hideExploreTab: true,
            hideSuggestedPosts: true,
            hideSponsoredPosts: true,
            hideStories: true
        })
    });
    t.after(() => session.dom.window.close());
    const { document } = session.dom.window;

    assert.equal(document.querySelector("#reels-link").dataset.nrfiHiddenNav, "true");
    assert.equal(document.querySelector("#explore-link").dataset.nrfiHiddenNav, "true");
    assert.equal(document.querySelector("#mobile-bottom-navigation").dataset.nrfiMobileNav, "true");
    assert.equal(document.querySelector("#reel-audio").dataset.nrfiHiddenNav, undefined);
    const navStyle = document.getElementById("nrfi-nav-style").textContent;
    assert.match(navStyle, />\s*:not\(\[data-nrfi-hidden-nav="true"\]\)/);
    assert.match(navStyle, /a:not\(\[data-nrfi-hidden-nav="true"\]\)/);
    assert.match(navStyle, /\[data-nrfi-mobile-nav="true"\]\s+\[data-nrfi-hidden-nav="true"\]\s*\{\s*display:\s*none\s*!important/);
    assert.equal(document.querySelector('[data-pagelet="story_tray"]').dataset.nrfiHiddenStories, "true");
    const collapsedReel = hiddenChild(document, "suggested-reel", "data-nrfi-hidden-feed-reel");
    assert.ok(collapsedReel);
    assert.equal(collapsedReel.dataset.nrfiFeedContentHidden, "true");
    assert.equal(collapsedReel.dataset.nrfiFeedPlaceholderMode, "collapsed");
    assert.match(collapsedReel.querySelector('[data-nrfi-feed-summary="true"]').textContent, /Reel from creator/);
    assert.equal(
        collapsedReel.querySelector('[data-nrfi-feed-summary-button="true"]').textContent,
        "Show anyway"
    );
    assert.ok(hiddenChild(document, "suggested-reel", "data-nrfi-hidden-suggested-post"));
    assert.ok(hiddenChild(document, "suggested-photo", "data-nrfi-hidden-suggested-post"));
    assert.ok(hiddenChild(document, "sponsored-post", "data-nrfi-hidden-sponsored-post"));
    assert.equal(
        hiddenChild(document, "suggested-photo", "data-nrfi-hidden-suggested-post")
            .dataset.nrfiFeedPlaceholderMode,
        "compact"
    );
    assert.equal(session.dom.window.getComputedStyle(collapsedReel).display, "block");
    assert.equal(session.dom.window.getComputedStyle(collapsedReel).height, "48px");
    assert.equal(document.querySelector("#normal-post > [data-nrfi-hidden-suggested-post]"), null);
    assert.equal(document.querySelector("#normal-video-post > [data-nrfi-hidden-feed-reel]"), null);
    assert.equal(document.querySelector("#for-you-control").dataset.nrfiHiddenTab, "true");
    [
        "nrfi-nav-style",
        "nrfi-feed-placeholder-style",
        "nrfi-feed-reels-style",
        "nrfi-suggested-posts-style",
        "nrfi-sponsored-posts-style",
        "nrfi-stories-style"
    ].forEach((styleId) => assert.ok(document.getElementById(styleId)));
    assert.doesNotMatch(document.getElementById("nrfi-feed-placeholder-style").textContent, /35vh/);
    assert.match(document.getElementById("nrfi-feed-placeholder-style").textContent, /height:\s*48px/);
    assert.deepEqual(session.unexpectedErrors, []);
});

test("filtering starts before DOMContentLoaded without waiting for the background worker", async (t) => {
    const session = await loadContentScript({
        suppressDOMContentLoaded: true,
        runtimeSendMessage: () => new Promise(() => {}),
        settings: settingsWith({ hideReels: true, hideStories: true })
    });
    t.after(() => session.dom.window.close());
    const { document } = session.dom.window;

    assert.equal(document.documentElement.dataset.nrfiReady, "true");
    assert.ok(hiddenChild(document, "suggested-reel", "data-nrfi-hidden-feed-reel"));
    assert.equal(document.querySelector('[data-pagelet="story_tray"]').dataset.nrfiHiddenStories, "true");
});

test("reinjecting the content script is idempotent and keeps one navigation owner", async (t) => {
    const session = await loadContentScript({
        settings: settingsWith({ hideReels: true, hideExploreTab: true })
    });
    t.after(() => session.dom.window.close());
    const { window } = session.dom;
    const { document } = window;

    assert.doesNotThrow(() => window.eval(contentScript));
    await waitForObservers(window);

    assert.equal(document.querySelector("#reels-link").dataset.nrfiHiddenNavCount, "1");
    assert.equal(document.querySelector("#explore-link").dataset.nrfiHiddenNavCount, "1");
    assert.equal(document.querySelectorAll("#nrfi-nav-style").length, 1);
});

test("a successful Following navigation clears the redirect loop guard", async (t) => {
    const redirectGuardKey = "nrfi-following-redirect-attempted";
    const session = await loadContentScript({
        settings: settingsWith({ hideSuggestedPosts: true }),
        sessionStorage: { [redirectGuardKey]: "true" }
    });
    t.after(() => session.dom.window.close());

    assert.equal(session.dom.window.sessionStorage.getItem(redirectGuardKey), null);
});

test("each Home filter can be disabled and restores only its own markers", async (t) => {
    const session = await loadContentScript({
        settings: settingsWith({
            hideReels: true,
            hideSuggestedPosts: true,
            hideSponsoredPosts: true
        })
    });
    t.after(() => session.dom.window.close());
    const { document } = session.dom.window;

    await session.changeSetting("hideSponsoredPosts", false);
    assert.equal(document.querySelector("#sponsored-post > [data-nrfi-hidden-sponsored-post]"), null);
    assert.ok(hiddenChild(document, "suggested-photo", "data-nrfi-hidden-suggested-post"));
    assert.equal(document.querySelector("#suggested-photo").dataset.nrfiFeedPlaceholder, "true");

    await session.changeSetting("hideSuggestedPosts", false);
    assert.equal(document.querySelector("#suggested-photo > [data-nrfi-hidden-suggested-post]"), null);
    assert.ok(hiddenChild(document, "suggested-reel", "data-nrfi-hidden-feed-reel"));
    assert.equal(document.querySelector("#suggested-reel").dataset.nrfiFeedPlaceholder, "true");

    await session.changeSetting("hideReels", false);
    assert.equal(document.querySelector("#suggested-reel > [data-nrfi-hidden-feed-reel]"), null);
    assert.equal(document.querySelector("#suggested-reel").dataset.nrfiFeedPlaceholder, undefined);
    assert.equal(document.querySelector("#reels-link").dataset.nrfiHiddenNav, undefined);
});

test("navigation and Stories toggles restore independently", async (t) => {
    const session = await loadContentScript({
        settings: settingsWith({ hideReels: true, hideExploreTab: true, hideStories: true })
    });
    t.after(() => session.dom.window.close());
    const { document } = session.dom.window;

    await session.changeSetting("hideExploreTab", false);
    assert.equal(document.querySelector("#explore-link").dataset.nrfiHiddenNav, undefined);
    assert.equal(document.querySelector("#reels-link").dataset.nrfiHiddenNav, "true");
    assert.equal(document.querySelector('[data-pagelet="story_tray"]').dataset.nrfiHiddenStories, "true");

    await session.changeSetting("hideStories", false);
    assert.equal(document.querySelector('[data-pagelet="story_tray"]').dataset.nrfiHiddenStories, undefined);
    assert.equal(document.querySelector("#reels-link").dataset.nrfiHiddenNav, "true");
});

test("desktop Search buttons with an SVG label are hidden and restored", async (t) => {
    const html = `<!doctype html><html><head></head><body>
        <div id="desktop-navigation">
            <a href="/">Home</a>
            <div id="search-button" role="button" tabindex="0">
                <svg aria-label="Rechercher"><title>Rechercher</title></svg>
            </div>
            <a href="/reels/">Reels</a>
            <a href="/direct/inbox/">Messages</a>
        </div>
        <main><article><button id="article-search"><svg aria-label="Rechercher"></svg></button></article></main>
    </body></html>`;
    const session = await loadContentScript({
        html,
        settings: settingsWith({ hideExploreTab: true })
    });
    t.after(() => session.dom.window.close());
    const { document } = session.dom.window;

    assert.equal(document.querySelector("#search-button").dataset.nrfiHiddenNav, "true");
    assert.equal(session.dom.window.getComputedStyle(document.querySelector("#search-button")).display, "none");
    assert.equal(document.querySelector("#article-search").dataset.nrfiHiddenNav, undefined);

    await session.changeSetting("hideExploreTab", false);
    assert.equal(document.querySelector("#search-button").dataset.nrfiHiddenNav, undefined);
});

test("late mobile feed insertions are filtered after Instagram hydration", async (t) => {
    const session = await loadContentScript({
        settings: settingsWith({
            hideReels: true,
            hideSuggestedPosts: true,
            hideSponsoredPosts: true
        })
    });
    t.after(() => session.dom.window.close());
    const { document } = session.dom.window;
    const article = document.createElement("article");
    article.id = "late-suggested-reel";
    article.innerHTML = `
        <div>
            <span>Suggestions pour vous</span>
            <a href="/latecreator/reel/late-1/">Reel tardif</a>
        </div>
    `;
    document.querySelector("main").appendChild(article);
    await waitForObservers(session.dom.window);

    assert.ok(hiddenChild(document, "late-suggested-reel", "data-nrfi-hidden-feed-reel"));
    assert.ok(hiddenChild(document, "late-suggested-reel", "data-nrfi-hidden-suggested-post"));
});

test("late Reel hydration never rewrites the user's scroll position", async (t) => {
    const session = await loadContentScript({
        html: "<!doctype html><html><head></head><body><main></main></body></html>",
        settings: settingsWith({ hideReels: true, keepReelsCollapsed: true })
    });
    t.after(() => session.dom.window.close());
    const { document } = session.dom.window;
    let scrollTop = 2000;
    let scrollTopWrites = 0;
    Object.defineProperty(document.documentElement, "scrollTop", {
        configurable: true,
        get() {
            return scrollTop;
        },
        set(value) {
            scrollTopWrites += 1;
            scrollTop = value;
        }
    });

    for (let index = 0; index < 3; index += 1) {
        const article = document.createElement("article");
        article.id = `late-scroll-reel-${index}`;
        article.innerHTML = `<div><a href="/creator/p/late-scroll-${index}/">Publication</a></div>`;
        document.querySelector("main").appendChild(article);
        await waitForObservers(session.dom.window);

        article.getBoundingClientRect = () => {
            const height = article.dataset.nrfiFeedPlaceholder === "true" ? 48 : 600;
            return {
                x: 0,
                y: -200,
                top: -200,
                right: 440,
                bottom: -200 + height,
                left: 0,
                width: 440,
                height,
                toJSON() {}
            };
        };

        article.querySelector("a").setAttribute("href", `/creator/reel/late-scroll-${index}/`);
        await waitForObservers(session.dom.window);

        assert.ok(hiddenChild(document, article.id, "data-nrfi-hidden-feed-reel"));
        assert.equal(article.dataset.nrfiFeedPlaceholderMode, "collapsed");

        article.remove();
        await waitForObservers(session.dom.window);
    }

    assert.equal(document.documentElement.scrollTop, 2000);
    assert.equal(scrollTopWrites, 0);
    assert.match(
        document.getElementById("nrfi-feed-placeholder-style").textContent,
        /html\[data-nrfi-feed-placeholders-active="true"\]\s*\{[^}]*overflow-anchor:\s*none/s
    );
    assert.equal(document.documentElement.hasAttribute("data-nrfi-feed-placeholders-active"), false);
    assert.match(
        document.getElementById("nrfi-feed-placeholder-style").textContent,
        /content-visibility:\s*visible/
    );
});

test("late Reel hydration below the viewport does not adjust the current scroll position", async (t) => {
    const session = await loadContentScript({
        settings: settingsWith({ hideReels: true, keepReelsCollapsed: true })
    });
    t.after(() => session.dom.window.close());
    const { document } = session.dom.window;
    const article = document.createElement("article");
    article.innerHTML = `<div><a href="/creator/p/below-viewport/">Publication</a></div>`;
    document.querySelector("main").appendChild(article);
    await waitForObservers(session.dom.window);

    Object.defineProperty(document.documentElement, "scrollTop", {
        configurable: true,
        writable: true,
        value: 800
    });
    article.getBoundingClientRect = () => {
        const height = article.dataset.nrfiFeedPlaceholder === "true" ? 48 : 600;
        return {
            x: 0,
            y: 1200,
            top: 1200,
            right: 440,
            bottom: 1200 + height,
            left: 0,
            width: 440,
            height,
            toJSON() {}
        };
    };

    article.querySelector("a").setAttribute("href", "/creator/reel/below-viewport/");
    await waitForObservers(session.dom.window);

    assert.equal(document.documentElement.scrollTop, 800);
    assert.equal(article.getBoundingClientRect().height, 48);
});

test("a recycled Reel keeps stable geometry while its permalink is temporarily absent", async (t) => {
    const session = await loadContentScript({
        html: "<!doctype html><html><head></head><body><main></main></body></html>",
        settings: settingsWith({ hideReels: true, keepReelsCollapsed: true })
    });
    t.after(() => session.dom.window.close());
    const { document } = session.dom.window;
    let scrollTop = 1200;
    let scrollTopWrites = 0;
    Object.defineProperty(document.documentElement, "scrollTop", {
        configurable: true,
        get: () => scrollTop,
        set(value) {
            scrollTopWrites += 1;
            scrollTop = value;
        }
    });

    const article = document.createElement("article");
    article.id = "recycled-reel";
    article.innerHTML = `<div><a href="/creator/reel/recycled/">Reel</a></div>`;
    document.querySelector("main").appendChild(article);
    await waitForObservers(session.dom.window);

    const permalink = article.querySelector("a");
    assert.equal(article.dataset.nrfiFeedPlaceholderMode, "collapsed");
    permalink.removeAttribute("href");
    await waitForObservers(session.dom.window);

    assert.equal(article.dataset.nrfiFeedPlaceholderMode, "collapsed");
    assert.ok(hiddenChild(document, "recycled-reel", "data-nrfi-hidden-feed-reel"));
    assert.equal(document.documentElement.scrollTop, 1200);
    assert.equal(scrollTopWrites, 0);

    permalink.setAttribute("href", "/creator/p/recycled-as-photo/");
    await waitForObservers(session.dom.window);

    assert.equal(article.dataset.nrfiFeedPlaceholder, undefined);
    assert.equal(document.querySelector("#recycled-reel > [data-nrfi-hidden-feed-reel]"), null);
    assert.equal(document.documentElement.scrollTop, 1200);
    assert.equal(scrollTopWrites, 0);
});

test("Responsive Design plural Reel permalinks are filtered without matching audio links", async (t) => {
    const html = `<!doctype html><html><head></head><body><main role="main">
        <article id="responsive-reel"><div>
            <a href="/reels/responsive-1/">Responsive Reel</a>
            <a href="/reels/audio/12345/">Original audio</a>
        </div></article>
        <article id="audio-only"><div><a href="/reels/audio/67890/">Original audio</a></div></article>
    </main></body></html>`;
    const session = await loadContentScript({
        html,
        settings: settingsWith({ hideReels: true })
    });
    t.after(() => session.dom.window.close());
    const { document } = session.dom.window;

    assert.ok(hiddenChild(document, "responsive-reel", "data-nrfi-hidden-feed-reel"));
    assert.equal(document.querySelector("#audio-only > [data-nrfi-hidden-feed-reel]"), null);
});

test("large synchronous feed hydration is processed with a linear query budget", async (t) => {
    const session = await loadContentScript({
        settings: settingsWith({
            hideReels: true,
            hideSuggestedPosts: true,
            hideSponsoredPosts: true
        })
    });
    t.after(() => session.dom.window.close());
    const { document, Element } = session.dom.window;
    const originalQuerySelectorAll = Element.prototype.querySelectorAll;
    let queryCount = 0;
    Element.prototype.querySelectorAll = function (...args) {
        queryCount += 1;
        return originalQuerySelectorAll.apply(this, args);
    };

    const fragment = document.createDocumentFragment();
    for (let index = 0; index < 100; index += 1) {
        const article = document.createElement("article");
        const kind = index % 2 === 0 ? "reel" : "p";
        const marker = index % 5 === 0 ? "<span>Suggestions pour vous</span>" : "";
        article.innerHTML = `<div>${marker}<a href="/creator${index}/${kind}/item${index}/">Item</a></div>`;
        fragment.appendChild(article);
    }
    document.querySelector("main").appendChild(fragment);
    await waitForObservers(session.dom.window);

    assert.equal(document.querySelectorAll('[data-nrfi-hidden-feed-reel="true"]').length >= 50, true);
    t.diagnostic(`querySelectorAll calls for 100 articles: ${queryCount}`);
    assert.equal(queryCount < 2500, true, `expected fewer than 2500 queries, received ${queryCount}`);
});

test("Search and Explore hide profile-prefixed Reel cards but keep photo cards", async (t) => {
    const html = `<!doctype html><html><head></head><body><main role="main">
        <div id="grid">
            <div id="reel-card"><a href="/creator/reel/abc/">Reel</a></div>
            <div id="photo-card"><a href="/creator/p/def/">Photo</a></div>
        </div>
    </main></body></html>`;
    const session = await loadContentScript({
        html,
        url: "https://www.instagram.com/explore/",
        settings: settingsWith({ hideSearchReels: true })
    });
    t.after(() => session.dom.window.close());
    const { document } = session.dom.window;

    assert.equal(document.querySelector("#reel-card").dataset.nrfiHiddenSearchReel, "true");
    assert.equal(document.querySelector("#photo-card").dataset.nrfiHiddenSearchReel, undefined);

    await session.changeSetting("hideSearchReels", false);
    assert.equal(document.querySelector("#reel-card").dataset.nrfiHiddenSearchReel, undefined);
});

test("a collapsed Reel keeps only a compact author row and can be revealed once", async (t) => {
    const session = await loadContentScript({
        settings: settingsWith({ hideReels: true, keepReelsCollapsed: true })
    });
    t.after(() => session.dom.window.close());
    const { document } = session.dom.window;
    const article = document.querySelector("#suggested-reel");
    const target = article.firstElementChild;
    const video = article.querySelector("video");

    assert.equal(target.dataset.nrfiFeedPlaceholderMode, "collapsed");
    assert.equal(session.dom.window.getComputedStyle(video).display, "none");
    target.querySelector('[data-nrfi-feed-summary-button="true"]').click();
    await waitForObservers(session.dom.window);

    assert.equal(article.dataset.nrfiFeedRevealed, "true");
    assert.equal(target.dataset.nrfiHiddenFeedReel, undefined);
    assert.equal(target.dataset.nrfiFeedContentHidden, undefined);
    assert.equal(target.querySelector('[data-nrfi-feed-summary="true"]'), null);

    article.appendChild(document.createElement("span"));
    await waitForObservers(session.dom.window);
    assert.equal(target.dataset.nrfiHiddenFeedReel, undefined);
});

test("the Reel row sub-option switches between a compact row and a tiny line", async (t) => {
    const session = await loadContentScript({
        settings: settingsWith({ hideReels: true, keepReelsCollapsed: true })
    });
    t.after(() => session.dom.window.close());
    const { document } = session.dom.window;
    const target = document.querySelector("#suggested-reel").firstElementChild;

    assert.equal(target.dataset.nrfiFeedPlaceholderMode, "collapsed");
    assert.ok(target.querySelector('[data-nrfi-feed-summary-button="true"]'));

    await session.changeSetting("keepReelsCollapsed", false);
    assert.equal(target.dataset.nrfiFeedPlaceholderMode, "minimal");
    assert.equal(session.dom.window.getComputedStyle(target).height, "8px");
    assert.equal(target.querySelector('[data-nrfi-feed-summary-button="true"]'), null);
});

test("detached articles are not retained or decorated after a batched mutation", async (t) => {
    const session = await loadContentScript({
        settings: settingsWith({ hideReels: true, hideSuggestedPosts: true })
    });
    t.after(() => session.dom.window.close());
    const { document } = session.dom.window;
    const article = document.createElement("article");
    article.innerHTML = '<div><span>Suggestions pour vous</span><a href="/gone/reel/1/">Gone</a></div>';

    document.querySelector("main").appendChild(article);
    article.remove();
    await waitForObservers(session.dom.window);

    assert.equal(article.querySelector("[data-nrfi-hidden-feed-reel]"), null);
    assert.equal(article.querySelector("[data-nrfi-hidden-suggested-post]"), null);
    assert.equal(article.dataset.nrfiFeedPlaceholder, undefined);
});

test("suggested-account rails are hidden without matching suggested feed posts", async (t) => {
    const html = `<!doctype html><html><head></head><body><main role="main">
        <section id="suggested-accounts">
            <h2>Suggestions pour vous</h2>
            <div><a href="/alice/">alice</a><button>Suivre</button></div>
            <div><a href="/bob/">bob</a><button>Suivre</button></div>
        </section>
        <article id="suggested-post"><div>
            <span>Suggestions pour vous</span><a href="/carol/p/1/">Post</a>
        </div></article>
    </main></body></html>`;
    const session = await loadContentScript({
        html,
        settings: settingsWith({ hideSuggestedUsers: true })
    });
    t.after(() => session.dom.window.close());
    const { document } = session.dom.window;

    assert.equal(document.querySelector("#suggested-accounts").dataset.nrfiHiddenUsers, "true");
    assert.equal(document.querySelector("#suggested-post").dataset.nrfiHiddenUsers, undefined);

    await session.changeSetting("hideSuggestedUsers", false);
    assert.equal(document.querySelector("#suggested-accounts").dataset.nrfiHiddenUsers, undefined);
});

test("the desktop suggested-account rail hides the rows, not only its See all heading", async (t) => {
    const html = `<!doctype html><html><head></head><body><main role="main">
        <aside id="sidebar">
            <div id="suggested-accounts">
                <div id="suggested-heading">
                    <span>Suggested for you</span><a href="/explore/people/">See all</a>
                </div>
                <div><a href="/alice/">Alice</a><button>Follow</button></div>
                <div><a href="/bob/">Bob</a><button>Follow</button></div>
            </div>
        </aside>
    </main></body></html>`;
    const session = await loadContentScript({
        html,
        settings: settingsWith({ hideSuggestedUsers: true })
    });
    t.after(() => session.dom.window.close());
    const { document } = session.dom.window;

    assert.equal(document.querySelector("#suggested-heading").dataset.nrfiHiddenUsers, undefined);
    assert.equal(document.querySelector("#suggested-accounts").dataset.nrfiHiddenUsers, "true");
    assert.equal(session.dom.window.getComputedStyle(document.querySelector("#suggested-accounts")).display, "none");

    await session.changeSetting("hideSuggestedUsers", false);
    assert.equal(document.querySelector("#suggested-accounts").dataset.nrfiHiddenUsers, undefined);
});

test("Home-only post filters do not alter profile pages", async (t) => {
    const session = await loadContentScript({
        url: "https://www.instagram.com/creator/",
        settings: settingsWith({
            hideReels: true,
            hideSuggestedPosts: true,
            hideSponsoredPosts: true
        })
    });
    t.after(() => session.dom.window.close());
    const { document } = session.dom.window;

    assert.equal(document.querySelector("[data-nrfi-hidden-feed-reel]"), null);
    assert.equal(document.querySelector("[data-nrfi-hidden-suggested-post]"), null);
    assert.equal(document.querySelector("[data-nrfi-hidden-sponsored-post]"), null);
});

const capturedPagePath = process.env.NRFI_CAPTURE_PATH;
if (capturedPagePath && fs.existsSync(capturedPagePath)) {
    test("the complete supplied mobile capture satisfies the regression contract", async (t) => {
        const session = await loadContentScript({
            html: fs.readFileSync(capturedPagePath, "utf8"),
            cleanExistingMarkers: true,
            settings: settingsWith({
                hideReels: true,
                keepReelsCollapsed: true,
                hideSearchReels: true,
                hideExploreTab: true,
                hideSuggestedPosts: true,
                hideSponsoredPosts: true,
                hideSuggestedUsers: true,
                hideStories: true
            })
        });
        t.after(() => session.dom.window.close());
        const { document } = session.dom.window;
        const exactNavLink = (pathname) => Array.from(document.querySelectorAll("a[href]"))
            .find((link) => new URL(link.getAttribute("href"), "https://www.instagram.com").pathname === pathname);

        assert.equal(exactNavLink("/reels/")?.dataset.nrfiHiddenNav, "true");
        assert.equal(exactNavLink("/explore/")?.dataset.nrfiHiddenNav, "true");
        assert.equal(document.querySelectorAll('[data-nrfi-hidden-stories="true"]').length, 1);
        assert.equal(document.querySelectorAll('[data-nrfi-hidden-sponsored-post="true"]').length, 1);
        assert.equal(document.querySelectorAll('[data-nrfi-hidden-suggested-post="true"]').length, 2);
        assert.equal(document.querySelectorAll('[data-nrfi-hidden-feed-reel="true"]').length, 1);
        assert.equal(document.querySelectorAll('style[id^="nrfi-"]').length, 8);
        assert.equal(
            Array.from(document.querySelectorAll('a[href*="/reels/audio/"]'))
                .some((link) => link.dataset.nrfiHiddenNav === "true"),
            false
        );
        assert.deepEqual(session.unexpectedErrors, []);
    });
}
