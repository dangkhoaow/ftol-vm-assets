const restartBtn = document.getElementById("restart");
const resetBtn = document.getElementById("reset");
const undoBtn = document.getElementById("undo");
const settingsBtn = document.getElementById("settings");
const closeBtn = document.getElementById("close");
const drawer = document.getElementById("drawer");
const overlay = document.getElementById("overlay");
const themeBtns = document.querySelectorAll(".theme-btn");

function openDrawer() {
    drawer.classList.add("open");
    overlay.classList.add("open");
}

function closeDrawer() {
    drawer.classList.remove("open");
    overlay.classList.remove("open");
}

settingsBtn.addEventListener("click", openDrawer);
closeBtn.addEventListener("click", closeDrawer);
overlay.addEventListener("click", closeDrawer);

const currentTheme = document.documentElement.getAttribute("data-theme") || "olive";
themeBtns.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.theme === currentTheme);

    btn.addEventListener("click", () => {
        const theme = btn.dataset.theme;
        document.documentElement.setAttribute("data-theme", theme);
        localStorage.setItem("ftol:piperotatepuzzle:theme", theme);

        themeBtns.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
    });
});

undoBtn.addEventListener("click", () => {
    if (window.undo) window.undo();
});

resetBtn.addEventListener("click", () => {
    if (window.reset) window.reset();
});

restartBtn.addEventListener("click", () => {
    if (window.restart) window.restart();
});

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && drawer.classList.contains("open")) {
        closeDrawer();
        return;
    }

    const key = e.key.toLowerCase();

    if (key === "r" && window.reset) {
        window.reset();
    } else if (key === "u" && window.undo) {
        window.undo();
    } else if (key === "n" && window.restart) {
        window.restart();
    }
});