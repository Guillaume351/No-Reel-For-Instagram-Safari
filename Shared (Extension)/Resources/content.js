const api = typeof browser !== "undefined" ? browser : chrome;

const controllers = {
    hideReels: createReelsController(),
    hideSuggestedPosts: createSuggestedPostsController(),
    hideSuggestedUsers: createSuggestedUsersController(),
    hideStories: createStoriesController()
};

let currentSettings = {};

function createNoopController(name) {
    return {
        enable() {
            console.debug(`No Reel For Instagram: controller ${name} not implemented yet.`);
        },
        disable() {
            // Intentionally empty until we have a strategy for this surface.
        }
    };
}

function createReelsController() {
    const hiddenNavItems = new Set();
    let observer = null;
    const styleId = "nrfi-reels-style";

    const LINK_PATTERNS = [
        /\/reels\/?/,
        /\/explore\/?/
    ];

    function ensureStyle() {
        if (document.getElementById(styleId)) {
            return;
        }

        const style = document.createElement("style");
        style.id = styleId;
        style.textContent = "[data-nrfi-hidden-nav=\"true\"]{display:none!important;}";
        (document.head || document.documentElement).appendChild(style);
    }

    function isReelsLink(link) {
        if (!(link instanceof HTMLElement)) {
            return false;
        }

        const href = link.getAttribute("href") || "";
        if (LINK_PATTERNS.some((pattern) => pattern.test(href))) {
            return true;
        }

        const label = (link.textContent || "").trim().toLowerCase();
        return label.includes("reels") || label.includes("découvrir") || label.includes("explore");
    }

    function hideNavLink(link) {
        const navItem = link.closest('a[role="link"]') || link.closest("a") || link;
        if (!(navItem instanceof HTMLElement) || navItem.dataset.nrfiHiddenNav === "true") {
            return;
        }

        navItem.dataset.nrfiHiddenNav = "true";
        hiddenNavItems.add(navItem);
    }

    function sweep(root) {
        root.querySelectorAll('a[href]').forEach((link) => {
            if (isReelsLink(link)) {
                hideNavLink(link);
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

        hiddenNavItems.forEach((item) => {
            if (item instanceof HTMLElement) {
                delete item.dataset.nrfiHiddenNav;
            }
        });
        hiddenNavItems.clear();

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

function createStoriesController() {
    const hiddenElements = new Set();
    let observer = null;
    const styleId = "nrfi-stories-style";

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

    function hideStoriesContainer(list) {
        if (!(list instanceof HTMLElement)) {
            return;
        }

        const tray = list.closest('div[role="presentation"]') || list.closest('div');
        const parent = tray instanceof HTMLElement ? tray.parentElement : null;
        const grandParent = parent instanceof HTMLElement ? parent.parentElement : null;

        [tray, parent, grandParent].forEach((element) => {
            if (element instanceof HTMLElement) {
                markHidden(element);
            }
        });
    }

    function sweep(root) {
        root.querySelectorAll('ul._acay').forEach((list) => {
            hideStoriesContainer(list);
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

function createSuggestedUsersController() {
    const hiddenSections = new Set();
    const hiddenItems = new Set();
    let observer = null;
    const styleId = "nrfi-suggested-users-style";

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
        const headings = Array.from(root.querySelectorAll('span._ap3a._aaco._aacw._aacx._aad7'));
        const results = new Set();

        headings.forEach((heading) => {
            if (!(heading instanceof HTMLElement)) {
                return;
            }

            const labelText = (heading.textContent || "").trim().toLowerCase();
            if (!labelText) {
                return;
            }

            if (labelText.includes("suggestion")) {
                const section = heading.closest('div[class]')?.closest('div[class]');
                if (section instanceof HTMLElement) {
                    results.add(section);
                }
            }
        });

        root.querySelectorAll('a[href="/explore/people/"]').forEach((link) => {
            if (link instanceof HTMLElement) {
                const section = link.closest('div[class]')?.closest('div[class]');
                if (section instanceof HTMLElement) {
                    results.add(section);
                }
            }
        });

        return Array.from(results);
    }

    function hideSuggestionSection(section) {
        if (!(section instanceof HTMLElement)) {
            return;
        }

        const listContainer = section.closest('div[style*="flex-direction:column"]');
        const railContainer = section.closest('div[class*="xqui205"]');
        const target = railContainer instanceof HTMLElement
            ? railContainer
            : listContainer instanceof HTMLElement
                ? listContainer
                : section;

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
    const attemptedTabSwitch = new WeakMap();
    let observer = null;
    const styleId = "nrfi-suggested-posts-style";

    function ensureStyleElement() {
        if (document.getElementById(styleId)) {
            return;
        }

        const style = document.createElement("style");
        style.id = styleId;
        style.textContent = "[data-nrfi-hidden-tab=\"true\"]{display:none!important;}";

        (document.head || document.documentElement).appendChild(style);
    }

    function activateFollowingTab(tabList, hiddenTab) {
        if (!(tabList instanceof HTMLElement)) {
            return;
        }

        if (attemptedTabSwitch.get(tabList)) {
            return;
        }

        const tabs = Array.from(tabList.querySelectorAll('[role="tab"]'));
        if (tabs.length < 2) {
            return;
        }

        attemptedTabSwitch.set(tabList, true);

        const fallbackUrl = () => {
            if (typeof window !== "undefined" && window.location) {
                try {
                    const url = new URL(window.location.href);
                    if (url.pathname === "/" && url.searchParams.get("variant") !== "following") {
                        url.searchParams.set("variant", "following");
                        window.location.replace(url.toString());
                    }
                } catch (error) {
                    console.error("No Reel For Instagram: failed to redirect to Following", error);
                }
            }
        };

        for (const tab of tabs) {
            if (tab === hiddenTab) {
                continue;
            }

            if (typeof tab.click === "function") {
                tab.click();
                window.setTimeout(fallbackUrl, 300);
                return;
            }

            const actionable = tab.querySelector('a[href], button');
            if (actionable instanceof HTMLElement) {
                actionable.click();
                window.setTimeout(fallbackUrl, 300);
                return;
            }
        }

        fallbackUrl();
    }

    function getHideTarget(tab) {
        if (!(tab instanceof HTMLElement)) {
            return null;
        }

        const candidate = tab.parentElement instanceof HTMLElement ? tab.parentElement : tab;
        return candidate;
    }

    function markTabHidden(tab) {
        if (!(tab instanceof HTMLElement)) {
            return;
        }

        const target = getHideTarget(tab);
        if (!(target instanceof HTMLElement) || target.dataset.nrfiHiddenTab === "true") {
            return;
        }

        target.dataset.nrfiHiddenTab = "true";
        hiddenElements.add(target);

        const tabList = tab.closest('[role="tablist"]');
        activateFollowingTab(tabList, tab);
    }

    function isSuggestedTab(tab) {
        if (!(tab instanceof HTMLElement)) {
            return false;
        }

        const tabList = tab.closest('[role="tablist"]');
        if (!tabList) {
            return false;
        }

        const tabs = Array.from(tabList.querySelectorAll('[role="tab"]'));
        return tabs.length > 1 && tabs[0] === tab;
    }

    function evaluateCandidate(element) {
        if (!(element instanceof HTMLElement)) {
            return;
        }

        const tab = element.getAttribute("role") === "tab"
            ? element
            : element.closest('[role="tab"]');

        if (!tab) {
            return;
        }

        if (isSuggestedTab(tab)) {
            markTabHidden(tab);
        }
    }

    function sweep(root) {
        root.querySelectorAll('[role="tab"]').forEach((tab) => {
            evaluateCandidate(tab);
        });
    }

    function reset() {
        hiddenElements.forEach((element) => {
            if (element instanceof HTMLElement) {
                delete element.dataset.nrfiHiddenTab;
            }
        });
        hiddenElements.clear();
        attemptedTabSwitch.clear();

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
                mutation.addedNodes.forEach((node) => {
                    if (node instanceof HTMLElement) {
                        evaluateCandidate(node);
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
        reset();
    }

    return {
        enable: start,
        disable: stop
    };
}

function sendMessage(message) {
    if (typeof browser !== "undefined") {
        return api.runtime.sendMessage(message);
    }

    return new Promise((resolve, reject) => {
        api.runtime.sendMessage(message, (response) => {
            const error = api.runtime.lastError;
            if (error) {
                reject(error);
            } else {
                resolve(response);
            }
        });
    });
}

async function requestSettings() {
    try {
        const response = await sendMessage({ type: "getSettings" });
        return response?.settings ?? {};
    } catch (error) {
        console.error("No Reel For Instagram: failed to request settings", error);
        return {};
    }
}

function applySettings(settings) {
    currentSettings = { ...settings };

    Object.entries(controllers).forEach(([feature, controller]) => {
        const isEnabled = Boolean(settings[feature]);
        if (isEnabled && controller && typeof controller.enable === "function") {
            controller.enable();
        } else if (!isEnabled && controller && typeof controller.disable === "function") {
            controller.disable();
        }
    });
}

function handleStorageChanges(changes, areaName) {
    if (areaName !== "sync") {
        return;
    }

    const nextSettings = { ...currentSettings };
    let didUpdate = false;

    Object.keys(controllers).forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(changes, key)) {
            nextSettings[key] = changes[key].newValue;
            didUpdate = true;
        }
    });

    if (didUpdate) {
        applySettings(nextSettings);
    }
}

async function init() {
    const settings = await requestSettings();
    applySettings(settings);
    api.storage.onChanged.addListener(handleStorageChanges);
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}
