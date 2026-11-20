// ============================================================================
// CLIENTE VANILLA JS — BLOTTO BIZANTINO (KISS / YAGNI)
// ============================================================================

const pb = new PocketBase(window.location.origin);
const savedTheme = localStorage.getItem("despot-theme") || "dark";
const savedLanguage = localStorage.getItem("despot-language") || "ES";
document.documentElement.dataset.theme = savedTheme;
document.documentElement.lang = savedLanguage.toLowerCase();
const languageButton = document.getElementById("btn-lang");
languageButton.dataset.language = savedLanguage;
languageButton.textContent = savedLanguage;

// Estado local mínimo
const state = {
    match: null,
    round: null,
    myDice: [4, 4, 3],
    timerInterval: null,
    lockedLocally: false
};

const translations = {
    ES: {
        rules: "Reglas", login: "Entrar", createMatch: "Crear partida",
        openRooms: "Salas abiertas", combatRules: "Reglas de Combate",
        username: "Nombre de usuario", save: "Guardar", logout: "Cerrar sesión",
        deleteAccount: "Eliminar cuenta"
    },
    EN: {
        rules: "Rules", login: "Login", createMatch: "Create match",
        openRooms: "Open rooms", combatRules: "Combat Rules",
        username: "Username", save: "Save", logout: "Log out",
        deleteAccount: "Delete account"
    },
    IT: {
        rules: "Regole", login: "Accedi", createMatch: "Crea partita",
        openRooms: "Stanze aperte", combatRules: "Regole di combattimento",
        username: "Nome utente", save: "Salva", logout: "Esci",
        deleteAccount: "Elimina account"
    }
};

function getErrorMessage(error, fallback) {
    const language = languageButton.dataset.language;
    const message = error?.response?.message || error?.message || "";
    if (message.includes("Failed to") || message.includes("Something went wrong")) {
        return language === "EN" ? fallback.en : language === "IT" ? fallback.it : fallback.es;
    }
    return message || fallback.es;
}

function applyTranslations() {
    const language = translations[languageButton.dataset.language] || translations.ES;
    document.querySelectorAll("[data-i18n]").forEach((element) => {
        element.textContent = language[element.dataset.i18n];
    });
}

// ----------------------------------------------------------------------------
// 1. NAVEGACIÓN, TEMA E IDIOMA (UI Shell)
// ----------------------------------------------------------------------------
function showView(viewId) {
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    document.getElementById(viewId).classList.add("active");
}

document.getElementById("btn-home").addEventListener("click", () => {
    showView("view-lobby");
    loadOpenMatches();
});

document.getElementById("btn-nav-rules").addEventListener("click", () => {
    showView("view-rules");
});

document.getElementById("btn-auth").addEventListener("click", () => {
    if (pb.authStore.isValid) window.location.href = "profile.html";
    else loginWithGoogle();
});

// Tema oscuro por defecto, alternable a claro
document.getElementById("btn-theme").addEventListener("click", () => {
    const root = document.documentElement;
    const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    localStorage.setItem("despot-theme", next);
});

const languages = ["ES", "EN", "IT"];
const languageMenu = document.getElementById("lang-menu");
languageButton.addEventListener("click", (event) => {
    event.stopPropagation();
    const isOpen = !languageMenu.hidden;
    languageMenu.hidden = isOpen;
    languageButton.setAttribute("aria-expanded", String(!isOpen));
});
languageMenu.addEventListener("click", (event) => {
    const option = event.target.closest("button[data-lang]");
    if (!option) return;
    const next = option.dataset.lang;
    languageButton.dataset.language = next;
    languageButton.textContent = next;
    document.documentElement.lang = next.toLowerCase();
    localStorage.setItem("despot-language", next);
    languageMenu.hidden = true;
    languageButton.setAttribute("aria-expanded", "false");
    applyTranslations();
});
document.addEventListener("click", () => {
    languageMenu.hidden = true;
    languageButton.setAttribute("aria-expanded", "false");
});

// ----------------------------------------------------------------------------
// 2. AUTENTICACIÓN CON GOOGLE
// ----------------------------------------------------------------------------
async function ensureAuth() {
    if (pb.authStore.isValid) {
        updateAuthButton();
        return;
    }
    throw new Error("Debes iniciar sesión con Google.");
}

async function loginWithGoogle() {
    try {
        await pb.collection("users").authWithOAuth2({
            provider: "google",
            queryParams: {
                scope: "openid email"
            }
        });
        await clearProviderProfileData();
        updateAuthButton();
        showView("view-lobby");
        loadOpenMatches();
    } catch (error) {
        console.error("Google OAuth:", error);
        alert(error.message || "No se pudo iniciar sesión con Google.");
    }
}

async function clearProviderProfileData() {
    if (!pb.authStore.model) return;
    try {
        const updated = await pb.collection("users").update(pb.authStore.model.id, {
            name: "",
            avatar: ""
        });
        pb.authStore.save(pb.authStore.token, updated);
    } catch (error) {
        console.error("No se pudieron limpiar los datos del proveedor:", error);
    }
}

function updateAuthButton() {
    const btn = document.getElementById("btn-auth");
    if (pb.authStore.isValid && pb.authStore.model) {
        const username = pb.authStore.model.username || "Perfil";
        const selectedAvatar = pb.authStore.model.profile_avatar || "assets/profile/prof01.svg";
        btn.replaceChildren();
        const image = document.createElement("img");
        image.src = selectedAvatar;
        image.alt = "Perfil";
        btn.append(image);
        btn.setAttribute("aria-label", username);
    } else {
        btn.textContent = translations[languageButton.dataset.language]?.login || "Entrar";
    }
}

// ----------------------------------------------------------------------------
// 3. LOBBY: CREAR, LISTAR Y UNIRSE A SALAS
// ----------------------------------------------------------------------------
async function loadOpenMatches() {
    const listEl = document.getElementById("matches-list");
    if (!pb.authStore.isValid) {
        listEl.innerHTML = '<li class="empty-msg">Inicia sesión con Google para ver partidas.</li>';
        return;
    }
    try {
        const res = await pb.collection("matches").getList(1, 15, {
            filter: 'status = "WAITING"',
            sort: "-id"
        });

        if (res.items.length === 0) {
            listEl.innerHTML = '<li class="empty-msg">No hay salas esperando rival. Crea una arriba.</li>';
            return;
        }

        listEl.innerHTML = "";
        res.items.forEach(m => {
            const li = document.createElement("li");
            li.dataset.matchRow = "true";
            li.dataset.search = `${m.room_code || ""} ${m.host_name || ""}`.toLowerCase();
            li.innerHTML = `
                <span>Sala <strong>${m.room_code}</strong></span>
                <button class="btn-outline" data-join-id="${m.id}">Unirse</button>
            `;
            li.querySelector("button").addEventListener("click", () => joinMatchById(m.id));
            listEl.appendChild(li);
        });
    } catch (err) {
        listEl.innerHTML = `<li class="empty-msg">${getErrorMessage(err, {
            es: "No se pudieron cargar las salas.",
            en: "Rooms could not be loaded.",
            it: "Impossibile caricare le stanze."
        })}</li>`;
    }
}

document.getElementById("match-search").addEventListener("input", (event) => {
    const query = event.target.value.trim().toLowerCase();
    document.querySelectorAll("#matches-list li[data-match-row]").forEach((row) => {
        row.classList.toggle("hidden", !row.dataset.search.includes(query));
    });
});

document.getElementById("btn-create-match").addEventListener("click", async () => {
    try {
        await ensureAuth();
        document.getElementById("create-match-modal").classList.remove("hidden");
    } catch (error) {
        alert(error.message || "Debes iniciar sesión.");
    }
});

document.getElementById("btn-close-create-match").addEventListener("click", () => {
    document.getElementById("create-match-modal").classList.add("hidden");
});

document.getElementById("private-match").addEventListener("change", (event) => {
    document.getElementById("pin-row").classList.toggle("hidden", !event.target.checked);
    if (event.target.checked) document.getElementById("bot-match").checked = false;
});

document.getElementById("bot-match").addEventListener("change", (event) => {
    if (event.target.checked) {
        document.getElementById("private-match").checked = false;
        document.getElementById("pin-row").classList.add("hidden");
    }
});

document.getElementById("btn-start-created-match").addEventListener("click", async () => {
    try {
        await ensureAuth();
        const isPrivate = document.getElementById("private-match").checked;
        const isBot = document.getElementById("bot-match").checked;
        const pin = document.getElementById("match-pin").value.trim();
        if (isPrivate && !isBot && !/^\d{4,8}$/.test(pin)) {
            alert("El PIN debe tener entre 4 y 8 dígitos.");
            return;
        }
        const code = Math.random().toString(36).substring(2, 6).toUpperCase();
        const match = await pb.collection("matches").create({
            room_code: code,
            is_private: isPrivate,
            pin_hash: "",
            is_bot: isBot,
            bot_name: isBot ? "Nash" : "",
            player_1: pb.authStore.model.id,
            status: isBot ? "ROLE_SELECT" : "WAITING",
            p1_role_choice: "NONE",
            p2_role_choice: "NONE",
            att_score: 0,
            def_score: 0,
            current_round: 1
        });
        document.getElementById("create-match-modal").classList.add("hidden");
        enterMatch(match.id);
    } catch (error) {
        alert(getErrorMessage(error, {
            es: "No se pudo crear la partida.",
            en: "The match could not be created.",
            it: "Impossibile creare la partita."
        }));
    }
});

document.getElementById("btn-join-match").addEventListener("click", async () => {
    try {
        const code = document.getElementById("input-room-code").value.trim().toUpperCase();
        if (code.length !== 4) return alert("Ingresa un código de 4 letras.");
        await ensureAuth();

        const match = await pb.collection("matches").getFirstListItem(`room_code = "${code}" && status = "WAITING"`);
        await joinMatchById(match.id);
    } catch (error) {
        alert(error.message || "No se encontró la partida.");
    }
});

async function joinMatchById(matchId) {
    await ensureAuth();
    const updated = await pb.collection("matches").update(matchId, {
        player_2: pb.authStore.model.id,
        status: "ROLE_SELECT"
    });
    enterMatch(updated.id);
}

// ----------------------------------------------------------------------------
// 4. SINCRONIZACIÓN EN TIEMPO REAL DE LA PARTIDA Y RONDAS
// ----------------------------------------------------------------------------
async function enterMatch(matchId) {
    pb.collection("matches").unsubscribe();
    pb.collection("rounds").unsubscribe();

    state.match = await pb.collection("matches").getOne(matchId);
    showView("view-board");
    renderMatchState();

    // Escuchar cambios en la partida
    pb.collection("matches").subscribe(matchId, (e) => {
        state.match = e.record;
        renderMatchState();
    });

    // Escuchar cambios en las rondas de esta partida
    pb.collection("rounds").subscribe("*", (e) => {
        if (e.record.match_id === matchId) {
            handleRoundUpdate(e.record);
        }
    });

    if (state.match.status === "PLAYING") {
        fetchActiveRound();
    }
}

async function fetchActiveRound() {
    const round = await pb.collection("rounds").getFirstListItem(
        `match_id = "${state.match.id}" && round_number = ${state.match.current_round}`
    );
    handleRoundUpdate(round);
}

function renderMatchState() {
    const m = state.match;
    document.getElementById("hud-room-code").textContent = m.room_code;
    document.getElementById("hud-att-score").textContent = m.att_score;
    document.getElementById("hud-def-score").textContent = m.def_score;
    document.getElementById("hud-round-label").textContent = `Ronda ${m.current_round}`;

    document.getElementById("stage-waiting").classList.add("hidden");
    document.getElementById("stage-roles").classList.add("hidden");
    document.getElementById("stage-combat").classList.add("hidden");

    if (m.status === "WAITING") {
        document.getElementById("stage-waiting").classList.remove("hidden");
        document.getElementById("wait-code-display").textContent = m.room_code;
    } else if (m.status === "ROLE_SELECT") {
        document.getElementById("stage-roles").classList.remove("hidden");
    } else if (m.status === "PLAYING") {
        document.getElementById("stage-combat").classList.remove("hidden");
        setupPerspectiveLabels();
        fetchActiveRound();
    } else if (m.status === "FINISHED") {
        document.getElementById("stage-combat").classList.remove("hidden");
        const iWon = m.winner_id === pb.authStore.model.id;
        alert(iWon ? "¡Victoria en la campaña!" : "Derrota. Tu ejército se retira.");
    }
}

// Fase 1: Selección de Rol
document.querySelectorAll("#stage-roles button").forEach(btn => {
    btn.addEventListener("click", async () => {
        const choice = btn.getAttribute("data-role");
        const isP1 = state.match.player_1 === pb.authStore.model.id;
        const field = isP1 ? "p1_role_choice" : "p2_role_choice";

        document.getElementById("role-status-msg").textContent = "Rol fijado. Esperando al rival...";
        await pb.collection("matches").update(state.match.id, { [field]: choice });
        state.match = await pb.collection("matches").getOne(state.match.id);
        renderMatchState();
    });
});

// Etiquetas en espejo según seas Atacante o Defensor
function setupPerspectiveLabels() {
    const isAtt = state.match.attacker_id === pb.authStore.model.id;
    const maxPts = isAtt ? 11 : 10;
    document.getElementById("points-max").textContent = maxPts;

    const myLabels = isAtt
        ? ["Vanguardia", "Centro", "Retaguardia"]
        : ["Retaguardia", "Centro", "Vanguardia"];
    const oppLabels = isAtt
        ? ["Retaguardia", "Centro", "Vanguardia"]
        : ["Vanguardia", "Centro", "Retaguardia"];

    for (let i = 0; i < 3; i++) {
        document.getElementById(`my-label-${i}`).textContent = myLabels[i];
        document.getElementById(`opp-label-${i}`).textContent = oppLabels[i];
    }
}

// ----------------------------------------------------------------------------
// 5. LÓGICA DE RONDA, DADOS, RELOJ DE 20s Y BALLESTEROS
// ----------------------------------------------------------------------------
function handleRoundUpdate(round) {
    const isNewRound = !state.round || state.round.id !== round.id;
    state.round = round;

    const isAtt = state.match.attacker_id === pb.authStore.model.id;
    const myConstraint = isAtt ? round.att_constraint : round.def_constraint;
    const maxPts = isAtt ? 11 : 10;

    if (isNewRound) {
        state.lockedLocally = false;
        state.myDice = isAtt ? [4, 4, 3] : [4, 3, 3];
        document.getElementById("btn-lock-dice").disabled = false;
        document.getElementById("btn-lock-dice").textContent = "Fijar Formación";
        document.getElementById("resolution-feed").innerHTML = "";
        for (let i = 0; i < 3; i++) {
            document.getElementById(`opp-die-${i}`).src = "assets/r_dice/r1.svg";
            const c = document.getElementById(`clash-${i}`);
            c.textContent = "-";
                c.className = "clash-indicator";
        }
    }
    // Mostrar restricción de Orden / Desbandada
    const badge = document.getElementById("constraint-badge");
    if (myConstraint === "ORDER") badge.textContent = "Orden (Mínimo un par)";
    else if (myConstraint === "ROUT") badge.textContent = "Desbandada (Todos distintos)";
    else badge.textContent = "Formación Libre";
    // Pista privada de Ballesteros (solo si el rival fijó primero y queda tiempo)
    const banner = document.getElementById("ballesteros-banner");
    const rivalLockedFirst = (isAtt && round.first_locker === "DEF") || (!isAtt && round.first_locker === "ATT");
    if (round.phase === "LOCKING" && rivalLockedFirst && round.ballesteros_hint !== "NONE") {
        banner.classList.remove("hidden");
        banner.textContent = round.ballesteros_hint === "HIGHER_OR_EQUAL"
            ? "Ballesteros: La formación rival es MAYOR O IGUAL que su ronda anterior."
            : "Ballesteros: La formación rival es MENOR que su ronda anterior.";
    } else {
        banner.classList.add("hidden");
    }
    updateDiceUI();
    startRoundTimer(round);
    if (round.phase === "REVEALED") {
        animateRoundResolution(round, isAtt);
    }
}
// Controles +/- de los 3 dados
document.querySelectorAll(".step-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        if (state.lockedLocally || state.round?.phase !== "LOCKING") return;
        const idx = Number(btn.getAttribute("data-idx"));
        const delta = Number(btn.getAttribute("data-delta"));
        const isAtt = state.match.attacker_id === pb.authStore.model.id;
        const maxPts = isAtt ? 11 : 10;
        const nextVal = state.myDice[idx] + delta;
        if (nextVal < 1 || nextVal > 6) return;
        const currentSum = state.myDice.reduce((acc, val) => acc + val, 0);
        if (currentSum + delta > maxPts) return;
        state.myDice[idx] = nextVal;
        updateDiceUI();
    });
});
function updateDiceUI() {
    let sum = 0;
    const isAtt = state.match?.attacker_id === pb.authStore.model?.id;
    const prefix = isAtt ? "r_dice/r" : "b_dice/b";
    for (let i = 0; i < 3; i++) {
        const val = state.myDice[i];
        document.getElementById(`my-die-${i}`).src = `assets/${prefix}${val}.svg`;
        sum += val;
    }
    document.getElementById("points-used").textContent = sum;
}
// Fijar formación en el servidor
document.getElementById("btn-lock-dice").addEventListener("click", async () => {
    if (state.lockedLocally || !state.round) return;
    const isAtt = state.match.attacker_id === pb.authStore.model.id;
    const field = isAtt ? "att_dice" : "def_dice";
    try {
        state.lockedLocally = true;
        document.getElementById("btn-lock-dice").disabled = true;
        document.getElementById("btn-lock-dice").textContent = "Formación Fijada";
        await pb.collection("rounds").update(state.round.id, {
            [field]: Array.from(state.myDice)
        });
    } catch (err) {
        state.lockedLocally = false;
        document.getElementById("btn-lock-dice").disabled = false;
        document.getElementById("btn-lock-dice").textContent = "Fijar Formación";
        alert(err.message || "Formación inválida según tu estado actual.");
    }
});
// Reloj sincronizado con ends_at del servidor
function startRoundTimer(round) {
    clearInterval(state.timerInterval);
    const timerEl = document.getElementById("hud-timer");
    if (round.phase !== "LOCKING") {
        timerEl.textContent = "0s";
        return;
    }
    const endMs = new Date(round.ends_at).getTime();
    state.timerInterval = setInterval(async () => {
        const rem = Math.max(0, Math.ceil((endMs - Date.now()) / 1000));
        timerEl.textContent = `${rem}s`;
        if (rem <= 0) {
            clearInterval(state.timerInterval);
            try {
                await pb.collection("rounds").update(round.id, { force_timeout: true });
            } catch (_) { /* El rival ya pudo haber disparado el cierre */ }
        }
    }, 250);
}
// Animación secuencial izquierda -> derecha (Vanguardia -> Centro -> Retaguardia)
function animateRoundResolution(round, isAtt) {
    // Si eres Defensor, invertimos visualmente el orden para que tu frente coincida en espejo con el tablero
    const myFinal = isAtt
        ? round.att_dice
        : [round.def_dice[2], round.def_dice[1], round.def_dice[0]];
    const oppFinal = isAtt
        ? [round.def_dice[2], round.def_dice[1], round.def_dice[0]]
        : round.att_dice;
    const feed = document.getElementById("resolution-feed");
    feed.innerHTML = "";
    for (let i = 0; i < 3; i++) {
        // El combate siempre se resuelve de izquierda a derecha del Atacante (sección 0 -> 1 -> 2)
        const visualSlot = isAtt ? i : 2 - i;
        setTimeout(() => {
                document.getElementById(`my-die-${visualSlot}`).src =
                    `assets/${isAtt ? "r_dice/r" : "b_dice/b"}${myFinal[visualSlot]}.svg`;
            document.getElementById(`opp-die-${visualSlot}`).src =
                `assets/${isAtt ? "b_dice/b" : "r_dice/r"}${oppFinal[visualSlot]}.svg`;
            const clashStep = (round.resolution_log || []).find(s => s.type === "CLASH" && s.section === i);
            if (clashStep) {
                const el = document.getElementById(`clash-${visualSlot}`);
                const iWonSection = (isAtt && clashStep.winner === "ATT") || (!isAtt && clashStep.winner === "DEF");
                el.textContent = iWonSection ? "VICTORIA" : "DERROTA";
                el.className = `clash-indicator ${iWonSection ? "win" : "loss"}`;
                if (clashStep.greekFire) feed.innerHTML += `<div>Fuego Griego activado en sección ${i + 1}.</div>`;
                if (clashStep.almogavar) feed.innerHTML += `<div>Almogávar (+1) encadenado desde sección ${i + 1}.</div>`;
            }
        }, i * 650);
    }
    setTimeout(() => {
        const varegos = (round.resolution_log || []).find(s => s.type === "VAREGOS");
        if (varegos) {
            feed.innerHTML += "<div><strong>¡Varegos! Victoria 3-0 otorga 2 puntos de ronda.</strong></div>";
        }
    }, 2100);
}
// Arranque inicial
applyTranslations();
updateAuthButton();
loadOpenMatches();
if (window.location.hash === "#rules") showView("view-rules");