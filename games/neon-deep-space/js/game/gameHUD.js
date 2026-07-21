// HUD更新相关函数
function updateHUD() {
    healthEl.innerText = Math.ceil(player.health);
    shieldEl.innerText = player.shield;
    bombEl.innerText = player.bombs;
    orbiterEl.innerText = player.orbiters.length;
    const wLevel = player.weaponLevel;
    weaponEl.innerText = "LV." + wLevel;
    if (wLevel >= 8) weaponEl.className = "hud-item text-red";
    else weaponEl.className = "hud-item text-orange";
    speedEl.innerText = "LV." + player.speedLevel;

    const now = Date.now();
    const timePassed = now - player.lastDash;
    if (timePassed >= player.dashCooldownTime) {
        dashText.innerText = "就绪";
        dashText.style.color = "#0ff";
        dashBar.style.width = "100%";
        dashBar.style.backgroundColor = "#0ff";
    } else {
        const remaining = Math.ceil((player.dashCooldownTime - timePassed) / 1000);
        dashText.innerText = remaining + "s";
        dashText.style.color = "#666";
        const pct = (timePassed / player.dashCooldownTime) * 100;
        dashBar.style.width = pct + "%";
        dashBar.style.backgroundColor = "#555";
    }
}
