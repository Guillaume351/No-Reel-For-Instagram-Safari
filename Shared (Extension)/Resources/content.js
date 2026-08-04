(() => {
if (globalThis.__nrfiContentScriptLoaded === true) {
    return;
}
globalThis.__nrfiContentScriptLoaded = true;

const api = typeof browser !== "undefined" ? browser : chrome;
const isBrowserApi = typeof browser !== "undefined";

const storageCandidates = (() => {
    const storage = api?.storage;
    if (!storage) {
        return [];
    }

    const candidates = [];
    if (storage.sync && typeof storage.sync.get === "function") {
        candidates.push({ name: "sync", area: storage.sync });
    }
    if (storage.local && typeof storage.local.get === "function") {
        candidates.push({ name: "local", area: storage.local });
    }
    return candidates;
})();

let activeStorage = storageCandidates[0] || null;
let currentSettings = {};
let initialized = false;
let initializationInProgress = false;
let storageListenerRegistered = false;

const NAV_STYLE_ID = "nrfi-nav-style";

// Video posts controller intentionally not registered until bug fixes land.

const defaultSettings = Object.freeze({
    hideReels: true,
    keepReelsCollapsed: true,
    hideSearchReels: true,
    hideExploreTab: true,
    hideSuggestedPosts: true,
    hideSponsoredPosts: true,
    hideSuggestedUsers: true,
    hideStories: true
});

currentSettings = { ...defaultSettings };

function normalizeLabel(value) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .replace(/\s+/g, " ")
        .replace(/[.!:;…؟]+$/g, "")
        .toLowerCase();
}

function pathnameFromHref(href) {
    if (!href) {
        return "";
    }

    try {
        return new URL(href, window.location?.origin || "https://www.instagram.com").pathname;
    } catch (error) {
        return String(href).split(/[?#]/, 1)[0];
    }
}

function linkPathname(link) {
    return link instanceof HTMLElement ? pathnameFromHref(link.getAttribute("href")) : "";
}

function isContentPermalink(link, kinds = ["p", "reel"]) {
    const pathname = linkPathname(link);
    const segments = pathname.split("/").filter(Boolean);

    if (segments.length < 2 || segments.length > 3) {
        return false;
    }

    const rawKind = segments.length === 2 ? segments[0] : segments[1];
    const kind = rawKind === "reels" ? "reel" : rawKind;
    return kinds.includes(kind);
}

function articleHasPermalink(article, kinds = ["p", "reel"]) {
    return article instanceof HTMLElement
        && Array.from(article.querySelectorAll("a[href]")).some((link) => isContentPermalink(link, kinds));
}

function leafLabels(element) {
    if (!(element instanceof HTMLElement)) {
        return [];
    }

    const labels = [];
    const ariaLabel = normalizeLabel(element.getAttribute("aria-label"));
    if (ariaLabel) {
        labels.push(ariaLabel);
    }

    if (element.childElementCount === 0) {
        const textLabel = normalizeLabel(element.textContent);
        if (textLabel) {
            labels.push(textLabel);
        }
    }

    return Array.from(new Set(labels));
}

function articleHasLabel(article, labels) {
    if (!(article instanceof HTMLElement)) {
        return false;
    }

    return Array.from(article.querySelectorAll('span, [dir="auto"], [aria-label]')).some((marker) => (
        leafLabels(marker).some((label) => labels.has(label))
    ));
}

function createFeedPlaceholderCoordinator() {
    const states = new Map();
    const styleId = "nrfi-feed-placeholder-style";
    const rootActiveAttribute = "data-nrfi-feed-placeholders-active";
    let keepReelsCollapsed = true;
    let playListenerRegistered = false;

    function localizedMessage(key, fallback, substitutions) {
        const message = api?.i18n?.getMessage?.(key, substitutions);
        return message && message !== key ? message : fallback;
    }

    function ensureStyle() {
        if (!document.getElementById(styleId)) {
            const style = document.createElement("style");
            style.id = styleId;
            style.textContent = `
                html[${rootActiveAttribute}="true"] {
                    overflow-anchor: none !important;
                }

                article[data-nrfi-feed-placeholder="true"] {
                    box-sizing: border-box !important;
                    height: 48px !important;
                    min-height: 48px !important;
                    max-height: 48px !important;
                    overflow: hidden !important;
                    content-visibility: visible !important;
                    contain-intrinsic-size: 48px !important;
                }

                article[data-nrfi-feed-placeholder="true"][data-nrfi-feed-placeholder-mode="minimal"] {
                    height: 8px !important;
                    min-height: 8px !important;
                    max-height: 8px !important;
                    contain-intrinsic-size: 8px !important;
                }

                [data-nrfi-feed-content-hidden="true"] {
                    position: relative !important;
                    display: block !important;
                    box-sizing: border-box !important;
                    height: 48px !important;
                    min-height: 48px !important;
                    max-height: 48px !important;
                    overflow: hidden !important;
                    visibility: hidden !important;
                    pointer-events: none !important;
                }

                [data-nrfi-feed-content-hidden="true"][data-nrfi-feed-placeholder-mode="minimal"] {
                    height: 8px !important;
                    min-height: 8px !important;
                    max-height: 8px !important;
                    border-top: 1px solid rgb(142 142 142 / 25%) !important;
                }

                [data-nrfi-feed-content-hidden="true"] > :not([data-nrfi-feed-summary="true"]) {
                    display: none !important;
                }

                [data-nrfi-feed-summary="true"] {
                    position: absolute !important;
                    inset: 0 !important;
                    z-index: 1 !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    gap: 10px !important;
                    box-sizing: border-box !important;
                    padding: 0 12px !important;
                    visibility: visible !important;
                    pointer-events: auto !important;
                    color: rgb(142, 142, 142) !important;
                    background: rgb(142 142 142 / 7%) !important;
                    font: 600 13px/1.25 -apple-system, BlinkMacSystemFont, sans-serif !important;
                }

                [data-nrfi-feed-summary="true"][data-nrfi-feed-placeholder-mode="minimal"] {
                    display: none !important;
                }

                [data-nrfi-feed-summary-author="true"] {
                    min-width: 0 !important;
                    overflow: hidden !important;
                    text-overflow: ellipsis !important;
                    white-space: nowrap !important;
                }

                [data-nrfi-feed-summary-button="true"] {
                    flex: 0 0 auto !important;
                    appearance: none !important;
                    border: 0 !important;
                    border-radius: 7px !important;
                    padding: 6px 9px !important;
                    color: rgb(0, 149, 246) !important;
                    background: transparent !important;
                    font: 600 13px/1 -apple-system, BlinkMacSystemFont, sans-serif !important;
                    cursor: pointer !important;
                }

                [data-nrfi-feed-summary-button="true"]:focus-visible {
                    outline: 2px solid rgb(0, 149, 246) !important;
                    outline-offset: 2px !important;
                }
            `;
            (document.head || document.documentElement).appendChild(style);
        }

        if (!playListenerRegistered) {
            document.addEventListener("play", (event) => {
                const video = event.target;
                if (!(video instanceof HTMLMediaElement)
                    || !video.closest('[data-nrfi-feed-content-hidden="true"]')) {
                    return;
                }

                try {
                    video.pause();
                } catch (error) {
                    console.debug("No Reel For Instagram: unable to pause a hidden video", error);
                }
            }, true);
            playListenerRegistered = true;
        }
    }

    function syncRootAnchoring() {
        const root = document.documentElement;
        if (!(root instanceof HTMLElement)) {
            return;
        }

        if (states.size > 0) {
            root.setAttribute(rootActiveAttribute, "true");
        } else {
            root.removeAttribute(rootActiveAttribute);
        }
    }

    function reelAuthor(article) {
        const reelLink = Array.from(article.querySelectorAll("a[href]")).find((link) => (
            isContentPermalink(link, ["reel"])
        ));
        const reelSegments = linkPathname(reelLink).split("/").filter(Boolean);
        const username = reelSegments.length === 3 ? reelSegments[0] : "";

        if (username) {
            const profileLink = Array.from(article.querySelectorAll("a[href]")).find((link) => (
                linkPathname(link) === `/${username}/`
            ));
            const profileLabel = normalizeLabel(
                profileLink?.textContent
                || profileLink?.getAttribute("aria-label")
                || profileLink?.querySelector("img[alt]")?.getAttribute("alt")
            );
            return profileLabel || username;
        }

        const reservedPaths = new Set(["explore", "reels", "direct", "notifications", "accounts"]);
        const profileLink = Array.from(article.querySelectorAll("a[href]")).find((link) => {
            const segments = linkPathname(link).split("/").filter(Boolean);
            return segments.length === 1 && !reservedPaths.has(segments[0]);
        });
        return normalizeLabel(
            profileLink?.textContent
            || profileLink?.getAttribute("aria-label")
            || profileLink?.querySelector("img[alt]")?.getAttribute("alt")
        );
    }

    function pauseVideos(article) {
        article.querySelectorAll("video").forEach((video) => {
            if (/jsdom/i.test(navigator.userAgent || "")) {
                return;
            }
            try {
                video.pause();
            } catch (error) {
                console.debug("No Reel For Instagram: unable to pause a hidden video", error);
            }
        });
    }

    function clearTarget(target) {
        if (!(target instanceof HTMLElement)) {
            return;
        }

        delete target.dataset.nrfiFeedContentHidden;
        delete target.dataset.nrfiFeedPlaceholderMode;
        delete target.dataset.nrfiPlaceholderLabel;
        target.querySelector(':scope > [data-nrfi-feed-summary="true"]')?.remove();
    }

    function reveal(article) {
        const state = states.get(article);
        if (!state) {
            return;
        }

        state.reasons.forEach(({ hiddenAttribute }) => {
            state.target?.removeAttribute(hiddenAttribute);
        });
        clearTarget(state.target);
        delete article.dataset.nrfiFeedPlaceholder;
        delete article.dataset.nrfiFeedPlaceholderMode;
        states.delete(article);
        syncRootAnchoring();
    }

    function renderState(article, state) {
        const target = article.firstElementChild instanceof HTMLElement
            ? article.firstElementChild
            : article;

        if (state.target && state.target !== target) {
            state.reasons.forEach(({ hiddenAttribute }) => state.target.removeAttribute(hiddenAttribute));
            clearTarget(state.target);
        }
        state.target = target;
        state.reasons.forEach(({ hiddenAttribute }) => target.setAttribute(hiddenAttribute, "true"));

        const hasReel = state.reasons.has("reel");
        const hasOtherFeedReason = state.reasons.has("suggested") || state.reasons.has("sponsored");
        const mode = hasReel && keepReelsCollapsed
            ? "collapsed"
            : hasOtherFeedReason
                ? "compact"
                : "minimal";

        article.dataset.nrfiFeedPlaceholder = "true";
        article.dataset.nrfiFeedPlaceholderMode = mode;
        target.dataset.nrfiFeedContentHidden = "true";
        target.dataset.nrfiFeedPlaceholderMode = mode;
        pauseVideos(article);

        let summary = target.querySelector(':scope > [data-nrfi-feed-summary="true"]');
        if (!(summary instanceof HTMLElement)) {
            summary = document.createElement("div");
            summary.dataset.nrfiFeedSummary = "true";
            target.appendChild(summary);
        }
        summary.dataset.nrfiFeedPlaceholderMode = mode;
        const author = mode === "collapsed" ? reelAuthor(article) : "";
        const label = author
            ? localizedMessage("hidden_reel_from", `Reel from ${author}`, author)
            : localizedMessage("hidden_post_placeholder", "Post hidden");
        const renderKey = `${mode}|${label}`;
        if (summary.dataset.nrfiFeedSummaryKey === renderKey) {
            return;
        }

        summary.dataset.nrfiFeedSummaryKey = renderKey;
        summary.replaceChildren();

        if (mode === "minimal") {
            return;
        }

        const labelElement = document.createElement("span");
        labelElement.dataset.nrfiFeedSummaryAuthor = "true";
        labelElement.textContent = label;
        summary.appendChild(labelElement);

        if (mode === "collapsed") {
            const button = document.createElement("button");
            button.type = "button";
            button.dataset.nrfiFeedSummaryButton = "true";
            button.textContent = localizedMessage("show_reel_anyway", "Show anyway");
            button.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                article.dataset.nrfiFeedRevealed = "true";
                reveal(article);
            });
            summary.appendChild(button);
        }
    }

    function addReason(article, reason, hiddenAttribute) {
        if (!(article instanceof HTMLElement) || !article.isConnected
            || article.dataset.nrfiFeedRevealed === "true") {
            return;
        }

        ensureStyle();
        let state = states.get(article);
        if (!state) {
            state = { target: null, reasons: new Map() };
            states.set(article, state);
            syncRootAnchoring();
        }
        state.reasons.set(reason, { hiddenAttribute });
        renderState(article, state);
    }

    function removeReason(article, reason) {
        const state = states.get(article);
        if (!state) {
            return;
        }

        const removed = state.reasons.get(reason);
        if (removed) {
            state.target?.removeAttribute(removed.hiddenAttribute);
            state.reasons.delete(reason);
        }

        if (state.reasons.size === 0) {
            clearTarget(state.target);
            delete article.dataset.nrfiFeedPlaceholder;
            delete article.dataset.nrfiFeedPlaceholderMode;
            states.delete(article);
            syncRootAnchoring();
        } else {
            renderState(article, state);
        }
    }

    function setCollapsedPreference(value) {
        keepReelsCollapsed = Boolean(value);
        states.forEach((state, article) => {
            if (article.isConnected) {
                renderState(article, state);
            }
        });
    }

    function prune() {
        states.forEach((state, article) => {
            if (!article.isConnected) {
                states.delete(article);
            }
        });
        syncRootAnchoring();
    }

    return {
        addReason,
        removeReason,
        prune,
        setCollapsedPreference
    };
}

const feedPlaceholderCoordinator = createFeedPlaceholderCoordinator();

function isHomePath() {
    return typeof window !== "undefined" && window.location?.pathname === "/";
}

function createArticleFilterController(options) {
    const {
        styleId,
        hiddenAttribute,
        reason = hiddenAttribute,
        matchesArticle,
        retainHiddenWhileIndeterminate = () => false,
        isActivePath = () => true
    } = options;
    const hiddenArticles = new Map();
    const pendingArticles = new Set();
    let observer = null;

    function ensureStyle() {
        if (document.getElementById(styleId)) {
            return;
        }

        const style = document.createElement("style");
        style.id = styleId;
        // Diagnostic marker only. Feed layout is coordinated across every filter
        // so overlapping Reel/suggested/sponsored reasons cannot fight in CSS.
        style.textContent = `[${hiddenAttribute}="true"]{}`;
        (document.head || document.documentElement).appendChild(style);
    }

    function restoreArticle(article) {
        const target = hiddenArticles.get(article);
        if (target instanceof HTMLElement) {
            target.removeAttribute(hiddenAttribute);
        }
        feedPlaceholderCoordinator.removeReason(article, reason);
        hiddenArticles.delete(article);
    }

    function evaluateArticle(article) {
        if (!(article instanceof HTMLElement) || !article.isConnected) {
            restoreArticle(article);
            return;
        }

        if (article.dataset.nrfiFeedRevealed === "true" || !isActivePath()) {
            restoreArticle(article);
            return;
        }

        const matches = matchesArticle(article);
        if (!matches) {
            if (hiddenArticles.has(article) && retainHiddenWhileIndeterminate(article)) {
                return;
            }
            restoreArticle(article);
            return;
        }

        const existingTarget = hiddenArticles.get(article);
        if (existingTarget instanceof HTMLElement && article.contains(existingTarget)) {
            feedPlaceholderCoordinator.addReason(article, reason, hiddenAttribute);
            return;
        }

        if (existingTarget instanceof HTMLElement) {
            existingTarget.removeAttribute(hiddenAttribute);
        }

        // Preserve the article node: Instagram observes it to continue loading the feed.
        const target = article.firstElementChild instanceof HTMLElement
            ? article.firstElementChild
            : article;
        target.setAttribute(hiddenAttribute, "true");
        hiddenArticles.set(article, target);
        feedPlaceholderCoordinator.addReason(article, reason, hiddenAttribute);
    }

    function pruneDisconnectedArticles() {
        hiddenArticles.forEach((target, article) => {
            if (!article.isConnected || !(target instanceof HTMLElement) || !target.isConnected) {
                hiddenArticles.delete(article);
            }
        });
        feedPlaceholderCoordinator.prune();
    }

    function flushPendingArticles() {
        pruneDisconnectedArticles();

        const articles = Array.from(pendingArticles);
        pendingArticles.clear();
        articles.forEach((article) => evaluateArticle(article));
    }

    function scheduleArticle(article) {
        if (!(article instanceof HTMLElement) || !article.matches("article")) {
            return;
        }

        pendingArticles.add(article);
    }

    function scheduleNode(node) {
        if (!(node instanceof HTMLElement || node instanceof DocumentFragment)) {
            return;
        }

        if (node instanceof HTMLElement) {
            const containingArticle = node.matches("article") ? node : node.closest("article");
            if (containingArticle instanceof HTMLElement) {
                scheduleArticle(containingArticle);
            }
        }

        node.querySelectorAll?.("article").forEach(scheduleArticle);
    }

    function sweep(root) {
        if (!isActivePath()) {
            clearHidden();
            return;
        }

        if (!(root instanceof HTMLElement || root instanceof Document || root instanceof DocumentFragment)) {
            return;
        }

        if (root instanceof HTMLElement) {
            const article = root.matches("article") ? root : root.closest("article");
            if (article instanceof HTMLElement) {
                evaluateArticle(article);
            }
        }

        root.querySelectorAll?.("article").forEach((article) => {
            evaluateArticle(article);
        });
    }

    function clearHidden() {
        hiddenArticles.forEach((target, article) => {
            if (target instanceof HTMLElement) {
                target.removeAttribute(hiddenAttribute);
            }
            feedPlaceholderCoordinator.removeReason(article, reason);
        });
        hiddenArticles.clear();
    }

    function start() {
        if (observer) {
            return;
        }

        ensureStyle();
        sweep(document);

        observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === "attributes" || mutation.type === "characterData") {
                    const mutationTarget = mutation.target instanceof HTMLElement
                        ? mutation.target
                        : mutation.target.parentElement;
                    const article = mutationTarget?.closest?.("article");
                    if (article instanceof HTMLElement) {
                        scheduleArticle(article);
                    }
                } else if (mutation.type === "childList") {
                    const mutationTarget = mutation.target instanceof HTMLElement
                        ? mutation.target
                        : mutation.target.parentElement;
                    const article = mutationTarget?.closest?.("article");
                    if (article instanceof HTMLElement) {
                        scheduleArticle(article);
                    }
                }

                mutation.addedNodes.forEach((node) => {
                    scheduleNode(node);
                });
            });

            // MutationObserver callbacks run before the next paint. Classify the
            // whole Instagram batch here instead of adding another microtask, so a
            // newly hydrated Reel does not briefly render at full height.
            flushPendingArticles();
        });

        observer.observe(document.body || document.documentElement, {
            attributes: true,
            attributeFilter: ["aria-label", "href"],
            childList: true,
            characterData: true,
            subtree: true
        });
    }

    function stop() {
        if (observer) {
            observer.disconnect();
            observer = null;
        }

        clearHidden();
        pendingArticles.clear();
        document.getElementById(styleId)?.remove();
        feedPlaceholderCoordinator.prune();
    }

    return {
        enable: start,
        disable: stop
    };
}

function invokeStorage(area, method, payload) {
    if (!area || typeof area[method] !== "function") {
        return Promise.reject(new Error("storage method unavailable"));
    }

    if (isBrowserApi) {
        return area[method](payload);
    }

    return new Promise((resolve, reject) => {
        area[method](payload, (result) => {
            const error = api.runtime?.lastError;
            if (error) {
                reject(error);
            } else {
                resolve(result);
            }
        });
    });
}

async function storageGet(keys) {
    const attempts = activeStorage
        ? [activeStorage, ...storageCandidates.filter((candidate) => candidate !== activeStorage)]
        : storageCandidates;

    let lastError = null;

    for (const candidate of attempts) {
        if (!candidate) {
            continue;
        }

        try {
            const result = await invokeStorage(candidate.area, "get", keys);
            activeStorage = candidate;
            return result && typeof result === "object" ? result : {};
        } catch (error) {
            lastError = error;
        }
    }

    if (lastError) {
        throw lastError;
    }

    return {};
}

async function loadSettingsDirectly() {
    try {
        const stored = await storageGet(Object.keys(defaultSettings));
        return { ...defaultSettings, ...stored };
    } catch (error) {
        console.warn("No Reel For Instagram: storage.get failed while reading settings", error);
        return { ...defaultSettings };
    }
}

function ensureNavLayoutStyle() {
    const css = `
        [data-nrfi-hidden-nav="true"] { display: none !important; }
        @media (max-width: 700px) {
            [data-nrfi-mobile-nav="true"] {
                display: flex !important;
                justify-content: space-evenly !important;
                align-items: stretch !important;
                gap: 0 !important;
            }

            [data-nrfi-mobile-nav="true"] > :not([data-nrfi-hidden-nav="true"]) {
                flex: 1 1 auto !important;
                display: flex !important;
                justify-content: center !important;
                align-items: center !important;
            }

            [data-nrfi-mobile-nav="true"] a:not([data-nrfi-hidden-nav="true"]) {
                flex: 1 1 auto !important;
                display: inline-flex !important;
                justify-content: center !important;
                align-items: center !important;
            }

            [data-nrfi-mobile-nav="true"] [data-nrfi-hidden-nav="true"] {
                display: none !important;
            }
        }
    `;
    let style = document.getElementById(NAV_STYLE_ID);
    if (!style) {
        style = document.createElement("style");
        style.id = NAV_STYLE_ID;
        (document.head || document.documentElement).appendChild(style);
    }

    if (style.textContent !== css) {
        style.textContent = css;
    }
}

function createNavLinkController(options) {
    const { linkPatterns = [], labelKeywords = [] } = options || {};
    const hiddenNavItems = new Map();
    const adjustedNavContainers = new Set();
    let observer = null;
    const PRIMARY_NAV_PATHS = new Set([
        "/",
        "/explore/",
        "/reels/",
        "/direct/inbox/",
        "/notifications/"
    ]);

    function isPrimaryNavigationLink(link) {
        return link instanceof HTMLElement && PRIMARY_NAV_PATHS.has(linkPathname(link));
    }

    function findNavigationContainer(control) {
        if (!(control instanceof HTMLElement) || control.closest("article")) {
            return null;
        }

        const semanticContainer = control.closest("nav, [role='navigation']");
        if (semanticContainer instanceof HTMLElement) {
            return semanticContainer;
        }

        let current = control.parentElement;
        while (current instanceof HTMLElement && !current.matches("body, main, [role='main']")) {
            const primaryLinks = Array.from(current.querySelectorAll("a[href]")).filter(isPrimaryNavigationLink);
            if (primaryLinks.length >= 2) {
                return current;
            }
            current = current.parentElement;
        }

        return null;
    }

    function matches(control) {
        if (!(control instanceof HTMLElement)) {
            return false;
        }

        if (!findNavigationContainer(control)) {
            return false;
        }

        const pathname = linkPathname(control).toLowerCase();
        if (linkPatterns.some((pattern) => pattern.test(pathname))) {
            return true;
        }

        const labels = [
            control.textContent,
            control.getAttribute("aria-label"),
            control.getAttribute("title")
        ];
        control.querySelectorAll("[aria-label], title").forEach((element) => {
            labels.push(element.getAttribute?.("aria-label"), element.textContent);
        });

        const normalizedLabels = labels.map(normalizeLabel).filter(Boolean);
        return labelKeywords.some((keyword) => {
            const normalizedKeyword = normalizeLabel(keyword);
            return normalizedLabels.some((label) => (
                label === normalizedKeyword
                || label.startsWith(`${normalizedKeyword} `)
                || label.endsWith(` ${normalizedKeyword}`)
            ));
        });
    }

    function markMobileNavigation(container) {
        if (!(container instanceof HTMLElement)) {
            return;
        }

        if (container.dataset.nrfiMobileNav !== "true") {
            container.dataset.nrfiMobileNav = "true";
        }

        adjustedNavContainers.add(container);
    }

    function findNavCell(navItem, container) {
        if (!(navItem instanceof HTMLElement)) {
            return navItem;
        }

        if (!(container instanceof HTMLElement)) {
            return navItem;
        }

        let current = navItem;
        while (current?.parentElement instanceof HTMLElement && current.parentElement !== container) {
            current = current.parentElement;
        }

        return current instanceof HTMLElement ? current : navItem;
    }

    function incrementHiddenTarget(element) {
        if (!(element instanceof HTMLElement)) {
            return;
        }

        const count = Number(element.dataset.nrfiHiddenNavCount || "0") + 1;
        element.dataset.nrfiHiddenNavCount = String(count);
        element.dataset.nrfiHiddenNav = "true";
    }

    function decrementHiddenTarget(element) {
        if (!(element instanceof HTMLElement)) {
            return;
        }

        const count = Number(element.dataset.nrfiHiddenNavCount || "0") - 1;

        if (count <= 0) {
            delete element.dataset.nrfiHiddenNavCount;
            delete element.dataset.nrfiHiddenNav;
        } else {
            element.dataset.nrfiHiddenNavCount = String(count);
        }
    }

    function hideNavLink(control) {
        const navItem = control.closest("a[role='link'], a[href], button, [role='button'], [role='link']") || control;
        if (!(navItem instanceof HTMLElement) || hiddenNavItems.has(navItem)) {
            return;
        }

        const container = findNavigationContainer(navItem);
        const navCell = findNavCell(navItem, container);

        incrementHiddenTarget(navItem);
        if (navCell && navCell !== navItem) {
            incrementHiddenTarget(navCell);
        }

        hiddenNavItems.set(navItem, navCell);
        markMobileNavigation(container);
    }

    function sweep(root) {
        if (!root) {
            return;
        }

        const targets = new Set();
        const interactiveSelector = "a[href], button, [role='button'], [role='link']";

        if (root instanceof HTMLElement) {
            if (root.matches(interactiveSelector)) {
                targets.add(root);
            } else {
                const interactiveAncestor = root.closest(interactiveSelector);
                if (interactiveAncestor instanceof HTMLElement) {
                    targets.add(interactiveAncestor);
                }
            }
        }

        if (root instanceof HTMLElement || root instanceof Document || root instanceof DocumentFragment) {
            root.querySelectorAll?.(interactiveSelector).forEach((candidate) => {
                targets.add(candidate);
            });
        }

        targets.forEach((link) => {
            if (matches(link)) {
                hideNavLink(link);
            }
        });
    }

    function start() {
        if (observer) {
            return;
        }

        ensureNavLayoutStyle();
        sweep(document);

        observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === "attributes" && mutation.target instanceof HTMLElement) {
                    sweep(mutation.target);
                }

                mutation.addedNodes.forEach((node) => {
                    if (node instanceof HTMLElement || node instanceof DocumentFragment) {
                        sweep(node);
                    }
                });
            });
        });

        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["aria-label", "href", "title"],
            childList: true,
            subtree: true
        });
    }

    function stop() {
        if (observer) {
            observer.disconnect();
            observer = null;
        }

        hiddenNavItems.forEach((navCell, navItem) => {
            if (!(navItem instanceof HTMLElement)) {
                return;
            }

            decrementHiddenTarget(navItem);
            if (navCell && navCell !== navItem) {
                decrementHiddenTarget(navCell);
            }
        });
        hiddenNavItems.clear();

        adjustedNavContainers.forEach((container) => {
            if (!(container instanceof HTMLElement)) {
                return;
            }

            if (!container.querySelector('[data-nrfi-hidden-nav="true"]')) {
                delete container.dataset.nrfiMobileNav;
            }
        });
        adjustedNavContainers.clear();
    }

    return {
        enable: start,
        disable: stop
    };
}

function createReelsController() {
    const navigationController = createNavLinkController({
        linkPatterns: [/^\/reels\/?$/i],
        labelKeywords: ["reels"]
    });
    const feedController = createArticleFilterController({
        styleId: "nrfi-feed-reels-style",
        hiddenAttribute: "data-nrfi-hidden-feed-reel",
        reason: "reel",
        isActivePath: isHomePath,
        matchesArticle: (article) => articleHasPermalink(article, ["reel"]),
        // Instagram temporarily removes permalink anchors while recycling a
        // connected article. Keep its compact geometry until a positive photo
        // permalink proves that the node now represents different content.
        retainHiddenWhileIndeterminate: (article) => !articleHasPermalink(article, ["p"])
    });

    return {
        enable() {
            navigationController.enable();
            feedController.enable();
        },
        disable() {
            navigationController.disable();
            feedController.disable();
        }
    };
}

function createSearchReelsController() {
    const hiddenElements = new Set();
    let observer = null;
    const styleId = "nrfi-search-reels-style";
    const SEARCH_PATH_PATTERNS = [/^\/explore(\/|$)/i, /^\/search(\/|$)/i];

    function isSearchSurfacePath() {
        if (typeof window === "undefined" || !window.location) {
            return false;
        }

        const path = window.location.pathname || "";
        return SEARCH_PATH_PATTERNS.some((pattern) => pattern.test(path));
    }

    function ensureStyle() {
        if (document.getElementById(styleId)) {
            return;
        }

        const style = document.createElement("style");
        style.id = styleId;
        style.textContent = "[data-nrfi-hidden-search-reel=\"true\"]{display:none!important;}";
        (document.head || document.documentElement).appendChild(style);
    }

    function clearHidden() {
        hiddenElements.forEach((element) => {
            if (element instanceof HTMLElement) {
                delete element.dataset.nrfiHiddenSearchReel;
            }
        });
        hiddenElements.clear();
    }

    function findHideTarget(link) {
        if (!(link instanceof HTMLElement)) {
            return link;
        }

        let current = link;

        while (current instanceof HTMLElement) {
            const parent = current.parentElement;
            if (!(parent instanceof HTMLElement)) {
                break;
            }

            if (parent === document.body || parent === document.documentElement) {
                break;
            }

            if (parent.matches("main, [role='main'], [role='feed']")) {
                break;
            }

            const siblingCards = Array.from(parent.children).filter((candidate) => (
                candidate instanceof HTMLElement
                && Array.from(candidate.querySelectorAll("a[href]")).some((anchor) => isContentPermalink(anchor))
            ));

            if (siblingCards.length >= 2) {
                return current;
            }

            current = parent;
        }

        return link;
    }

    function hideReelCard(link) {
        if (!(link instanceof HTMLElement)) {
            return;
        }

        const target = findHideTarget(link);
        if (!(target instanceof HTMLElement) || target.dataset.nrfiHiddenSearchReel === "true") {
            return;
        }

        target.dataset.nrfiHiddenSearchReel = "true";
        hiddenElements.add(target);
    }

    function sweep(root) {
        if (!isSearchSurfacePath()) {
            clearHidden();
            return;
        }

        if (root instanceof HTMLAnchorElement && isContentPermalink(root, ["reel"])) {
            hideReelCard(root);
        }

        if (!(root instanceof HTMLElement || root instanceof Document || root instanceof DocumentFragment)) {
            return;
        }

        root.querySelectorAll?.("a[href]").forEach((candidate) => {
            if (isContentPermalink(candidate, ["reel"])) {
                hideReelCard(candidate);
            }
        });
    }

    function start() {
        if (observer) {
            return;
        }

        ensureStyle();
        sweep(document);

        observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === "attributes" && mutation.target instanceof HTMLElement) {
                    sweep(mutation.target);
                }

                mutation.addedNodes.forEach((node) => {
                    if (node instanceof HTMLElement || node instanceof DocumentFragment) {
                        sweep(node);
                    }
                });
            });
        });

        observer.observe(document.body || document.documentElement, {
            attributes: true,
            attributeFilter: ["href"],
            childList: true,
            subtree: true
        });
    }

    function stop() {
        if (observer) {
            observer.disconnect();
            observer = null;
        }

        clearHidden();

        const style = document.getElementById(styleId);
        if (style) {
            style.remove();
        }
    }

    return {
        enable: start,
        disable: stop
    };
}

function createExploreController() {
    return createNavLinkController({
        linkPatterns: [/^\/explore\/?$/i, /^\/search\/?$/i],
        labelKeywords: [
            "explore",
            "search",
            "rechercher",
            "recherche",
            "suche",
            "découvrir",
            "decouvrir",
            "entdecken",
            "explorar",
            "esplora",
            "buscar"
        ]
    });
}

function createStoriesController() {
    const hiddenElements = new Set();
    let observer = null;
    const styleId = "nrfi-stories-style";
    const STORY_SELECTORS = ['[data-pagelet="story_tray"]', 'ul._acay'];
    const CHAT_PAGELET_SELECTOR = '[data-pagelet^="IGDChat"]';
    const STORY_LINK_SELECTOR = 'a[href^="/stories/"]';

    function isInChatExperience(element) {
        return element instanceof HTMLElement && Boolean(element.closest(CHAT_PAGELET_SELECTOR));
    }

    function looksLikeStoryTray(element) {
        if (!(element instanceof HTMLElement)) {
            return false;
        }

        if (element.matches('[data-pagelet="story_tray"]')) {
            return true;
        }

        if (element.querySelector('[data-pagelet="story_tray"]')) {
            return true;
        }

        return Boolean(element.querySelector(STORY_LINK_SELECTOR));
    }

    function ensureStyle() {
        if (document.getElementById(styleId)) {
            return;
        }

        const style = document.createElement("style");
        style.id = styleId;
        style.textContent = "[data-nrfi-hidden-stories=\"true\"]{display:none!important;}";
        (document.head || document.documentElement).appendChild(style);
    }

    function markHidden(element) {
        if (!(element instanceof HTMLElement) || element.dataset.nrfiHiddenStories === "true") {
            return;
        }

        element.dataset.nrfiHiddenStories = "true";
        hiddenElements.add(element);
    }

    function hideStoriesContainer(element) {
        if (!(element instanceof HTMLElement)) {
            return;
        }

        let tray = null;

        if (element.matches('[data-pagelet="story_tray"]')) {
            tray = element;
        } else if (element.matches('ul._acay')) {
            // Skip post carousels that reuse the same class names
            if (element.closest('article')) {
                return;
            }

            const storyTray = element.closest('[data-pagelet="story_tray"]');
            if (storyTray instanceof HTMLElement) {
                tray = storyTray;
            } else if (element.querySelector('a[href^="/stories/"]')) {
                tray = element.closest('div[role="presentation"]') || element;
            }
        } else {
            tray = element.closest('[data-pagelet="story_tray"]') || element.closest('div[role="presentation"]');
        }

        if (tray instanceof HTMLElement) {
            // Guard against hiding regular feed carousels
            if (tray.closest('article')) {
                return;
            }

            if (!looksLikeStoryTray(tray) || isInChatExperience(tray)) {
                // Chat panes reuse similar structure so skip anything under the messaging surfaces.
                return;
            }

            markHidden(tray);
        }
    }

    function sweep(root) {
        STORY_SELECTORS.forEach((selector) => {
            root.querySelectorAll(selector).forEach((candidate) => {
                hideStoriesContainer(candidate);
            });
        });
    }

    function start() {
        if (observer) {
            return;
        }

        ensureStyle();
        sweep(document);

        observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node instanceof HTMLElement) {
                        hideStoriesContainer(node);
                        sweep(node);
                    }
                });
            });
        });

        observer.observe(document.body || document.documentElement, {
            childList: true,
            subtree: true
        });
    }

    function stop() {
        if (observer) {
            observer.disconnect();
            observer = null;
        }

        hiddenElements.forEach((element) => {
            if (element instanceof HTMLElement) {
                delete element.dataset.nrfiHiddenStories;
            }
        });
        hiddenElements.clear();

        const style = document.getElementById(styleId);
        if (style) {
            style.remove();
        }
    }

    return {
        enable: start,
        disable: stop
    };
}

function createVideoPostsController() {
    // Currently unused while the hide video posts feature is disabled for stability.
    const hiddenItems = new Map();
    let observer = null;
    const VIDEO_ARIA_KEYWORDS = ["video", "vidéo", "vídeo", "audio"];
    const VIDEO_ARIA_QUERY = VIDEO_ARIA_KEYWORDS
        .map((keyword) => `[aria-label*="${keyword}" i]`)
        .join(", ");
    const MEDIA_QUERY = "video, source[type^='video/']";
    let scrollKickScheduled = false;

    function scheduleScrollKick() {
        if (scrollKickScheduled) {
            return;
        }

        scrollKickScheduled = true;
        requestAnimationFrame(() => {
            scrollKickScheduled = false;
            window.dispatchEvent(new Event("scroll"));
        });
    }

    function hideElement(target) {
        if (!(target instanceof HTMLElement) || hiddenItems.has(target)) {
            return;
        }

        const parent = target.parentNode;
        if (!(parent instanceof Node)) {
            return;
        }

        const placeholder = document.createComment("nrfi-hidden-video");
        hiddenItems.set(target, placeholder);
        parent.replaceChild(placeholder, target);
        scheduleScrollKick();
    }

    function unhideAll() {
        const entries = Array.from(hiddenItems.entries());
        hiddenItems.clear();

        entries.forEach(([element, placeholder]) => {
            if (!(placeholder instanceof Comment)) {
                return;
            }

            if (!placeholder.parentNode) {
                return;
            }

            placeholder.replaceWith(element);
        });
    }

    function findFeedItemContainer(article) {
        let current = article;

        while (current?.parentElement instanceof HTMLElement) {
            const parent = current.parentElement;

            if (parent === document.body || parent === document.documentElement) {
                break;
            }

            if (parent.matches("main, [role='main'], [role='feed']")) {
                break;
            }

            const grandparent = parent.parentElement;
            if (grandparent instanceof HTMLElement && grandparent.matches("main, [role='main'], [role='feed']")) {
                break;
            }

            const articleCount = parent.querySelectorAll("article").length;
            if (articleCount > 1) {
                break;
            }

            current = parent;
        }

        return current instanceof HTMLElement ? current : article;
    }

    function isVideoArticle(article) {
        if (!(article instanceof HTMLElement)) {
            return false;
        }

        if (article.querySelector("video, source[type^='video/'], div[data-testid='videoPlayer']")) {
            return true;
        }

        return Boolean(VIDEO_ARIA_QUERY && article.querySelector(VIDEO_ARIA_QUERY));
    }

    function evaluateArticle(article) {
        if (!(article instanceof HTMLElement)) {
            return;
        }

        if (isVideoArticle(article)) {
            const container = findFeedItemContainer(article);
            hideElement(container instanceof HTMLElement ? container : article);
        }
    }

    function handleNode(node) {
        if (node instanceof DocumentFragment) {
            node.querySelectorAll("article").forEach((article) => {
                evaluateArticle(article);
            });

            node.querySelectorAll(MEDIA_QUERY).forEach((element) => {
                const article = element.closest("article");
                if (article instanceof HTMLElement) {
                    evaluateArticle(article);
                }
            });

            if (VIDEO_ARIA_QUERY) {
                node.querySelectorAll(VIDEO_ARIA_QUERY).forEach((element) => {
                    const article = element.closest("article");
                    if (article instanceof HTMLElement) {
                        evaluateArticle(article);
                    }
                });
            }

            return;
        }

        if (!(node instanceof HTMLElement)) {
            return;
        }

        if (node.tagName === "ARTICLE") {
            evaluateArticle(node);
        }

        node.querySelectorAll("article").forEach((article) => {
            evaluateArticle(article);
        });

        node.querySelectorAll(MEDIA_QUERY).forEach((element) => {
            const article = element.closest("article");
            if (article instanceof HTMLElement) {
                evaluateArticle(article);
            }
        });

        if (VIDEO_ARIA_QUERY) {
            node.querySelectorAll(VIDEO_ARIA_QUERY).forEach((element) => {
                const article = element.closest("article");
                if (article instanceof HTMLElement) {
                    evaluateArticle(article);
                }
            });
        }
    }

    function sweep(root) {
        if (!(root instanceof HTMLElement || root instanceof Document)) {
            return;
        }

        const queryRoot = root;

        if (root instanceof HTMLElement && root.tagName === "ARTICLE") {
            evaluateArticle(root);
        }

        if (typeof queryRoot.querySelectorAll === "function") {
            queryRoot.querySelectorAll("article").forEach((article) => {
                evaluateArticle(article);
            });
        }
    }

    function start() {
        if (observer) {
            return;
        }

        ensureStyle();
        sweep(document);

        observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    handleNode(node);
                });
            });
        });

        observer.observe(document.body || document.documentElement, {
            childList: true,
            subtree: true
        });
    }

    function stop() {
        if (observer) {
            observer.disconnect();
            observer = null;
        }

        unhideAll();
    }

    return {
        enable: start,
        disable: stop
    };
}

function createSuggestedUsersController() {
    const hiddenSections = new Set();
    const hiddenItems = new Set();
    let observer = null;
    const styleId = "nrfi-suggested-users-style";
    const SUGGESTION_LABELS = [
        "suggestion",
        "suggestions for you",
        "pour vous",
        "sugerencias para ti",
        "vorschlage fur dich",
        "suggerimenti per te",
        "اقتراحات لك"
    ];
    const FOLLOW_LABELS = new Set([
        "follow",
        "suivre",
        "seguir",
        "folgen",
        "segui",
        "متابعة"
    ]);

    function ensureStyle() {
        if (document.getElementById(styleId)) {
            return;
        }

        const style = document.createElement("style");
        style.id = styleId;
        style.textContent = "[data-nrfi-hidden-users=\"true\"]{display:none!important;}";
        (document.head || document.documentElement).appendChild(style);
    }

    function markHidden(element) {
        if (!(element instanceof HTMLElement) || element.dataset.nrfiHiddenUsers === "true") {
            return;
        }

        element.dataset.nrfiHiddenUsers = "true";
        hiddenItems.add(element);
    }

    function clearHidden() {
        hiddenItems.forEach((element) => {
            if (element instanceof HTMLElement) {
                delete element.dataset.nrfiHiddenUsers;
            }
        });
        hiddenItems.clear();

        hiddenSections.forEach((section) => {
            if (section instanceof HTMLElement) {
                delete section.dataset.nrfiHiddenUsers;
            }
        });
        hiddenSections.clear();
    }

    function candidateSections(root) {
        if (!(root instanceof HTMLElement || root instanceof Document || root instanceof DocumentFragment)) {
            return [];
        }

        const headings = [];
        if (root instanceof HTMLElement && root.matches("span, h1, h2, h3, [role='heading']")) {
            headings.push(root);
        }
        root.querySelectorAll("span, h1, h2, h3, [role='heading']").forEach((element) => {
            headings.push(element);
        });
        const results = new Set();

        headings.forEach((heading) => {
            if (!(heading instanceof HTMLElement) || heading.closest("article")) {
                return;
            }

            const labelText = normalizeLabel(heading.textContent);
            if (!labelText) {
                return;
            }

            if (SUGGESTION_LABELS.some((label) => labelText.includes(label))) {
                let section = heading.parentElement;
                let depth = 0;
                while (section instanceof HTMLElement && depth < 8 && !section.matches("body, main, [role='main']")) {
                    const followControls = Array.from(section.querySelectorAll("button, [role='button']")).filter((control) => (
                        control instanceof HTMLElement
                        && !control.closest("article")
                        && (
                            FOLLOW_LABELS.has(normalizeLabel(control.textContent))
                            || FOLLOW_LABELS.has(normalizeLabel(control.getAttribute("aria-label")))
                        )
                    ));
                    const profileLinks = Array.from(section.querySelectorAll("a[href]")).filter((link) => {
                        if (!(link instanceof HTMLElement) || link.closest("article")) {
                            return false;
                        }
                        const segments = linkPathname(link).split("/").filter(Boolean);
                        return segments.length === 1
                            && !["explore", "reels", "direct", "notifications", "accounts"].includes(segments[0]);
                    });
                    // Instagram keeps the "See all" link in the heading row, while
                    // the actual account rows live one level above it. Requiring a
                    // real profile/follow pair prevents us from hiding only that
                    // heading and leaving the recommendations visible.
                    if (followControls.length > 0 && profileLinks.length > 0) {
                        results.add(section);
                        break;
                    }
                    section = section.parentElement;
                    depth += 1;
                }
            }
        });

        root.querySelectorAll('a[href="/explore/people/"]').forEach((link) => {
            if (!(link instanceof HTMLElement) || link.closest("article")) {
                return;
            }

            let section = link.parentElement;
            let depth = 0;
            while (section instanceof HTMLElement && depth < 8 && !section.matches("body, main, [role='main']")) {
                const followControl = Array.from(section.querySelectorAll("button, [role='button']")).find((control) => (
                    control instanceof HTMLElement
                    && !control.closest("article")
                    && (
                        FOLLOW_LABELS.has(normalizeLabel(control.textContent))
                        || FOLLOW_LABELS.has(normalizeLabel(control.getAttribute("aria-label")))
                    )
                ));
                const profileLink = Array.from(section.querySelectorAll("a[href]")).find((candidate) => {
                    if (!(candidate instanceof HTMLElement) || candidate.closest("article")) {
                        return false;
                    }
                    const segments = linkPathname(candidate).split("/").filter(Boolean);
                    return segments.length === 1
                        && !["explore", "reels", "direct", "notifications", "accounts"].includes(segments[0]);
                });

                if (followControl && profileLink) {
                    results.add(section);
                    break;
                }

                section = section.parentElement;
                depth += 1;
            }
        });

        return Array.from(results);
    }

    function hideSuggestionSection(section) {
        if (!(section instanceof HTMLElement)) {
            return;
        }

        const target = section;

        if (target.dataset.nrfiHiddenUsers === "true") {
            return;
        }

        target.dataset.nrfiHiddenUsers = "true";
        hiddenSections.add(target);

        target.querySelectorAll('button, a').forEach((element) => {
            if (element instanceof HTMLElement) {
                markHidden(element.closest('div[class]'));
            }
        });
    }

    function sweep(root) {
        candidateSections(root).forEach((section) => {
            hideSuggestionSection(section);
        });
    }

    function start() {
        if (observer) {
            return;
        }

        ensureStyle();
        sweep(document);

        observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node instanceof HTMLElement) {
                        sweep(node);
                    }
                });
            });
        });

        observer.observe(document.body || document.documentElement, {
            childList: true,
            subtree: true
        });
    }

    function stop() {
        if (observer) {
            observer.disconnect();
            observer = null;
        }

        clearHidden();

        const style = document.getElementById(styleId);
        if (style) {
            style.remove();
        }
    }

    return {
        enable: start,
        disable: stop
    };
}

function createSuggestedPostsController() {
    const hiddenElements = new Set();
    const hiddenPosts = new Map();
    const pendingArticles = new Set();
    let attemptedTabSwitch = new WeakMap();
    let observer = null;
    const styleId = "nrfi-suggested-posts-style";
    const FOLLOWING_ATTEMPT_KEY = "nrfi-following-redirect-attempted";
    const SUGGESTED_CONTROL_SELECTOR = [
        '[role="tab"]',
        'nav a[href]',
        'nav button',
        'nav [role="button"]',
        'header button',
        'header [role="button"]'
    ].join(", ");
    const SUGGESTED_TAB_LABELS = new Set([
        "for you",
        "pour vous",
        "para ti",
        "per te",
        "fur dich",
        "لك"
    ]);
    const FOLLOWING_TAB_LABELS = new Set([
        "following",
        "abonnements",
        "suivis",
        "siguiendo",
        "seguiti",
        "gefolgt"
    ]);
    const SUGGESTED_POST_LABELS = new Set([
        "suggested for you",
        "suggested post",
        "recommended for you",
        "suggestion pour vous",
        "suggestions pour vous",
        "suggere pour vous",
        "recommande pour vous",
        "sugerencias para ti",
        "sugerido para ti",
        "recomendado para ti",
        "vorschlage fur dich",
        "fur dich vorgeschlagen",
        "fur dich empfohlen",
        "suggerimenti per te",
        "suggerito per te",
        "consigliato per te",
        "sugestoes para voce",
        "sugerido para voce",
        "مقترحات لك",
        "مقترح لك",
        "موصى به لك"
    ]);

    function controlLabels(control) {
        if (!(control instanceof HTMLElement)) {
            return [];
        }

        return Array.from(new Set([
            normalizeLabel(control.textContent),
            normalizeLabel(control.getAttribute("aria-label"))
        ].filter(Boolean)));
    }

    function hasKnownLabel(control, labels) {
        const knownLabels = Array.from(labels);
        if (controlLabels(control).some((label) => (
            knownLabels.some((knownLabel) => label === knownLabel || label.startsWith(`${knownLabel} `))
        ))) {
            return true;
        }

        return Array.from(control.querySelectorAll?.("span, [aria-label]") || []).some((element) => (
            leafLabels(element).some((label) => labels.has(label))
        ));
    }

    function forceFollowingVariant() {
        try {
            if (typeof window === "undefined" || !window.location) {
                return;
            }

            const url = new URL(window.location.href);
            if (url.pathname === "/" && url.searchParams.get("variant") === "following") {
                window.sessionStorage?.removeItem(FOLLOWING_ATTEMPT_KEY);
                return;
            }

            const alreadyAttempted = window.sessionStorage?.getItem(FOLLOWING_ATTEMPT_KEY) === "true";
            if (url.pathname === "/" && url.searchParams.get("variant") !== "following" && !alreadyAttempted) {
                window.sessionStorage?.setItem(FOLLOWING_ATTEMPT_KEY, "true");
                url.searchParams.set("variant", "following");
                window.location.replace(url.toString());
            }
        } catch (error) {
            console.error("No Reel For Instagram: failed to redirect to Following", error);
        }
    }

    function scheduleFollowingFallback() {
        window.setTimeout(() => {
            if (document.defaultView !== window) {
                return;
            }
            forceFollowingVariant();
        }, 0);
    }

    function ensureStyleElement() {
        if (document.getElementById(styleId)) {
            return;
        }

        const style = document.createElement("style");
        style.id = styleId;
        style.textContent = `
            [data-nrfi-hidden-tab="true"] {
                display: none !important;
            }
            [data-nrfi-hidden-suggested-post="true"] {}
        `;

        (document.head || document.documentElement).appendChild(style);
    }

    function activateFollowingControl(container, hiddenControl) {
        if (!(container instanceof HTMLElement) || !isHomePath()) {
            return;
        }

        if (attemptedTabSwitch.get(container)) {
            return;
        }

        const controls = Array.from(container.querySelectorAll('[role="tab"], a[href], button, [role="button"]'));
        const followingControl = controls.find((control) => {
            if (!(control instanceof HTMLElement) || control === hiddenControl) {
                return false;
            }

            const href = control.getAttribute("href") || control.querySelector("a[href]")?.getAttribute("href") || "";
            return href.includes("variant=following") || hasKnownLabel(control, FOLLOWING_TAB_LABELS);
        });

        attemptedTabSwitch.set(container, true);

        if (followingControl instanceof HTMLElement && typeof followingControl.click === "function") {
            followingControl.click();
            scheduleFollowingFallback();
            return;
        }

        const actionable = followingControl?.querySelector?.('a[href], button, [role="button"]');
        if (actionable instanceof HTMLElement) {
            actionable.click();
            scheduleFollowingFallback();
            return;
        }

        forceFollowingVariant();
    }

    function getHideTarget(tab) {
        if (!(tab instanceof HTMLElement)) {
            return null;
        }

        return tab.closest('[role="tab"]') || tab;
    }

    function markControlHidden(control, container) {
        if (!(control instanceof HTMLElement) || !(container instanceof HTMLElement)) {
            return;
        }

        const target = getHideTarget(control);
        if (!(target instanceof HTMLElement) || target.dataset.nrfiHiddenTab === "true") {
            return;
        }

        target.dataset.nrfiHiddenTab = "true";
        hiddenElements.add(target);
        activateFollowingControl(container, control);
    }

    function isSuggestedControl(control) {
        return isHomePath()
            && control instanceof HTMLElement
            && hasKnownLabel(control, SUGGESTED_TAB_LABELS);
    }

    function evaluateCandidate(element) {
        if (!(element instanceof HTMLElement) || !isSuggestedControl(element)) {
            return;
        }

        const container = element.closest('[role="tablist"], nav, header');
        if (container instanceof HTMLElement) {
            markControlHidden(element, container);
        }
    }

    function isSuggestedPost(article) {
        if (!(article instanceof HTMLElement) || !article.matches("article")) {
            return false;
        }

        // Suggested-account carousels can use the same label, but do not contain a post permalink.
        if (!articleHasPermalink(article)) {
            return false;
        }

        return articleHasLabel(article, SUGGESTED_POST_LABELS);
    }

    function restorePost(article) {
        const target = hiddenPosts.get(article);
        if (target instanceof HTMLElement) {
            delete target.dataset.nrfiHiddenSuggestedPost;
        }
        feedPlaceholderCoordinator.removeReason(article, "suggested");
        hiddenPosts.delete(article);
    }

    function evaluateArticle(article) {
        if (!(article instanceof HTMLElement) || !article.isConnected) {
            restorePost(article);
            return;
        }

        if (article.dataset.nrfiFeedRevealed === "true" || !isSuggestedPost(article)) {
            restorePost(article);
            return;
        }

        const existingTarget = hiddenPosts.get(article);
        if (existingTarget instanceof HTMLElement && article.contains(existingTarget)) {
            feedPlaceholderCoordinator.addReason(
                article,
                "suggested",
                "data-nrfi-hidden-suggested-post"
            );
            return;
        }

        if (existingTarget instanceof HTMLElement) {
            delete existingTarget.dataset.nrfiHiddenSuggestedPost;
        }

        // Keep the article node in the feed so Instagram's infinite-scroll bookkeeping survives.
        const target = article.firstElementChild instanceof HTMLElement
            ? article.firstElementChild
            : article;
        target.dataset.nrfiHiddenSuggestedPost = "true";
        hiddenPosts.set(article, target);
        feedPlaceholderCoordinator.addReason(
            article,
            "suggested",
            "data-nrfi-hidden-suggested-post"
        );
    }

    function pruneDisconnectedPosts() {
        hiddenPosts.forEach((target, article) => {
            if (!article.isConnected || !(target instanceof HTMLElement) || !target.isConnected) {
                hiddenPosts.delete(article);
            }
        });
        feedPlaceholderCoordinator.prune();
    }

    function flushPendingArticles() {
        pruneDisconnectedPosts();

        const articles = Array.from(pendingArticles);
        pendingArticles.clear();
        articles.forEach((article) => evaluateArticle(article));
    }

    function scheduleArticle(article) {
        if (!(article instanceof HTMLElement) || !article.matches("article")) {
            return;
        }

        pendingArticles.add(article);
    }

    function scheduleNodeArticles(node) {
        if (!(node instanceof HTMLElement || node instanceof DocumentFragment)) {
            return;
        }

        if (node instanceof HTMLElement) {
            const containingArticle = node.matches("article") ? node : node.closest("article");
            if (containingArticle instanceof HTMLElement) {
                scheduleArticle(containingArticle);
            }
        }

        node.querySelectorAll?.("article").forEach(scheduleArticle);
    }

    function evaluateControls(root) {
        if (!(root instanceof HTMLElement || root instanceof Document || root instanceof DocumentFragment)) {
            return;
        }

        if (root instanceof HTMLElement) {
            const control = root.matches(SUGGESTED_CONTROL_SELECTOR)
                ? root
                : root.closest(SUGGESTED_CONTROL_SELECTOR);
            if (control instanceof HTMLElement) {
                evaluateCandidate(control);
            }
        }

        root.querySelectorAll?.(SUGGESTED_CONTROL_SELECTOR).forEach(evaluateCandidate);
    }

    function sweep(root) {
        if (!isHomePath()) {
            clearHidden();
            return;
        }

        forceFollowingVariant();

        if (!(root instanceof HTMLElement || root instanceof Document || root instanceof DocumentFragment)) {
            return;
        }

        evaluateControls(root);

        if (root instanceof HTMLElement) {
            const article = root.matches("article") ? root : root.closest("article");
            if (article instanceof HTMLElement) {
                evaluateArticle(article);
            }
        }

        root.querySelectorAll?.("article").forEach((article) => {
            evaluateArticle(article);
        });
    }

    function clearHidden() {
        hiddenElements.forEach((element) => {
            if (element instanceof HTMLElement) {
                delete element.dataset.nrfiHiddenTab;
            }
        });
        hiddenElements.clear();

        hiddenPosts.forEach((target, article) => {
            if (target instanceof HTMLElement) {
                delete target.dataset.nrfiHiddenSuggestedPost;
            }
            feedPlaceholderCoordinator.removeReason(article, "suggested");
        });
        hiddenPosts.clear();
        pendingArticles.clear();
        attemptedTabSwitch = new WeakMap();
    }

    function reset() {
        clearHidden();

        const style = document.getElementById(styleId);
        if (style) {
            style.remove();
        }
    }

    function start() {
        if (observer) {
            return;
        }

        ensureStyleElement();
        sweep(document);

        observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                const mutationTarget = mutation.target instanceof HTMLElement
                    ? mutation.target
                    : mutation.target.parentElement;
                if (mutationTarget instanceof HTMLElement) {
                    if (mutation.type === "attributes" || mutation.type === "characterData") {
                        const control = mutationTarget.matches(SUGGESTED_CONTROL_SELECTOR)
                            ? mutationTarget
                            : mutationTarget.closest(SUGGESTED_CONTROL_SELECTOR);
                        if (control instanceof HTMLElement) {
                            evaluateCandidate(control);
                        }
                    }
                    const article = mutationTarget.closest("article");
                    if (article instanceof HTMLElement) {
                        scheduleArticle(article);
                    }
                }

                mutation.addedNodes.forEach((node) => {
                    if (node instanceof HTMLElement || node instanceof DocumentFragment) {
                        evaluateControls(node);
                        scheduleNodeArticles(node);
                    }
                });

            });

            // Keep every feed classifier in the same MutationObserver turn so
            // Instagram cannot paint an intermediate full-height article.
            flushPendingArticles();
        });

        observer.observe(document.body || document.documentElement, {
            attributes: true,
            attributeFilter: ["aria-label", "href"],
            childList: true,
            characterData: true,
            subtree: true
        });
    }

    function stop() {
        if (observer) {
            observer.disconnect();
            observer = null;
        }
        reset();
    }

    return {
        enable: start,
        disable: stop
    };
}

function createSponsoredPostsController() {
    const SPONSORED_LABELS = new Set([
        "sponsored",
        "sponsorise",
        "sponsorisee",
        "publicite",
        "patrocinado",
        "patrocinada",
        "publicidad",
        "gesponsert",
        "sponsorizzato",
        "sponsorizzata",
        "ممول",
        "مموّل",
        "اعلان ممول",
        "إعلان ممول"
    ]);

    return createArticleFilterController({
        styleId: "nrfi-sponsored-posts-style",
        hiddenAttribute: "data-nrfi-hidden-sponsored-post",
        reason: "sponsored",
        isActivePath: isHomePath,
        matchesArticle(article) {
            if (!(article instanceof HTMLElement)) {
                return false;
            }

            if (article.querySelector('a[href*="facebook.com/ads/ig_redirect"]')) {
                return true;
            }

            return articleHasLabel(article, SPONSORED_LABELS);
        }
    });
}

function createCollapsedReelsPreferenceController() {
    return {
        enable() {
            feedPlaceholderCoordinator.setCollapsedPreference(true);
        },
        disable() {
            feedPlaceholderCoordinator.setCollapsedPreference(false);
        }
    };
}

const controllers = {
    hideReels: createReelsController(),
    keepReelsCollapsed: createCollapsedReelsPreferenceController(),
    hideSearchReels: createSearchReelsController(),
    hideExploreTab: createExploreController(),
    hideSuggestedPosts: createSuggestedPostsController(),
    hideSponsoredPosts: createSponsoredPostsController(),
    hideSuggestedUsers: createSuggestedUsersController(),
    hideStories: createStoriesController()
};

async function requestSettings() {
    try {
        // Content scripts can read extension storage directly. Avoid waiting on a
        // suspended Safari service worker before activating page filters.
        return await loadSettingsDirectly();
    } catch (error) {
        console.error("No Reel For Instagram: unable to read settings from storage", error);
        return { ...defaultSettings };
    }
}

function applySettings(settings) {
    const sanitized = {};

    for (const [key, defaultValue] of Object.entries(defaultSettings)) {
        if (Object.prototype.hasOwnProperty.call(settings, key)) {
            sanitized[key] = Boolean(settings[key]);
        } else {
            sanitized[key] = Boolean(defaultValue);
        }
    }

    currentSettings = sanitized;

    Object.entries(controllers).forEach(([feature, controller]) => {
        const isEnabled = Boolean(sanitized[feature]);
        try {
            if (isEnabled && controller && typeof controller.enable === "function") {
                controller.enable();
            } else if (!isEnabled && controller && typeof controller.disable === "function") {
                controller.disable();
            }
        } catch (error) {
            console.error(`No Reel For Instagram: failed to ${isEnabled ? "enable" : "disable"} ${feature}`, error);
        }
    });
}

function handleStorageChanges(changes, areaName) {
    if (areaName && storageCandidates.length > 0 && !storageCandidates.some((candidate) => candidate.name === areaName)) {
        return;
    }

    const nextSettings = { ...currentSettings };
    let didUpdate = false;

    Object.keys(controllers).forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(changes, key)) {
            const change = changes[key];
            if (change && Object.prototype.hasOwnProperty.call(change, "newValue")) {
                if (typeof change.newValue === "undefined") {
                    delete nextSettings[key];
                } else {
                    nextSettings[key] = change.newValue;
                }
                didUpdate = true;
            }
        }
    });

    if (didUpdate) {
        applySettings(nextSettings);
    }
}

async function init() {
    if (initialized || initializationInProgress) {
        return;
    }

    if (!document.documentElement) {
        return;
    }

    initializationInProgress = true;

    try {
        const settings = await requestSettings();
        applySettings(settings);
        initialized = true;
        document.documentElement.dataset.nrfiReady = "true";
    } catch (error) {
        console.error("No Reel For Instagram: initialization failed", error);
    } finally {
        initializationInProgress = false;
    }

    if (!storageListenerRegistered && api?.storage?.onChanged?.addListener) {
        api.storage.onChanged.addListener(handleStorageChanges);
        storageListenerRegistered = true;
    }
}

let rootObserver = null;

function initializeWhenRootExists() {
    if (!document.documentElement) {
        return;
    }

    if (rootObserver) {
        rootObserver.disconnect();
        rootObserver = null;
    }

    init();
}

initializeWhenRootExists();

if (!document.documentElement) {
    rootObserver = new MutationObserver(initializeWhenRootExists);
    rootObserver.observe(document, { childList: true });
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeWhenRootExists, { once: true });
}
})();
