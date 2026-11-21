const pb = new PocketBase(window.location.origin);
const languageButton = document.getElementById("btn-lang");
const languageMenu = document.getElementById("lang-menu");
const translations = {
    ES: {
        skip: "Saltar al contenido", home: "Inicio", theme: "Cambiar tema", language: "Idioma",
        avatarOption: "Imagen", close: "Cerrar", rules: "Reglas", profile: "Perfil", deleteTitle: "Eliminar cuenta",
        deleteWarning: "Esta acción eliminará tu cuenta y no se puede deshacer.",
        username: "Nombre de usuario", player: "Jugador", chooseAvatar: "Elige tu imagen", changeAvatar: "Cambiar imagen de perfil", save: "Guardar",
        logout: "Cerrar sesión", deleteAccount: "Eliminar cuenta", confirmDelete: "Eliminar", cancel: "Cancelar",
        history: "Historial de rondas", loadingHistory: "Cargando...", noHistory: "Aún no hay rondas.", round: "Ronda", win: "Victoria", loss: "Derrota", point: "punto", points: "puntos", historyError: "No se pudo cargar el historial.",
        invalidUsername: "El nombre debe tener entre 2 y 32 caracteres y solo contener letras, números, espacios, guiones o guiones bajos.",
        saved: "Perfil guardado.", saveError: "No se pudo guardar el perfil.", deleteError: "No se pudo eliminar la cuenta.",
        themeError: "No se pudo guardar el tema.", languageError: "No se pudo guardar el idioma.", eloError: "No se pudo actualizar el Elo.", messages: "Mensajes"
    },
    EN: {
        skip: "Skip to content", home: "Home", theme: "Change theme", language: "Language",
        avatarOption: "Image", close: "Close", rules: "Rules", profile: "Profile", deleteTitle: "Delete account",
        deleteWarning: "This action will permanently delete your account.",
        username: "Username", player: "Player", chooseAvatar: "Choose your image", changeAvatar: "Change profile image", save: "Save",
        logout: "Log out", deleteAccount: "Delete account", confirmDelete: "Delete", cancel: "Cancel",
        history: "Round history", loadingHistory: "Loading...", noHistory: "No rounds yet.", round: "Round", win: "Victory", loss: "Defeat", point: "point", points: "points", historyError: "Could not load history.",
        invalidUsername: "The name must be 2 to 32 characters and contain only letters, numbers, spaces, hyphens or underscores.",
        saved: "Profile saved.", saveError: "Could not save the profile.", deleteError: "Could not delete the account.",
        themeError: "Could not save the theme.", languageError: "Could not save the language.", eloError: "Could not refresh Elo.", messages: "Messages"
    },
    IT: {
        skip: "Vai al contenuto", home: "Home", theme: "Cambia tema", language: "Lingua",
        avatarOption: "Immagine", close: "Chiudi", rules: "Regole", profile: "Profilo", deleteTitle: "Elimina account",
        deleteWarning: "Questa azione eliminerà definitivamente il tuo account.",
        username: "Nome utente", player: "Giocatore", chooseAvatar: "Scegli la tua immagine", changeAvatar: "Cambia immagine del profilo", save: "Salva",
        logout: "Esci", deleteAccount: "Elimina account", confirmDelete: "Elimina", cancel: "Annulla",
        history: "Cronologia dei turni", loadingHistory: "Caricamento...", noHistory: "Nessun turno.", round: "Turno", win: "Vittoria", loss: "Sconfitta", point: "punto", points: "punti", historyError: "Impossibile caricare la cronologia.",
        invalidUsername: "Il nome deve contenere da 2 a 32 caratteri: solo lettere, numeri, spazi, trattini o trattini bassi.",
        saved: "Profilo salvato.", saveError: "Impossibile salvare il profilo.", deleteError: "Impossibile eliminare l'account.",
        themeError: "Impossibile salvare il tema.", languageError: "Impossibile salvare la lingua.", eloError: "Impossibile aggiornare l'Elo.", messages: "Messaggi"
    }
};
let historyEntries = [];
let historyLoaded = false;
let defaultUsername = "";
const avatarModal = setupModal(document.getElementById("avatar-modal"));

function renderHistory() {
    const labels = translations[languageButton.dataset.language] || translations.ES;
    const list = document.getElementById("round-history");
    list.replaceChildren();
    if (!historyEntries.length) {
        const item = document.createElement("li");
        item.textContent = historyLoaded ? labels.noHistory : labels.loadingHistory;
        list.append(item);
        return;
    }
    for (const entry of historyEntries) {
        const item = document.createElement("li");
        const date = new Date(entry.recorded_at).toLocaleString(document.documentElement.lang);
        item.textContent = `${date} · ${labels.round} ${entry.round_number} · ${entry.result === "WIN" ? labels.win : labels.loss} · ${entry.points} ${entry.points === 1 ? labels.point : labels.points}`;
        list.append(item);
    }
}

async function loadHistory() {
    try {
        historyEntries = await pb.collection("round_history").getFullList({ sort: "-recorded_at", requestKey: null });
        historyLoaded = true;
        renderHistory();
    } catch (error) {
        document.getElementById("round-history").replaceChildren();
        showProfileError(error, "historyError");
    }
}

function applyTranslations() {
    const language = translations[languageButton.dataset.language] || translations.ES;
    document.documentElement.lang = languageButton.dataset.language.toLowerCase();
    document.querySelectorAll("[data-i18n]").forEach((element) => {
        element.textContent = language[element.dataset.i18n];
    });
    for (const [selector, key] of [[".logo-slot", "home"], ["#btn-theme", "theme"], ["#btn-lang", "language"],
        ["#btn-close-delete-account", "close"], ["#btn-close-avatar", "close"],
        ["#btn-change-avatar", "changeAvatar"], ["#profile-avatar-grid", "chooseAvatar"], ["#toast-stack", "messages"]]) {
        const element = document.querySelector(selector);
        element.setAttribute("aria-label", language[key]);
        if (element.hasAttribute("title")) element.title = language[key];
    }
    document.querySelectorAll(".profile-avatar-option").forEach((button, index) => {
        button.setAttribute("aria-label", `${language.avatarOption} ${index + 1}`);
    });
    if (pb.authStore.model) {
        document.getElementById("header-avatar").src = pb.authStore.model.profile_avatar || "assets/profile/prof01.svg";
        const input = document.getElementById("profile-username-input");
        if (!pb.authStore.model.username && input.value === defaultUsername) input.value = language.player;
        defaultUsername = language.player;
        const label = pb.authStore.model.username || language.profile;
        document.getElementById("btn-auth").setAttribute("aria-label", label);
        document.getElementById("btn-auth").title = label;
    }
    document.title = `${language.profile} | Despot`;
    translateNotices(language, language.close);
    renderHistory();
}

function showProfileError(error, key) {
    console.error("Profile operation failed:", error);
    const language = translations[languageButton.dataset.language] || translations.ES;
    showNotice(language[key], String(error.status || 500), "error", language.close, 0, key);
}

function updateProfileView() {
    const model = pb.authStore.model;
    const language = translations[languageButton.dataset.language] || translations.ES;
    const username = model.username || language.player;
    const avatar = model.profile_avatar || "assets/profile/prof01.svg";
    document.getElementById("profile-username-input").value = username;
    document.getElementById("profile-avatar").src = avatar;
    document.getElementById("header-avatar").src = avatar;
    document.getElementById("btn-auth").setAttribute("aria-label", username);
    document.getElementById("btn-auth").title = username;
    document.getElementById("profile-elo").textContent = model.elo ?? "—";
    document.querySelectorAll(".profile-avatar-option").forEach((item) => {
        const selected = item.dataset.avatar === avatar;
        item.classList.toggle("is-active", selected);
        item.setAttribute("aria-pressed", String(selected));
    });
}

function buildAvatarGrid() {
    const grid = document.getElementById("profile-avatar-grid");
    for (let index = 1; index <= 19; index += 1) {
        const number = String(index).padStart(2, "0");
        const source = `assets/profile/prof${number}.svg`;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "profile-avatar-option";
        button.dataset.avatar = source;
        button.innerHTML = `<img src="${source}" alt="">`;
        button.addEventListener("click", () => {
            document.querySelectorAll(".profile-avatar-option").forEach((item) => {
                item.classList.remove("is-active");
                item.setAttribute("aria-pressed", "false");
            });
            button.classList.add("is-active");
            button.setAttribute("aria-pressed", "true");
            document.getElementById("profile-avatar").src = source;
            avatarModal.close();
        });
        grid.append(button);
    }
}

document.getElementById("btn-change-avatar").addEventListener("click", () => {
    avatarModal.open(document.querySelector(".profile-avatar-option.is-active"));
});
document.getElementById("btn-close-avatar").addEventListener("click", avatarModal.close);

document.getElementById("btn-theme").addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("despot-theme", next);
    pb.collection("users").update(pb.authStore.model.id, { theme: next }).then((updated) => {
        pb.authStore.save(pb.authStore.token, updated);
    }).catch(error => showProfileError(error, "themeError"));
});

setupAuthMenu(pb, () => { window.location.href = "/"; });

setupLanguageMenu(languageButton, languageMenu, (next) => {
    languageButton.dataset.language = next;
    languageButton.textContent = next;
    localStorage.setItem("despot-language", next);
    applyTranslations();
    pb.collection("users").update(pb.authStore.model.id, { language: next }).then((updated) => {
        pb.authStore.save(pb.authStore.token, updated);
    }).catch(error => showProfileError(error, "languageError"));
});

document.getElementById("btn-save-profile").addEventListener("click", async () => {
    const username = document.getElementById("profile-username-input").value.trim();
    const avatar = document.querySelector(".profile-avatar-option.is-active")?.dataset.avatar
        || "assets/profile/prof01.svg";
    if (!/^[\p{L}\p{N}_ -]{2,32}$/u.test(username)) {
        const language = translations[languageButton.dataset.language] || translations.ES;
        showNotice(language.invalidUsername, "400", "error", language.close, 0, "invalidUsername");
        return;
    }
    try {
        const updated = await pb.collection("users").update(pb.authStore.model.id, {
            username,
            profile_avatar: avatar,
            theme: document.documentElement.dataset.theme,
            language: languageButton.dataset.language,
            name: ""
        });
        pb.authStore.save(pb.authStore.token, updated);
        updateProfileView();
        const language = translations[languageButton.dataset.language] || translations.ES;
        showNotice(language.saved, "200", "success", language.close, 7000, "saved");
    } catch (error) {
        showProfileError(error, "saveError");
    }
});

const deleteModal = setupModal(document.getElementById("delete-account-modal"));

document.getElementById("btn-delete-account").addEventListener("click", () => {
    deleteModal.open();
});
document.getElementById("btn-close-delete-account").addEventListener("click", deleteModal.close);
document.getElementById("btn-cancel-delete").addEventListener("click", deleteModal.close);
document.getElementById("btn-confirm-delete").addEventListener("click", async () => {
    try {
        await pb.collection("users").delete(pb.authStore.model.id);
        pb.authStore.clear();
        window.location.href = "/";
    } catch (error) {
        showProfileError(error, "deleteError");
    }
});

const savedTheme = pb.authStore.model?.theme || localStorage.getItem("despot-theme") || "dark";
const savedLanguage = pb.authStore.model?.language || localStorage.getItem("despot-language") || "ES";
document.documentElement.dataset.theme = savedTheme;
languageButton.dataset.language = savedLanguage;
languageButton.textContent = savedLanguage;

if (!pb.authStore.isValid) {
    window.location.href = "/";
} else {
    buildAvatarGrid();
    applyTranslations();
    updateProfileView();
    loadHistory();
    pb.collection("users").getOne(pb.authStore.model.id, { requestKey: null }).then((record) => {
        document.getElementById("profile-elo").textContent = record.elo ?? "—";
    }).catch(error => {
        document.getElementById("profile-elo").textContent = "—";
        showProfileError(error, "eloError");
    });
}
