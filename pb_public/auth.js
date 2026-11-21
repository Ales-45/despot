async function signInWithGoogle(pb) {
    await pb.collection("users").authWithOAuth2({
        provider: "google",
        queryParams: { scope: "openid email" }
    });
    const updated = await pb.collection("users").update(pb.authStore.model.id, {
        name: "",
        avatar: ""
    });
    pb.authStore.save(pb.authStore.token, updated);
}

function showNotice(message, code, kind, closeLabel, timeout = 0, messageKey = "") {
    const toast = document.createElement("div");
    toast.className = `toast ${kind}`;
    toast.dataset.messageKey = messageKey;
    const badge = document.createElement("span");
    badge.className = "toast-code";
    badge.textContent = code;
    const text = document.createElement("span");
    text.textContent = message;
    const close = document.createElement("button");
    close.type = "button";
    close.className = "toast-close";
    close.setAttribute("aria-label", closeLabel);
    close.textContent = "×";
    close.addEventListener("click", () => toast.remove());
    toast.append(badge, text, close);
    document.getElementById("toast-stack").append(toast);
    if (timeout) setTimeout(() => toast.remove(), timeout);
}

function translateNotices(messages, closeLabel) {
    document.querySelectorAll("#toast-stack .toast").forEach((toast) => {
        const message = messages[toast.dataset.messageKey];
        if (message) toast.children[1].textContent = message;
        toast.querySelector(".toast-close").setAttribute("aria-label", closeLabel);
    });
}

function setupModal(element, onClose = () => {}) {
    let trigger = null;

    function close() {
        if (element.classList.contains("hidden")) return;
        element.classList.add("hidden");
        onClose();
        if (trigger?.isConnected) trigger.focus();
        trigger = null;
    }

    function open(initialFocus) {
        trigger = document.activeElement;
        element.classList.remove("hidden");
        (initialFocus || element.querySelector("button, input, a[href]"))?.focus();
    }

    element.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            close();
        } else if (event.key === "Tab") {
            const focusable = [...element.querySelectorAll("button:not(:disabled), input:not(:disabled), a[href], [tabindex]:not([tabindex='-1'])")]
                .filter(item => item.getClientRects().length);
            if (!focusable.length) {
                event.preventDefault();
            } else if (event.shiftKey && document.activeElement === focusable[0]) {
                event.preventDefault();
                focusable[focusable.length - 1].focus();
            } else if (!event.shiftKey && document.activeElement === focusable[focusable.length - 1]) {
                event.preventDefault();
                focusable[0].focus();
            }
        }
    });

    return { open, close };
}

function setupLanguageMenu(button, menu, onSelect) {
    const container = button.parentElement;
    function close() {
        menu.hidden = true;
        button.setAttribute("aria-expanded", "false");
    }

    button.setAttribute("aria-controls", menu.id);
    button.addEventListener("click", () => {
        menu.hidden = !menu.hidden;
        button.setAttribute("aria-expanded", String(!menu.hidden));
    });
    menu.addEventListener("click", (event) => {
        const option = event.target.closest("button[data-lang]");
        if (!option) return;
        onSelect(option.dataset.lang);
        close();
        button.focus();
    });
    document.addEventListener("click", (event) => {
        if (!container.contains(event.target)) close();
    });
    document.addEventListener("focusin", (event) => {
        if (!container.contains(event.target)) close();
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !menu.hidden) {
            close();
            button.focus();
        }
    });
}

function setupAuthMenu(pb, onLogin) {
    const button = document.getElementById("btn-auth");
    const menu = document.getElementById("auth-menu");
    const container = button.parentElement;

    function closeMenu() {
        menu.hidden = true;
        if (pb?.authStore.isValid) button.setAttribute("aria-expanded", "false");
    }

    function syncMenu() {
        closeMenu();
        if (pb?.authStore.isValid) {
            button.setAttribute("aria-haspopup", "true");
            button.setAttribute("aria-controls", "auth-menu");
            button.setAttribute("aria-expanded", "false");
        } else {
            button.removeAttribute("aria-haspopup");
            button.removeAttribute("aria-controls");
            button.removeAttribute("aria-expanded");
        }
    }

    button.addEventListener("click", () => {
        if (!pb?.authStore.isValid) {
            onLogin();
            return;
        }
        menu.hidden = !menu.hidden;
        button.setAttribute("aria-expanded", String(!menu.hidden));
    });
    document.addEventListener("click", (event) => {
        if (!container.contains(event.target)) closeMenu();
    });
    document.addEventListener("focusin", (event) => {
        if (!container.contains(event.target)) closeMenu();
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !menu.hidden) {
            closeMenu();
            button.focus();
        }
    });
    document.getElementById("btn-logout").addEventListener("click", () => {
        pb.authStore.clear();
        window.location.href = "/";
    });
    if (pb) pb.authStore.onChange(syncMenu);
    syncMenu();
}
