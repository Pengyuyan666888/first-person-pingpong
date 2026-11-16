const TUTORIAL_KEY = 'rally7-tutorial-seen';

export class UI {
  constructor() {
    this.startScreen = document.getElementById('start-screen');
    this.tutorialScreen = document.getElementById('tutorial-screen');
    this.pauseScreen = document.getElementById('pause-screen');
    this.resultScreen = document.getElementById('result-screen');
    this.hud = document.getElementById('hud');
    this.loadingScreen = document.getElementById('loading-screen');
    this.toastEl = document.getElementById('toast');
    this.scorePlayer = document.getElementById('score-player');
    this.scoreAi = document.getElementById('score-ai');
    this.scoreSidePlayer = document.getElementById('score-side-player');
    this.scoreSideAi = document.getElementById('score-side-ai');
    this.difficultyBadge = document.getElementById('difficulty-badge');
    this.rallyChip = document.getElementById('rally-chip');
    this.hintBar = document.getElementById('hint-bar');
    this.servePrompt = document.getElementById('serve-prompt');
    this.pauseBtn = document.getElementById('pause-btn');
    this.muteBtn = document.getElementById('mute-btn');
    this.muteIcon = document.getElementById('mute-icon');
    this.soundToggle = document.getElementById('sound-toggle');
    this.soundLabel = document.getElementById('sound-label');
    this.difficultyCards = [...document.querySelectorAll('.difficulty-card')];
    this.toastTimer = 0;
    this.hintTimer = 0;
    this.tutorialSeen = false;
    try {
      this.tutorialSeen = localStorage.getItem(TUTORIAL_KEY) === '1';
    } catch {
      this.tutorialSeen = false;
    }
  }

  setDifficulty(key) {
    this.difficultyCards.forEach((card) => {
      card.classList.toggle('active', card.dataset.difficulty === key);
    });
    const labels = { easy: '新手', normal: '业余', hard: '高手' };
    this.difficultyBadge.textContent = labels[key] ?? '业余';
  }

  showScreen(screen) {
    screen.classList.remove('hidden');
  }

  hideScreen(screen) {
    screen.classList.add('hidden');
  }

  showMenu() {
    this.hideScreen(this.tutorialScreen);
    this.hideScreen(this.pauseScreen);
    this.hideScreen(this.resultScreen);
    this.hud.classList.add('hidden');
    this.showScreen(this.startScreen);
    this.servePrompt.classList.add('hidden');
    this.toastEl.classList.remove('show');
    this.hintBar.classList.remove('fade');
    document.body.classList.remove('playing');
  }

  showHUD() {
    this.hideScreen(this.startScreen);
    this.hideScreen(this.tutorialScreen);
    this.hideScreen(this.pauseScreen);
    this.hideScreen(this.resultScreen);
    this.hud.classList.remove('hidden');
    this.hintBar.classList.remove('fade');
    this.hintTimer = 0;
  }

  showTutorial() {
    this.hideScreen(this.startScreen);
    this.showScreen(this.tutorialScreen);
  }

  hideTutorial() {
    this.hideScreen(this.tutorialScreen);
  }

  showPause() {
    this.showScreen(this.pauseScreen);
  }

  hidePause() {
    this.hideScreen(this.pauseScreen);
  }

  showResult(data) {
    this.hideScreen(this.pauseScreen);
    this.hud.classList.add('hidden');
    this.scorePlayer.textContent = String(data.playerScore);
    this.scoreAi.textContent = String(data.aiScore);
    document.getElementById('result-player').textContent = String(data.playerScore);
    document.getElementById('result-ai').textContent = String(data.aiScore);
    document.getElementById('result-title').textContent = data.won ? '胜利' : '惜败';
    document.getElementById('result-kicker').textContent = data.won ? '比赛结束 · 你赢了' : '比赛结束 · 机器赢了';
    document.getElementById('result-sub').textContent = data.won
      ? '最后一拍落地，球台属于你。'
      : '再试一次，把节奏抢回来。';
    document.getElementById('stat-rally').textContent = `${data.longestRally} 拍`;
    document.getElementById('stat-winners').textContent = String(data.winners);
    document.getElementById('stat-difficulty').textContent = data.difficultyLabel;
    const panel = this.resultScreen.querySelector('.result-panel');
    panel.classList.toggle('lose', !data.won);
    this.showScreen(this.resultScreen);
  }

  hideResult() {
    this.hideScreen(this.resultScreen);
  }

  setScore(playerScore, aiScore) {
    this.scorePlayer.textContent = String(playerScore);
    this.scoreAi.textContent = String(aiScore);
  }

  setServer(server) {
    this.scoreSidePlayer.classList.toggle('serving', server === 'player');
    this.scoreSideAi.classList.toggle('serving', server === 'ai');
  }

  setRally(count) {
    this.rallyChip.innerHTML = `回合 <b>${count}</b>`;
  }

  setServePrompt(visible, title = '你的发球', sub = '点击抛球，再点击击球') {
    this.servePrompt.classList.toggle('hidden', !visible);
    if (visible) {
      this.servePrompt.querySelector('.serve-prompt-title').textContent = title;
      this.servePrompt.querySelector('.serve-prompt-sub').textContent = sub;
    }
  }

  toast(text, side = null, duration = 1500) {
    this.toastEl.textContent = text;
    this.toastEl.className = 'toast show';
    if (side) this.toastEl.classList.add(side);
    this.toastTimer = duration / 1000;
  }

  update(dt) {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toastEl.classList.remove('show');
    }
    if (this.hintTimer >= 0) {
      this.hintTimer += dt;
      if (this.hintTimer > 9) this.hintBar.classList.add('fade');
    }
  }

  setMuted(muted) {
    this.muteBtn.classList.toggle('muted', muted);
    this.muteIcon.textContent = muted ? '×' : '♪';
    this.soundToggle.setAttribute('aria-pressed', String(!muted));
    this.soundLabel.textContent = muted ? '声音关闭' : '声音开启';
  }

  loadingDone() {
    this.loadingScreen.classList.add('done');
    window.setTimeout(() => this.loadingScreen.classList.add('hidden'), 600);
  }

  markTutorialSeen() {
    this.tutorialSeen = true;
    try {
      localStorage.setItem(TUTORIAL_KEY, '1');
    } catch {
      /* ignore private mode */
    }
  }

  resetHintTimer() {
    this.hintTimer = 0;
    this.hintBar.classList.remove('fade');
  }
}
