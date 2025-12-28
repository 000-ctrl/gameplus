// ==================== 音效系统 ====================
const SoundManager = {
    enabled: false,
    context: null,

    init() {
        try {
            this.context = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.log('音频上下文不支持');
        }
    },

    playTone(frequency, duration, type = 'sine') {
        if (!this.enabled || !this.context) return;

        const oscillator = this.context.createOscillator();
        const gainNode = this.context.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(this.context.destination);

        oscillator.frequency.value = frequency;
        oscillator.type = type;

        gainNode.gain.setValueAtTime(0.1, this.context.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.context.currentTime + duration);

        oscillator.start(this.context.currentTime);
        oscillator.stop(this.context.currentTime + duration);
    },

    click() {
        this.playTone(800, 0.05);
    },

    success() {
        this.playTone(523.25, 0.1);
        setTimeout(() => this.playTone(659.25, 0.1), 100);
        setTimeout(() => this.playTone(783.99, 0.2), 200);
    },

    fail() {
        this.playTone(200, 0.2, 'sawtooth');
    },

    victory() {
        const notes = [523.25, 587.33, 659.25, 783.99, 880.00];
        notes.forEach((note, i) => {
            setTimeout(() => this.playTone(note, 0.15), i * 100);
        });
    },

    toggle() {
        this.enabled = !this.enabled;
        localStorage.setItem('soundEnabled', this.enabled);
        showNotification(this.enabled ? '音效已开启' : '音效已关闭', 'info');
        updateSoundUI();
    }
};

// ==================== 游戏状态管理 ====================
const GameState = {
    READY: 'ready',
    PLAYING: 'playing',
    ENDED: 'ended'
};

let gameState = GameState.READY;
let targetNumber = null;
let attempts = 0;
let timerInterval = null;
let timeLeft = 0;
let currentDifficulty = null;
let gameStartTime = null;
let isChallengeMode = false;
let challengeProgress = 0;
let doubleModeTarget = null;

// 成就和统计数据
let achievements = {};
let stats = {};
let gameHistory = [];
let bestScores = {};

// 难度配置
const difficultySettings = {
    easy: { max: 50, time: 60, name: '简单' },
    medium: { max: 100, time: 60, name: '中等' },
    hard: { max: 200, time: 90, name: '困难' },
    daily: { max: 100, time: 120, name: '每日挑战' },
    extreme: { max: 500, time: 30, name: '极限模式' },
    infinite: { max: 100, time: null, name: '无限模式', maxAttempts: 20 },
    reverse: { max: 100, time: 60, name: '反向模式', reverse: true },
    double: { max: 100, time: 90, name: '双倍模式', double: true }
};

// 成就定义
const achievementDefinitions = [
    { id: 'first_game', name: '初学者', desc: '完成第一次游戏', icon: '🎓', check: () => stats.totalGames >= 1 },
    { id: 'lightning', name: '闪电手', desc: '20秒内获胜', icon: '⚡', check: () => stats.lastWinTime !== null && stats.lastWinTime <= 20 },
    { id: 'master', name: '神算子', desc: '5次内获胜', icon: '🧠', check: () => stats.lastWinAttempts !== null && stats.lastWinAttempts <= 5 },
    { id: 'perfect', name: '百发百中', desc: '100%胜率（10局以上）', icon: '🎯', check: () => stats.totalGames >= 10 && stats.winRate === 100 },
    { id: 'challenger', name: '挑战者', desc: '完成困难难度', icon: '🔥', check: () => stats.hardCompleted >= 1 },
    { id: 'persistent', name: '坚持不懈', desc: '累计50次尝试', icon: '💪', check: () => stats.totalAttempts >= 50 },
    { id: 'champion', name: '冠军', desc: '完成挑战模式', icon: '🏆', check: () => stats.challengeCompleted >= 1 },
    { id: 'daily', name: '每日玩家', desc: '完成每日挑战', icon: '📅', check: () => stats.dailyCompleted >= 1 },
    { id: 'extreme', name: '极限生存', desc: '完成极限模式', icon: '⚡', check: () => stats.extremeCompleted >= 1 },
    { id: 'unlimited', name: '无限可能', desc: '完成无限模式', icon: '∞', check: () => stats.infiniteCompleted >= 1 },
    { id: 'reverse', name: '反向思维', desc: '完成反向模式', icon: '🔄', check: () => stats.reverseCompleted >= 1 },
    { id: 'double', name: '双重胜利', desc: '完成双倍模式', icon: '✌️', check: () => stats.doubleCompleted >= 1 }
];

// ==================== DOM 元素 ====================
const elements = {
    guessInput: document.getElementById('guessInput'),
    submitBtn: document.getElementById('submitBtn'),
    messageDiv: document.getElementById('message'),
    attemptsSpan: document.getElementById('attempts'),
    restartBtn: document.getElementById('restartBtn'),
    timerSpan: document.getElementById('timer'),
    bestScoreSpan: document.getElementById('bestScore'),
    difficultyBtns: document.querySelectorAll('.difficulty-btn'),
    historyBtn: document.getElementById('historyBtn'),
    statsBtn: document.getElementById('statsBtn'),
    achievementsBtn: document.getElementById('achievementsBtn'),
    challengeBtn: document.getElementById('challengeBtn'),
    historySection: document.getElementById('historySection'),
    statsSection: document.getElementById('statsSection'),
    achievementsSection: document.getElementById('achievementsSection'),
    challengeSection: document.getElementById('challengeSection'),
    helpSection: document.getElementById('helpSection'),
    settingsSection: document.getElementById('settingsSection'),
    historyList: document.getElementById('historyList'),
    statsGrid: document.getElementById('statsGrid'),
    achievementsGrid: document.getElementById('achievementsGrid'),
    gameOverModal: document.getElementById('gameOverModal'),
    modalTitle: document.getElementById('modalTitle'),
    modalMessage: document.getElementById('modalMessage'),
    modalBtn: document.getElementById('modalBtn'),
    modalCloseBtn: document.getElementById('modalCloseBtn'),
    modalAchievements: document.getElementById('modalAchievements'),
    modalAchievementsList: document.getElementById('modalAchievementsList'),
    celebration: document.getElementById('celebration'),
    statusBar: document.getElementById('statusBar'),
    themeToggle: document.getElementById('themeToggle'),
    soundToggle: document.getElementById('soundToggle'),
    helpToggle: document.getElementById('helpToggle'),
    soundSwitch: document.getElementById('soundSwitch'),
    themeSwitch: document.getElementById('themeSwitch'),
    exportData: document.getElementById('exportData'),
    importData: document.getElementById('importData'),
    clearData: document.getElementById('clearData'),
    dataTransfer: document.getElementById('dataTransfer'),
    startChallenge: document.getElementById('startChallenge'),
    cancelChallenge: document.getElementById('cancelChallenge'),
    challengeInfo: document.getElementById('challengeInfo'),
    challengeStats: document.getElementById('challengeStats'),
    challengeProgress: document.getElementById('challengeProgress'),
    challengeStatus: document.getElementById('challengeStatus'),
    challengeTitle: document.getElementById('challengeTitle')
};

// ==================== 通知系统 ====================
function showNotification(message, type = 'info') {
    const container = document.getElementById('notificationContainer');
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;

    container.appendChild(notification);

    setTimeout(() => notification.classList.add('show'), 100);

    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// ==================== 初始化 ====================
function initGame() {
    loadGameData();
    createParticles();
    updateAchievementsDisplay();
    updateStatsDisplay();
    updateHistoryDisplay();
    updateBestScoreDisplay();
    updateUIState();
    updateSoundUI();
    updateThemeUI();

    SoundManager.init();
    checkDailyChallenge();
}

function createParticles() {
    const particlesContainer = document.getElementById('particles');
    const particleCount = 20;

    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        particle.classList.add('particle');

        const size = Math.random() * 10 + 5;
        particle.style.width = `${size}px`;
        particle.style.height = `${size}px`;
        particle.style.left = `${Math.random() * 100}%`;
        particle.style.top = `${Math.random() * 100}%`;
        particle.style.animationDelay = `${Math.random() * 15}s`;
        particle.style.animationDuration = `${15 + Math.random() * 10}s`;

        particlesContainer.appendChild(particle);
    }
}

// ==================== 每日挑战 ====================
function checkDailyChallenge() {
    const today = new Date().toDateString();
    const lastDaily = localStorage.getItem('lastDailyDate');

    if (lastDaily !== today) {
        const dailyNumber = Math.floor(Math.random() * 100) + 1;
        localStorage.setItem('dailyNumber', dailyNumber);
        localStorage.setItem('lastDailyDate', today);
        showNotification('新的每日挑战已就绪！', 'info');
    }
}

function getDailyNumber() {
    return parseInt(localStorage.getItem('dailyNumber') || '0');
}

// ==================== 游戏逻辑 ====================
function startGame() {
    if (!currentDifficulty) {
        showNotification('请先选择难度！', 'error');
        return;
    }

    clearInterval(timerInterval);

    gameState = GameState.PLAYING;
    const config = difficultySettings[currentDifficulty];

    // 特殊模式处理
    if (currentDifficulty === 'daily') {
        targetNumber = getDailyNumber();
        if (targetNumber === 0) {
            showNotification('每日挑战数据异常，请刷新页面', 'error');
            return;
        }
    } else if (currentDifficulty === 'double') {
        // 双倍模式：两个不同的数字
        targetNumber = Math.floor(Math.random() * config.max) + 1;
        doubleModeTarget = Math.floor(Math.random() * config.max) + 1;
        while (doubleModeTarget === targetNumber) {
            doubleModeTarget = Math.floor(Math.random() * config.max) + 1;
        }
        showMessage(`双倍模式：需要猜对两个数字！第一个是 ${targetNumber}，第二个是 ${doubleModeTarget}`, 'info');
    } else {
        targetNumber = Math.floor(Math.random() * config.max) + 1;
    }

    attempts = 0;
    timeLeft = config.time;
    gameStartTime = Date.now();

    elements.attemptsSpan.textContent = attempts;
    elements.timerSpan.textContent = config.time ? `${timeLeft}s` : '∞';
    elements.timerSpan.classList.remove('safe');
    elements.guessInput.disabled = false;
    elements.submitBtn.disabled = false;
    elements.guessInput.placeholder = `输入1-${config.max}之间的数字`;
    elements.guessInput.max = config.max;
    elements.guessInput.value = '';
    elements.guessInput.focus();

    if (currentDifficulty === 'infinite') {
        showMessage(`无限模式：无时间限制，最多 ${config.maxAttempts} 次尝试`, 'info');
    } else if (currentDifficulty === 'reverse') {
        showMessage(`反向模式：猜比目标更大的数！`, 'info');
    } else if (currentDifficulty === 'extreme') {
        showMessage(`极限模式：30秒内猜对1-500的大数字！`, 'info');
    } else if (currentDifficulty !== 'double') {
        showMessage('游戏开始！请输入你的猜测', 'info');
    }

    updateUIState();

    if (config.time) {
        startTimer();
    }

    SoundManager.click();
}

function startTimer() {
    elements.timerSpan.style.animation = 'pulse 1s infinite';

    timerInterval = setInterval(() => {
        timeLeft--;
        elements.timerSpan.textContent = `${timeLeft}s`;

        if (timeLeft <= 10) {
            elements.timerSpan.style.animation = 'pulse 0.5s infinite';
            elements.timerSpan.style.color = '#ff0000';
        } else if (timeLeft > 10) {
            elements.timerSpan.style.color = '#dc3545';
            elements.timerSpan.classList.add('safe');
        }

        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            endGame(false, '时间到！');
            SoundManager.fail();
        }
    }, 1000);
}

function handleGuess() {
    if (gameState !== GameState.PLAYING) {
        showNotification('游戏尚未开始！请先选择难度并点击开始', 'error');
        return;
    }

    const guess = parseInt(elements.guessInput.value.trim());
    const config = difficultySettings[currentDifficulty];
    const max = config.max;

    if (isNaN(guess) || guess < 1 || guess > max) {
        showMessage(`请输入 1 ~ ${max} 之间的有效数字！`, 'info');
        shakeInput();
        SoundManager.fail();
        return;
    }

    attempts++;
    elements.attemptsSpan.textContent = attempts;
    SoundManager.click();

    // 无限模式尝试次数限制
    if (currentDifficulty === 'infinite' && attempts >= config.maxAttempts) {
        endGame(false, `达到最大尝试次数（${config.maxAttempts}）！`);
        SoundManager.fail();
        return;
    }

    const difference = Math.abs(guess - targetNumber);
    let isCorrect = false;

    // 反向模式逻辑
    if (config.reverse) {
        if (guess > targetNumber) {
            isCorrect = true;
        } else if (guess < targetNumber) {
            showMessage(`猜小了！需要比 ${targetNumber} 更大的数`, 'too-low');
            shakeInput();
        } else {
            showMessage(`猜对了！但反向模式需要比目标更大的数`, 'info');
            shakeInput();
        }
    } else {
        if (guess === targetNumber) {
            isCorrect = true;
        } else if (guess > targetNumber) {
            let hint = '';
            if (difference > 50) hint = '差太远了，往小调很多';
            else if (difference > 20) hint = '偏大了，往小调一点';
            else if (difference > 10) hint = '有点大，再小一点';
            else if (difference > 5) hint = '接近了，稍微小一点';
            else hint = '非常接近！就差一点点';

            showMessage(`猜大了！${hint}`, 'too-high');
            shakeInput();
        } else {
            let hint = '';
            if (difference > 50) hint = '差太远了，往大调很多';
            else if (difference > 20) hint = '偏小了，往大调一点';
            else if (difference > 10) hint = '有点小，再大一点';
            else if (difference > 5) hint = '接近了，稍微大一点';
            else hint = '非常接近！就差一点点';

            showMessage(`猜小了！${hint}`, 'too-low');
            shakeInput();
        }
    }

    if (isCorrect) {
        // 双倍模式处理
        if (currentDifficulty === 'double') {
            if (targetNumber !== null) {
                showMessage(`第一个数字猜对了！现在猜第二个：${doubleModeTarget}`, 'success');
                targetNumber = doubleModeTarget;
                doubleModeTarget = null;
                elements.guessInput.value = '';
                elements.guessInput.focus();
                return;
            }
        }

        const timeUsed = config.time ? (config.time - timeLeft) : 0;
        endGame(true, `恭喜！你猜对了！答案就是 ${targetNumber}`);
        updateWinStats(timeUsed);
        checkAchievements();
        SoundManager.success();

        // 挑战模式逻辑
        if (isChallengeMode) {
            challengeProgress++;
            updateChallengeUI();

            if (challengeProgress >= 3) {
                setTimeout(() => {
                    endChallenge(true);
                }, 500);
            } else {
                setTimeout(() => {
                    showMessage(`挑战进度：${challengeProgress}/3，继续加油！`, 'info');
                    startGame();
                }, 1000);
            }
        }
    }

    elements.guessInput.value = '';
    elements.guessInput.focus();
}

function endGame(isWin, customMessage) {
    clearInterval(timerInterval);
    gameState = GameState.ENDED;
    elements.guessInput.disabled = true;
    elements.submitBtn.disabled = true;

    // 保存历史记录
    const historyItem = {
        difficulty: currentDifficulty,
        attempts: attempts,
        timeUsed: difficultySettings[currentDifficulty].time ? (difficultySettings[currentDifficulty].time - timeLeft) : attempts,
        win: isWin,
        date: new Date().toLocaleString()
    };
    gameHistory.unshift(historyItem);
    if (gameHistory.length > 20) gameHistory.pop();
    saveGameData();

    // 更新UI
    updateUIState();
    updateHistoryDisplay();
    updateStatsDisplay();

    // 显示模态框
    setTimeout(() => {
        if (isWin) {
            elements.modalTitle.innerHTML = '🎉 恭喜获胜！';
            elements.modalTitle.style.color = 'var(--success)';
            elements.modalMessage.innerHTML = `
                答案：<strong>${targetNumber}</strong><br>
                尝试次数：<strong>${attempts}</strong>次<br>
                ${difficultySettings[currentDifficulty].time ? `用时：<strong>${difficultySettings[currentDifficulty].time - timeLeft}</strong>秒<br>` : ''}
                难度：<strong>${difficultySettings[currentDifficulty].name}</strong>
            `;
            showMessage(customMessage, 'success');
            showCelebration();
            SoundManager.victory();
        } else {
            elements.modalTitle.innerHTML = '⏰ 游戏结束！';
            elements.modalTitle.style.color = 'var(--danger)';
            elements.modalMessage.innerHTML = `
                很遗憾，游戏结束<br>
                正确答案是：<strong>${targetNumber}</strong><br>
                你尝试了：<strong>${attempts}</strong>次<br>
                难度：<strong>${difficultySettings[currentDifficulty].name}</strong>
            `;
            showMessage(customMessage || '游戏结束', 'info');
        }

        // 显示新解锁的成就
        const newAchievements = checkNewAchievements();
        if (newAchievements.length > 0) {
            elements.modalAchievements.classList.add('show');
            elements.modalAchievementsList.innerHTML = newAchievements
                .map(a => `🏆 ${a.name} - ${a.desc}`)
                .join('<br>');
            SoundManager.victory();
        } else {
            elements.modalAchievements.classList.remove('show');
        }

        elements.gameOverModal.classList.add('show');
    }, 800);
}

// ==================== 挑战模式 ====================
function startChallenge() {
    if (gameState === GameState.PLAYING) {
        showNotification('请先完成当前游戏', 'error');
        return;
    }

    isChallengeMode = true;
    challengeProgress = 0;
    elements.challengeInfo.classList.add('active');
    elements.challengeTitle.textContent = '🎯 挑战模式';
    elements.challengeStats.textContent = '目标：连续猜对 3 个数字';
    elements.challengeProgress.textContent = '进度：0 / 3';
    elements.startChallenge.disabled = true;
    elements.cancelChallenge.disabled = false;
    elements.challengeStatus.textContent = '挑战开始！第一个数字已生成';

    showNotification('挑战模式开始！连续猜对3个数字', 'info');
    updateUIState();

    setTimeout(() => startGame(), 500);
}

function cancelChallenge() {
    if (gameState === GameState.PLAYING) {
        if (!confirm('确定要取消正在进行的挑战吗？')) return;
        clearInterval(timerInterval);
        gameState = GameState.ENDED;
    }

    isChallengeMode = false;
    challengeProgress = 0;
    elements.challengeInfo.classList.remove('active');
    elements.startChallenge.disabled = false;
    elements.cancelChallenge.disabled = true;
    elements.challengeStatus.textContent = '';

    showNotification('挑战已取消', 'info');
    updateUIState();
}

function updateChallengeUI() {
    elements.challengeProgress.textContent = `进度：${challengeProgress} / 3`;
    elements.challengeStatus.textContent = `第 ${challengeProgress} 个完成！`;
}

function endChallenge(success) {
    isChallengeMode = false;
    elements.challengeInfo.classList.remove('active');
    elements.startChallenge.disabled = false;
    elements.cancelChallenge.disabled = true;
    elements.challengeStatus.textContent = '';

    if (success) {
        showNotification('🎉 挑战成功！连续猜对3个数字！', 'success');
        SoundManager.victory();

        stats.challengeCompleted = (stats.challengeCompleted || 0) + 1;
        saveGameData();
        updateStatsDisplay();
        checkAchievements();
    }
}

// ==================== 成就系统 ====================
function checkAchievements() {
    const newlyUnlocked = [];

    achievementDefinitions.forEach(achievement => {
        if (!achievements[achievement.id] && achievement.check()) {
            achievements[achievement.id] = true;
            newlyUnlocked.push(achievement);
        }
    });

    if (newlyUnlocked.length > 0) {
        saveGameData();
        updateAchievementsDisplay();
        showNotification(`解锁成就：${newlyUnlocked.map(a => a.name).join(', ')}`, 'success');
    }

    return newlyUnlocked;
}

function checkNewAchievements() {
    const newOnes = [];
    achievementDefinitions.forEach(achievement => {
        if (!achievements[achievement.id] && achievement.check()) {
            newOnes.push(achievement);
        }
    });
    return newOnes;
}

function updateAchievementsDisplay() {
    elements.achievementsGrid.innerHTML = '';

    achievementDefinitions.forEach(achievement => {
        const div = document.createElement('div');
        div.className = `achievement ${achievements[achievement.id] ? 'unlocked' : 'locked'}`;
        div.innerHTML = `
            <div class="achievement-icon">${achievement.icon}</div>
            <div class="achievement-name">${achievement.name}</div>
            <div class="achievement-desc">${achievement.desc}</div>
        `;
        elements.achievementsGrid.appendChild(div);
    });
}

// ==================== 统计系统 ====================
function updateWinStats(timeUsed) {
    stats.lastWinTime = timeUsed;
    stats.lastWinAttempts = attempts;
    stats.totalGames++;
    stats.totalWins++;
    stats.totalAttempts += attempts;

    // 特殊模式统计
    if (currentDifficulty === 'hard') stats.hardCompleted = (stats.hardCompleted || 0) + 1;
    if (currentDifficulty === 'daily') stats.dailyCompleted = (stats.dailyCompleted || 0) + 1;
    if (currentDifficulty === 'extreme') stats.extremeCompleted = (stats.extremeCompleted || 0) + 1;
    if (currentDifficulty === 'infinite') stats.infiniteCompleted = (stats.infiniteCompleted || 0) + 1;
    if (currentDifficulty === 'reverse') stats.reverseCompleted = (stats.reverseCompleted || 0) + 1;
    if (currentDifficulty === 'double') stats.doubleCompleted = (stats.doubleCompleted || 0) + 1;

    stats.winRate = stats.totalGames > 0 ? Math.round((stats.totalWins / stats.totalGames) * 100) : 0;
    stats.avgAttempts = stats.totalWins > 0 ? Math.round(stats.totalAttempts / stats.totalWins * 10) / 10 : 0;
    stats.avgTime = stats.totalWins > 0 ? Math.round((stats.totalTime || 0) / stats.totalWins * 10) / 10 : 0;
    stats.totalTime = (stats.totalTime || 0) + timeUsed;

    if (!bestScores[currentDifficulty] || attempts < bestScores[currentDifficulty]) {
        bestScores[currentDifficulty] = attempts;
    }

    saveGameData();
    updateStatsDisplay();
    updateBestScoreDisplay();
}

function updateStatsDisplay() {
    elements.statsGrid.innerHTML = `
        <div class="stat-card">
            <div class="stat-label">总游戏次数</div>
            <div class="stat-value">${stats.totalGames || 0}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">获胜次数</div>
            <div class="stat-value">${stats.totalWins || 0}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">胜率</div>
            <div class="stat-value">${stats.winRate || 0}%</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">平均尝试</div>
            <div class="stat-value">${stats.avgAttempts || 0}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">平均用时</div>
            <div class="stat-value">${stats.avgTime || 0}s</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">累计尝试</div>
            <div class="stat-value">${stats.totalAttempts || 0}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">挑战完成</div>
            <div class="stat-value">${stats.challengeCompleted || 0}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">极限模式</div>
            <div class="stat-value">${stats.extremeCompleted || 0}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">无限模式</div>
            <div class="stat-value">${stats.infiniteCompleted || 0}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">反向模式</div>
            <div class="stat-value">${stats.reverseCompleted || 0}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">双倍模式</div>
            <div class="stat-value">${stats.doubleCompleted || 0}</div>
        </div>
    `;
}

function updateBestScoreDisplay() {
    if (!currentDifficulty) {
        elements.bestScoreSpan.textContent = '--';
        return;
    }
    const best = bestScores[currentDifficulty];
    elements.bestScoreSpan.textContent = best ? `${best}次` : '--';
}

// ==================== 历史记录 ====================
function updateHistoryDisplay() {
    if (gameHistory.length === 0) {
        elements.historyList.innerHTML = '<li class="empty-history">暂无游戏记录</li>';
        return;
    }

    elements.historyList.innerHTML = '';
    gameHistory.slice(0, 10).forEach(item => {
        const li = document.createElement('li');
        li.classList.add('history-item');
        li.classList.add(item.win ? 'win' : 'lose');

        const difficultyName = difficultySettings[item.difficulty].name;
        const result = item.win ? '✓' : '✗';

        li.innerHTML = `
            <div>
                <span class="result">${result}</span>
                <span>${difficultyName}</span>
                <span>${item.attempts}次</span>
                ${item.timeUsed ? `<span>${item.timeUsed}秒</span>` : ''}
            </div>
            <div>${item.date.split(' ')[0]}</div>
        `;

        elements.historyList.appendChild(li);
    });
}

// ==================== UI 状态管理 ====================
function updateUIState() {
    // 更新状态指示器
    if (gameState === GameState.READY) {
        elements.statusBar.textContent = isChallengeMode ? '🎯 挑战已就绪' : '✅ 已就绪 - 请点击开始';
        elements.statusBar.className = 'status-bar ready';
    } else if (gameState === GameState.PLAYING) {
        elements.statusBar.textContent = isChallengeMode ? '🎮 挑战进行中' : '🎮 游戏进行中 - 猜猜看！';
        elements.statusBar.className = 'status-bar playing';
    } else if (gameState === GameState.ENDED) {
        elements.statusBar.textContent = '🏁 游戏结束 - 请重新开始';
        elements.statusBar.className = 'status-bar ended';
    }

    // 禁用/启用按钮
    const isPlaying = gameState === GameState.PLAYING;

    elements.difficultyBtns.forEach(btn => {
        btn.disabled = isPlaying;
    });

    elements.historyBtn.disabled = isPlaying;
    elements.statsBtn.disabled = isPlaying;
    elements.achievementsBtn.disabled = isPlaying;
    elements.challengeBtn.disabled = isPlaying;
    elements.startChallenge.disabled = isPlaying;

    // 禁用/启用输入框
    if (gameState === GameState.PLAYING) {
        elements.guessInput.disabled = false;
        elements.submitBtn.disabled = false;
        elements.guessInput.placeholder = `输入猜测`;
    } else if (gameState === GameState.READY) {
        elements.guessInput.disabled = true;
        elements.submitBtn.disabled = true;
        elements.guessInput.placeholder = `选择难度后开始游戏`;
    } else {
        elements.guessInput.disabled = true;
        elements.submitBtn.disabled = true;
        elements.guessInput.placeholder = `游戏结束`;
    }

    // 重新开始按钮文本
    if (gameState === GameState.READY) {
        elements.restartBtn.textContent = isChallengeMode ? '开始挑战' : '开始游戏';
    } else {
        elements.restartBtn.textContent = '重新开始游戏';
    }
}

function updateSoundUI() {
    elements.soundSwitch.classList.toggle('active', SoundManager.enabled);
    elements.soundToggle.textContent = SoundManager.enabled ? '🔊 音效' : '🔇 静音';
}

function updateThemeUI() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    elements.themeSwitch.classList.toggle('active', isDark);
    elements.themeToggle.textContent = isDark ? '🌙 夜间' : '☀️ 日间';
}

// ==================== 交互功能 ====================
function showMessage(text, type) {
    elements.messageDiv.textContent = text;
    elements.messageDiv.className = `message ${type}`;

    if (type === 'too-high' || type === 'too-low') {
        const hint = getSmartHint(parseInt(elements.guessInput.value) || 0);
        if (hint.type === 'hint') {
            setTimeout(() => {
                const hintDiv = document.createElement('div');
                hintDiv.className = `message hint`;
                hintDiv.textContent = hint.text;
                elements.messageDiv.parentNode.insertBefore(hintDiv, elements.messageDiv.nextSibling);
                setTimeout(() => hintDiv.remove(), 2000);
            }, 100);
        }
    }
}

function getSmartHint(guess) {
    const difference = Math.abs(guess - targetNumber);

    if (difference === 0) return { text: '🎉 正确！', type: 'success' };
    if (difference <= 3) return { text: '🔥 就差一点点！', type: 'hint' };
    if (difference <= 10) return { text: '✨ 非常接近了！', type: 'hint' };
    if (difference <= 20) return { text: '👍 接近了', type: 'hint' };
    if (difference <= 50) return { text: '📏 差一点', type: 'info' };

    return { text: '📍 还需要努力', type: 'info' };
}

function shakeInput() {
    elements.guessInput.classList.add('shake');
    setTimeout(() => elements.guessInput.classList.remove('shake'), 500);
}

function showCelebration() {
    elements.celebration.innerHTML = '';
    elements.celebration.classList.add('show');

    const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'];
    const confettiCount = 150;

    for (let i = 0; i < confettiCount; i++) {
        const confetti = document.createElement('div');
        confetti.classList.add('confetti');

        const size = Math.random() * 8 + 4;
        const color = colors[Math.floor(Math.random() * colors.length)];
        const left = Math.random() * 100;
        const delay = Math.random() * 2;

        confetti.style.width = `${size}px`;
        confetti.style.height = `${size}px`;
        confetti.style.background = color;
        confetti.style.left = `${left}%`;
        confetti.style.animationDelay = `${delay}s`;
        confetti.style.animationDuration = `${2 + Math.random() * 2}s`;

        elements.celebration.appendChild(confetti);
    }

    setTimeout(() => elements.celebration.classList.remove('show'), 2000);
}

function toggleSection(section) {
    const sectionMap = {
        history: elements.historySection,
        stats: elements.statsSection,
        achievements: elements.achievementsSection,
        challenge: elements.challengeSection,
        help: elements.helpSection,
        settings: elements.settingsSection
    };

    const target = sectionMap[section];
    const isShown = target.classList.contains('show');

    // 关闭所有其他部分
    Object.values(sectionMap).forEach(s => s.classList.remove('show'));

    // 切换目标部分
    if (!isShown) {
        target.classList.add('show');
        SoundManager.click();
    }
}

// ==================== 数据管理 ====================
function saveGameData() {
    const data = {
        achievements,
        stats,
        gameHistory,
        bestScores,
        soundEnabled: SoundManager.enabled,
        theme: document.documentElement.getAttribute('data-theme') || 'light'
    };
    localStorage.setItem('guessNumberGame', JSON.stringify(data));
}

function loadGameData() {
    const saved = localStorage.getItem('guessNumberGame');
    if (saved) {
        try {
            const data = JSON.parse(saved);
            achievements = data.achievements || {};
            stats = data.stats || {};
            gameHistory = data.gameHistory || [];
            bestScores = data.bestScores || {};
            SoundManager.enabled = data.soundEnabled || false;

            if (data.theme === 'dark') {
                document.documentElement.setAttribute('data-theme', 'dark');
            }
        } catch (e) {
            console.error('加载数据失败', e);
            achievements = {};
            stats = {};
            gameHistory = [];
            bestScores = {};
        }
    } else {
        achievements = {};
        stats = {};
        gameHistory = [];
        bestScores = {};
    }
}

function exportData() {
    const data = {
        achievements,
        stats,
        gameHistory,
        bestScores,
        version: '2.1.0',
        exportDate: new Date().toISOString()
    };
    const json = JSON.stringify(data, null, 2);
    elements.dataTransfer.value = json;
    showNotification('数据已导出到文本框', 'info');
    SoundManager.click();
}

function importData() {
    const json = elements.dataTransfer.value.trim();
    if (!json) {
        showNotification('请先粘贴数据', 'error');
        return;
    }

    try {
        const data = JSON.parse(json);
        if (!data.version) {
            throw new Error('无效的数据格式');
        }

        if (confirm('导入数据将覆盖当前所有数据，确定要继续吗？')) {
            achievements = data.achievements || {};
            stats = data.stats || {};
            gameHistory = data.gameHistory || [];
            bestScores = data.bestScores || {};

            saveGameData();
            updateAchievementsDisplay();
            updateStatsDisplay();
            updateHistoryDisplay();
            updateBestScoreDisplay();

            showNotification('数据导入成功！', 'success');
            SoundManager.success();
        }
    } catch (e) {
        showNotification('数据格式错误：' + e.message, 'error');
        SoundManager.fail();
    }
}

function clearData() {
    if (confirm('确定要清空所有游戏数据吗？此操作不可恢复！')) {
        localStorage.removeItem('guessNumberGame');
        achievements = {};
        stats = {};
        gameHistory = [];
        bestScores = {};

        updateAchievementsDisplay();
        updateStatsDisplay();
        updateHistoryDisplay();
        updateBestScoreDisplay();

        showNotification('所有数据已清空', 'info');
        SoundManager.fail();
    }
}

// ==================== 主题与音效 ====================
function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const newTheme = current === 'dark' ? 'light' : 'dark';

    document.documentElement.setAttribute('data-theme', newTheme);
    saveGameData();
    updateThemeUI();

    showNotification(newTheme === 'dark' ? '切换到夜间模式' : '切换到日间模式', 'info');
    SoundManager.click();
}

function toggleSound() {
    SoundManager.toggle();
}

// ==================== 事件监听器 ====================

// 难度选择
elements.difficultyBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        if (gameState === GameState.PLAYING) {
            if (confirm('游戏正在进行中，切换难度将停止当前游戏。确定要切换吗？')) {
                clearInterval(timerInterval);
                gameState = GameState.READY;
                updateUIState();
            } else {
                return;
            }
        }

        currentDifficulty = btn.dataset.difficulty;
        elements.difficultyBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        gameState = GameState.READY;
        updateUIState();
        updateBestScoreDisplay();

        let message = '';
        if (currentDifficulty === 'daily') {
            message = `每日挑战已选择，数字每日更新`;
        } else if (currentDifficulty === 'extreme') {
            message = `极限模式：1-500，30秒限制`;
        } else if (currentDifficulty === 'infinite') {
            message = `无限模式：无时间限制，最多20次尝试`;
        } else if (currentDifficulty === 'reverse') {
            message = `反向模式：猜比目标更大的数`;
        } else if (currentDifficulty === 'double') {
            message = `双倍模式：连续猜对两个数字`;
        } else {
            message = `已选择${difficultySettings[currentDifficulty].name}难度，点击开始游戏`;
        }

        showMessage(message, 'info');
        SoundManager.click();
    });
});

// 重新开始/开始游戏
elements.restartBtn.addEventListener('click', () => {
    if (gameState === GameState.PLAYING) {
        if (confirm('确定要重新开始当前游戏吗？')) {
            startGame();
        }
    } else {
        startGame();
    }
});

// 提交猜测
elements.submitBtn.addEventListener('click', handleGuess);

// 回车键提交
elements.guessInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && gameState === GameState.PLAYING) {
        handleGuess();
    }
});

// 历史记录
elements.historyBtn.addEventListener('click', () => {
    if (gameState === GameState.PLAYING) {
        showNotification('游戏进行中不能查看历史记录！', 'error');
        return;
    }
    toggleSection('history');
});

// 统计数据
elements.statsBtn.addEventListener('click', () => {
    if (gameState === GameState.PLAYING) {
        showNotification('游戏进行中不能查看统计数据！', 'error');
        return;
    }
    toggleSection('stats');
    updateStatsDisplay();
});

// 成就系统
elements.achievementsBtn.addEventListener('click', () => {
    if (gameState === GameState.PLAYING) {
        showNotification('游戏进行中不能查看成就！', 'error');
        return;
    }
    toggleSection('achievements');
    updateAchievementsDisplay();
});

// 挑战模式
elements.challengeBtn.addEventListener('click', () => {
    if (gameState === GameState.PLAYING) {
        showNotification('游戏进行中不能切换模式！', 'error');
        return;
    }
    toggleSection('challenge');
});

elements.startChallenge.addEventListener('click', startChallenge);
elements.cancelChallenge.addEventListener('click', cancelChallenge);

// 顶部工具栏
elements.themeToggle.addEventListener('click', toggleTheme);
elements.soundToggle.addEventListener('click', toggleSound);
elements.helpToggle.addEventListener('click', () => {
    toggleSection('help');
    SoundManager.click();
});

// 设置开关
elements.soundSwitch.addEventListener('click', toggleSound);
elements.themeSwitch.addEventListener('click', toggleTheme);

// 数据管理
elements.exportData.addEventListener('click', exportData);
elements.importData.addEventListener('click', importData);
elements.clearData.addEventListener('click', clearData);

// 模态框
elements.modalBtn.addEventListener('click', () => {
    elements.gameOverModal.classList.remove('show');
    if (isChallengeMode && challengeProgress < 3) {
        startGame();
    } else {
        startGame();
    }
});

elements.modalCloseBtn.addEventListener('click', () => {
    elements.gameOverModal.classList.remove('show');
});

elements.gameOverModal.addEventListener('click', (e) => {
    if (e.target === elements.gameOverModal) {
        elements.gameOverModal.classList.remove('show');
    }
});

// 键盘快捷键
document.addEventListener('keydown', (e) => {
    if (e.target === elements.guessInput) {
        if (e.key === 'Escape') {
            e.target.blur();
        }
        return;
    }

    switch(e.key.toLowerCase()) {
        case 'enter':
            if (gameState === GameState.PLAYING) {
                handleGuess();
            }
            break;
        case 'escape':
            if (gameState === GameState.PLAYING) {
                if (confirm('确定要重新开始吗？')) {
                    startGame();
                }
            } else {
                startGame();
            }
            break;
        case ' ':
            e.preventDefault();
            toggleTheme();
            break;
        case 'm':
            toggleSound();
            break;
        case 'h':
            toggleSection('help');
            break;
        case 'c':
            if (gameState !== GameState.PLAYING) {
                toggleSection('challenge');
            }
            break;
        case 's':
            if (gameState !== GameState.PLAYING) {
                toggleSection('stats');
                updateStatsDisplay();
            }
            break;
    }
});

// 页面加载
window.addEventListener('load', initGame);

// 防止页面刷新时丢失数据
window.addEventListener('beforeunload', (e) => {
    if (gameState === GameState.PLAYING) {
        e.preventDefault();
        e.returnValue = '游戏正在进行中，确定要离开吗？';
        return '游戏正在进行中，确定要离开吗？';
    }
});
