// 暂停菜单显示和隐藏函数
function showPauseMenu() {
    // 获取暂停菜单元素
    const pauseMenu = document.getElementById('pause-menu');
    // 更新暂停时的分数显示
    const pauseScoreEl = document.getElementById('pause-score');
    pauseScoreEl.textContent = score;
    // 显示暂停菜单
    pauseMenu.classList.remove('hidden');
    // 隐藏HUD
    hud.style.display = 'none';
}

function hidePauseMenu() {
    // 隐藏暂停菜单
    const pauseMenu = document.getElementById('pause-menu');
    pauseMenu.classList.add('hidden');
    // 显示HUD
    hud.style.display = 'flex';
    // 移除所有暂停菜单按钮的焦点，防止空格键触发按钮点击
    const pauseButtons = pauseMenu.querySelectorAll('button');
    pauseButtons.forEach(btn => {
        btn.blur();
    });
    // 将焦点设置到游戏画布上，确保空格键不会触发其他元素
    canvas.focus();
}

// 暂停游戏
function pauseGame() {
    if (currentState === STATE.PLAYING) {
        isPaused = true;
        currentState = STATE.PAUSED;
        // 显示暂停菜单
        showPauseMenu();
    }
}

// 暂停后继续
function continueGame() {
    if (currentState === STATE.PAUSED) {
    // 继续游戏
    isPaused = false;
    currentState = STATE.PLAYING;
    hidePauseMenu();
    }
}

function restartGameFromPause() {
    // 从暂停状态重新开始游戏
    if (currentState === STATE.PAUSED) {
    isPaused = false;
    hidePauseMenu(); // 先隐藏暂停菜单，移除按钮焦点
    startGame(); // 然后重新开始游戏
    }
}

function returnToMainMenuFromPause() {
    // 从暂停状态返回主菜单
    if (currentState === STATE.PAUSED) {
        isPaused = false;
        hidePauseMenu(); // 先隐藏暂停菜单，移除按钮焦点
        returnToMenu();
    }
}
