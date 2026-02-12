// ========================================
// グローバル変数とゲーム設定
// ========================================
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

// Canvas サイズ設定
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
canvas.width = CANVAS_WIDTH;
canvas.height = CANVAS_HEIGHT;

// ゲーム状態
let gameState = 'title'; // 'title', 'playing', 'gameover', 'victory'
let score = 0;
let lives = 3;
let animationId = null;

// プレイヤー
let player = {
    x: CANVAS_WIDTH / 2,
    y: CANVAS_HEIGHT - 60,
    width: 40,
    height: 30,
    speed: 5,
    color: '#00ff00'
};

// 弾丸
let playerBullets = [];
let enemyBullets = [];
const BULLET_WIDTH = 4;
const BULLET_HEIGHT = 15;
const BULLET_SPEED = 7;
const PLAYER_BULLET_COOLDOWN = 300; // ms
let lastPlayerShot = 0;

// 敵
let enemies = [];
const ENEMY_ROWS = 5;
const ENEMY_COLS = 11;
const ENEMY_WIDTH = 30;
const ENEMY_HEIGHT = 25;
const ENEMY_SPACING_X = 50;
const ENEMY_SPACING_Y = 40;
const ENEMY_START_X = 80;
const ENEMY_START_Y = 60;
let enemyDirection = 1; // 1: 右, -1: 左
let enemySpeed = 1;
let enemyDropDistance = 20;

// バリケード
let barricades = [];
const BARRICADE_WIDTH = 80;
const BARRICADE_HEIGHT = 60;
const BARRICADE_HEALTH = 10;

// 入力管理
let keys = {};
let touchLeft = false;
let touchRight = false;
let touchShoot = false;

// ========================================
// 初期化関数
// ========================================
function initGame() {
    score = 0;
    lives = 3;
    player.x = CANVAS_WIDTH / 2;
    playerBullets = [];
    enemyBullets = [];
    lastPlayerShot = 0;
    
    // 敵の初期化
    enemies = [];
    for (let row = 0; row < ENEMY_ROWS; row++) {
        for (let col = 0; col < ENEMY_COLS; col++) {
            enemies.push({
                x: ENEMY_START_X + col * ENEMY_SPACING_X,
                y: ENEMY_START_Y + row * ENEMY_SPACING_Y,
                width: ENEMY_WIDTH,
                height: ENEMY_HEIGHT,
                alive: true,
                type: row // 行によってタイプ分け(スコア用)
            });
        }
    }
    
    enemyDirection = 1;
    enemySpeed = 1;
    
    // バリケードの初期化
    barricades = [];
    const barricadeY = CANVAS_HEIGHT - 150;
    const barricadePositions = [100, 250, 400, 550];
    barricadePositions.forEach(x => {
        barricades.push({
            x: x,
            y: barricadeY,
            width: BARRICADE_WIDTH,
            height: BARRICADE_HEIGHT,
            health: BARRICADE_HEALTH
        });
    });
    
    updateUI();
}

// ========================================
// 描画関数
// ========================================
function drawPlayer() {
    ctx.fillStyle = player.color;
    ctx.fillRect(player.x - player.width / 2, player.y, player.width, player.height);
    
    // 砲台
    ctx.fillRect(player.x - 3, player.y - 10, 6, 10);
}

function drawEnemies() {
    enemies.forEach(enemy => {
        if (!enemy.alive) return;
        
        // タイプによって色を変える
        const colors = ['#ff0000', '#ff6600', '#ffff00', '#00ff00', '#00ffff'];
        ctx.fillStyle = colors[enemy.type] || '#ffffff';
        
        // シンプルな敵の形(四角+触角)
        ctx.fillRect(enemy.x, enemy.y + 5, enemy.width, enemy.height - 10);
        ctx.fillRect(enemy.x + 5, enemy.y, 8, 8);
        ctx.fillRect(enemy.x + enemy.width - 13, enemy.y, 8, 8);
    });
}

function drawBullets() {
    // プレイヤーの弾
    ctx.fillStyle = '#00ff00';
    playerBullets.forEach(bullet => {
        ctx.fillRect(bullet.x, bullet.y, BULLET_WIDTH, BULLET_HEIGHT);
    });
    
    // 敵の弾
    ctx.fillStyle = '#ff0000';
    enemyBullets.forEach(bullet => {
        ctx.fillRect(bullet.x, bullet.y, BULLET_WIDTH, BULLET_HEIGHT);
    });
}

function drawBarricades() {
    barricades.forEach(barricade => {
        if (barricade.health <= 0) return;
        
        // 体力に応じて色を変える
        const healthRatio = barricade.health / BARRICADE_HEALTH;
        const green = Math.floor(255 * healthRatio);
        ctx.fillStyle = `rgb(0, ${green}, 0)`;
        
        ctx.fillRect(barricade.x, barricade.y, barricade.width, barricade.height);
    });
}

function drawGame() {
    // 背景クリア
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    // 描画
    drawBarricades();
    drawPlayer();
    drawEnemies();
    drawBullets();
}

// ========================================
// 更新関数
// ========================================
function updatePlayer() {
    // キーボード入力
    if (keys['ArrowLeft'] || touchLeft) {
        player.x -= player.speed;
    }
    if (keys['ArrowRight'] || touchRight) {
        player.x += player.speed;
    }
    
    // 画面外に出ないように制限
    player.x = Math.max(player.width / 2, Math.min(CANVAS_WIDTH - player.width / 2, player.x));
    
    // 発射
    if ((keys[' '] || touchShoot) && Date.now() - lastPlayerShot > PLAYER_BULLET_COOLDOWN) {
        playerBullets.push({
            x: player.x - BULLET_WIDTH / 2,
            y: player.y - 10
        });
        lastPlayerShot = Date.now();
    }
}

function updateBullets() {
    // プレイヤーの弾を更新
    playerBullets = playerBullets.filter(bullet => {
        bullet.y -= BULLET_SPEED;
        return bullet.y > -BULLET_HEIGHT;
    });
    
    // 敵の弾を更新
    enemyBullets = enemyBullets.filter(bullet => {
        bullet.y += BULLET_SPEED;
        return bullet.y < CANVAS_HEIGHT;
    });
}

function updateEnemies() {
    if (enemies.filter(e => e.alive).length === 0) return;
    
    // 端の検出
    let hitEdge = false;
    enemies.forEach(enemy => {
        if (!enemy.alive) return;
        if (enemy.x + enemy.width >= CANVAS_WIDTH - 10 && enemyDirection === 1) {
            hitEdge = true;
        }
        if (enemy.x <= 10 && enemyDirection === -1) {
            hitEdge = true;
        }
    });
    
    // 端に到達したら方向転換して下降
    if (hitEdge) {
        enemyDirection *= -1;
        enemies.forEach(enemy => {
            if (enemy.alive) {
                enemy.y += enemyDropDistance;
            }
        });
    }
    
    // 横移動
    enemies.forEach(enemy => {
        if (enemy.alive) {
            enemy.x += enemySpeed * enemyDirection;
        }
    });
    
    // ランダムに敵弾発射
    if (Math.random() < 0.01) {
        const aliveEnemies = enemies.filter(e => e.alive);
        if (aliveEnemies.length > 0) {
            const shooter = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)];
            enemyBullets.push({
                x: shooter.x + shooter.width / 2 - BULLET_WIDTH / 2,
                y: shooter.y + shooter.height
            });
        }
    }
    
    // 敵が下まで到達したらゲームオーバー
    enemies.forEach(enemy => {
        if (enemy.alive && enemy.y + enemy.height >= player.y) {
            gameOver();
        }
    });
}


// ========================================
// 当たり判定
// ========================================
function checkCollisions() {
    // プレイヤーの弾 vs 敵
    playerBullets = playerBullets.filter(bullet => {
        let hit = false;
        enemies.forEach(enemy => {
            if (!enemy.alive) return;
            if (isColliding(bullet, BULLET_WIDTH, BULLET_HEIGHT, enemy.x, enemy.y, enemy.width, enemy.height)) {
                enemy.alive = false;
                hit = true;
                score += (5 - enemy.type) * 10; // 上の行ほど高得点
                updateUI();
            }
        });
        return !hit;
    });
    
    // プレイヤーの弾 vs バリケード
    playerBullets = playerBullets.filter(bullet => {
        let hit = false;
        barricades.forEach(barricade => {
            if (barricade.health <= 0) return;
            if (isColliding(bullet, BULLET_WIDTH, BULLET_HEIGHT, barricade.x, barricade.y, barricade.width, barricade.height)) {
                barricade.health--;
                hit = true;
            }
        });
        return !hit;
    });
    
    // 敵の弾 vs プレイヤー
    enemyBullets = enemyBullets.filter(bullet => {
        if (isColliding(bullet, BULLET_WIDTH, BULLET_HEIGHT, player.x - player.width / 2, player.y, player.width, player.height)) {
            lives--;
            updateUI();
            if (lives <= 0) {
                gameOver();
            }
            return false;
        }
        return true;
    });
    
    // 敵の弾 vs バリケード
    enemyBullets = enemyBullets.filter(bullet => {
        let hit = false;
        barricades.forEach(barricade => {
            if (barricade.health <= 0) return;
            if (isColliding(bullet, BULLET_WIDTH, BULLET_HEIGHT, barricade.x, barricade.y, barricade.width, barricade.height)) {
                barricade.health--;
                hit = true;
            }
        });
        return !hit;
    });
    
    // 全敵撃破チェック
    if (enemies.filter(e => e.alive).length === 0) {
        victory();
    }
}

function isColliding(obj1, w1, h1, x2, y2, w2, h2) {
    const x1 = obj1.x;
    const y1 = obj1.y;
    
    return x1 < x2 + w2 &&
           x1 + w1 > x2 &&
           y1 < y2 + h2 &&
           y1 + h1 > y2;
}

// ========================================
// ゲームループ
// ========================================
function gameLoop() {
    if (gameState !== 'playing') return;
    
    updatePlayer();
    updateBullets();
    updateEnemies();
    checkCollisions();
    drawGame();
    
    animationId = requestAnimationFrame(gameLoop);
}

// ========================================
// UI更新
// ========================================
function updateUI() {
    document.getElementById('score').textContent = `SCORE: ${score}`;
    document.getElementById('lives').textContent = `LIVES: ${'❤️'.repeat(Math.max(0, lives))}`;
}

// ========================================
// ゲーム状態管理
// ========================================
function startGame() {
    gameState = 'playing';
    initGame();
    showScreen('game-screen');
    gameLoop();
}

function gameOver() {
    gameState = 'gameover';
    if (animationId) {
        cancelAnimationFrame(animationId);
    }
    
    document.getElementById('result-title').textContent = 'GAME OVER';
    document.getElementById('final-score').textContent = `SCORE: ${score}`;
    document.getElementById('result-screen').classList.remove('victory');
    showScreen('result-screen');
}

function victory() {
    gameState = 'victory';
    if (animationId) {
        cancelAnimationFrame(animationId);
    }
    
    document.getElementById('result-title').textContent = 'STAGE CLEAR!';
    document.getElementById('final-score').textContent = `SCORE: ${score}`;
    document.getElementById('result-screen').classList.add('victory');
    showScreen('result-screen');
}

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.add('hidden');
    });
    document.getElementById(screenId).classList.remove('hidden');
}

// ========================================
// イベントリスナー
// ========================================
// キーボード
document.addEventListener('keydown', (e) => {
    keys[e.key] = true;
    if (e.key === ' ') {
        e.preventDefault(); // スペースキーのスクロール防止
    }
});

document.addEventListener('keyup', (e) => {
    keys[e.key] = false;
});

// タッチ操作(スマホ対応)
canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    
    // 画面を3分割: 左(移動左)、中央(発射)、右(移動右)
    const third = rect.width / 3;
    if (x < third) {
        touchLeft = true;
    } else if (x > third * 2) {
        touchRight = true;
    } else {
        touchShoot = true;
    }
});

canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    touchLeft = false;
    touchRight = false;
    touchShoot = false;
});

// ボタン
document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('retry-btn').addEventListener('click', startGame);
document.getElementById('title-btn').addEventListener('click', () => {
    gameState = 'title';
    showScreen('title-screen');
});

// ========================================
// 初期表示
// ========================================
showScreen('title-screen');
