(() => {
  "use strict";

  const USER_KEY = "despot-user";
  const GAME_KEY = "despot-game";
  const DICE_COUNT = 3;
  const DIE_MAX = 6;
  const RESOLUTION_DIE_MAX = 7;
  const ROLE_LIMITS = { attack: 11, defense: 10 };
  const TURCOPOLES_LIMITS = { attack: 8, defense: 7 };
  const get = (selector) => document.querySelector(selector);
  const loginModal = get("#login-modal");
  const loginForm = get("#login-form");
  const usernameInput = get("#username");
  const formError = get("#form-error");
  const accountLabel = get("#account-label");
  const accountStatus = get("#account-status");
  const loginButton = get("#login-button");
  const logoutButton = get("#logout-button");
  let pendingPlay = false;
  let toastTimeout;
  let roundTimer;
  let resultTimer;

  const getUser = () => localStorage.getItem(USER_KEY);
  const showToast = (message) => {
    const toast = get("#toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.remove("hidden");
    window.clearTimeout(toastTimeout);
    toastTimeout = window.setTimeout(() => toast.classList.add("hidden"), 3000);
  };
  const updateAccount = () => {
    const username = getUser();
    accountLabel?.classList.toggle("hidden", !username);
    accountStatus?.classList.toggle("hidden", !username);
    if (accountLabel) accountLabel.textContent = username || "";
    loginButton?.classList.toggle("hidden", Boolean(username));
    logoutButton?.classList.toggle("hidden", !username);
  };
  const openLogin = () => {
    loginModal?.classList.remove("hidden");
    usernameInput?.focus();
  };
  const closeLogin = () => {
    loginModal?.classList.add("hidden");
    formError?.classList.add("hidden");
    loginForm?.reset();
  };
  const clearGame = () => sessionStorage.removeItem(GAME_KEY);
  const clearTimers = () => {
    window.clearTimeout(roundTimer);
    window.clearTimeout(resultTimer);
  };

  const pages = {
    home: get("#home-page"),
    role: get("#role-page"),
    allocation: get("#allocation-page"),
    round: get("#round-page"),
    battle: get("#battle-page"),
    result: get("#match-result-page"),
  };
  const diceBoard = get("#dice-board");
  const showOnly = (page) => Object.values(pages).forEach((view) => view?.classList.toggle("hidden", view !== page));

  const newGame = (role) => ({
    role,
    phase: "role",
    round: 1,
    roundWins: 0,
    opponentWins: 0,
    playerDice: Array(DICE_COUNT).fill(1),
    opponentDice: [],
    lastPlayerRoundWins: 0,
    varangianVictory: false,
  });
  let game = null;
  const saveGame = () => sessionStorage.setItem(GAME_KEY, JSON.stringify(game));

  const showRoleSelection = () => showOnly(pages.role);
  const showRound = () => {
    window.clearTimeout(roundTimer);
    game.phase = "round";
    saveGame();
    const title = get("#round-title");
    const symbols = get("#round-symbols");
    if (title) title.textContent = `Round ${game.round}`;
    if (symbols) {
      symbols.innerHTML = Array.from(
        { length: game.roundWins },
        () => '<img src="images/nika.png" alt="Round won" />',
      ).join("");
      symbols.classList.toggle("hidden", game.roundWins === 0);
    }
    showOnly(pages.round);
    roundTimer = window.setTimeout(showAllocation, 850);
  };
  const showAllocation = () => {
    game.phase = "allocation";
    saveGame();
    const maximum = ROLE_LIMITS[game.role];
    const points = get("#points-remaining");
    if (points) points.textContent = String(maximum - game.playerDice.reduce((sum, value) => sum + value, 0));
    renderDice(null, 0, true);
    showOnly(pages.allocation);
  };

  const renderDice = (changedIndex = null, direction = 0, rebuild = false) => {
    const board = get("#dice-board");
    if (!board) return;
    const prefix = game.role === "attack" ? "red" : "blu";
    const maximum = ROLE_LIMITS[game.role];
    const points = get("#points-remaining");
    if (points) points.textContent = String(maximum - game.playerDice.reduce((sum, value) => sum + value, 0));
    if (rebuild) board.innerHTML = "";
    if (!board.children.length) {
      board.innerHTML = game.playerDice.map((value, index) => `
        <div class="die-control">
          <button class="die-adjust" type="button" data-index="${index}" data-change="1" aria-label="Increase die ${index + 1}">▲</button>
          <img class="die-image" data-die-image="${index}" src="images/${prefix}${value}.png" alt="Die ${index + 1}, value ${value}" />
          <button class="die-adjust" type="button" data-index="${index}" data-change="-1" aria-label="Decrease die ${index + 1}">▼</button>
        </div>`).join("");
    } else if (changedIndex !== null) {
      const image = board.querySelector(`[data-die-image="${changedIndex}"]`);
      image.classList.remove("die-slide-up", "die-slide-down");
      void image.offsetWidth;
      image.src = `images/${prefix}${game.playerDice[changedIndex]}.png`;
      image.alt = `Die ${changedIndex + 1}, value ${game.playerDice[changedIndex]}`;
      image.classList.add(direction > 0 ? "die-slide-up" : "die-slide-down");
    }
  };

  diceBoard?.addEventListener("click", (event) => {
    const button = event.target.closest(".die-adjust");
    if (!button || !game || game.phase !== "allocation") return;

    const index = Number(button.dataset.index);
    const change = Number(button.dataset.change);
    const currentValue = game.playerDice[index];
    const nextValue = change > 0
      ? (currentValue === DIE_MAX ? 1 : currentValue + 1)
      : (currentValue === 1 ? DIE_MAX : currentValue - 1);
    const maximum = ROLE_LIMITS[game.role];
    const total = game.playerDice.reduce((sum, value) => sum + value, 0);
    const nextTotal = total - currentValue + nextValue;

    if (nextTotal > maximum) return;
    game.playerDice[index] = nextValue;
    saveGame();
    renderDice(index, change);
  });

  const rollOpponent = () => {
    const maximum = ROLE_LIMITS[game.role === "attack" ? "defense" : "attack"];
    const values = Array(DICE_COUNT).fill(1);
    let remaining = maximum - DICE_COUNT;
    while (remaining > 0) {
      const available = values
        .map((value, index) => value < DIE_MAX ? index : -1)
        .filter((index) => index >= 0);
      if (!available.length) break;
      const index = available[Math.floor(Math.random() * available.length)];
      values[index] += 1;
      remaining -= 1;
    }
    return values;
  };

  const dieMarkup = (value, role) => `
    <div class="battle-die">
      <img src="images/${role === "attack" ? "red" : "blu"}${value}.png" alt="${role} die, value ${value}" />
    </div>`;

  const getResolutionSides = () => {
    const player = [...game.playerDice];
    const opponent = [...game.opponentDice].reverse();
    const playerIsAttacker = game.role === "attack";
    return {
      player,
      opponent,
      attacker: playerIsAttacker ? player : opponent,
      defender: playerIsAttacker ? opponent : player,
    };
  };

  const renderResolutionSides = (attacker, defender) => {
    const playerValues = game.role === "attack" ? attacker : defender;
    const opponentValues = game.role === "attack" ? defender : attacker;
    const playerRole = game.role;
    const opponentRole = game.role === "attack" ? "defense" : "attack";
    get("#opponent-dice").innerHTML = opponentValues.map((value) => dieMarkup(value, opponentRole)).join("");
    get("#player-dice").innerHTML = playerValues.map((value) => dieMarkup(value, playerRole)).join("");
  };

  const updatePlayerDiceFromResolution = (attacker, defender) => {
    game.playerDice = game.role === "attack" ? [...attacker] : [...defender];
  };

  const updateOpponentDiceFromResolution = (attacker, defender) => {
    game.opponentDice = game.role === "attack" ? [...defender].reverse() : [...attacker].reverse();
  };

  const resolvePair = (attackerValue, defenderValue) => {
    if (attackerValue === 1 && defenderValue === 6) return "attacker";
    if (attackerValue === 6 && defenderValue === 1) return "defender";
    if (attackerValue === defenderValue) return "defender";
    return attackerValue > defenderValue ? "attacker" : "defender";
  };

  const activatesAlmogavar = (winnerValue, loserValue) => (
    winnerValue >= 4
    && winnerValue >= loserValue * 2
    && !(winnerValue === 6 && loserValue === 1)
  );

  const applyTurcopoles = (values, role) => {
    const threshold = TURCOPOLES_LIMITS[role];
    const total = values.reduce((sum, value) => sum + value, 0);
    if (total > threshold) return { activated: false, changed: false };

    const lowest = Math.min(...values);
    const index = values.indexOf(lowest);
    const rerolled = Math.floor(Math.random() * DIE_MAX) + 1;
    values[index] = rerolled;
    return { activated: true, changed: rerolled !== lowest };
  };

  const resolveRound = ({ attacker, defender, playerRole }) => {
    const initialAttacker = [...attacker];
    const initialDefender = [...defender];
    const resolvedAttacker = [...attacker];
    const resolvedDefender = [...defender];
    const playerValues = playerRole === "attack" ? resolvedAttacker : resolvedDefender;
    const turcopoles = applyTurcopoles(playerValues, playerRole);
    let playerWins = 0;
    let attackerWins = 0;
    let defenderWins = 0;

    for (let index = 0; index < DICE_COUNT; index += 1) {
      const attackerValue = resolvedAttacker[index];
      const defenderValue = resolvedDefender[index];
      const winner = resolvePair(attackerValue, defenderValue);
      if (winner === "attacker") attackerWins += 1;
      else defenderWins += 1;
      const playerWinner = playerRole === "attack" ? "attacker" : "defender";
      if (winner === playerWinner) playerWins += 1;

      const winningValue = winner === "attacker" ? attackerValue : defenderValue;
      const losingValue = winner === "attacker" ? defenderValue : attackerValue;
      if (index < DICE_COUNT - 1 && activatesAlmogavar(winningValue, losingValue)) {
        const nextSide = winner === "attacker" ? resolvedAttacker : resolvedDefender;
        nextSide[index + 1] = Math.min(RESOLUTION_DIE_MAX, nextSide[index + 1] + 1);
      }
    }

    return {
      attacker: resolvedAttacker,
      defender: resolvedDefender,
      playerWins,
      attackerWins,
      defenderWins,
      changed: JSON.stringify(initialAttacker) !== JSON.stringify(resolvedAttacker)
        || JSON.stringify(initialDefender) !== JSON.stringify(resolvedDefender),
      turcopoles,
    };
  };

  const createResolutionSnapshot = (attacker, defender) => ({
    player: game.role === "attack" ? [...attacker] : [...defender],
    opponent: game.role === "attack" ? [...defender] : [...attacker],
  });

  let resolutionSnapshots = [];
  let activeResolutionSnapshot = 0;
  const renderResolutionSnapshot = () => {
    const snapshot = resolutionSnapshots[activeResolutionSnapshot];
    if (!snapshot) return;
    const opponentRole = game.role === "attack" ? "defense" : "attack";
    get("#opponent-dice").innerHTML = snapshot.opponent.map((value) => dieMarkup(value, opponentRole)).join("");
    get("#player-dice").innerHTML = snapshot.player.map((value) => dieMarkup(value, game.role)).join("");
    const stage = get("#resolution-stage");
    if (stage) stage.textContent = activeResolutionSnapshot === 0 ? "Initial allocation" : "Final allocation";
    get("#resolution-slider")?.classList.toggle("hidden", resolutionSnapshots.length < 2);
  };

  const resolveBattle = () => {
    const battleButton = get("#battle-button");
    if (battleButton) battleButton.disabled = true;
    game.opponentDice = rollOpponent();
    const sides = getResolutionSides();
    const result = resolveRound({
      attacker: sides.attacker,
      defender: sides.defender,
      playerRole: game.role,
    });

    resolutionSnapshots = [createResolutionSnapshot(sides.attacker, sides.defender)];
    if (result.changed) resolutionSnapshots.push(createResolutionSnapshot(result.attacker, result.defender));
    activeResolutionSnapshot = resolutionSnapshots.length - 1;

    updatePlayerDiceFromResolution(result.attacker, result.defender);
    updateOpponentDiceFromResolution(result.attacker, result.defender);
    game.roundWins += result.playerWins >= 2 ? 1 : 0;
    game.opponentWins += result.playerWins >= 2 ? 0 : 1;
    game.phase = "battle";
    game.lastPlayerRoundWins = result.playerWins;
    game.varangianVictory = result.playerWins === DICE_COUNT;
    saveGame();
    renderBattle(result.playerWins, result.attackerWins === DICE_COUNT || result.defenderWins === DICE_COUNT);
  };

  const renderBattle = (playerRoundWins, knockout = false) => {
    const sides = getResolutionSides();
    if (resolutionSnapshots.length > 1) renderResolutionSnapshot();
    else renderResolutionSides(sides.attacker, sides.defender);
    get("#battle-result").textContent = playerRoundWins >= 2 ? "You win" : "Opponent wins";
    const playerWonKnockout = knockout && playerRoundWins === 3;
    const opponentWonKnockout = knockout && playerRoundWins === 0;
    const matchFinished = playerWonKnockout || opponentWonKnockout || game.roundWins === 2 || game.opponentWins === 2 || game.round === 3;
    get("#next-round-button").classList.toggle("hidden", matchFinished);
    showOnly(pages.battle);
    if (matchFinished) {
      window.clearTimeout(resultTimer);
      resultTimer = window.setTimeout(showMatchResult, 9000);
    }
    const battleButton = get("#battle-button");
    if (battleButton) battleButton.disabled = false;
  };

  const showMatchResult = () => {
    resultTimer = undefined;
    if (!game) return;
    game.phase = "result";
    saveGame();
    const playerWon = game.roundWins > game.opponentWins;
    get("#match-result").innerHTML = playerWon
      ? `<img src="images/nika.png" alt="" class="victory-mark inverted" /><strong>${game.varangianVictory ? "VARANGIAN VICTORY" : "VICTORY"}</strong><img src="images/nika.png" alt="" class="victory-mark" />`
      : '<strong>DEFEAT</strong>';
    showOnly(pages.result);
    resultTimer = window.setTimeout(() => {
      clearGame();
      game = null;
      showOnly(pages.home);
    }, 3500);
  };

  get("#play-button")?.addEventListener("click", () => {
    if (!getUser()) {
      pendingPlay = true;
      openLogin();
      return;
    }
    game ? showRound() : showRoleSelection();
  });
  loginButton?.addEventListener("click", openLogin);
  get("#modal-close")?.addEventListener("click", closeLogin);
  loginModal?.addEventListener("click", (event) => {
    if (event.target === loginModal) closeLogin();
  });
  loginForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const username = usernameInput.value.trim();
    if (username.length < 3) {
      formError.classList.remove("hidden");
      return;
    }
    localStorage.setItem(USER_KEY, username);
    updateAccount();
    closeLogin();
    if (pendingPlay) {
      pendingPlay = false;
      showRoleSelection();
    }
  });
  logoutButton?.addEventListener("click", () => {
    clearTimers();
    localStorage.removeItem(USER_KEY);
    clearGame();
    game = null;
    showOnly(pages.home);
    updateAccount();
  });
  document.querySelectorAll("[data-role]").forEach((button) => {
    button.addEventListener("click", () => {
      clearTimers();
      game = newGame(button.dataset.role);
      saveGame();
      showRound();
    });
  });
  get("#battle-button")?.addEventListener("click", resolveBattle);
  get("#next-round-button")?.addEventListener("click", () => {
    clearTimers();
    game.round += 1;
    game.playerDice = Array(DICE_COUNT).fill(1);
    saveGame();
    showRound();
  });
  get("#previous-resolution")?.addEventListener("click", () => {
    activeResolutionSnapshot = (activeResolutionSnapshot + resolutionSnapshots.length - 1) % resolutionSnapshots.length;
    renderResolutionSnapshot();
  });
  get("#next-resolution")?.addEventListener("click", () => {
    activeResolutionSnapshot = (activeResolutionSnapshot + 1) % resolutionSnapshots.length;
    renderResolutionSnapshot();
  });

  const wildcardRules = [
    {
      name: "Greek Fire",
      description: "A dice with value of 1 beats an opposing dice with 6",
      image: "fire.png",
    },
    {
      name: "Almogavar",
      description: "If a dice with a value of 4 or higher wins and doubles the opponent dice, the next dice will have one extra point, it can trigger or dissable itself and other wildcards",
      image: "almogavar.png",
    },
    {
      name: "Turcopoles",
      description: "Play with -3 max points to allocate, on battle resolution the lowest dice its randomly rerolled, it can trigger or dissable other wildcards",
      image: "turk.png",
    },
    {
      name: "Varangian",
      description: "Win all sides to win by K.O",
      image: "varangian.png",
    },
  ];
  const ruleName = get("#rule-name");
  const ruleDescription = get("#rule-description");
  const ruleImage = get("#rule-image");
  const carouselDots = get("#carousel-dots");
  let activeWildcard = 0;

  const renderWildcard = () => {
    if (!ruleName || !ruleDescription || !ruleImage || !carouselDots) return;
    const rule = wildcardRules[activeWildcard];
    ruleName.textContent = rule.name;
    ruleDescription.textContent = rule.description;
    ruleImage.src = `images/${rule.image}`;
    ruleImage.alt = rule.name;
    carouselDots.querySelectorAll(".carousel-dot").forEach((dot, index) => {
      dot.classList.toggle("is-active", index === activeWildcard);
    });
  };

  if (carouselDots) {
    wildcardRules.forEach((rule, index) => {
      const dot = document.createElement("button");
      dot.className = "carousel-dot";
      dot.type = "button";
      dot.ariaLabel = rule.name;
      dot.addEventListener("click", () => {
        activeWildcard = index;
        renderWildcard();
      });
      carouselDots.append(dot);
    });
    get("#previous-rule")?.addEventListener("click", () => {
      activeWildcard = (activeWildcard - 1 + wildcardRules.length) % wildcardRules.length;
      renderWildcard();
    });
    get("#next-rule")?.addEventListener("click", () => {
      activeWildcard = (activeWildcard + 1) % wildcardRules.length;
      renderWildcard();
    });
    renderWildcard();
  }

  if (performance.getEntriesByType("navigation")[0]?.type === "reload") clearGame();
  try {
    const storedGame = JSON.parse(sessionStorage.getItem(GAME_KEY));
    game = storedGame ? { ...newGame(storedGame.role), ...storedGame } : null;
  } catch {
    game = null;
  }
  updateAccount();
  if (game && getUser()) {
    if (game.phase === "battle") renderBattle(game.lastPlayerRoundWins);
    else if (game.phase === "result") showMatchResult();
    else if (game.phase === "allocation") showAllocation();
    else showRound();
  }
})();
