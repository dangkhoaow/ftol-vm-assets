let active = true;
let history = [];
const MAX_HISTORY = 50;
let isEvaluating = false;

const levelDisplay = document.getElementById("level");

const NEIGHBORS = [
    { dr: -1, dc: 0, fromDir: DIR.S, toDir: DIR.N },
    { dr: 0, dc: 1, fromDir: DIR.W, toDir: DIR.E },
    { dr: 1, dc: 0, fromDir: DIR.N, toDir: DIR.S },
    { dr: 0, dc: -1, fromDir: DIR.E, toDir: DIR.W }
];

function undo() {
    if (history.length === 0 || isEvaluating) return;
    const last = history.pop();
    const cell = cells[last.r][last.c];
    if (cell.locked) {
        history.push(last);
        return;
    }
    cell.rotation = last.oldRotation;
    cell.innerElement.style.transform = `rotate(${cell.rotation * 90}deg)`;
    setTimeout(() => check(), 50);
}

function addMove(row, col, oldRot, newRot) {
    if (oldRot === newRot) return;
    history.push({ r: row, c: col, oldRotation: oldRot, newRotation: newRot });
    if (history.length > MAX_HISTORY) history.shift();
}

function resetHistory() {
    history = [];
}

function check() {
    const s = size;
    for (let r = 0; r < s; r++) {
        for (let c = 0; c < s; c++) {
            const cell = cells[r][c];
            cell.powered = false;
            if (cell.element) cell.element.classList.remove("on");
        }
    }

    let source = null;
    for (let r = 0; r < s; r++) {
        for (let c = 0; c < s; c++) {
            if (cells[r][c].isSource) {
                source = cells[r][c];
                break;
            }
        }
        if (source) break;
    }

    if (!source) return;

    source.powered = true;
    const queue = [source];

    while (queue.length) {
        const current = queue.shift();
        if (current.element) current.element.classList.add("on");
        const mask = rotate(current.type.mask, current.rotation);

        for (const { dr, dc, fromDir, toDir } of NEIGHBORS) {
            const nr = current.r + dr;
            const nc = current.c + dc;
            if (nr < 0 || nr >= s || nc < 0 || nc >= s) continue;

            const neighbor = cells[nr][nc];
            if (!neighbor.powered && mask[toDir]) {
                const nMask = rotate(neighbor.type.mask, neighbor.rotation);
                if (nMask[fromDir]) {
                    neighbor.powered = true;
                    if (neighbor.locked) {
                        neighbor.locked = false;
                        if (neighbor.element) {
                            neighbor.element.classList.remove("locked");
                            neighbor.element.classList.add("unlocked");
                        }
                    }
                    queue.push(neighbor);
                }
            }
        }
    }

    const done = cells.flat().every(cell => cell.powered);

    if (done && active) {
        active = false;
        gridElement.classList.add("done");
        levelDisplay.innerText = "✦ Complete";
        levelDisplay.style.color = "var(--wire-on)";
        localStorage.setItem("ftol:piperotatepuzzle:level", level + 1);

        setTimeout(() => {
            level++;
            levelDisplay.style.color = "var(--text-color)";
            start();
        }, 600);
    }
}

function start() {
    const saved = parseInt(localStorage.getItem("ftol:piperotatepuzzle:level"));
    if (saved && saved > 1) {
        level = saved;
    }

    resetHistory();
    gridElement.classList.remove("done");
    window.resetEval();
    active = true;
    updateSize();
    levelDisplay.innerText = `LEVEL ${level}`;

    const source = sourceForLevel(level, size);
    const board = buildBoard(source);
    cells = shuffle(board, source);
    render(source);
    check();
}

start();

window.restart = function() {
    localStorage.removeItem("ftol:piperotatepuzzle:level");
    level = 1;
    active = true;
    start();
};

window.reset = function() {
    start();
};

window.undo = undo;
window.addMove = addMove;
window.resetHistory = resetHistory;