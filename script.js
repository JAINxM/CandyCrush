const BOARD_SIZE = 8;
const NORMAL_CANDY_IMAGE_PATHS = [
    "images/capsule 1.svg",
    "images/eye 1.svg",
    "images/eye-chart-1.svg",
    "images/eyedrop1.svg",
    "images/Glasses.svg",
    "images/optonetrist_eyetest_glass.svg"
];
const COLOR_BOMB_IMAGE_PATH = "images/eye-chart-1.svg";
const COLORS = NORMAL_CANDY_IMAGE_PATHS.length;
const BASE_POINTS = 10;
const SPECIAL_BONUS = 40;

const LEVELS = [
    {
        level: 1,
        type: 'score',
        targetScore: 1500,
        stars: [1500, 2500, 4000],
        moves: 15,
        desc: "Reach 1500 points to pass!"
    },
    {
        level: 2,
        type: 'collect',
        targetColors: { 0: 15, 2: 15 }, // Red and Yellow
        stars: [1500, 2500, 4000], // For collect levels, stars can still be based on score
        moves: 20,
        desc: "Collect 15 Red and 15 Yellow candies!"
    },
    {
        level: 3,
        type: 'score',
        targetScore: 3500,
        stars: [3500, 5000, 7000],
        moves: 25,
        desc: "Reach 3500 points to pass!"
    },
    {
        level: 4,
        type: 'collect',
        targetColors: { 1: 20, 3: 20, 4: 20 }, // Orange, Green, Blue
        stars: [2000, 4000, 6000],
        moves: 25,
        desc: "Collect 20 Orange, Green, and Blue candies!"
    }
];

let playerProgress = {
    0: { stars: 0, unlocked: true }
};

function loadProgress() {
    try {
        const saved = localStorage.getItem("candyProgress");
        if (saved) {
            playerProgress = JSON.parse(saved);
        }
    } catch (e) { }

    // Ensure at least first level is unlocked
    if (!playerProgress[0]) {
        playerProgress[0] = { stars: 0, unlocked: true };
    }
}

function saveProgress() {
    try {
        localStorage.setItem("candyProgress", JSON.stringify(playerProgress));
    } catch (e) { }
}

const mapView = document.getElementById("mapView");
const gameShell = document.getElementById("gameShell");
const levelGrid = document.getElementById("levelGrid");

const boardEl = document.getElementById("board");
const scoreEl = document.getElementById("score");
const movesEl = document.getElementById("moves");
const targetEl = document.getElementById("target");
const playBtn = document.getElementById("playBtn");
const pauseBtn = document.getElementById("pauseBtn");
const restartBtn = document.getElementById("restartBtn");
const nextLevelBtn = document.getElementById("nextLevelBtn");
const settingsBtn = document.getElementById("settingsBtn");
const homeBtn = document.getElementById("homeBtn");
const gameOverEl = document.getElementById("gameOver");
const levelStartEl = document.getElementById("levelStart");
const levelTitleEl = document.getElementById("levelTitle");
const levelDescEl = document.getElementById("levelDesc");
const startLevelBtn = document.getElementById("startLevelBtn");
const finalScoreEl = document.getElementById("finalScore");
const playAgainBtn = document.getElementById("playAgainBtn");

let board = [];
let score = 0;
let movesLeft = 0;
let currentLevelIdx = 0;
let levelState = { type: 'score', collected: {}, targetColors: {} };
let currentTarget = 0;
let busy = false;
let gameActive = false;
let isPaused = false;
let dragSource = null;
let lastSwap = null;

function key(row, col) {
    return `${row},${col}`;
}

function parseKey(value) {
    const [row, col] = value.split(",").map(Number);
    return { row, col };
}

function inBounds(row, col) {
    return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

function isAdjacent(a, b) {
    return Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1;
}

function randomColor() {
    return Math.floor(Math.random() * COLORS);
}

function makeCandy(color = randomColor(), special = null) {
    if (!special) {
        const r = Math.random();
        // Spawns will be much more rare now
        if (r < 0.001) special = "colorBomb"; // 5-candy (0.1% chance)
        else if (r < 0.004) special = "wrapped"; // bomb (0.3% chance)
        else if (r < 0.01) special = Math.random() < 0.5 ? "stripedH" : "stripedV"; // 4-candy (0.6% chance)
    }
    return { color, special };
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function getCell(row, col) {
    return boardEl.children[row * BOARD_SIZE + col];
}

function getCandyEl(row, col) {
    return getCell(row, col).firstElementChild;
}

function getCandyImagePath(color, special = null) {
    if (special === "colorBomb") {
        return COLOR_BOMB_IMAGE_PATH;
    }
    if (typeof color === "number" && color >= 0 && color < NORMAL_CANDY_IMAGE_PATHS.length) {
        return NORMAL_CANDY_IMAGE_PATHS[color];
    }
    return NORMAL_CANDY_IMAGE_PATHS[NORMAL_CANDY_IMAGE_PATHS.length - 1];
}

function createCandyImage(color, special = null, className = "candy-art") {
    if (special === "colorBomb") return null;
    const image = document.createElement("img");
    image.className = className;
    image.src = getCandyImagePath(color, special);
    image.alt = "";
    image.draggable = false;
    return image;
}

function paintCandy(row, col, candy) {
    const candyEl = getCandyEl(row, col);
    candyEl.className = "candy";
    candyEl.replaceChildren();

    if (!candy) {
        candyEl.classList.add("empty");
        return;
    }

    candyEl.classList.add("has-art");
    const art = createCandyImage(candy.color, candy.special);
    if (art) candyEl.appendChild(art);

    if (typeof candy.color === "number") {
        candyEl.classList.add(`type-${candy.color}`);
    } else {
        candyEl.classList.add("bomb-base");
    }

    if (candy.special) {
        candyEl.classList.add(`special-${candy.special}`);
    }
}

function renderAll() {
    for (let row = 0; row < BOARD_SIZE; row += 1) {
        for (let col = 0; col < BOARD_SIZE; col += 1) {
            paintCandy(row, col, board[row][col]);
        }
    }
}

function updateHud() {
    scoreEl.textContent = String(score);
    if (movesEl) movesEl.textContent = String(movesLeft);
    if (targetEl) {
        targetEl.classList.toggle("collect-target", levelState.type === 'collect');
        if (levelState.type === 'score') {
            targetEl.innerHTML = String(currentTarget);
        } else if (levelState.type === 'collect') {
            let html = "";
            for (const colorStr in levelState.targetColors) {
                const color = Number(colorStr);
                const needed = levelState.targetColors[colorStr];
                const collected = levelState.collected[color] || 0;
                const remaining = Math.max(0, needed - collected);
                html += `<div class="target-candy-wrap"><div class="target-candy type-${color}"><img src="${getCandyImagePath(color)}" alt="" class="target-candy-art"></div> ${remaining}</div>`;
            }
            targetEl.innerHTML = html;
        }
    }
}

function tapFeedback(buttonEl) {
    if (!buttonEl) return;
    buttonEl.classList.remove("tap-pop");
    void buttonEl.offsetWidth;
    buttonEl.classList.add("tap-pop");
    setTimeout(() => buttonEl.classList.remove("tap-pop"), 150);
}

function updateControlStates() {
    const ended = !gameActive;
    if (playBtn) playBtn.disabled = !isPaused && !ended;
    if (pauseBtn) pauseBtn.disabled = isPaused || ended;
}

function buildBoardDOM() {
    boardEl.innerHTML = "";
    for (let row = 0; row < BOARD_SIZE; row += 1) {
        for (let col = 0; col < BOARD_SIZE; col += 1) {
            const cell = document.createElement("div");
            cell.className = "cell";
            cell.dataset.row = String(row);
            cell.dataset.col = String(col);
            const candy = document.createElement("div");
            candy.className = "candy";
            candy.draggable = true;
            cell.appendChild(candy);
            boardEl.appendChild(cell);
        }
    }
}

function swapInBoard(a, b) {
    const temp = board[a.row][a.col];
    board[a.row][a.col] = board[b.row][b.col];
    board[b.row][b.col] = temp;
}

function createInitialBoard() {
    const next = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
    for (let row = 0; row < BOARD_SIZE; row += 1) {
        for (let col = 0; col < BOARD_SIZE; col += 1) {
            let candidate = { color: randomColor(), special: null };
            while (
                (col >= 2 &&
                    next[row][col - 1] &&
                    next[row][col - 2] &&
                    next[row][col - 1].color === candidate.color &&
                    next[row][col - 2].color === candidate.color) ||
                (row >= 2 &&
                    next[row - 1][col] &&
                    next[row - 2][col] &&
                    next[row - 1][col].color === candidate.color &&
                    next[row - 2][col].color === candidate.color)
            ) {
                candidate = { color: randomColor(), special: null };
            }
            next[row][col] = candidate;
        }
    }
    return next;
}

function findAllMatches() {
    const horizontalRuns = [];
    const verticalRuns = [];

    for (let row = 0; row < BOARD_SIZE; row += 1) {
        let start = 0;
        for (let col = 1; col <= BOARD_SIZE; col += 1) {
            const prev = board[row][col - 1];
            const curr = col < BOARD_SIZE ? board[row][col] : null;
            const same =
                curr &&
                prev &&
                curr.special !== "colorBomb" &&
                prev.special !== "colorBomb" &&
                curr.color === prev.color;
            if (!same) {
                const len = col - start;
                if (prev && prev.special !== "colorBomb" && len >= 3) {
                    const cells = [];
                    for (let c = start; c < col; c += 1) cells.push({ row, col: c });
                    horizontalRuns.push(cells);
                }
                start = col;
            }
        }
    }

    for (let col = 0; col < BOARD_SIZE; col += 1) {
        let start = 0;
        for (let row = 1; row <= BOARD_SIZE; row += 1) {
            const prev = board[row - 1]?.[col] || null;
            const curr = row < BOARD_SIZE ? board[row][col] : null;
            const same =
                curr &&
                prev &&
                curr.special !== "colorBomb" &&
                prev.special !== "colorBomb" &&
                curr.color === prev.color;
            if (!same) {
                const len = row - start;
                if (prev && prev.special !== "colorBomb" && len >= 3) {
                    const cells = [];
                    for (let r = start; r < row; r += 1) cells.push({ row: r, col });
                    verticalRuns.push(cells);
                }
                start = row;
            }
        }
    }

    const all = new Set();
    horizontalRuns.forEach((run) => run.forEach((p) => all.add(key(p.row, p.col))));
    verticalRuns.forEach((run) => run.forEach((p) => all.add(key(p.row, p.col))));
    return { horizontalRuns, verticalRuns, all };
}

function chooseSpawnCell(cells) {
    const idx = Math.floor(cells.length / 2);
    return cells[idx];
}

function runContains(run, pos) {
    if (!pos) return false;
    return run.some((p) => p.row === pos.row && p.col === pos.col);
}

function chooseSpawnCellForRun(run) {
    if (!run || !run.length) return null;

    if (lastSwap) {
        const preferred = [lastSwap.a, lastSwap.b];
        for (const pos of preferred) {
            if (runContains(run, pos)) return pos;
        }
    }

    return chooseSpawnCell(run);
}

function findBestOverlap(horizontalRuns, verticalRuns) {
    const hSet = new Set();
    horizontalRuns.forEach((run) => run.forEach((p) => hSet.add(key(p.row, p.col))));
    const overlaps = [];
    verticalRuns.forEach((run) => {
        run.forEach((p) => {
            if (hSet.has(key(p.row, p.col))) overlaps.push(p);
        });
    });
    return overlaps.length ? overlaps[0] : null;
}

function createSpecialPlan(matches) {
    const plan = new Map();
    const add = (pos, special) => {
        if (!pos) return;
        const k = key(pos.row, pos.col);
        const current = plan.get(k);
        const priority = { stripedH: 1, stripedV: 1, wrapped: 2, colorBomb: 3 };
        if (!current || priority[special] > priority[current]) {
            plan.set(k, special);
        }
    };

    const overlap = findBestOverlap(matches.horizontalRuns, matches.verticalRuns);
    if (overlap) {
        let spawn = overlap;
        if (lastSwap) {
            if (overlap.row === lastSwap.a.row && overlap.col === lastSwap.a.col) spawn = lastSwap.a;
            else if (overlap.row === lastSwap.b.row && overlap.col === lastSwap.b.col) spawn = lastSwap.b;
        }
        add(spawn, "wrapped");
    }

    matches.horizontalRuns.forEach((run) => {
        if (run.length >= 5) add(chooseSpawnCellForRun(run), "colorBomb");
        else if (run.length === 4) add(chooseSpawnCellForRun(run), "stripedH");
    });
    matches.verticalRuns.forEach((run) => {
        if (run.length >= 5) add(chooseSpawnCellForRun(run), "colorBomb");
        else if (run.length === 4) add(chooseSpawnCellForRun(run), "stripedV");
    });

    if (lastSwap) {
        const a = key(lastSwap.a.row, lastSwap.a.col);
        const b = key(lastSwap.b.row, lastSwap.b.col);
        if (plan.has(a) && plan.has(b)) {
            plan.delete(b);
        }
    }

    return plan;
}

function addRowToSet(set, row) {
    for (let col = 0; col < BOARD_SIZE; col += 1) set.add(key(row, col));
}

function addColToSet(set, col) {
    for (let row = 0; row < BOARD_SIZE; row += 1) set.add(key(row, col));
}

function addAreaToSet(set, centerRow, centerCol, radius) {
    for (let r = centerRow - radius; r <= centerRow + radius; r += 1) {
        for (let c = centerCol - radius; c <= centerCol + radius; c += 1) {
            if (inBounds(r, c)) set.add(key(r, c));
        }
    }
}

function existingColors() {
    const colors = [];
    for (let row = 0; row < BOARD_SIZE; row += 1) {
        for (let col = 0; col < BOARD_SIZE; col += 1) {
            const candy = board[row][col];
            if (candy && typeof candy.color === "number") {
                colors.push(candy.color);
            }
        }
    }
    return colors;
}

function expandSpecialEffects(initialSet) {
    const clearSet = new Set(initialSet);
    const queue = [...clearSet];
    const activated = new Set();

    while (queue.length) {
        const current = queue.shift();
        if (activated.has(current)) continue;
        activated.add(current);
        const { row, col } = parseKey(current);
        const candy = board[row][col];
        if (!candy || !candy.special) continue;

        if (candy.special === "stripedH") {
            for (let c = 0; c < BOARD_SIZE; c += 1) {
                const k = key(row, c);
                if (!clearSet.has(k)) {
                    clearSet.add(k);
                    queue.push(k);
                }
            }
        } else if (candy.special === "stripedV") {
            for (let r = 0; r < BOARD_SIZE; r += 1) {
                const k = key(r, col);
                if (!clearSet.has(k)) {
                    clearSet.add(k);
                    queue.push(k);
                }
            }
        } else if (candy.special === "wrapped") {
            for (let r = row - 1; r <= row + 1; r += 1) {
                for (let c = col - 1; c <= col + 1; c += 1) {
                    if (!inBounds(r, c)) continue;
                    const k = key(r, c);
                    if (!clearSet.has(k)) {
                        clearSet.add(k);
                        queue.push(k);
                    }
                }
            }
        } else if (candy.special === "colorBomb") {
            const colors = existingColors();
            if (!colors.length) continue;
            const target = colors[Math.floor(Math.random() * colors.length)];
            for (let r = 0; r < BOARD_SIZE; r += 1) {
                for (let c = 0; c < BOARD_SIZE; c += 1) {
                    const item = board[r][c];
                    if (item && item.color === target) {
                        const k = key(r, c);
                        if (!clearSet.has(k)) {
                            clearSet.add(k);
                            queue.push(k);
                        }
                    }
                }
            }
        }
    }

    return { clearSet, activated };
}

async function animateSwap(a, b) {
    const cellA = getCell(a.row, a.col);
    const cellB = getCell(b.row, b.col);
    const candyA = cellA.firstElementChild;
    const candyB = cellB.firstElementChild;
    const rectA = cellA.getBoundingClientRect();
    const rectB = cellB.getBoundingClientRect();
    const dx = rectB.left - rectA.left;
    const dy = rectB.top - rectA.top;

    candyA.classList.add("swapping");
    candyB.classList.add("swapping");
    candyA.style.transform = `translate(${dx}px, ${dy}px)`;
    candyB.style.transform = `translate(${-dx}px, ${-dy}px)`;
    await wait(170);
    candyA.style.transform = "";
    candyB.style.transform = "";
    candyA.classList.remove("swapping");
    candyB.classList.remove("swapping");
}

async function animateClear(clearSet) {
    clearSet.forEach((k) => {
        const { row, col } = parseKey(k);
        const candy = getCandyEl(row, col);
        candy.classList.add("matched");
    });
    await wait(120);
    clearSet.forEach((k) => {
        const { row, col } = parseKey(k);
        getCandyEl(row, col).classList.add("popping");
    });
    await wait(190);
    clearSet.forEach((k) => {
        const { row, col } = parseKey(k);
        const candy = getCandyEl(row, col);
        candy.classList.remove("matched", "popping");
    });
}

function collapseAndRefill() {
    const moved = [];

    for (let col = 0; col < BOARD_SIZE; col += 1) {
        let writeRow = BOARD_SIZE - 1;
        for (let row = BOARD_SIZE - 1; row >= 0; row -= 1) {
            const candy = board[row][col];
            if (candy) {
                if (row !== writeRow) {
                    board[writeRow][col] = candy;
                    board[row][col] = null;
                    moved.push({ row: writeRow, col, distance: writeRow - row });
                }
                writeRow -= 1;
            }
        }
        for (let row = writeRow; row >= 0; row -= 1) {
            board[row][col] = makeCandy();
            moved.push({ row, col, distance: writeRow - row + 1 });
        }
    }

    return moved;
}

async function animateFall(moved) {
    const cellHeight = getCell(0, 0).getBoundingClientRect().height;

    moved.forEach(({ row, col, distance }) => {
        paintCandy(row, col, board[row][col]);
        const candy = getCandyEl(row, col);
        candy.classList.add("falling");
        candy.style.setProperty("--fall-distance", `${distance * cellHeight}px`);
    });

    await wait(210);

    moved.forEach(({ row, col }) => {
        const candy = getCandyEl(row, col);
        candy.classList.remove("falling");
        candy.style.removeProperty("--fall-distance");
    });
}

function applyScore(clearCount, specialTriggers, comboStep) {
    const gained = clearCount * BASE_POINTS * comboStep + specialTriggers * SPECIAL_BONUS;
    score += gained;
    updateHud();
}

function applySpecialSpawns(spawnPlan, clearSet) {
    spawnPlan.forEach((special, k) => {
        if (clearSet.has(k)) return;
        const { row, col } = parseKey(k);
        const oldCandy = board[row][col];
        if (!oldCandy) return;
        if (special === "colorBomb") {
            board[row][col] = { color: null, special: "colorBomb" };
        } else {
            board[row][col] = { color: oldCandy.color, special };
        }
    });
}

function clearCandies(clearSet) {
    clearSet.forEach((k) => {
        const { row, col } = parseKey(k);
        board[row][col] = null;
    });
}

function collectAllOfColor(color) {
    const set = new Set();
    for (let row = 0; row < BOARD_SIZE; row += 1) {
        for (let col = 0; col < BOARD_SIZE; col += 1) {
            const candy = board[row][col];
            if (candy && candy.color === color) {
                set.add(key(row, col));
            }
        }
    }
    return set;
}

function activateColorBombWithStriped(color) {
    const set = new Set();
    for (let row = 0; row < BOARD_SIZE; row += 1) {
        for (let col = 0; col < BOARD_SIZE; col += 1) {
            const candy = board[row][col];
            if (candy && candy.color === color) {
                board[row][col] = {
                    color,
                    special: Math.random() < 0.5 ? "stripedH" : "stripedV"
                };
                set.add(key(row, col));
            }
        }
    }
    return set;
}

function spawnRandomSpecial(special, excludeSet) {
    // Collect all normal (non-special, non-null) cells not in the exclude set
    const candidates = [];
    for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
            const k = key(row, col);
            if (excludeSet && excludeSet.has(k)) continue;
            const candy = board[row][col];
            if (candy && typeof candy.color === "number" && !candy.special) {
                candidates.push({ row, col });
            }
        }
    }
    if (!candidates.length) return null;
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    const origColor = board[pick.row][pick.col].color;
    board[pick.row][pick.col] = { color: origColor, special };
    return key(pick.row, pick.col);
}

function activateColorBombWithWrapped(color) {
    const set = new Set();
    for (let row = 0; row < BOARD_SIZE; row += 1) {
        for (let col = 0; col < BOARD_SIZE; col += 1) {
            const candy = board[row][col];
            if (candy && candy.color === color) {
                board[row][col] = { color, special: "wrapped" };
                set.add(key(row, col));
            }
        }
    }
    return set;
}

function specialComboSet(aPos, bPos) {
    const aCandy = board[aPos.row][aPos.col];
    const bCandy = board[bPos.row][bPos.col];
    if (!aCandy || !bCandy) return null;

    const aSpecial = aCandy.special;
    const bSpecial = bCandy.special;

    if (aSpecial === "colorBomb" && bSpecial === "colorBomb") {
        const all = new Set();
        for (let row = 0; row < BOARD_SIZE; row += 1) {
            for (let col = 0; col < BOARD_SIZE; col += 1) all.add(key(row, col));
        }
        return all;
    }

    if (aSpecial === "colorBomb" || bSpecial === "colorBomb") {
        const bombPos = aSpecial === "colorBomb" ? aPos : bPos;
        const otherPos = aSpecial === "colorBomb" ? bPos : aPos;
        const other = board[otherPos.row][otherPos.col];
        if (!other) return null;

        if (other.special === "stripedH" || other.special === "stripedV") {
            // Convert all of that color to striped and fire them
            const converted = activateColorBombWithStriped(other.color);
            converted.add(key(bombPos.row, bombPos.col));
            converted.add(key(otherPos.row, otherPos.col));
            // BONUS: spawn an extra random striped at an unrelated tile and fire it
            const bonus = spawnRandomSpecial(
                Math.random() < 0.5 ? "stripedH" : "stripedV",
                converted
            );
            if (bonus) converted.add(bonus);
            return converted;
        }

        if (other.special === "wrapped") {
            // Convert all of that color to wrapped and fire them
            const converted = activateColorBombWithWrapped(other.color);
            converted.add(key(bombPos.row, bombPos.col));
            converted.add(key(otherPos.row, otherPos.col));
            // BONUS: spawn an extra random wrapped at an unrelated tile and fire it
            const bonus = spawnRandomSpecial("wrapped", converted);
            if (bonus) converted.add(bonus);
            return converted;
        }

        // Default: colorBomb + normal candy
        const set = collectAllOfColor(other.color);
        set.add(key(bombPos.row, bombPos.col));
        set.add(key(otherPos.row, otherPos.col));
        return set;
    }

    if (
        (aSpecial === "stripedH" || aSpecial === "stripedV") &&
        (bSpecial === "stripedH" || bSpecial === "stripedV")
    ) {
        const set = new Set();
        addRowToSet(set, aPos.row);
        addColToSet(set, aPos.col);
        addRowToSet(set, bPos.row);
        addColToSet(set, bPos.col);
        return set;
    }

    const aStriped = aSpecial === "stripedH" || aSpecial === "stripedV";
    const bStriped = bSpecial === "stripedH" || bSpecial === "stripedV";
    if ((aStriped && bSpecial === "wrapped") || (bStriped && aSpecial === "wrapped")) {
        const set = new Set();
        const centerRow = aPos.row;
        const centerCol = aPos.col;
        for (let r = centerRow - 1; r <= centerRow + 1; r += 1) {
            if (r >= 0 && r < BOARD_SIZE) addRowToSet(set, r);
        }
        for (let c = centerCol - 1; c <= centerCol + 1; c += 1) {
            if (c >= 0 && c < BOARD_SIZE) addColToSet(set, c);
        }
        return set;
    }

    if (aSpecial === "wrapped" && bSpecial === "wrapped") {
        const set = new Set();
        addAreaToSet(set, aPos.row, aPos.col, 3);
        addAreaToSet(set, bPos.row, bPos.col, 3);
        return set;
    }

    return null;
}

function canActivateNormalSpecialSwap(aPos, bPos) {
    return false;
}

let audioCtx = null;
let soundEnabled = true;

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

function playTone(freq, type, duration, vol = 0.05) {
    if (!audioCtx || !soundEnabled) return;
    try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        gain.gain.setValueAtTime(0, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(vol, audioCtx.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    } catch (e) { }
}

function playSwapSound() {
    playTone(300, 'sine', 0.1, 0.05);
}

function playMatchSound() {
    playTone(600, 'sine', 0.15, 0.05);
    setTimeout(() => playTone(800, 'sine', 0.2, 0.05), 50);
}

function playComboSound(comboStep) {
    const baseFreq = 400 + (comboStep * 80);
    playTone(baseFreq, 'square', 0.2, 0.04);
    setTimeout(() => playTone(baseFreq * 1.25, 'square', 0.3, 0.04), 80);
}

function playWinSound() {
    [440, 554, 659, 880].forEach((freq, i) => {
        setTimeout(() => playTone(freq, 'triangle', 0.4, 0.08), i * 150);
    });
}

function playLoseSound() {
    [300, 250, 200].forEach((freq, i) => {
        setTimeout(() => playTone(freq, 'sawtooth', 0.5, 0.08), i * 300);
    });
}

function showComboMessage(comboStep) {
    if (comboStep < 2) return;
    const msg = document.createElement("div");
    msg.className = "combo-text";
    msg.textContent = `Combo x${comboStep}!`;
    boardEl.appendChild(msg);
    setTimeout(() => {
        if (msg.parentNode) msg.parentNode.removeChild(msg);
    }, 1200);
}

function hasPossibleMove() {
    // Check every adjacent pair to see if swapping would create a match
    for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
            const neighbors = [
                { row: row, col: col + 1 },
                { row: row + 1, col: col }
            ];
            for (const nb of neighbors) {
                if (!inBounds(nb.row, nb.col)) continue;
                // Temporarily swap
                const aPos = { row, col };
                const bPos = nb;
                swapInBoard(aPos, bPos);
                const matches = findAllMatches();
                const comboSet = specialComboSet(aPos, bPos);
                swapInBoard(aPos, bPos); // swap back
                if (matches.all.size > 0 || comboSet) return true;
            }
        }
    }
    return false;
}

async function shuffleBoard() {
    // Show shuffle notice
    const msg = document.createElement("div");
    msg.className = "combo-text";
    msg.textContent = "Reshuffling!";
    boardEl.appendChild(msg);
    await wait(600);
    if (msg.parentNode) msg.parentNode.removeChild(msg);

    // Collect all candy data and shuffle it
    const candies = [];
    for (let row = 0; row < BOARD_SIZE; row++)
        for (let col = 0; col < BOARD_SIZE; col++)
            if (board[row][col]) candies.push(board[row][col]);

    // Fisher-Yates shuffle
    for (let i = candies.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [candies[i], candies[j]] = [candies[j], candies[i]];
    }

    let idx = 0;
    for (let row = 0; row < BOARD_SIZE; row++)
        for (let col = 0; col < BOARD_SIZE; col++)
            if (board[row][col]) board[row][col] = candies[idx++];

    renderAll();

    // Recursively shuffle until there's a valid move
    if (!hasPossibleMove()) await shuffleBoard();
}

async function checkAndShuffle() {
    if (!gameActive) return;
    if (!hasPossibleMove()) {
        await shuffleBoard();
    }
}

function checkWinLoss() {
    if (!gameActive) return;
    let isWin = false;

    if (levelState.type === 'score') {
        if (score >= currentTarget) isWin = true;
    } else if (levelState.type === 'collect') {
        let allCollected = true;
        for (const colorStr in levelState.targetColors) {
            const needed = levelState.targetColors[colorStr];
            const collected = levelState.collected[Number(colorStr)] || 0;
            if (collected < needed) {
                allCollected = false;
                break;
            }
        }
        if (allCollected) isWin = true;
    }

    if (isWin) {
        endGame(true);
    } else if (movesLeft <= 0) {
        endGame(false);
    }
}

async function resolveCascades(initialClear = null) {
    let comboStep = 0;
    let pendingClear = initialClear;

    while (true) {
        comboStep += 1;
        let spawnPlan = new Map();
        let clearSet;

        if (pendingClear) {
            clearSet = pendingClear;
            pendingClear = null;
        } else {
            const matches = findAllMatches();
            if (matches.all.size === 0) break;
            spawnPlan = createSpecialPlan(matches);
            clearSet = new Set(matches.all);
            spawnPlan.forEach((_, k) => clearSet.delete(k));
        }

        const expanded = expandSpecialEffects(clearSet);
        clearSet = expanded.clearSet;
        const specialTriggers = [...expanded.activated].filter((k) => {
            const { row, col } = parseKey(k);
            return !!board[row][col]?.special;
        }).length;

        await animateClear(clearSet);

        // Track collected colors
        if (levelState.type === 'collect') {
            clearSet.forEach((k) => {
                const { row, col } = parseKey(k);
                const candy = board[row][col];
                if (candy && typeof candy.color === "number") {
                    if (!levelState.collected[candy.color]) levelState.collected[candy.color] = 0;
                    levelState.collected[candy.color]++;
                }
            });
        }

        applySpecialSpawns(spawnPlan, clearSet);
        applyScore(clearSet.size, specialTriggers, comboStep);

        if (comboStep > 1) {
            showComboMessage(comboStep);
        }

        clearCandies(clearSet);
        const moved = collapseAndRefill();
        await animateFall(moved);
        renderAll();

        if (comboStep > 1) {
            playComboSound(comboStep);
        } else {
            playMatchSound();
        }
    }
}

async function attemptSwap(aPos, bPos) {
    if (!gameActive || isPaused || busy || !isAdjacent(aPos, bPos)) return;
    busy = true;
    initAudio();

    await animateSwap(aPos, bPos);
    swapInBoard(aPos, bPos);
    renderAll();
    lastSwap = { a: aPos, b: bPos };

    const comboSet = specialComboSet(aPos, bPos);
    if (comboSet) {
        movesLeft -= 1;
        updateHud();
        playSwapSound();
        await resolveCascades(comboSet);
        busy = false;
        lastSwap = null;
        checkWinLoss();
        return;
    }

    const matches = findAllMatches();
    if (matches.all.size === 0) {
        playSwapSound();
        await animateSwap(aPos, bPos);
        swapInBoard(aPos, bPos);
        renderAll();
        busy = false;
        lastSwap = null;
        return;
    }

    movesLeft -= 1;
    updateHud();

    playSwapSound();
    await resolveCascades();

    busy = false;
    lastSwap = null;
    checkWinLoss();
    if (gameActive) await checkAndShuffle();
}

function onDragStart(event) {
    if (!gameActive || isPaused || busy) {
        event.preventDefault();
        return;
    }
    const cell = event.target.closest(".cell");
    if (!cell) {
        event.preventDefault();
        return;
    }
    dragSource = { row: Number(cell.dataset.row), col: Number(cell.dataset.col) };
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", key(dragSource.row, dragSource.col));
}

function onDragOver(event) {
    event.preventDefault();
}

function onDrop(event) {
    event.preventDefault();
    if (!dragSource || !gameActive || isPaused || busy) return;
    const cell = event.target.closest(".cell");
    if (!cell) return;
    const target = { row: Number(cell.dataset.row), col: Number(cell.dataset.col) };
    attemptSwap(dragSource, target);
    dragSource = null;
}

function onDragEnd() {
    dragSource = null;
}

// Mobile Touch Support Logic
let touchStartX = 0;
let touchStartY = 0;
let touchActive = false;

function onTouchStart(event) {
    initAudio();
    if (!gameActive || isPaused || busy) return;
    const touch = event.touches[0];
    const cell = touch.target.closest(".cell");
    if (!cell) return;

    dragSource = { row: Number(cell.dataset.row), col: Number(cell.dataset.col) };
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    touchActive = true;
}

function onTouchMove(event) {
    if (!touchActive || !dragSource) return;
    event.preventDefault(); // Prevent scroll while playing
}

function onTouchEnd(event) {
    if (!touchActive || !dragSource) return;
    touchActive = false;

    const touch = event.changedTouches[0];
    const endX = touch.clientX;
    const endY = touch.clientY;

    const dx = endX - touchStartX;
    const dy = endY - touchStartY;

    // Minimum distance to count as a deliberate swipe (threshold)
    const threshold = 20;

    if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) {
        // Just a tap? We could handle click-to-swap here if needed.
        dragSource = null;
        return;
    }

    let targetRow = dragSource.row;
    let targetCol = dragSource.col;

    if (Math.abs(dx) > Math.abs(dy)) {
        // Horizontal swipe
        targetCol += dx > 0 ? 1 : -1;
    } else {
        // Vertical swipe
        targetRow += dy > 0 ? 1 : -1;
    }

    if (inBounds(targetRow, targetCol)) {
        attemptSwap(dragSource, { row: targetRow, col: targetCol });
    }

    dragSource = null;
}

function showMap() {
    initAudio();
    saveProgress();
    gameShell.classList.add("hidden");
    mapView.classList.remove("hidden");
    renderMap();
}

function renderMap() {
    levelGrid.innerHTML = "";
    LEVELS.forEach((levelData, index) => {
        const prog = playerProgress[index] || { stars: 0, unlocked: false };
        const btn = document.createElement("div");
        btn.className = "level-btn" + (prog.unlocked ? "" : " locked");


        btn.innerHTML = `
            <span class="level-num">${levelData.level}</span>
        `;

        if (prog.unlocked) {
            btn.addEventListener("click", () => {
                mapView.classList.add("hidden");
                gameShell.classList.remove("hidden");
                loadLevel(index);
            });
        }

        levelGrid.appendChild(btn);
    });
}

function endGame(isWin = false) {
    gameActive = false;
    isPaused = false;
    busy = true;
    finalScoreEl.textContent = String(score);
    const titleEl = gameOverEl.querySelector("h2");

    if (isWin) {
        titleEl.textContent = "Level Complete!";
        playWinSound();

        // Calculate stars
        let starsEarned = 1; // Base 1 star for winning
        const thresholds = LEVELS[currentLevelIdx].stars;
        if (score >= thresholds[1]) starsEarned = 2;
        if (score >= thresholds[2]) starsEarned = 3;

        // Update progress
        if (!playerProgress[currentLevelIdx]) playerProgress[currentLevelIdx] = { stars: 0, unlocked: true };
        playerProgress[currentLevelIdx].stars = Math.max(playerProgress[currentLevelIdx].stars, starsEarned);

        // Unlock next level
        if (currentLevelIdx + 1 < LEVELS.length) {
            if (!playerProgress[currentLevelIdx + 1]) {
                playerProgress[currentLevelIdx + 1] = { stars: 0, unlocked: true };
            } else {
                playerProgress[currentLevelIdx + 1].unlocked = true;
            }
        }
        saveProgress();
    } else {
        titleEl.textContent = "Game Over";
        playLoseSound();
    }

    gameOverEl.classList.remove("hidden");
    updateControlStates();
}

function pauseGame() {
    if (!gameActive || isPaused) return;
    initAudio();
    isPaused = true;
    updateControlStates();
}

function resumeGame() {
    if (!gameActive || !isPaused) return;
    initAudio();
    isPaused = false;
    updateControlStates();
}

function loadLevel(index) {
    initAudio();
    if (index >= LEVELS.length) {
        index = LEVELS.length - 1; // Play last level indefinitely
    }
    currentLevelIdx = index;
    const config = LEVELS[currentLevelIdx];

    score = 0;
    movesLeft = config.moves;
    currentTarget = config.targetScore || 0;

    levelState = {
        type: config.type,
        targetColors: config.targetColors || {},
        collected: {}
    };

    busy = false;
    gameActive = false;
    isPaused = false;
    dragSource = null;
    lastSwap = null;
    board = createInitialBoard();
    renderAll();
    updateHud();

    gameOverEl.classList.add("hidden");

    levelTitleEl.textContent = `Level ${config.level}`;
    levelDescEl.textContent = config.desc;
    levelStartEl.classList.remove("hidden");

    updateControlStates();
}

function startLevel() {
    initAudio();
    levelStartEl.classList.add("hidden");
    gameActive = true;
    updateControlStates();
}

function nextLevel() {
    loadLevel(currentLevelIdx + 1);
}

function resetGame() {
    loadLevel(currentLevelIdx);
}

function init() {
    buildBoardDOM();
    boardEl.addEventListener("dragstart", onDragStart);
    boardEl.addEventListener("dragover", onDragOver);
    boardEl.addEventListener("drop", onDrop);
    boardEl.addEventListener("dragend", onDragEnd);

    // Add Touch Support for Mobile
    boardEl.addEventListener("touchstart", onTouchStart, { passive: false });
    boardEl.addEventListener("touchmove", onTouchMove, { passive: false });
    boardEl.addEventListener("touchend", onTouchEnd, { passive: false });

    startLevelBtn?.addEventListener("click", () => {
        tapFeedback(startLevelBtn);
        startLevel();
    });
    playBtn?.addEventListener("click", () => {
        tapFeedback(playBtn);
        if (!gameActive) {
            resetGame();
            return;
        }
        resumeGame();
    });
    pauseBtn?.addEventListener("click", () => {
        tapFeedback(pauseBtn);
        pauseGame();
    });
    restartBtn.addEventListener("click", () => {
        tapFeedback(restartBtn);
        resetGame();
    });
    nextLevelBtn?.addEventListener("click", () => {
        tapFeedback(nextLevelBtn);
        nextLevel();
    });
    const settingsOverlay = document.getElementById("settingsOverlay");
    const soundToggleBtn = document.getElementById("soundToggleBtn");
    const closeSettingsBtn = document.getElementById("closeSettingsBtn");

    settingsBtn?.addEventListener("click", () => {
        tapFeedback(settingsBtn);
        settingsOverlay.classList.remove("hidden");
    });

    closeSettingsBtn?.addEventListener("click", () => {
        tapFeedback(closeSettingsBtn);
        settingsOverlay.classList.add("hidden");
    });

    soundToggleBtn?.addEventListener("click", () => {
        soundEnabled = !soundEnabled;
        tapFeedback(soundToggleBtn);
        soundToggleBtn.querySelector(".txt").textContent = `Sound: ${soundEnabled ? 'ON' : 'OFF'}`;
        if (soundEnabled) {
            initAudio();
            playTone(600, 'sine', 0.1);
        }
    });

    homeBtn?.addEventListener("click", () => {
        tapFeedback(homeBtn);
        showMap();
    });

    playAgainBtn.addEventListener("click", () => {
        tapFeedback(playAgainBtn);
        if (gameOverEl.querySelector("h2")?.textContent === "Level Complete!") {
            if (currentLevelIdx + 1 < LEVELS.length) {
                nextLevel();
            } else {
                showMap();
            }
        } else {
            resetGame();
        }
    });

    loadProgress();
    showMap();
}

init();
