const pb = typeof PocketBase !== "undefined" ? new PocketBase(window.location.origin) : null;
const savedTheme = pb?.authStore.model?.theme || localStorage.getItem("despot-theme") || "dark";
const savedLanguage = pb?.authStore.model?.language || localStorage.getItem("despot-language") || "ES";
document.documentElement.dataset.theme = savedTheme;
const languageButton = document.getElementById("btn-lang");
const languageMenu = document.getElementById("lang-menu");
languageButton.dataset.language = savedLanguage;
languageButton.textContent = savedLanguage;

const translations = {
    ES: { skip:"Saltar al contenido", home:"Inicio", theme:"Cambiar tema", language:"Idioma", previous:"Anterior", next:"Siguiente", close:"Cerrar", messages:"Mensajes", login:"Acceder", profile:"Perfil", logout:"Cerrar sesión", rules:"Reglas", title:"Reglas de Combate", rolesTitle:"Roles", rolesText:"Recibe tres dados d6: 11 puntos para el atacante y 10 para el defensor. Para activar Turcópolos, deja exactamente 3 puntos sin usar (8 para el atacante o 7 para el defensor); cualquier otra suma inferior no es válida. Fija tu formación cuando estés listo.", battleTitle:"Batalla", battleText:"Los dados se emparejan en espejo desde la perspectiva del atacante. Un valor superior gana su enfrentamiento; en empate gana el defensor. Gana al menos dos secciones para ganar la ronda. El mejor de cinco gana la partida.", orderTitle:"Orden y Desbandada", orderText:"El jugador que ganó la ronda anterior debe jugar una disposición de dados donde haya al menos dos dados con el mismo valor, mientras tanto el jugador que perdió la ronda debe jugar una disposición donde cada dado tiene un valor diferente.", wildcardsTitle:"Crisóbulas" },
    EN: { skip:"Skip to content", home:"Home", theme:"Change theme", language:"Language", previous:"Previous", next:"Next", close:"Close", messages:"Messages", login:"Login", profile:"Profile", logout:"Log out", rules:"Rules", title:"Combat Rules", rolesTitle:"Roles", rolesText:"Receive three d6 dice: 11 points for the attacker and 10 for the defender. To trigger Turcopoles, leave exactly 3 points unused (8 for the attacker or 7 for the defender); any other lower total is invalid. Lock your formation when ready.", battleTitle:"Battle", battleText:"Dice are paired in mirror from the attacker's perspective. A higher value wins; ties go to the defender. Win at least two sections to win the round. Best of five wins the match.", orderTitle:"Order and Rout", orderText:"The player who won the previous round must play dice arranged with at least two dice having the same value, while the player who lost must play a formation in which every die has a different value.", wildcardsTitle:"Chrysobulls" },
    IT: { skip:"Vai al contenuto", home:"Home", theme:"Cambia tema", language:"Lingua", previous:"Precedente", next:"Successivo", close:"Chiudi", messages:"Messaggi", login:"Accedi", profile:"Profilo", logout:"Esci", rules:"Regole", title:"Regole di combattimento", rolesTitle:"Ruoli", rolesText:"Ricevi tre dadi d6: 11 punti per l'attaccante e 10 per il difensore. Per attivare i Turcopoli, lascia esattamente 3 punti inutilizzati (8 per l'attaccante o 7 per il difensore); qualsiasi altro totale inferiore non è valido. Fissa la formazione quando sei pronto.", battleTitle:"Battaglia", battleText:"I dadi si affrontano in specchio dalla prospettiva dell'attaccante. Il valore maggiore vince; in caso di pareggio vince il difensore. Vinci almeno due sezioni per vincere il turno. Il migliore delle cinque vince.", orderTitle:"Ordine e Sbandamento", orderText:"Il giocatore che ha vinto il turno precedente deve giocare una disposizione con almeno due dadi dello stesso valore, mentre il giocatore che ha perso deve giocare una disposizione in cui ogni dado ha un valore diverso.", wildcardsTitle:"Crisobole" }
};
const imageDescriptions = {
    ES: { rolesImage: "Roles y formación", battleImage: "Combate en espejo" },
    EN: { rolesImage: "Roles and formation", battleImage: "Mirrored battle" },
    IT: { rolesImage: "Ruoli e formazione", battleImage: "Battaglia speculare" }
};
const errorMessages = {
    ES: { login: "No se pudo iniciar sesión.", theme: "No se pudo guardar el tema.", language: "No se pudo guardar el idioma." },
    EN: { login: "Could not sign in.", theme: "Could not save the theme.", language: "Could not save the language." },
    IT: { login: "Accesso non riuscito.", theme: "Impossibile salvare il tema.", language: "Impossibile salvare la lingua." }
};

const wildcardData = {
    ES: [
        ["assets/icon/fire.svg","Fuego Griego","Un dado con valor de 1 derrota a un dado opuesto con valor de 6"],
        ["assets/icon/almogavar.svg","Almogávar","Un dado mayor o igual a 4 suma +1 al siguiente dado aliado si duplica o supera al contrincante. El Almogávar atacante en retaguardia gana si hay empate en otra sección."],
        ["assets/icon/turk.svg","Turcopolos","Si fijas con tres puntos inferiores a tu límite, el menor dado desde la vanguardia recibe un valor aleatorio entre 1 y 6."],
        ["assets/icon/varangian.svg","Varegos","Si derrotas todos los dados opuestos, la ronda cuenta por dos puntos."],
        ["assets/icon/balestra.svg","Ballesteros","Desde la segunda ronda, el primero que fija resta 10 segundos al rival. El rival verá esta pista si esa formación es mayor o igual que la anterior, de lo contrario será menor."]
    ],
    EN: [
        ["assets/icon/fire.svg","Greek Fire","A die valued 1 defeats an opposing die valued 6."],
        ["assets/icon/almogavar.svg","Almogavar","A die of 4 or more adds +1 to the next allied die when it doubles or exceeds the opponent. An attacking rearguard Almogavar wins the round if another section is tied."],
        ["assets/icon/turk.svg","Turcopoles","Fixing three points below the limit replaces the smallest die from the front with a random value from 1 to 6."],
        ["assets/icon/varangian.svg","Varangians","Winning every opposed section makes the round worth two points."],
        ["assets/icon/balestra.svg","Crossbowmen","From round two, the first player to lock removes 10 seconds from the opponent. The opponent will see this hint if that formation is greater than or equal to the previous one; otherwise, it is lower."]
    ],
    IT: [
        ["assets/icon/fire.svg","Fuoco greco","Un dado con valore 1 sconfigge un dado avversario con valore 6."],
        ["assets/icon/almogavar.svg","Almogavar","Un dado da 4 o più aggiunge +1 al prossimo dado alleato se raddoppia o supera l'avversario. Un Almogavar attaccante in retroguardia vince il turno se un'altra sezione è in pareggio."],
        ["assets/icon/turk.svg","Turcopoli","Fissando tre punti sotto il limite, il dado più piccolo dalla vanguardia riceve un valore casuale da 1 a 6."],
        ["assets/icon/varangian.svg","Varengi","Vincere ogni sezione avversaria fa valere il turno due punti."],
        ["assets/icon/balestra.svg","Balestrieri","Dal secondo turno, chi fissa per primo sottrae 10 secondi all'avversario. L'avversario vedrà questo indizio se la formazione è maggiore o uguale alla precedente; altrimenti è inferiore."]
    ]
};
let wildcardIndex = 0;
function updateWildcard() {
    const [icon, name, text] = wildcardData[languageButton.dataset.language][wildcardIndex];
    document.getElementById("wildcard-icon").src = icon;
    document.getElementById("wildcard-name").textContent = name;
    document.getElementById("wildcard-text").textContent = text;
}

function applyTranslations() {
    const language = translations[languageButton.dataset.language] || translations.ES;
    document.documentElement.lang = languageButton.dataset.language.toLowerCase();
    document.querySelectorAll("[data-i18n]").forEach((element) => {
        if (language[element.dataset.i18n]) element.textContent = language[element.dataset.i18n];
    });
    document.querySelectorAll("[data-i18n-alt]").forEach((element) => {
        element.alt = imageDescriptions[languageButton.dataset.language][element.dataset.i18nAlt];
    });
    for (const [selector, key] of [[".logo-slot", "home"], ["#btn-theme", "theme"], ["#btn-lang", "language"],
        ["#wildcard-prev", "previous"], ["#wildcard-next", "next"], ["#toast-stack", "messages"]]) {
        const element = document.querySelector(selector);
        element.setAttribute("aria-label", language[key]);
        if (element.hasAttribute("title")) element.title = language[key];
    }
    document.title = `${language.rules} | Despot`;
    translateNotices(errorMessages[languageButton.dataset.language], language.close);
}

function updateAuthHeader() {
    const button = document.getElementById("btn-auth");
    if (!pb || !pb.authStore.isValid || !pb.authStore.model) {
        const label = translations[languageButton.dataset.language]?.login || "Acceder";
        button.classList.remove("is-avatar");
        button.textContent = label;
        button.setAttribute("aria-label", label);
        button.title = label;
        return;
    }
    const username = pb.authStore.model.username || translations[languageButton.dataset.language].profile;
    const avatar = pb.authStore.model.profile_avatar || "assets/profile/prof01.svg";
    button.replaceChildren();
    const image = document.createElement("img");
    image.src = avatar;
    image.alt = "";
    button.append(image);
    button.classList.add("is-avatar");
    button.setAttribute("aria-label", username);
    button.title = username;
}

function showRulesError(error, kind) {
    console.error(kind, error);
    showNotice(errorMessages[languageButton.dataset.language][kind],
        String(error.status || (kind === "login" ? 401 : 500)), "error",
        translations[languageButton.dataset.language].close, 0, kind);
}

document.getElementById("btn-theme").addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("despot-theme", next);
    if (pb?.authStore.isValid) {
        pb.collection("users").update(pb.authStore.model.id, { theme: next }).then((updated) => {
            pb.authStore.save(pb.authStore.token, updated);
            updateAuthHeader();
        }).catch(error => showRulesError(error, "theme"));
    }
});
setupLanguageMenu(languageButton, languageMenu, (next) => {
    languageButton.dataset.language = next;
    languageButton.textContent = next;
    localStorage.setItem("despot-language", next);
    if (pb?.authStore.isValid) {
        pb.collection("users").update(pb.authStore.model.id, { language: next }).then((updated) => {
            pb.authStore.save(pb.authStore.token, updated);
            updateAuthHeader();
        }).catch(error => showRulesError(error, "language"));
    }
    applyTranslations();
    updateWildcard();
    updateAuthHeader();
});
document.getElementById("wildcard-prev").addEventListener("click", () => {
    const items = wildcardData[languageButton.dataset.language];
    wildcardIndex = (wildcardIndex - 1 + items.length) % items.length;
    updateWildcard();
});
document.getElementById("wildcard-next").addEventListener("click", () => {
    const items = wildcardData[languageButton.dataset.language];
    wildcardIndex = (wildcardIndex + 1) % items.length;
    updateWildcard();
});
async function loginWithGoogle() {
    try {
        if (!pb) throw new Error("PocketBase unavailable");
        await signInWithGoogle(pb);
        updateAuthHeader();
    } catch (error) {
        showRulesError(error, "login");
    }
}
setupAuthMenu(pb, loginWithGoogle);
applyTranslations();
updateAuthHeader();
updateWildcard();
