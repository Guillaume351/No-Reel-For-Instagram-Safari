function show(platform, enabled, useSettingsInsteadOfPreferences) {
    document.body.classList.add(`platform-${platform}`);

    if (useSettingsInsteadOfPreferences) {
        document.getElementsByClassName('platform-mac state-on')[0].innerText = "No Reel For Instagram is active. Manage it in Safari Settings > Extensions to keep Reels blocked.";
        document.getElementsByClassName('platform-mac state-off')[0].innerText = "No Reel For Instagram is off. Enable it in Safari Settings > Extensions to remove Reels and For You feeds.";
        document.getElementsByClassName('platform-mac state-unknown')[0].innerText = "Turn on No Reel For Instagram from Safari Settings > Extensions to hide Reels and suggested content.";
        document.getElementsByClassName('platform-mac open-preferences')[0].innerText = "Quit and Open Safari Settings…";
    }

    if (typeof enabled === "boolean") {
        document.body.classList.toggle(`state-on`, enabled);
        document.body.classList.toggle(`state-off`, !enabled);
    } else {
        document.body.classList.remove(`state-on`);
        document.body.classList.remove(`state-off`);
    }
}

function openPreferences() {
    webkit.messageHandlers.controller.postMessage("open-preferences");
}

document.querySelector("button.open-preferences").addEventListener("click", openPreferences);
