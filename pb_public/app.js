const pb = new PocketBase(window.location.origin);
const ROUND_DURATION_MS = 30000;
const BALLESTEROS_PENALTY_MS = 10000;
const savedTheme = pb.authStore.model?.theme || localStorage.getItem("despot-theme") || "dark";
const savedLanguage = pb.authStore.model?.language || localStorage.getItem("despot-language") || "ES";
document.documentElement.dataset.theme = savedTheme;
document.documentElement.lang = savedLanguage.toLowerCase();
const languageButton = document.getElementById("btn-lang");
languageButton.dataset.language = savedLanguage;
languageButton.textContent = savedLanguage;

// Estado local mínimo
const state = {
    match: null,
    round: null,
    myDice: startingDice(),
    timerInterval: null,
    roundAdvanceTimeout: null,
    serverClockOffset: 0,
    lockedLocally: false,
    botMode: false,
    botDice: [4, 3, 3],
    botRound: 1,
    botAttScore: 0,
    botDefScore: 0,
    botPreviousBotConcat: null,
    botResults: [],
    roundSync: 0,
    pendingPrivateMatchId: null
};
const createMatchModal = setupModal(document.getElementById("create-match-modal"));
const joinPrivateModal = setupModal(document.getElementById("join-private-modal"), () => {
    state.pendingPrivateMatchId = null;
});

const translations = {
    ES: {
        rules: "Reglas", login: "Acceder", createMatch: "Crear partida",
        openRooms: "Campos de batalla",
        player: "Jugador", profile: "Perfil", logout: "Cerrar sesión", createMatchTitle: "Crear partida",
        privateMatch: "Partida privada", createRoom: "Crear sala",
        joinPrivateTitle: "Unirse con PIN", joinMatch: "Unirse",
        closeMatch: "Cerrar partida", shareCode: "Comparte el código de sala:",
        waitingOpponent: "Esperando oponente...", chooseRole: "Elige tu Rol",
        roleCoinText: "Si ambos eligen lo mismo, una moneda decidirá.",
        attackerRole: "Atacante (11 pts)", defenderRole: "Defensor (10 pts)",
        attacker: "Atacante", defender: "Defensor", points: "Puntos", round: "Ronda",
        code: "CÓDIGO", roomCode: "Código de sala", searchHost: "Buscar anfitrión", pinPlaceholder: "4-8 dígitos",
        playBot: "Jugar contra la máquina", startMatch: "Iniciar partida",
        waitingHost: "Esperando a que el anfitrión inicie...", roleLocked: "Rol fijado. Esperando al rival...",
        lockDice: "Lucha",
        order: "Orden", rout: "Desbandada", returnHome: "Volver al inicio",
        loginRooms: "Inicia sesión con Google para ver partidas.", noRooms: "No hay rivales",
        invalidPin: "El PIN debe tener entre 4 y 8 dígitos.", wrongPin: "PIN incorrecto.", tooManyPins: "Demasiados intentos. Espera un minuto.",
        invalidCode: "Ingresa un código de 4 letras o números.", matchError: "No se pudo completar la acción.",
        roomClosed: "La sala se cerró.", matchCanceled: "La partida fue cancelada.", victory: "Victoria", defeat: "Derrota",
        privateRoom: "Partida privada", join: "Unirse", loginRequired: "Debes iniciar sesión con Google.",
        roundWon: "Gana", roundLost: "Pérdida", matchResults: "Resultados de las rondas: atacante contra defensor",
        unrated: "Sin Elo: ya jugaron hoy (UTC).",
        alreadyOpen: "Ya tienes una partida abierta.", roomFull: "La sala ya tiene rival.",
        invalidFormation: "Formación no válida.", expired: "El tiempo de la ronda ha expirado.",
        alreadyLocked: "Ya fijaste tus dados.", roundNotStarted: "La ronda aún no ha comenzado.", roomUnavailable: "La sala ya no está disponible.",
        notParticipant: "No perteneces a esta partida.", notHost: "Solo el anfitrión puede iniciar.",
        opponentMissing: "Falta un rival.", roleAlready: "Ya elegiste tu rol.", roundInactive: "La ronda ya no está activa.",
        skip: "Saltar al contenido", home: "Inicio", theme: "Cambiar tema", language: "Idioma",
        themeError: "No se pudo guardar el tema.", languageError: "No se pudo guardar el idioma.", loginError: "No se pudo iniciar sesión.", closeError: "No se pudo cerrar la partida.", roomsError: "No se pudieron cargar las salas.",
        close: "Cerrar", increaseDice: "Aumentar dado", decreaseDice: "Reducir dado", dieValue: "valor",
        myDie: "Dado propio", opponentDie: "Dado rival", hint: "Ballesteros: mayor o igual", messages: "Mensajes",
        greekFire: "Fuego griego", almogavar: "Almogávar", turcopolos: "Turcopolos", varegos: "Varegos"
    },
    EN: {
        rules: "Rules", login: "Login", createMatch: "Create match",
        openRooms: "Battlefields",
        player: "Player", profile: "Profile", logout: "Log out", createMatchTitle: "Create match",
        privateMatch: "Private match", createRoom: "Create room",
        joinPrivateTitle: "Join with PIN", joinMatch: "Join",
        closeMatch: "Close match", shareCode: "Share the room code:",
        waitingOpponent: "Waiting for opponent...", chooseRole: "Choose your role",
        roleCoinText: "If both choose the same role, a coin decides.",
        attackerRole: "Attacker (11 pts)", defenderRole: "Defender (10 pts)",
        attacker: "Attacker", defender: "Defender", points: "Points", round: "Round",
        code: "CODE", roomCode: "Room code", searchHost: "Search host", pinPlaceholder: "4-8 digits",
        playBot: "Play against the machine", startMatch: "Start match",
        waitingHost: "Waiting for the host to start...", roleLocked: "Role locked. Waiting for opponent...",
        lockDice: "Battle",
        order: "Order", rout: "Rout", returnHome: "Return home",
        loginRooms: "Sign in with Google to view matches.", noRooms: "No rivals here",
        invalidPin: "The PIN must have 4 to 8 digits.", wrongPin: "Incorrect PIN.", tooManyPins: "Too many attempts. Wait one minute.",
        invalidCode: "Enter a 4-character code.", matchError: "The action could not be completed.",
        roomClosed: "The room was closed.", matchCanceled: "The match was canceled.", victory: "Victory", defeat: "Defeat",
        privateRoom: "Private match", join: "Join", loginRequired: "Sign in with Google.",
        roundWon: "Win", roundLost: "Loss", matchResults: "Round results: attacker versus defender",
        unrated: "Unrated: already played today (UTC).",
        alreadyOpen: "You already have an open match.", roomFull: "The room already has an opponent.",
        invalidFormation: "Invalid formation.", expired: "The round time has expired.",
        alreadyLocked: "Your dice are already locked.", roundNotStarted: "The round has not started yet.", roomUnavailable: "The room is no longer available.",
        notParticipant: "You are not in this match.", notHost: "Only the host can start.",
        opponentMissing: "An opponent is required.", roleAlready: "You already chose a role.", roundInactive: "The round is no longer active.",
        skip: "Skip to content", home: "Home", theme: "Change theme", language: "Language",
        themeError: "Could not save the theme.", languageError: "Could not save the language.", loginError: "Could not sign in.", closeError: "Could not close the match.", roomsError: "Could not load rooms.",
        close: "Close", increaseDice: "Increase die", decreaseDice: "Decrease die", dieValue: "value",
        myDie: "Your die", opponentDie: "Opponent's die", hint: "Crossbowmen: greater than or equal", messages: "Messages",
        greekFire: "Greek fire", almogavar: "Almogavar", turcopolos: "Turcopoles", varegos: "Varangians"
    },
    IT: {
        rules: "Regole", login: "Accedi", createMatch: "Crea partita",
        openRooms: "Campi di battaglia",
        player: "Giocatore", profile: "Profilo", logout: "Esci", createMatchTitle: "Crea partita",
        privateMatch: "Partita privata", createRoom: "Crea stanza",
        joinPrivateTitle: "Unisciti con PIN", joinMatch: "Unisciti",
        closeMatch: "Chiudi partita", shareCode: "Condividi il codice della stanza:",
        waitingOpponent: "In attesa dell'avversario...", chooseRole: "Scegli il tuo ruolo",
        roleCoinText: "Se entrambi scegliete lo stesso ruolo, decide una moneta.",
        attackerRole: "Attaccante (11 punti)", defenderRole: "Difensore (10 punti)",
        attacker: "Attaccante", defender: "Difensore", points: "Punti", round: "Turno",
        code: "CODICE", roomCode: "Codice stanza", searchHost: "Cerca ospite", pinPlaceholder: "4-8 cifre",
        playBot: "Gioca contro la macchina", startMatch: "Inizia partita",
        waitingHost: "In attesa che l'ospite inizi...", roleLocked: "Ruolo fissato. In attesa dell'avversario...",
        lockDice: "Combatti",
        order: "Ordine", rout: "Sbandamento", returnHome: "Torna alla home",
        loginRooms: "Accedi con Google per vedere le partite.", noRooms: "Nessun rivale",
        invalidPin: "Il PIN deve avere da 4 a 8 cifre.", wrongPin: "PIN errato.", tooManyPins: "Troppi tentativi. Attendi un minuto.",
        invalidCode: "Inserisci un codice di 4 caratteri.", matchError: "Impossibile completare l'azione.",
        roomClosed: "La stanza è stata chiusa.", matchCanceled: "La partita è stata annullata.", victory: "Vittoria", defeat: "Sconfitta",
        privateRoom: "Partita privata", join: "Unisciti", loginRequired: "Accedi con Google.",
        roundWon: "Vinta", roundLost: "Persa", matchResults: "Risultati dei turni: attaccante contro difensore",
        unrated: "Senza Elo: avete già giocato oggi (UTC).",
        alreadyOpen: "Hai già una partita aperta.", roomFull: "La stanza ha già un avversario.",
        invalidFormation: "Formazione non valida.", expired: "Il tempo del turno è scaduto.",
        alreadyLocked: "Hai già fissato i dadi.", roundNotStarted: "Il turno non è ancora iniziato.", roomUnavailable: "La stanza non è più disponibile.",
        notParticipant: "Non partecipi a questa partita.", notHost: "Solo l'ospite può iniziare.",
        opponentMissing: "Manca un avversario.", roleAlready: "Hai già scelto un ruolo.", roundInactive: "Il turno non è più attivo.",
        skip: "Vai al contenuto", home: "Home", theme: "Cambia tema", language: "Lingua",
        themeError: "Impossibile salvare il tema.", languageError: "Impossibile salvare la lingua.", loginError: "Accesso non riuscito.", closeError: "Impossibile chiudere la partita.", roomsError: "Impossibile caricare le stanze.",
        close: "Chiudi", increaseDice: "Aumenta dado", decreaseDice: "Riduci dado", dieValue: "valore",
        myDie: "Il tuo dado", opponentDie: "Dado avversario", hint: "Balestrieri: maggiore o uguale", messages: "Messaggi",
        greekFire: "Fuoco greco", almogavar: "Almogavar", turcopolos: "Turcopoli", varegos: "Varengi"
    }
};

function t(key) {
    return (translations[languageButton.dataset.language] || translations.ES)[key] || key;
}

function showGameError(error, key = "matchError") {
    const messages = {
        "You already have an open match.": "alreadyOpen",
        "The room already has an opponent.": "roomFull",
        "The room is no longer available.": "roomUnavailable",
        "You are not in this match.": "notParticipant",
        "Only the host can start.": "notHost",
        "An opponent is required.": "opponentMissing",
        "You already chose a role.": "roleAlready",
        "The round has not started yet.": "roundNotStarted",
        "The round is no longer active.": "roundInactive",
        "The round time has expired.": "expired",
        "Your dice are already locked in this round.": "alreadyLocked",
        "The formation is invalid.": "invalidFormation",
        "Incorrect PIN.": "wrongPin",
        "Too many attempts. Wait one minute.": "tooManyPins",
        "Authentication is required.": "loginRequired"
    };
    const message = error.response?.message || error.message;
    console.error("Game operation failed:", error);
    showToast(messages[message] || key, String(error.status || (message === "Authentication is required." || key === "loginError" ? 401 : 500)), "error");
}

function gameRequest(action, body) {
    return pb.send(`/api/despot/${action}`, { method: "POST", body, requestKey: null });
}

function currentMatchKey() {
    return `despot-match-${pb.authStore.model.id}`;
}

function humanId() {
    return state.botMode ? (pb.authStore.model?.id || "HUMAN") : pb.authStore.model.id;
}

function safeAvatar(value) {
    return /^assets\/profile\/prof(0[1-9]|1[0-9])\.svg$/.test(value || "")
        ? value : "assets/profile/prof01.svg";
}

function applyTranslations() {
    const language = translations[languageButton.dataset.language] || translations.ES;
    document.querySelectorAll("[data-i18n]").forEach((element) => {
        if (language[element.dataset.i18n]) element.textContent = language[element.dataset.i18n];
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
        element.placeholder = language[element.dataset.i18nPlaceholder];
    });
    document.querySelectorAll("[data-i18n-aria]").forEach((element) => {
        element.setAttribute("aria-label", language[element.dataset.i18nAria]);
    });
    document.querySelectorAll("[data-i18n-alt]").forEach((element) => {
        element.alt = language[element.dataset.i18nAlt];
    });
    document.querySelectorAll("[data-i18n-title]").forEach((element) => {
        element.title = language[element.dataset.i18nTitle];
    });
    translateNotices(language, language.close);
    updateDiceAccessibility();
    updateAuthButton();
    if (state.match) {
        document.getElementById("hud-round-label").textContent = `${t("round")} ${state.round?.round_number || state.match.current_round}`;
        if (state.match.status === "PLAYING") setupPerspectiveLabels();
        if (state.round) updateRoundLabels(state.round);
        if (state.match.status === "WAITING") renderMatchState();
        if (state.match.status === "FINISHED") {
            const won = state.botMode
                ? (state.match.attacker_id === humanId() ? state.match.att_score >= 3 : state.match.def_score >= 3)
                : state.match.winner_id === humanId();
            showMatchResult(won);
        } else if (state.round?.phase === "REVEALED" && state.round.round_winner) {
            const won = state.round.round_winner === (state.match.attacker_id === humanId() ? "ATT" : "DEF");
            setResultStatus(won ? "roundWon" : "roundLost", state.round.resolution_log);
        }
    } else {
        loadOpenMatches();
    }
}

function showToast(key, code = "400", kind = "error") {
    showNotice(t(key), code, kind, t("close"), 7000, key);
}

// tema e idioma
function showView(viewId) {
    const view = document.getElementById(viewId);
    const changed = !view.classList.contains("active");
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    view.classList.add("active");
    if (changed) document.getElementById("main-stage").focus({ preventScroll: true });
}

document.getElementById("btn-home").addEventListener("click", () => {
    if (pb.authStore.model) localStorage.removeItem(currentMatchKey());
    state.botMode = false;
    state.match = null;
    state.round = null;
    state.roundSync++;
    clearInterval(state.timerInterval);
    clearTimeout(state.roundAdvanceTimeout);
    state.roundAdvanceTimeout = null;
    pb.collection("matches").unsubscribe();
    pb.collection("rounds").unsubscribe();
    showView("view-lobby");
    loadOpenMatches();
});

setupAuthMenu(pb, loginWithGoogle);

// chiaroscuro por defecto
document.getElementById("btn-theme").addEventListener("click", () => {
    const root = document.documentElement;
    const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    localStorage.setItem("despot-theme", next);
    if (pb.authStore.isValid) {
        pb.collection("users").update(pb.authStore.model.id, { theme: next }).then((updated) => {
            pb.authStore.save(pb.authStore.token, updated);
            updateAuthButton();
        }).catch(error => showGameError(error, "themeError"));
    }
});

const languageMenu = document.getElementById("lang-menu");
setupLanguageMenu(languageButton, languageMenu, (next) => {
    languageButton.dataset.language = next;
    languageButton.textContent = next;
    document.documentElement.lang = next.toLowerCase();
    localStorage.setItem("despot-language", next);
    applyTranslations();
    if (pb.authStore.isValid) {
        pb.collection("users").update(pb.authStore.model.id, { language: next }).then((updated) => {
            pb.authStore.save(pb.authStore.token, updated);
            updateAuthButton();
        }).catch(error => showGameError(error, "languageError"));
    }
});

// google el gran hermano te vigila
async function ensureAuth() {
    if (pb.authStore.isValid) {
        updateAuthButton();
        return;
    }
    throw new Error("Authentication is required.");
}

async function loginWithGoogle() {
    try {
        await signInWithGoogle(pb);
        updateAuthButton();
        showView("view-lobby");
        loadOpenMatches();
    } catch (error) {
        showGameError(error, "loginError");
    }
}

function updateAuthButton() {
    const btn = document.getElementById("btn-auth");
    if (pb.authStore.isValid && pb.authStore.model) {
        const username = pb.authStore.model.username || t("profile");
        const selectedAvatar = pb.authStore.model.profile_avatar || "assets/profile/prof01.svg";
        btn.replaceChildren();
        const image = document.createElement("img");
        image.src = selectedAvatar;
        image.alt = "";
        btn.append(image);
        btn.classList.add("is-avatar");
        btn.setAttribute("aria-label", username);
        btn.title = username;
    } else {
        const label = translations[languageButton.dataset.language]?.login || "Acceder";
        btn.classList.remove("is-avatar");
        btn.textContent = label;
        btn.setAttribute("aria-label", label);
        btn.title = label;
    }
}

// 300 millones para israel
async function loadOpenMatches() {
    const listEl = document.getElementById("matches-list");
    if (!pb.authStore.isValid) {
        listEl.textContent = t("loginRooms");
        return;
    }
    try {
        const res = await pb.collection("matches").getList(1, 15, {
            filter: 'status = "WAITING" && player_2 = ""',
            sort: "-id"
        });

        if (res.items.length === 0) {
            listEl.textContent = t("noRooms");
            return;
        }

        listEl.innerHTML = "";
        res.items.forEach(m => {
            const li = document.createElement("li");
            li.dataset.matchRow = "true";
            const name = m.host_name || t("player");
            li.dataset.search = `${m.room_code || ""} ${name} ${m.host_elo ?? 0} 5 bo5`.toLowerCase();
            const host = document.createElement("span");
            host.className = "match-host";
            const avatar = document.createElement("img");
            avatar.className = "match-host-avatar";
            avatar.src = safeAvatar(m.host_avatar);
            avatar.alt = "";
            const label = document.createElement("span");
            label.textContent = `${name} · ${m.host_elo ?? 0}${m.is_private ? " 🔒" : ""}`;
            if (m.is_private) label.title = t("privateRoom");
            host.append(avatar, label);
            const joinButton = document.createElement("button");
            joinButton.className = "btn-outline";
            joinButton.textContent = t("join");
            joinButton.addEventListener("click", () => {
                joinMatchById(m.id).catch(error => showGameError(error));
            });
            li.append(host, joinButton);
            listEl.appendChild(li);
        });
    } catch (err) {
        if (err.isAbort) return;
        console.error("Could not load rooms:", err);
        listEl.textContent = t("roomsError");
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
        const ownOpen = await pb.collection("matches").getList(1, 1, {
            filter: pb.filter('status != "FINISHED" && (player_1 = {:id} || player_2 = {:id})', { id: pb.authStore.model.id }),
        });
        if (ownOpen.items.length > 0) {
            await enterMatch(ownOpen.items[0].id);
            showToast("alreadyOpen", "409", "error");
            return;
        }
        createMatchModal.open();
    } catch (error) {
        showGameError(error);
    }
});

document.getElementById("btn-close-create-match").addEventListener("click", () => {
    createMatchModal.close();
});

document.getElementById("btn-close-join-private").addEventListener("click", () => {
    joinPrivateModal.close();
});

document.getElementById("btn-confirm-private-join").addEventListener("click", async () => {
    if (!state.pendingPrivateMatchId) return;
    const pin = document.getElementById("join-match-pin").value.trim();
    if (!/^\d{4,8}$/.test(pin)) {
        showToast("invalidPin", "400", "error");
        return;
    }
    try {
        const updated = await gameRequest("join", { match_id: state.pendingPrivateMatchId, pin });
        joinPrivateModal.close();
        await enterMatch(updated.id);
    } catch (error) {
        showGameError(error, error.status === 403 ? "wrongPin" : error.status === 429 ? "tooManyPins" : "matchError");
    }
});

document.getElementById("private-match").addEventListener("change", (event) => {
    document.getElementById("pin-row").classList.toggle("hidden", !event.target.checked);
});

function startingDice() {
    return [1, 1, 1];
}

function chooseBotDice(constraint, budget) {
    const candidates = budget === 11
        ? [[[2,5,4],0.169],[[5,5,1],0.146],[[2,4,5],0.107],[[4,2,5],0.104],[[5,4,2],0.094],[[6,3,2],0.087],[[3,6,2],0.065],[[5,1,5],0.047],[[3,2,6],0.042],[[2,6,3],0.035],[[5,2,4],0.033],[[6,1,4],0.024],[[4,5,2],0.020],[[4,3,4],0.016],[[4,1,6],0.010]]
        : [[[1,4,5],0.146],[[1,5,4],0.145],[[4,5,1],0.130],[[3,6,1],0.098],[[5,4,1],0.092],[[5,1,4],0.088],[[3,2,5],0.087],[[6,1,3],0.054],[[4,2,4],0.044],[[2,5,3],0.035],[[5,2,3],0.025],[[5,3,2],0.024],[[2,4,4],0.014],[[4,4,2],0.010],[[4,1,5],0.009]];
    const valid = candidates.filter(([dice]) => DespotGame.validFormation(dice, budget, constraint));
    const total = valid.reduce((sum, entry) => sum + entry[1], 0);
    let choice = Math.random() * total;
    for (const [dice, weight] of valid) {
        choice -= weight;
        if (choice <= 0) return [...dice];
    }
    return [...valid[valid.length - 1][0]];
}

function startBotMatch() {
    clearInterval(state.timerInterval);
    clearTimeout(state.roundAdvanceTimeout);
    state.roundAdvanceTimeout = null;
    pb.collection("matches").unsubscribe();
    pb.collection("rounds").unsubscribe();
    state.botMode = true;
    state.lockedLocally = false;
    state.botRound = 1;
    state.botAttScore = 0;
    state.botDefScore = 0;
    state.botPreviousBotConcat = null;
    state.botResults = [];
    state.roundSync++;
    resetResolution();
    state.myDice = startingDice();
    state.match = {
        room_code: "BOT",
        att_score: 0,
        def_score: 0,
        current_round: 1,
        attacker_id: null,
        defender_id: null,
        status: "ROLE_SELECT"
    };
    state.botDice = chooseBotDice("FREE", 10);
    state.round = {
        round_number: 1,
        phase: "LOCKING",
        ends_at: new Date(Date.now() + ROUND_DURATION_MS).toISOString(),
        att_constraint: "FREE",
        def_constraint: "FREE",
        first_locker: "NONE",
        ballesteros_hint: "NONE"
    };
    createMatchModal.close();
    document.getElementById("role-status-msg").textContent = "";
    showView("view-board");
    renderMatchState();
}

document.getElementById("btn-play-bot").addEventListener("click", startBotMatch);
document.getElementById("btn-return-home").addEventListener("click", () => document.getElementById("btn-home").click());

document.getElementById("btn-start-created-match").addEventListener("click", async () => {
    try {
        await ensureAuth();
        const isPrivate = document.getElementById("private-match").checked;
        const pin = document.getElementById("match-pin").value.trim();
        if (isPrivate && !/^\d{4,8}$/.test(pin)) {
            showToast("invalidPin", "400", "error");
            return;
        }
        const match = await gameRequest("create", { is_private: isPrivate, pin });
        createMatchModal.close();
        await enterMatch(match.id);
    } catch (error) {
        showGameError(error);
    }
});

document.getElementById("btn-join-match").addEventListener("click", async () => {
    try {
        const code = document.getElementById("input-room-code").value.trim().toUpperCase();
        if (!/^[A-Z0-9]{4}$/.test(code)) {
            showToast("invalidCode", "400", "error");
            return;
        }
        await ensureAuth();

        const match = await pb.collection("matches").getFirstListItem(
            pb.filter('room_code = {:code} && status = "WAITING"', { code }));
        await joinMatchById(match.id);
    } catch (error) {
        showGameError(error);
    }
});

async function joinMatchById(matchId) {
    await ensureAuth();
    const match = await pb.collection("matches").getFirstListItem(
        pb.filter('id = {:id} && status = "WAITING"', { id: matchId })
    );
    if (match.player_1 === pb.authStore.model.id || match.player_2 === pb.authStore.model.id) {
        await enterMatch(matchId);
        return;
    }
    if (match.player_2) {
        showToast("roomFull", "409", "error");
        return;
    }
    if (match.is_private) {
        state.pendingPrivateMatchId = matchId;
        document.getElementById("join-match-pin").value = "";
        joinPrivateModal.open(document.getElementById("join-match-pin"));
        return;
    }
    const updated = await gameRequest("join", { match_id: matchId });
    await enterMatch(updated.id);
}

document.getElementById("btn-start-match").addEventListener("click", async () => {
    try {
        await gameRequest("start", { match_id: state.match.id });
    } catch (error) {
        showGameError(error);
    }
});

document.getElementById("btn-close-match").addEventListener("click", async () => {
    if (!state.match || state.match.status !== "WAITING") return;
    const matchId = state.match.id;
    try {
        await pb.collection("matches").delete(matchId);
        handleMatchClosed(matchId);
    } catch (error) {
        showGameError(error, "closeError");
    }
});

function handleMatchClosed(matchId) {
    if (state.match?.id !== matchId) return;
    localStorage.removeItem(currentMatchKey());
    if (state.match.status === "FINISHED") return;
    const message = state.match.status === "WAITING" ? "roomClosed" : "matchCanceled";
    state.match = null;
    state.round = null;
    state.roundSync++;
    clearInterval(state.timerInterval);
    clearTimeout(state.roundAdvanceTimeout);
    state.roundAdvanceTimeout = null;
    showView("view-lobby");
    loadOpenMatches();
    showToast(message, "200", "success");
}

// SIncronizar partidas
async function enterMatch(matchId) {
    state.botMode = false;
    state.round = null;
    state.roundSync++;
    resetResolution();
    clearTimeout(state.roundAdvanceTimeout);
    state.roundAdvanceTimeout = null;
    const clockStart = Date.now();
    const clock = await gameRequest("clock", {});
    state.serverClockOffset = clock.now - (clockStart + Date.now()) / 2;
    await Promise.all([pb.collection("matches").unsubscribe(), pb.collection("rounds").unsubscribe()]);
    await pb.collection("matches").subscribe(matchId, (e) => {
        if (e.action === "delete") {
            handleMatchClosed(matchId);
            return;
        }
        state.match = e.record;
        renderMatchState();
    });
    await pb.collection("rounds").subscribe("*", (e) => {
        if (state.match && (state.match.status === "PLAYING" || state.match.status === "FINISHED") &&
            e.record.match_id === matchId &&
            (e.record.round_number === state.match.current_round ||
                (e.record.id === state.round?.id && e.record.phase === "REVEALED"))) {
            if (e.record.phase === "LOCKING" && e.record.starts_at &&
                Date.now() + state.serverClockOffset < new Date(e.record.starts_at).getTime()) return;
            handleRoundUpdate(e.record);
        }
    });
    state.match = await pb.collection("matches").getOne(matchId);
    if (state.match.status !== "FINISHED") localStorage.setItem(currentMatchKey(), matchId);
    showView("view-board");
    renderMatchState();
}

async function fetchActiveRound() {
    if (state.botMode) {
        handleBotRoundUpdate();
        return;
    }
    const matchId = state.match.id;
    const roundNumber = state.match.current_round;
    const sync = ++state.roundSync;
    const round = await pb.collection("rounds").getFirstListItem(
        pb.filter("match_id = {:matchId} && round_number = {:roundNumber}", { matchId, roundNumber }),
        { requestKey: null }
    );
    let ownDice = null;
    if (state.match?.id !== matchId || state.match.current_round !== roundNumber || state.roundSync !== sync) return;
    const startsAt = round.starts_at ? new Date(round.starts_at).getTime() : 0;
    const remaining = startsAt - (Date.now() + state.serverClockOffset);
    if (round.phase === "LOCKING" && remaining > 0) {
        const previous = await pb.collection("rounds").getFirstListItem(
            pb.filter("match_id = {:matchId} && round_number = {:previous}", { matchId, previous: roundNumber - 1 }),
            { requestKey: null }
        );
        if (state.match?.id !== matchId || state.match.current_round !== roundNumber || state.roundSync !== sync) return;
        if (previous.phase === "REVEALED") handleRoundUpdate(previous);
        clearTimeout(state.roundAdvanceTimeout);
        state.roundAdvanceTimeout = setTimeout(() => {
            state.roundAdvanceTimeout = null;
            if (state.match?.id === matchId && state.match.status === "PLAYING") {
                fetchActiveRound().catch(error => showGameError(error));
            }
        }, Math.max(0, startsAt - (Date.now() + state.serverClockOffset)));
        return;
    }
    const ownSide = state.match.attacker_id === pb.authStore.model.id ? "ATT" : "DEF";
    if (round.phase === "LOCKING" && round.first_locker === ownSide) {
        ownDice = (await gameRequest("my-lock", { round_id: round.id })).dice;
    }
    if (state.match?.id === matchId && state.match.current_round === roundNumber && state.roundSync === sync) {
        if (state.round?.id === round.id && state.round.attempt === round.attempt &&
            (state.round.phase === "REVEALED" ||
                (state.round.first_locker !== "NONE" && round.first_locker === "NONE"))) return;
        handleRoundUpdate(round);
        if (ownDice) {
            state.myDice = ownDice;
            updateDiceUI();
        }
    }
}

function handleBotRoundUpdate() {
    state.round.phase = "LOCKING";
    state.round.round_winner = "";
    state.lockedLocally = false;
    document.getElementById("stage-waiting").classList.add("hidden");
    document.getElementById("stage-roles").classList.add("hidden");
    document.getElementById("stage-combat").classList.remove("hidden");
    setupPerspectiveLabels();
    resetResolution();
    document.getElementById("btn-lock-dice").disabled = false;
    updateRoundLabels(state.round);
    if (state.botRound >= 2) {
        state.round.ends_at = new Date(Date.now() + ROUND_DURATION_MS - BALLESTEROS_PENALTY_MS).toISOString();
        const banner = document.getElementById("ballesteros-banner");
        const currentConcat = Number(state.botDice.join(""));
        const previousConcat = state.botPreviousBotConcat;
        banner.classList.toggle("hidden", previousConcat === null || currentConcat < previousConcat);
    } else {
        document.getElementById("ballesteros-banner").classList.add("hidden");
    }
    updateDiceUI();
    startRoundTimer(state.round);
}

function resolveBotRound(timedOut = false) {
    if (state.lockedLocally) return;
    const humanIsAttacker = state.match.attacker_id === humanId();
    const constraint = humanIsAttacker ? state.round.att_constraint : state.round.def_constraint;
    if (!timedOut && !DespotGame.validFormation(state.myDice, humanIsAttacker ? 11 : 10, constraint)) {
        showToast("invalidFormation", "400", "error");
        return;
    }
    const humanInitial = timedOut ? null : [...state.myDice];
    const botInitial = [...state.botDice];
    const outcome = DespotGame.resolve(
        humanIsAttacker ? humanInitial : botInitial,
        humanIsAttacker ? botInitial : humanInitial,
        () => Math.floor(Math.random() * 6) + 1
    );
    const roundWinner = outcome.roundWinner;
    state.botResults.push({
        att_dice_final: humanIsAttacker && !humanInitial ? null : outcome.finalAttDice,
        def_dice_final: !humanIsAttacker && !humanInitial ? null : outcome.finalDefDice,
        resolution_log: outcome.steps
    });
    state.lockedLocally = true;
    state.round.phase = "REVEALED";
    state.round.round_winner = outcome.roundWinner;
    state.round.resolution_log = outcome.steps;
    clearInterval(state.timerInterval);
    document.getElementById("ballesteros-banner").classList.add("hidden");
    document.getElementById("btn-lock-dice").disabled = true;
    animateRoundResolution({
        att_dice: outcome.finalAttDice,
        def_dice: outcome.finalDefDice,
        round_winner: outcome.roundWinner,
        resolution_log: outcome.steps
    }, humanIsAttacker);

    if (roundWinner === "ATT") state.botAttScore = Math.min(3, state.botAttScore + outcome.pointsAwarded);
    else state.botDefScore = Math.min(3, state.botDefScore + outcome.pointsAwarded);
    state.match.att_score = state.botAttScore;
    state.match.def_score = state.botDefScore;
    document.getElementById("hud-att-score").textContent = state.botAttScore;
    document.getElementById("hud-def-score").textContent = state.botDefScore;

    if (state.botAttScore >= 3 || state.botDefScore >= 3) {
        state.match.status = "FINISHED";
        const humanWon = (humanIsAttacker && state.botAttScore >= 3) || (!humanIsAttacker && state.botDefScore >= 3);
        showMatchResult(humanWon);
        renderResults(state.botResults);
        return;
    }

    state.botPreviousBotConcat = Number(state.botDice.join(""));
    const humanWon = (humanIsAttacker && roundWinner === "ATT") || (!humanIsAttacker && roundWinner === "DEF");
    const humanConstraint = humanWon ? "ORDER" : "ROUT";
    const botConstraint = humanWon ? "ROUT" : "ORDER";
    state.roundAdvanceTimeout = setTimeout(() => {
        state.roundAdvanceTimeout = null;
        if (!state.botMode || state.match.status !== "PLAYING") return;
        state.round.att_constraint = humanIsAttacker ? humanConstraint : botConstraint;
        state.round.def_constraint = humanIsAttacker ? botConstraint : humanConstraint;
        state.myDice = startingDice();
        state.botDice = chooseBotDice(botConstraint, humanIsAttacker ? 10 : 11);
        state.botRound += 1;
        state.match.current_round = state.botRound;
        state.round.round_number = state.botRound;
        document.getElementById("hud-round-label").textContent = `${t("round")} ${state.botRound}`;
        state.round.ends_at = new Date(Date.now() + ROUND_DURATION_MS).toISOString();
        handleBotRoundUpdate();
    }, 10000);
}

function renderMatchState() {
    const m = state.match;
    if (!m) return;
    document.getElementById("hud-room-code").textContent = m.room_code;
    document.getElementById("hud-att-score").textContent = m.att_score;
    document.getElementById("hud-def-score").textContent = m.def_score;
    document.getElementById("hud-round-label").textContent = `${t("round")} ${m.current_round}`;

    document.getElementById("stage-waiting").classList.add("hidden");
    document.getElementById("stage-roles").classList.add("hidden");
    document.getElementById("stage-combat").classList.add("hidden");

    if (m.status === "WAITING") {
        document.getElementById("stage-waiting").classList.remove("hidden");
        document.getElementById("wait-code-display").textContent = m.room_code;
        const host = m.player_1 === pb.authStore.model.id;
        document.getElementById("btn-close-match").classList.toggle("hidden", !host);
        document.getElementById("btn-start-match").classList.toggle("hidden", !host || !m.player_2);
        const waitingMessage = document.getElementById("waiting-message");
        waitingMessage.hidden = host && Boolean(m.player_2);
        waitingMessage.textContent = m.player_2 ? t("waitingHost") : t("waitingOpponent");
        const players = document.getElementById("waiting-players");
        players.replaceChildren();
        for (const prefix of m.player_2 ? ["host", "guest"] : ["host"]) {
            const player = document.createElement("div");
            player.className = "waiting-player";
            const avatar = document.createElement("img");
            avatar.src = safeAvatar(m[`${prefix}_avatar`]);
            avatar.alt = "";
            const name = document.createElement("span");
            name.textContent = `${m[`${prefix}_name`] || "—"} · ${m[`${prefix}_elo`] || 0}`;
            player.append(avatar, name);
            players.append(player);
        }
    } else if (m.status === "ROLE_SELECT") {
        document.getElementById("stage-roles").classList.remove("hidden");
        document.getElementById("role-coin-text").classList.toggle("hidden", state.botMode);
        const choice = state.botMode ? null : m.player_1 === humanId() ? m.p1_role_choice : m.p2_role_choice;
        const selected = !state.botMode && choice && choice !== "NONE";
        document.querySelectorAll("#stage-roles button").forEach(button => { button.disabled = Boolean(selected); });
        document.getElementById("role-status-msg").textContent = selected ? t("roleLocked") : "";
    } else if (m.status === "PLAYING") {
        document.getElementById("stage-combat").classList.remove("hidden");
        setupPerspectiveLabels();
        fetchActiveRound().catch(error => showGameError(error));
    } else if (m.status === "FINISHED") {
        state.roundSync++;
        clearTimeout(state.roundAdvanceTimeout);
        state.roundAdvanceTimeout = null;
        localStorage.removeItem(currentMatchKey());
        document.getElementById("stage-combat").classList.remove("hidden");
        showMatchResult(m.winner_id === humanId());
        loadFinalResults(m.id).catch(error => showGameError(error));
    }
}

// seleccion rol
document.querySelectorAll("#stage-roles button").forEach(btn => {
    btn.addEventListener("click", async () => {
        const choice = btn.getAttribute("data-role");
        if (state.botMode) {
            const playerId = humanId();
            state.match.attacker_id = choice === "ATT" ? playerId : "BOT";
            state.match.defender_id = choice === "DEF" ? playerId : "BOT";
            state.match.status = "PLAYING";
            state.round.phase = "LOCKING";
            state.round.ends_at = new Date(Date.now() + ROUND_DURATION_MS).toISOString();
            state.myDice = startingDice();
            state.botDice = chooseBotDice("FREE", choice === "ATT" ? 10 : 11);
            renderMatchState();
            return;
        }
        try {
            await gameRequest("role", { match_id: state.match.id, choice });
            document.getElementById("role-status-msg").textContent = t("roleLocked");
        } catch (error) {
            showGameError(error);
        }
    });
});

// etiqueras segun rol
function setupPerspectiveLabels() {
    const isAtt = state.match.attacker_id === humanId();
    const maxPts = isAtt ? 11 : 10;
    document.getElementById("points-max").textContent = maxPts;
}

function handleRoundUpdate(round) {
    const isNewRound = !state.round || state.round.id !== round.id || state.round.attempt !== round.attempt;
    state.round = round;
    document.getElementById("hud-round-label").textContent = `${t("round")} ${round.round_number}`;

    const isAtt = state.match.attacker_id === humanId();
    if (isNewRound) {
        state.lockedLocally = false;
        state.myDice = startingDice();
        document.getElementById("btn-lock-dice").disabled = false;
        resetResolution();
        for (let i = 0; i < 3; i++) {
            const opponent = document.getElementById(`opp-die-${i}`);
            opponent.src = "assets/r_dice/r1.svg";
            delete opponent.dataset.value;
        }
        if (round.phase === "LOCKING" && round.first_locker === (isAtt ? "ATT" : "DEF")) {
            state.lockedLocally = true;
            document.getElementById("btn-lock-dice").disabled = true;
        }
    }
    updateRoundLabels(round);
    // Pista de virote ballesta
    const banner = document.getElementById("ballesteros-banner");
    const rivalLockedFirst = (isAtt && round.first_locker === "DEF") || (!isAtt && round.first_locker === "ATT");
    banner.classList.toggle("hidden",
        round.phase !== "LOCKING" || !rivalLockedFirst || round.ballesteros_hint !== "HIGHER_OR_EQUAL");
    updateDiceUI();
    startRoundTimer(round);
    if (round.phase === "REVEALED") {
        state.lockedLocally = true;
        document.getElementById("btn-lock-dice").disabled = true;
        animateRoundResolution(round, isAtt);
    }
}

function updateRoundLabels(round) {
    const isAtt = state.match.attacker_id === humanId();
    const myConstraint = isAtt ? round.att_constraint : round.def_constraint;
    const badge = document.getElementById("constraint-badge");
    badge.classList.toggle("hidden", myConstraint !== "ORDER" && myConstraint !== "ROUT");
    badge.textContent = myConstraint === "ORDER" ? t("order") : myConstraint === "ROUT" ? t("rout") : "";
}
// Controles +/- de los 3 dados
document.querySelectorAll(".step-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        if (state.lockedLocally || state.round?.phase !== "LOCKING") return;
        const idx = Number(btn.getAttribute("data-idx"));
        const delta = Number(btn.getAttribute("data-delta"));
        const isAtt = state.match.attacker_id === humanId();
        const maxPts = isAtt ? 11 : 10;
        const current = state.myDice[idx];
        const nextVal = delta > 0 && current === 6 ? 1
            : delta < 0 && current === 1 ? 6 : current + delta;
        const currentSum = state.myDice.reduce((acc, val) => acc + val, 0);
        if (currentSum + nextVal - current > maxPts) return;
        state.myDice[idx] = nextVal;
        updateDiceUI();
    });
});
function updateDiceUI() {
    let sum = 0;
    const isAtt = state.match?.attacker_id === humanId();
    const prefix = isAtt ? "r_dice/r" : "b_dice/b";
    for (let i = 0; i < 3; i++) {
        const val = state.myDice[i];
        const die = document.getElementById(`my-die-${i}`);
        die.src = `assets/${prefix}${val}.svg`;
        die.dataset.value = val;
        sum += val;
    }
    document.getElementById("points-used").textContent = sum;
    updateDiceAccessibility();
}

function updateDiceAccessibility() {
    document.querySelectorAll(".player-die, .opp-die").forEach(die => {
        const label = t(die.classList.contains("player-die") ? "myDie" : "opponentDie");
        die.alt = die.dataset.value ? `${label}: ${die.dataset.value}` : label;
    });
    document.querySelectorAll(".step-btn").forEach(button => {
        const index = Number(button.dataset.idx);
        const action = t(button.dataset.delta === "1" ? "increaseDice" : "decreaseDice");
        button.setAttribute("aria-label", `${action} ${index + 1}, ${t("dieValue")} ${state.myDice[index]}`);
    });
}
// Fijar formación en el servidor
document.getElementById("btn-lock-dice").addEventListener("click", async () => {
    if (state.lockedLocally || !state.round) return;
    if (state.botMode) {
        resolveBotRound();
        return;
    }
    if (Date.now() + state.serverClockOffset >= new Date(state.round.ends_at).getTime()) {
        document.getElementById("btn-lock-dice").disabled = true;
        return;
    }
    const isAtt = state.match.attacker_id === humanId();
    const constraint = isAtt ? state.round.att_constraint : state.round.def_constraint;
    if (!DespotGame.validFormation(state.myDice, isAtt ? 11 : 10, constraint)) {
        showToast("invalidFormation", "400", "error");
        return;
    }
    const round = state.round;
    try {
        state.lockedLocally = true;
        document.getElementById("btn-lock-dice").disabled = true;
        await gameRequest("lock", { round_id: round.id, dice: Array.from(state.myDice) });
    } catch (err) {
        if (state.round?.id === round.id && state.round.attempt === round.attempt && state.round.phase === "LOCKING") {
            state.lockedLocally = false;
            document.getElementById("btn-lock-dice").disabled =
                Date.now() + state.serverClockOffset >= new Date(state.round.ends_at).getTime();
        }
        showGameError(err);
    }
});
// reloj como la peli esa del tiempo es moneda
function startRoundTimer(round) {
    clearInterval(state.timerInterval);
    const timerEl = document.getElementById("hud-timer");
    if (round.phase !== "LOCKING") {
        return;
    }
    const endMs = new Date(round.ends_at).getTime();
    state.timerInterval = setInterval(async () => {
        const now = Date.now() + (state.botMode ? 0 : state.serverClockOffset);
        const rem = Math.max(0, Math.ceil((endMs - now) / 1000));
        if (timerEl.textContent !== `${rem}s`) timerEl.textContent = `${rem}s`;
        if (!state.botMode && state.round?.id === round.id && state.round.attempt === round.attempt &&
            state.round.phase === "LOCKING" && !state.lockedLocally) {
            document.getElementById("btn-lock-dice").disabled = rem <= 0;
        }
        if (rem <= 0) {
            clearInterval(state.timerInterval);
            if (state.botMode) {
                resolveBotRound(true);
                return;
            }
            try {
                const result = await gameRequest("timeout", { round_id: round.id });
                if (result.pending && state.round?.id === round.id && state.round?.attempt === round.attempt) {
                    state.timerInterval = setTimeout(() => startRoundTimer(round), 500);
                }
            } catch (error) {
                if (state.round?.id === round.id && state.round?.phase === "LOCKING") {
                    try {
                        const current = await pb.collection("rounds").getOne(round.id, { requestKey: null });
                        if (current.phase !== "LOCKING" || current.attempt !== round.attempt) {
                            handleRoundUpdate(current);
                        } else {
                            showGameError(error);
                        }
                    } catch (refreshError) {
                        showGameError(refreshError);
                    }
                }
            }
        }
    }, 250);
}
// animacion de combate
function resetResolution() {
    document.querySelectorAll(".die-face").forEach(die => die.classList.remove("clash-winner"));
    document.querySelectorAll(".die-effects").forEach(effects => effects.replaceChildren());
    document.querySelectorAll(".opp-die").forEach(die => { delete die.dataset.value; });
    updateDiceAccessibility();
    document.getElementById("stage-combat").classList.remove("round-revealed");
    const timer = document.getElementById("hud-timer");
    timer.textContent = `${ROUND_DURATION_MS / 1000}s`;
    timer.setAttribute("aria-live", "off");
    timer.classList.remove("match-result");
    document.getElementById("btn-return-home").classList.add("hidden");
    document.getElementById("elo-unrated").classList.add("hidden");
    document.getElementById("match-results").classList.add("hidden");
    document.querySelector("#match-results tbody").replaceChildren();
}

function showMatchResult(won) {
    const timer = document.getElementById("hud-timer");
    const steps = state.round?.round_number === state.match.current_round ? state.round.resolution_log : null;
    setResultStatus(won ? "victory" : "defeat", steps);
    timer.classList.add("match-result");
    const unrated = document.getElementById("elo-unrated");
    unrated.textContent = t("unrated");
    unrated.classList.toggle("hidden", state.botMode || !state.match.elo_unrated);
    document.getElementById("btn-return-home").classList.remove("hidden");
}

function effectIcon(key) {
    const icons = {
        greekFire: "fire.svg",
        almogavar: "almogavar.svg",
        turcopolos: "turk.svg",
        varegos: "varangian.svg"
    };
    const image = document.createElement("img");
    image.className = "effect-icon";
    image.src = `assets/icon/${icons[key]}`;
    image.alt = t(key);
    image.dataset.i18nAlt = key;
    return image;
}

function setResultStatus(key, steps) {
    const timer = document.getElementById("hud-timer");
    timer.setAttribute("aria-live", "polite");
    timer.textContent = t(key);
    if (steps?.some(step => step.type === "VAREGOS")) timer.append(effectIcon("varegos"));
}

function renderResults(rounds) {
    const table = document.getElementById("match-results");
    const body = table.querySelector("tbody");
    body.replaceChildren();
    for (const round of rounds) {
        const row = document.createElement("tr");
        const varegos = round.resolution_log?.find(step => step.type === "VAREGOS");
        const values = [round.att_dice_final?.join("-") || "—", "vs", round.def_dice_final?.join("-") || "—"];
        for (const [index, value] of values.entries()) {
            const cell = document.createElement("td");
            cell.textContent = value;
            if (varegos && index === (varegos.winner === "ATT" ? 0 : 2)) cell.append(effectIcon("varegos"));
            row.append(cell);
        }
        body.append(row);
    }
    table.classList.remove("hidden");
}

async function loadFinalResults(matchId) {
    const rounds = await pb.collection("rounds").getFullList({
        filter: pb.filter('match_id = {:matchId} && phase = "REVEALED"', { matchId }),
        sort: "round_number",
        requestKey: null
    });
    if (state.match?.id !== matchId || state.match.status !== "FINISHED") return;
    const last = rounds[rounds.length - 1];
    if (last) {
        handleRoundUpdate(last);
        showMatchResult(state.match.winner_id === humanId());
    }
    renderResults(rounds.map(round => ({
        att_dice_final: round.resolution_log?.some(step => step.type === "TIMEOUT" && step.side === "ATT") ? null : round.att_dice_final,
        def_dice_final: round.resolution_log?.some(step => step.type === "TIMEOUT" && step.side === "DEF") ? null : round.def_dice_final,
        resolution_log: round.resolution_log
    })));
}

function animateRoundResolution(round, isAtt) {
    const activeRound = state.round;
    // defensor se mira al espejo
    const myFinal = isAtt ? round.att_dice : round.def_dice;
    const oppFinal = isAtt
        ? [round.def_dice[2], round.def_dice[1], round.def_dice[0]]
        : [round.att_dice[2], round.att_dice[1], round.att_dice[0]];
    const won = (isAtt && round.round_winner === "ATT") || (!isAtt && round.round_winner === "DEF");
    if (state.match.status !== "FINISHED") {
        setResultStatus(won ? "roundWon" : "roundLost", round.resolution_log);
    } else {
        showMatchResult(state.botMode ? won : state.match.winner_id === humanId());
    }
    document.getElementById("stage-combat").classList.add("round-revealed");
    document.querySelectorAll(".die-face").forEach(die => die.classList.remove("clash-winner"));
    document.querySelectorAll(".die-effects").forEach(effects => effects.replaceChildren());
    for (const step of round.resolution_log || []) {
        let side;
        let index;
        let icon;
        if (step.type === "TURCOPOLOS") {
            side = step.side;
            const own = (side === "ATT") === isAtt;
            index = own ? step.index : 2 - step.index;
            icon = "turcopolos";
        } else if (step.type === "CLASH" && (step.greekFire || step.almogavar)) {
            side = step.winner;
            index = isAtt ? step.section : 2 - step.section;
            icon = step.greekFire ? "greekFire" : "almogavar";
        } else {
            continue;
        }
        const own = (side === "ATT") === isAtt;
        document.getElementById(`${own ? "my" : "opp"}-die-${index}`).parentElement
            .querySelector(".die-effects").append(effectIcon(icon));
    }
    for (let i = 0; i < 3; i++) {
        // arranque de combate desde atacante
        const visualSlot = isAtt ? i : 2 - i;
        setTimeout(() => {
            if (state.round !== activeRound || activeRound?.phase !== "REVEALED") return;
            const myDie = document.getElementById(`my-die-${visualSlot}`);
            const opponentDie = document.getElementById(`opp-die-${visualSlot}`);
            myDie.src = `assets/${isAtt ? "r_dice/r" : "b_dice/b"}${myFinal[visualSlot]}.svg`;
            opponentDie.src = `assets/${isAtt ? "b_dice/b" : "r_dice/r"}${oppFinal[visualSlot]}.svg`;
            myDie.dataset.value = myFinal[visualSlot];
            opponentDie.dataset.value = oppFinal[visualSlot];
            updateDiceAccessibility();
            const clashStep = (round.resolution_log || []).find(s => s.type === "CLASH" && s.section === i);
            if (clashStep) {
                const iWonSection = (isAtt && clashStep.winner === "ATT") ||
                    (!isAtt && (clashStep.winner === "DEF" || clashStep.winner === "TIE"));
                const winner = document.getElementById(`${iWonSection ? "my" : "opp"}-die-${visualSlot}`).parentElement;
                const opponent = document.getElementById(`${iWonSection ? "opp" : "my"}-die-${visualSlot}`).parentElement;
                const distance = (opponent.getBoundingClientRect().top - winner.getBoundingClientRect().top) / 2;
                winner.style.setProperty("--clash-shift", `${distance}px`);
                winner.classList.add("clash-winner");
            }
        }, i * 650);
    }
}
// Arranque inicial
applyTranslations();
if (pb.authStore.isValid && pb.authStore.model) {
    const savedMatch = localStorage.getItem(currentMatchKey());
    if (savedMatch) {
        enterMatch(savedMatch).catch(error => {
            localStorage.removeItem(currentMatchKey());
            if (error.status === 404) showToast("matchCanceled", "200", "success");
            else showGameError(error);
        });
    }
}