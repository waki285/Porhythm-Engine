// 各判定の範囲（ボタンの直径の何割か）
const JUDGE = {
  PERFECT: 0.4,
  GOOD: 0.8,
  MISS: 1.2,
};
// 加算スコア
const SCORE = {
  PERFECT: 500,
  GOOD: 200,
  MISS: 0,
};
// コンボゲージの増減値
const COMBO_GAUGE = {
  PERFECT: 2,
  GOOD: 1,
  MISS: -1,
};
// スピード（数値が小さいほど早くなる）
const SPEED_RATE = {
  EASY: 8,
  NORMAL: 6,
  HARD: 5,
};
// 1小節の拍数
const BEAT_PER_BAR = 16;
// 再生するまでの拍数
const PLAY_WAIT_BEAT_COUNT = BEAT_PER_BAR * 1;
// コンボを表示するコンボ数
const COMBO_DISPLAY_COUNT = 5;

if (!localStorage.getItem("keybinds")) {
  localStorage.setItem("keybinds", "KeyA,KeyS,KeyD,KeyF,KeyG");
}

function generateKeybindText(key) {
  return `<span class="judge-keybind">${visualizeKeyText(key)}</span>`;
}
function visualizeKeyText(key) {
  return key
    .replace("Key", "")
    .replace("Arrow", "")
    .replace("Left", "←")
    .replace("Down", "↓")
    .replace("Up", "↑")
    .replace("Right", "→");
}
function getKeybinds() {
  return localStorage.getItem("keybinds").split(",");
}

var EASY_NOTES = {};
var NORMAL_NOTES = {};
var HARD_NOTES = {};

var gameController;

class GameController {
  constructor() {
    this.view = new ViewController(this);
    this.view.onClickPlayEasyBtn = () => this.play("easy");
    this.view.onClickPlayNormalBtn = () => this.play("normal");
    this.view.onClickPlayHardBtn = () => this.play("hard");

    this.playing = false;

    this.record = new RecordData();

    document.addEventListener("showView", (e) => {
      if (e.detail.name == "TitleView") {
        this.playedModes = [];
      }
    });
    document.addEventListener("judged", (e) =>
      this.record.update(e.detail.judge)
    );
    document.addEventListener("render", (e) => this.onRender(e));

    // ウィンドウのフォーカスが外れた時に全体をポーズする
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState == "hidden") this.onBlur();
    });
    window.addEventListener("orientationchange", () => this.onBlur());
  }
  reset() {
    if (!this.view.titleView.showed) {
      if (this.renderId) cancelAnimationFrame(this.renderId);
      if (this.mode) this.view.audio[this.mode].pause();
      this.rendering = false;
      this.view.playView.reset();
      this.view.titleView.show();
    }
  }
  async play(mode) {
    if (this.playedModes.length == 0) this.record.reset();

    this.playing = true;

    this.mode = mode;
    this.playedModes.push(this.mode);

    switch (this.mode) {
      case "easy":
        this.notesDataList = new NotesDataList(
          await this.easyNotesData(),
          this.mode
        );
        this.lyrics = new LyricsEasy();
        break;
      case "normal":
        this.notesDataList = new NotesDataList(
          await this.normalNotesData(),
          this.mode
        );
        this.lyrics = new LyricsNormal();
        break;
      case "hard":
        this.notesDataList = new NotesDataList(
          await this.hardNotesData(),
          this.mode
        );
        this.lyrics = new LyricsHard();
        break;
    }

    this.startRender();
    this.rendering = true;
  }
  startRender() {
    this.currentTime = 0; // deltaTime算出用
    this.startTime = 0; // renderの経過時間
    this.playTime = 0; // 曲の再生時間
    this.count = 0; // 拍数
    this.playing = true;
    this.ended = false;
    this.rendering = true;
    this.render();
  }
  stopRender() {
    this.rendering = false;
  }
  render(timestamp) {
    const now = (timestamp || 0) * 0.001; // 秒に変換

    if (this.currentTime == 0) {
      this.currentTime = now;
    } else if (timestamp) {
      const deltaTime = now - this.currentTime;
      this.currentTime = now;

      const event = new CustomEvent("render", { detail: { delta: deltaTime } });
      document
        .querySelectorAll(".note")
        .forEach((el) => el.dispatchEvent(event));
      document.dispatchEvent(event);
    }
    this.renderId = requestAnimationFrame((time) => this.render(time));
    if (!this.rendering) cancelAnimationFrame(this.renderId);
  }
  onRender(e) {
    this.startTime += e.detail.delta;

    if (this.view.audio[this.mode].playing) {
      this.playTime += e.detail.delta;
    }

    if (!this.notesDataList.lyrics[0]) {
    } else if (this.notesDataList.lyrics[0] <= this.playTime) {
      this.notesDataList.lyrics.shift();
      this.lyrics.next();
    }

    if (this.ended) {
      return;
    } else if (!this.notesDataList.convertedNotes[0]) {
      this.ended = true;
      this.onEnded();
    } else if (this.notesDataList.convertedNotes[0].time <= this.startTime) {
      let data = this.notesDataList.convertedNotes.shift();

      if (this.count == PLAY_WAIT_BEAT_COUNT) {
        console.log("play");
        this.view.audio[this.mode].play();
      }

      data.notes.forEach((note) => note.append());

      this.count++;
    }
  }
  onEnded() {
    console.log("onEnded");
    setTimeout(() => {
      this.stopRender();
      this.playing = false;
      this.view.playView.showEndText();
      this.view.audio[this.mode].pause();
      this.view.audio.end.play();
      setTimeout(() => {
        if (this.playedModes.length < 3) {
          this.view.resultView.show();
        } else {
          this.view.lastResultView.show();
        }
      }, 6000);
    }, this.notesDataList.waitTime);
  }
  onBlur() {
    if (this.playing) {
      if (this.mode) this.view.audio[this.mode].pause();
      this.view.playView.showReloadDialog();
      this.stopRender();
    }
  }
  async easyNotesData() {
    if (!this._easyNotesData) {
      const response = await fetch("notes/easy.json");
      this._easyNotesData = await response.json();
    }
    return { ...this._easyNotesData, ...EASY_NOTES };
  }
  async normalNotesData() {
    if (!this._normalNotesData) {
      const response = await fetch("notes/normal.json");
      this._normalNotesData = await response.json();
    }
    return { ...this._normalNotesData, ...NORMAL_NOTES };
  }
  async hardNotesData() {
    if (!this._hardNotesData) {
      const response = await fetch("notes/hard.json");
      this._hardNotesData = await response.json();
    }
    return { ...this._hardNotesData, ...HARD_NOTES };
  }
}
class ViewController {
  constructor(gameController) {
    this.gameController = gameController;
    this.onClickPlayEasyBtn = () => {};
    this.onClickPlayNormalBtn = () => {};
    this.onClickPlayHardBtn = () => {};

    this.audio = {
      easy: new Sound("sound/easy.mp3"),
      normal: new Sound("sound/normal.mp3"),
      hard: new Sound("sound/hard.mp3"),
      tap: new Sound("sound/tap.mp3"),
      end: new Sound("sound/end.mp3"),
    };

    this.titleView = new TitleView();
    this.howtoView = new HowtoView();
    this.settingsView = new SettingsView();
    this.changeKeybindsView = new ChangeKeybindsView();
    this.selectView = new SelectView();
    this.playView = new PlayView();
    this.resultView = new ResultView();
    this.lastResultView = new LastResultView();

    document.querySelector(".btn-select").addEventListener("click", () => {
      this.btnAction(() => {
        this.selectView.show();
        this.audio.end.play();
        this.audio.end.pause();
      });
    });
    document.querySelector(".btn-howto").addEventListener("click", () => {
      this.btnAction(() => this.howtoView.show());
    });
    document.querySelector(".btn-settings").addEventListener("click", () => {
      this.btnAction(() => this.settingsView.show());
    });

    document.querySelector("#change-keybinds").addEventListener("click", () => {
      this.btnAction(() => this.changeKeybindsView.show());
    });
    document.querySelector(".btn-play-easy").addEventListener("click", () => {
      this.btnAction(() => {
        this.playView.mode = "easy";
        this.playView.show();
        this.audio.easy.play();
        this.audio.easy.pause();
        if (typeof this.onClickPlayEasyBtn == "function")
          this.onClickPlayEasyBtn();
      });
    });
    document.querySelector(".btn-play-normal").addEventListener("click", () => {
      this.btnAction(() => {
        this.playView.mode = "normal";
        this.playView.show();
        this.audio.normal.play();
        this.audio.normal.pause();
        if (typeof this.onClickPlayNormalBtn == "function")
          this.onClickPlayNormalBtn();
      });
    });
    document.querySelector(".btn-play-hard").addEventListener("click", () => {
      this.btnAction(() => {
        this.playView.mode = "hard";
        this.playView.show();
        this.audio.hard.play();
        this.audio.hard.pause();
        if (typeof this.onClickPlayHardBtn == "function")
          this.onClickPlayHardBtn();
      });
    });
    document.querySelector(".btn-next").addEventListener("click", () => {
      this.btnAction(() => {
        if (this.gameController.playedModes.indexOf("easy") != -1) {
          this.selectView.hideBtn("easy");
        }
        if (this.gameController.playedModes.indexOf("normal") != -1) {
          this.selectView.hideBtn("normal");
        }
        if (this.gameController.playedModes.indexOf("hard") != -1) {
          this.selectView.hideBtn("hard");
        }
        this.selectView.show();
      });
    });
    document.querySelectorAll(".btn-back, .btn-end").forEach((el) => {
      el.addEventListener("click", () => {
        this.btnAction(() => {
          this.playView.hideEndText();
          this.selectView.reset();
          this.titleView.show();
        });
      });
    });
    document.querySelectorAll(".btn-close").forEach((el) => {
      el.addEventListener("click", () => {
        this.btnAction(() => {
          this.changeKeybindsView.hide();
        });
      });
    });
    document.querySelectorAll(".btn-reload").forEach((el) => {
      el.addEventListener("click", () => location.reload());
    });
    document.querySelectorAll(".btn").forEach((el) => {
      el.addEventListener("click", () => this.audio.tap.play());
    });

    document.addEventListener("keydown", (e) => {
      const keybinds = getKeybinds();
      switch (e.code) {
        case keybinds[0]: {
          this.judgeEvent(1);
          break;
        } // a (1)
        case keybinds[1]: {
          this.judgeEvent(2);
          break;
        } // s (2)
        case keybinds[2]: {
          this.judgeEvent(3);
          break;
        } // d (3)
        case keybinds[3]: {
          this.judgeEvent(4);
          break;
        } // f (4)
        case keybinds[4]: {
          this.judgeEvent(5);
          break;
        } // g (5)
      }
    });
    document
      .querySelectorAll(".btn-judge > div")
      .forEach((el, index) => new JudgeBtn(el, index));
  }
  // 連続で処理が実行されないようにする
  btnAction(callback) {
    this.disableBtn ||= false;
    if (!this.disableBtn) {
      this.disableBtn = true;
      if (typeof callback == "function") {
        callback();
        setTimeout(() => (this.disableBtn = false), 1000);
      }
    }
  }
  judgeEvent(number) {
    let event = new CustomEvent(`judge${number}`);
    document
      .querySelectorAll(`.lane${number} .note`)
      .forEach((el) => el.dispatchEvent(event));
  }
}
class View {
  get showed() {
    return this.el.classList.contains("over-layer");
  }
  constructor(selector) {
    this.el = document.querySelector(selector);
  }
  show() {
    let outEl = document.querySelector(".over-layer");
    document
      .querySelectorAll(".view")
      .forEach((el) => el.classList.remove("over-layer", "under-layer"));
    if (this.el) this.el.classList.add("over-layer");
    if (outEl) outEl.classList.add("under-layer");

    let event = new CustomEvent("showView", {
      detail: { name: this.constructor.name },
    });
    document.dispatchEvent(event);
  }
}
class SubView {
  get showed() {
    return this.el.classList.contains("over-layer");
  }
  constructor(selector) {
    this.el = document.querySelector(selector);
  }
  show() {
    document
      .querySelectorAll(".subview")
      .forEach((el) => el.classList.remove("over-layer"));
    if (this.el) this.el.classList.add("over-layer");

    let event = new CustomEvent("showSubView", {
      detail: { name: this.constructor.name },
    });
    document.dispatchEvent(event);
  }
  hide() {
    this.el.classList.remove("over-layer");
  }
}
class LoadingView extends View {
  constructor() {
    super(".loading-view");
    this.reloadDialogEl = this.el.querySelector(".dialog-reload");
  }
  hide() {
    new TitleView().show();
  }
  fadeIn() {
    this.el.classList.add("fade");
  }
  showReloadDialog() {
    this.reloadDialogEl.classList.add("show");
  }
}
class TitleView extends View {
  constructor() {
    super(".title-view");
  }
}
class HowtoView extends View {
  constructor() {
    super(".howto-view");
  }
}
class SettingsView extends View {
  constructor() {
    super(".settings-view");
  }
}

class ChangeKeybindsView extends SubView {
  constructor() {
    super(".change-keybinds-view");
    this.rebindEl = document.querySelector(".change-menu");
    this.rebinding = false;
    this.buttons = document.querySelectorAll(".change-keybinds-keybinds > div");
    this.buttons.forEach((el, index) => {
      el.addEventListener("click", (e) => {
        if (this.rebinding) return;
        this.rebinding = true;
        this.rebindEl.classList.add("inline-block");
        const keyDownEvent = (e) => {
          const oldKeybinds = getKeybinds();
          oldKeybinds[index] = e.code;
          localStorage.setItem("keybinds", oldKeybinds);
          document.removeEventListener("keydown", keyDownEvent);
          this.refresh();
          this.rebindEl.classList.remove("inline-block");
          this.rebinding = false;
        }
        document.addEventListener("keydown", keyDownEvent);
      });
    });
    this.refresh();
  }
  refresh() {
    const keybinds = getKeybinds();
    this.buttons.forEach((el, index) => {
      el.children.item(0).innerText = visualizeKeyText(keybinds[index]);
    });
  }
}

class SelectView extends View {
  constructor() {
    super(".select-view");
    this.btnPlayEasyEl = document.querySelector(".btn-play-easy");
    this.btnPlayNormalEl = document.querySelector(".btn-play-normal");
    this.btnPlayHardEl = document.querySelector(".btn-play-hard");
  }
  reset() {
    this.showBtn("easy");
    this.showBtn("normal");
    this.showBtn("hard");
  }
  showBtn(mode) {
    switch (mode) {
      case "easy": {
        this.btnPlayEasyEl.style.display = "block";
        break;
      }
      case "normal": {
        this.btnPlayNormalEl.style.display = "block";
        break;
      }
      case "hard": {
        this.btnPlayHardEl.style.display = "block";
        break;
      }
    }
  }
  hideBtn(mode) {
    switch (mode) {
      case "easy": {
        this.btnPlayEasyEl.style.display = "none";
        break;
      }
      case "normal": {
        this.btnPlayNormalEl.style.display = "none";
        break;
      }
      case "hard": {
        this.btnPlayHardEl.style.display = "none";
        break;
      }
    }
  }
}
class PlayView extends View {
  get mode() {
    return this._mode;
  }
  set mode(value) {
    this._mode = value;
    this.el.dataset.mode = value;
  }
  constructor() {
    super(".play-view");
    this.endTextEl = this.el.querySelector(".end-text");
    this.scoreNumbersEl = this.el.querySelector(".score .numbers");
    this.comboEl = this.el.querySelector(".combo");
    this.comboNumbersEl = this.el.querySelector(".combo .numbers");
    this.comboGaugeEl = this.el.querySelector(".gauge");
    this.btnJudgeEls = this.el.querySelectorAll(".btn-judge > div");
    this.reloadDialogEl = this.el.querySelector(".dialog-reload");

    document.addEventListener("updateRecord", (e) => {
      let { name, value } = e.detail;
      if (name == "score") this.updateScore(value);
      if (name == "combo") this.updateCombo(value);
      if (name == "comboGauge") {
        this.updateComboGauge(value);
        this.updateComboEffect(value);
      }
    });
  }
  show() {
    this.reset();
    super.show();
    document.querySelectorAll("button").forEach((x) => x.blur());
  }
  reset() {
    for (let i = 1; i <= 5; i++)
      document
        .querySelectorAll(`.lane${i}`)
        .forEach((el) => (el.innerHTML = ""));
    const keybinds = getKeybinds();
    document
      .querySelectorAll(".btn-judge > div")
      .forEach((el, i) => (el.innerHTML = generateKeybindText(keybinds[i])));
    this.hideEndText();
  }
  showEndText() {
    this.endTextEl.classList.add("show");
  }
  hideEndText() {
    this.endTextEl.classList.remove("show");
  }
  showReloadDialog() {
    this.reloadDialogEl.classList.add("show");
  }
  updateScore(score) {
    let html = (score + "")
      .split("")
      .map((value) => `<div data-number="${value}"></div>`)
      .join("");
    this.scoreNumbersEl.innerHTML = html;
  }
  updateCombo(combo) {
    if (combo < COMBO_DISPLAY_COUNT) {
      this.comboEl.classList.remove("show");
    } else {
      let html = (combo + "")
        .split("")
        .map((value) => `<div data-number="${value}"></div>`)
        .join("");
      this.comboNumbersEl.innerHTML = html;
      this.comboEl.classList.add("show");
    }
  }
  updateComboGauge(comboGauge) {
    this.comboGaugeEl.style.clipPath = `inset(${100 - comboGauge}% 0 0 0)`;
  }
  updateComboEffect(comboGauge) {
    if (comboGauge <= 30) {
      this.el.dataset.comboGauge = 0;
    } else if (comboGauge <= 60) {
      this.el.dataset.comboGauge = 1;
    } else if (comboGauge <= 99) {
      this.el.dataset.comboGauge = 2;
    } else {
      this.el.dataset.comboGauge = 3;
    }
  }
}
class ResultView extends View {
  constructor(selector = ".result-view") {
    super(selector);
    this.scoreEl = this.el.querySelector(".score .numbers");
    this.comboEl = this.el.querySelector(".combo .numbers");

    document.addEventListener("updateRecord", (e) => {
      let { name, value } = e.detail;
      if (name == "score") this.updateScore(value);
      if (name == "maxCombo") this.updateMaxCombo(value);
    });
  }
  updateScore(value) {
    let html = (value + "")
      .split("")
      .map((value) => `<div data-number="${value}"></div>`)
      .join("");
    this.scoreEl.innerHTML = html;
  }
  updateMaxCombo(value) {
    let html = (value + "")
      .split("")
      .map((value) => `<div data-number="${value}"></div>`)
      .join("");
    this.comboEl.innerHTML = html;
  }
}
class LastResultView extends ResultView {
  constructor() {
    super(".last-result-view");
  }
}
class Lyrics {
  constructor(defaultY, increment) {
    this.el = document.querySelector(".lyrics-text");
    this.defaultY = defaultY;
    this.increment = increment;
    this.currentY = this.defaultY;
    this.reset();
  }
  reset() {
    this.currentY = this.defaultY;
    this.update();
  }
  next() {
    this.currentY += this.increment;
    this.update();
  }
  update() {
    this.el.style.backgroundPositionY = `${this.currentY}%`;
  }
}
class LyricsEasy extends Lyrics {
  constructor() {
    super(0, 2.94);
  }
}
class LyricsNormal extends Lyrics {
  constructor() {
    super(0, 6.66);
  }
}
class LyricsHard extends Lyrics {
  constructor() {
    super(0, 2.63);
  }
}
class JudgeBtn {
  constructor(el, index) {
    this.el = el;
    this.index = index;
    this.keybinds = getKeybinds();

    document.addEventListener("judged", (e) => {
      let { index, judge } = e.detail;
      if (index == this.index) this.effect(judge);
    });
    this.el.addEventListener("mousedown", () => this.onClick());
    this.el.addEventListener("touchstart", () => this.onClick());
  }
  effect(text) {
    let html = "";
    this.keybinds = getKeybinds();
    if (text != "miss") html += '<div class="judge-effect"></div>';
    html += `<div class="judge-text" data-text="${text}"></div>`;
    this.el.innerHTML = `${generateKeybindText(
      this.keybinds[this.index]
    )}${html}`;
  }
  onClick() {
    let event = new CustomEvent(`judge${this.index + 1}`);
    document
      .querySelectorAll(`.lane${this.index + 1} .note`)
      .forEach((el) => el.dispatchEvent(event));
  }
}
class NotesDataList {
  get waitTime() {
    if (this.notes[0]) {
      return this.notes[this.notes.length - 1].judgeData.waitTime * 1000;
    } else {
      return 2000;
    }
  }
  constructor(notesData, mode) {
    this.mode = mode;
    this.notes = notesData.notes.map((data) => new NotesData(data, this.mode));
    this.lyrics = [...notesData.lyrics];
    this.convert();
  }
  convert() {
    let currentTime = 0; // 処理を実行する時間

    this.convertedNotes = [];

    this.notes.forEach((data, i) => {
      let judgeData = data.judgeData;
      let beatCount = judgeData.moveToBeatCount - PLAY_WAIT_BEAT_COUNT;

      data.lanes.forEach((row, j) => {
        let cell = {
          time: currentTime,
          notes: [],
        };

        if (i != 0 || j == 0 || j >= beatCount) {
          this.convertedNotes.push(cell);
          currentTime += judgeData.beatSecond;
        } else {
          cell = this.convertedNotes[0];
        }

        row.forEach((value, k) => {
          if (k < 5 && value == 1) {
            let note = new Note(k, judgeData);
            if (i == 0 && j < beatCount) {
              note.top +=
                judgeData.distance * (1 - j / judgeData.moveToBeatCount) -
                judgeData.distance / judgeData.speedRate;
            }
            cell.notes.push(note);
          }
        });
      });
    });
  }
}
class NotesData {
  constructor(data, mode) {
    this.mode = mode;
    this.bpm = data.bpm;
    this.lanes = data.lanes;
    this.judgeData = new JudgeData(this.bpm, this.mode);
  }
}
class Note {
  // ノーツの中心Y座標
  get center() {
    return this.top + this.el.clientHeight / 2;
  }
  // @param [Number] index レーンのインデックス
  // @param [JudgeData] judgeData
  constructor(index, judgeData) {
    this.index = index;
    this.judgeData = judgeData;
    this.judgeRange = this.judgeData.judgeRange;
    this.speed = this.judgeData.speed;
    this.top = this.judgeData.startY;
    this.endY = this.judgeData.endY;
    this.judged = false;
  }
  // Y座標をもとに判定
  // @return [String] perfect|good|miss
  judgement() {
    let y = this.center;

    // 判定済み or 判定エリアに達していない
    if (this.judged || this.judgeRange.miss.min > y) return this._judgement;

    this.judged = true;

    // 判定エリア内
    if (this.judgeRange.miss.max >= y) {
      if (
        this.judgeRange.perfect.min <= y &&
        this.judgeRange.perfect.max >= y
      ) {
        this._judgement = "perfect";
      } else if (
        this.judgeRange.good.min <= y &&
        this.judgeRange.good.max >= y
      ) {
        this._judgement = "good";
      } else {
        this._judgement = "miss";
      }
    }
    // 判定エリア外
    else {
      this._judgement = "miss";
    }
    return this._judgement;
  }
  // 位置を更新
  move() {
    this.el.style.transform = `translate3d(-50%, ${this.top}px, 0)`;
  }
  append() {
    // Elementを追加
    this.el = document.createElement("div");
    this.el.classList.add("note");
    document.querySelector(`.lane${this.index + 1}`).appendChild(this.el);

    let renderEvent = (e) => this.onRender(e);
    let judgeEvent = () => this.onJudge();

    this.move(); // 初期位置に移動
    this.el.addEventListener("render", renderEvent);
    this.el.addEventListener(`judge${this.index + 1}`, judgeEvent);

    this.removeEvent = () => {
      this.el.removeEventListener("render", renderEvent);
      this.el.removeEventListener(`judge${this.index + 1}`, judgeEvent);
    };
  }
  // Elementを削除
  remove() {
    this.el.parentElement.removeChild(this.el);
    this.removeEvent();
  }
  onRender(e) {
    let y = this.center;
    if (this.top >= this.endY) {
      this.remove();
    } else {
      // 位置を更新
      this.top = this.top + this.speed * e.detail.delta;
      this.move();
      // 判定範囲を超えたらmiss判定
      if (!this.judged && this.judgeRange.miss.max < y) {
        this.fireEvent();
      }
    }
  }
  onJudge() {
    if (this.judgement()) {
      if (this.judgement() != "miss") this.remove();
      this.fireEvent();
    }
  }
  fireEvent() {
    let event = new CustomEvent("judged", {
      detail: { index: this.index, judge: this.judgement() },
    });
    document.dispatchEvent(event);
  }
}
// スコアやコンボを管理
class RecordData {
  get score() {
    return this._score || 0;
  }
  set score(value) {
    this._score = value;
    this.fireEvent("score", value);
  }
  get combo() {
    return this._combo || 0;
  }
  set combo(value) {
    this._combo = value;
    this.fireEvent("combo", value);
  }
  get maxCombo() {
    return this._maxCombo || 0;
  }
  set maxCombo(value) {
    this._maxCombo = value;
    this.fireEvent("maxCombo", value);
  }
  get comboGauge() {
    return this._comboGauge || 0;
  }
  set comboGauge(value) {
    this._comboGauge = value;
    this.fireEvent("comboGauge", value);
  }
  // 判定に合わせて各種数値を更新
  // @param [String] judge (perfect|good|miss)
  update(judge) {
    switch (judge) {
      case "perfect":
        this.score += SCORE.PERFECT;
        this.combo += 1;
        this.comboGauge = Math.min(this.comboGauge + COMBO_GAUGE.PERFECT, 100);
        this.maxCombo = Math.max(this.combo, this.maxCombo);
        break;
      case "good":
        this.score += SCORE.GOOD;
        this.combo += 1;
        this.comboGauge = Math.min(this.comboGauge + COMBO_GAUGE.GOOD, 100);
        this.maxCombo = Math.max(this.combo, this.maxCombo);
        break;
      case "miss":
        this.score += SCORE.MISS;
        this.combo = 0;
        this.comboGauge = Math.max(this.comboGauge + COMBO_GAUGE.MISS, 0);
        break;
    }
  }
  // 各種数値をリセット
  reset() {
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.comboGauge = 0;
  }
  // 各種数値が更新された時にイベントを発火
  fireEvent(name, value) {
    let event = new CustomEvent("updateRecord", {
      detail: { name: name, value: value },
    });
    document.dispatchEvent(event);
  }
}
// 判定やノーツの動きに必要な各種数値を管理
class JudgeData {
  constructor(bpm, mode) {
    const containerEl = document.querySelector(".container");
    const lanesEl = document.querySelector(".lanes");
    const judgeAreaEl = document.querySelector(".judge-area");

    this.mode = mode;
    this.bpm = bpm;

    // ノーツを作成するY座標
    this.startY = -containerEl.clientHeight * 0.2;
    // ノーツを削除するY座標
    this.endY = lanesEl.clientHeight + Math.abs(this.startY);

    // 判定ライン(Y座標)
    let style = window.getComputedStyle(judgeAreaEl);
    let bottom = Number(style.getPropertyValue("bottom").replace("px", ""));
    let height = Number(style.getPropertyValue("height").replace("px", ""));
    this.judgeLine = lanesEl.clientHeight - (bottom + height / 2);

    // 初期座標から判定ラインまでの距離
    this.distance = Math.abs(this.startY) + Math.abs(this.judgeLine);

    // 判定範囲
    this.judgeRange = {
      perfect: {
        min: this.judgeLine - (height * JUDGE.PERFECT) / 2,
        max: this.judgeLine + (height * JUDGE.PERFECT) / 2,
      },
      good: {
        min: this.judgeLine - (height * JUDGE.GOOD) / 2,
        max: this.judgeLine + (height * JUDGE.GOOD) / 2,
      },
      miss: {
        min: this.judgeLine - (height * JUDGE.MISS) / 2,
        max: this.judgeLine + (height * JUDGE.MISS) / 2,
      },
    };

    // スピード係数
    this.speedRate = SPEED_RATE[this.mode.toUpperCase()];

    // 1小節の秒数
    this.barSecond = (60 / this.bpm) * 4;
    // 1拍の秒数
    this.beatSecond = this.barSecond / BEAT_PER_BAR;
    // ノーツが判定ラインに移動するまでの拍数
    this.moveToBeatCount = BEAT_PER_BAR * this.speedRate;
    // 最後のノーツを生成してから「演奏終了」を表示するまでの時間（秒）
    this.waitTime = this.barSecond * (this.speedRate + 1);
    // ノーツの流れる速度(秒)
    this.speed = this.distance / (this.barSecond * this.speedRate);

    this.showJudgeArea();
  }
  showJudgeArea() {
    document.querySelector(
      ".judge-area-perfect"
    ).style.top = `${this.judgeRange.perfect.min}px`;
    document.querySelector(".judge-area-perfect").style.height = `${
      this.judgeRange.perfect.max - this.judgeRange.perfect.min
    }px`;
    document.querySelector(
      ".judge-area-good"
    ).style.top = `${this.judgeRange.good.min}px`;
    document.querySelector(".judge-area-good").style.height = `${
      this.judgeRange.good.max - this.judgeRange.good.min
    }px`;
    document.querySelector(
      ".judge-area-miss"
    ).style.top = `${this.judgeRange.miss.min}px`;
    document.querySelector(".judge-area-miss").style.height = `${
      this.judgeRange.miss.max - this.judgeRange.miss.min
    }px`;
  }
}
class Sound {
  get duration() {
    return this.buffer.duration;
  }
  // @param [String] src
  // @param [Object] options loop,volumeのみ
  constructor(src, options = {}) {
    this.context = new (window.AudioContext || window.webkitAudioContext)();
    this.buffer = null;
    this.options = options;
    this.onEnded = this.options.onEnded;
    this.playing = false;
    this.paused = false;

    (async () => {
      const response = await fetch(src);
      const responseBuffer = await response.arrayBuffer();
      this.context.decodeAudioData(
        responseBuffer,
        (buffer) => (this.buffer = buffer)
      );
    })();
  }
  prepare() {
    // source -> gainNode -> context の順に接続
    this.source = this.context.createBufferSource();
    this.source.buffer = this.buffer;
    this.gainNode = this.context.createGain();
    this.source.connect(this.gainNode);
    this.gainNode.connect(this.context.destination);
    if (typeof this.options.loop == "boolean") this.loop(this.options.loop);
    if (typeof this.options.volume == "number")
      this.volume(this.options.volume);
    if (typeof this.onEnded == "function") this.source.onended = this.onEnded;
  }
  // 最初から再生
  play() {
    this.prepare();
    this.source.start(0);
    this.playing = true;
  }
  pause() {
    this.source.stop();
    this.playing = false;
  }
  playPause() {
    if (this.playing) {
      if (this.paused) {
        this.context.resume();
        this.paused = false;
      } else {
        this.context.suspend();
        this.paused = true;
      }
    }
  }
  loop(value) {
    this.options.loop = value;
    this.source.loop = value;
  }
  volume(value) {
    this.options.volume = value;
    this.gainNode.gain.value = value;
  }
}

function init() {
  gameController = new GameController();

  var image = new Image();
  image.onload = () => {
    let loadingView = new LoadingView();
    loadingView.fadeIn();
    Promise.all(
      [
        "img/bg_howto.png",
        "img/bg_last_result.png",
        "img/bg_play_easy.png",
        "img/bg_play_hard.png",
        "img/bg_play_normal.png",
        "img/bg_reload.png",
        "img/bg_result.png",
        "img/bg_select.png",
        "img/bg_title.png",
        "img/btn_judge.png",
        "img/btn_mode.png",
        "img/btns.png",
        "img/combo_gauge.png",
        "img/combo.png",
        "img/end_text.png",
        "img/judge_effect.png",
        "img/judge_text.png",
        "img/light_top.png",
        "img/light_under.png",
        "img/lyrics_easy.png",
        "img/lyrics_hard.png",
        "img/lyrics_normal.png",
        "img/numbers.png",
        "img/orchestra_lower.png",
        "img/orchestra_middle.png",
        "img/orchestra_upper.png",
        "img/score.png",
      ].map((src) => {
        return new Promise((resolve, reject) => {
          var image = new Image();
          image.onload = () => resolve();
          image.onerror = () => reject();
          image.src = src;
        });
      })
    )
      .then(() => {
        setTimeout(() => loadingView.hide(), 2000);
      })
      .catch(() => {
        loadingView.showReloadDialog();
      });
  };
  image.src = "img/loading_text.png";

  var inner = document.querySelector(".container > .inner");
  var imgAspect = 1920 / 1080; // 背景画像のアスペクト
  var resizeAction = () => {
    var aspect = window.innerHeight / window.innerWidth;

    // 縦長
    if (imgAspect < aspect) {
      inner.style.width = "100%";
      inner.style.height = `${window.innerWidth * imgAspect}px`;
    }
    // 横長
    else {
      inner.style.width = `${window.innerHeight / imgAspect}px`;
      inner.style.height = "100%";
    }

    inner.style.display = "flex";

    var playView = document.querySelector(".play-view");
    playView.style.perspective = `${inner.clientWidth * 0.4688}px`;
  };
  resizeAction();
  window.addEventListener("resize", resizeAction);
}

window.addEventListener("DOMContentLoaded", init);

document.addEventListener("dblclick", (e) => e.preventDefault(), {
  passive: false,
});
document.addEventListener(
  "touchmove",
  (e) => {
    if (e.touches.length >= 2) e.preventDefault();
  },
  { passive: false }
);
