const pb = new PocketBase(window.location.origin);
const languageButton = document.getElementById("btn-lang");
const languageMenu = document.getElementById("lang-menu");
const translations = {
    ES: {
        rules: "Reglas", profile: "Perfil", deleteTitle: "Eliminar cuenta",
        deleteWarning: "Esta acción eliminará tu cuenta y no se puede deshacer.",
        username: "Nombre de usuario", chooseAvatar: "Elige tu imagen", save: "Guardar",
        logout: "Cerrar sesión", deleteAccount: "Eliminar cuenta", confirmDelete: "Eliminar", cancel: "Cancelar"
    },
    EN: {
        rules: "Rules", profile: "Profile", deleteTitle: "Delete account",
        deleteWarning: "This action will permanently delete your account.",
        username: "Username", chooseAvatar: "Choose your image", save: "Save",
        logout: "Log out", deleteAccount: "Delete account", confirmDelete: "Delete", cancel: "Cancel"
    },
    IT: {
        rules: "Regole", profile: "Profilo", deleteTitle: "Elimina account",
        deleteWarning: "Questa azione eliminerà definitivamente il tuo account.",
        username: "Nome utente", chooseAvatar: "Scegli la tua immagine", save: "Salva",
        logout: "Esci", deleteAccount: "Elimina account", confirmDelete: "Elimina", cancel: "Annulla"
    }
};

function applyTranslations() {
    const language = translations[languageButton.dataset.language] || translations.ES;
    document.documentElement.lang = languageButton.dataset.language.toLowerCase();
    document.querySelectorAll("[data-i18n]").forEach((element) => {
        element.textContent = language[element.dataset.i18n];
    });
}

function setStatus(message, isError = false) {
    const status = document.getElementById("profile-status");
    status.textContent = message;
    status.classList.toggle("is-error", isError);
}

function getErrorMessage(error, fallback) {
    const language = languageButton.dataset.language;
    const message = error?.response?.message || error?.message || "";
    if (message.includes("Failed to") || message.includes("Something went wrong")) {
        return language === "EN" ? fallback.en : language === "IT" ? fallback.it : fallback.es;
    }
    return message || fallback.es;
}

function updateProfileView() {
    const model = pb.authStore.model;
    const username = model.username || "Jugador";
    const avatar = model.profile_avatar || "assets/profile/prof01.svg";
    document.getElementById("profile-username-input").value = username;
    document.getElementById("profile-avatar").src = avatar;
    document.querySelectorAll(".profile-avatar-option").forEach((item) => {
        item.classList.toggle("is-active", item.dataset.avatar === avatar);
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
        button.innerHTML = `<img src="${source}" alt="Perfil ${index}">`;
        button.addEventListener("click", () => {
            document.querySelectorAll(".profile-avatar-option").forEach((item) => item.classList.remove("is-active"));
            button.classList.add("is-active");
            document.getElementById("profile-avatar").src = source;
        });
        grid.append(button);
    }
}

document.getElementById("btn-theme").addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("despot-theme", next);
});

document.getElementById("btn-nav-rules").addEventListener("click", () => {
    window.location.href = "/#rules";
});

document.getElementById("btn-auth").addEventListener("click", () => {
    window.location.reload();
});

languageButton.addEventListener("click", (event) => {
    event.stopPropagation();
    languageMenu.hidden = !languageMenu.hidden;
    languageButton.setAttribute("aria-expanded", String(!languageMenu.hidden));
});

languageMenu.addEventListener("click", (event) => {
    const option = event.target.closest("button[data-lang]");
    if (!option) return;
    languageButton.dataset.language = option.dataset.lang;
    languageButton.textContent = option.dataset.lang;
    languageMenu.hidden = true;
    languageButton.setAttribute("aria-expanded", "false");
    localStorage.setItem("despot-language", option.dataset.lang);
    applyTranslations();
});

document.addEventListener("click", () => {
    languageMenu.hidden = true;
    languageButton.setAttribute("aria-expanded", "false");
});

document.getElementById("btn-save-profile").addEventListener("click", async () => {
    const username = document.getElementById("profile-username-input").value.trim();
    const avatar = document.querySelector(".profile-avatar-option.is-active")?.dataset.avatar
        || "assets/profile/prof01.svg";
    if (!/^[\p{L}\p{N}_ -]{2,32}$/u.test(username)) {
        setStatus("El nombre debe tener entre 2 y 32 caracteres.", true);
        return;
    }
    try {
        const updated = await pb.collection("users").update(pb.authStore.model.id, {
            username,
            profile_avatar: avatar,
            name: ""
        });
        pb.authStore.save(pb.authStore.token, updated);
        updateProfileView();
        setStatus("Perfil guardado.");
    } catch (error) {
        setStatus(getErrorMessage(error, {
            es: "No se pudo guardar el perfil.",
            en: "The profile could not be saved.",
            it: "Impossibile salvare il profilo."
        }), true);
    }
});

document.getElementById("btn-logout").addEventListener("click", () => {
    pb.authStore.clear();
    window.location.href = "/";
});

const deleteModal = document.getElementById("delete-account-modal");
function closeDeleteModal() {
    deleteModal.classList.add("hidden");
}

document.getElementById("btn-delete-account").addEventListener("click", () => {
    deleteModal.classList.remove("hidden");
});
document.getElementById("btn-close-delete-account").addEventListener("click", closeDeleteModal);
document.getElementById("btn-cancel-delete").addEventListener("click", closeDeleteModal);
document.getElementById("btn-confirm-delete").addEventListener("click", async () => {
    try {
        await pb.collection("users").delete(pb.authStore.model.id);
        pb.authStore.clear();
        window.location.href = "/";
    } catch (error) {
        setStatus(getErrorMessage(error, {
            es: "No se pudo eliminar la cuenta.",
            en: "The account could not be deleted.",
            it: "Impossibile eliminare l'account."
        }), true);
    }
});

const savedTheme = localStorage.getItem("despot-theme") || "dark";
const savedLanguage = localStorage.getItem("despot-language") || "ES";
document.documentElement.dataset.theme = savedTheme;
languageButton.dataset.language = savedLanguage;
languageButton.textContent = savedLanguage;

if (!pb.authStore.isValid) {
    window.location.href = "/";
} else {
    buildAvatarGrid();
    applyTranslations();
    updateProfileView();
    document.getElementById("header-avatar").src = pb.authStore.model.profile_avatar || "assets/profile/prof01.svg";
}
