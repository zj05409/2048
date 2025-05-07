function KeyboardInputManager() {
  this.events = {};

  if (window.navigator.msPointerEnabled) {
    //Internet Explorer 10 style
    this.eventTouchstart = "MSPointerDown";
    this.eventTouchmove = "MSPointerMove";
    this.eventTouchend = "MSPointerUp";
  } else {
    this.eventTouchstart = "touchstart";
    this.eventTouchmove = "touchmove";
    this.eventTouchend = "touchend";
  }

  this.listen();
}

KeyboardInputManager.prototype.on = function (event, callback) {
  if (!this.events[event]) {
    this.events[event] = [];
  }
  this.events[event].push(callback);
};

KeyboardInputManager.prototype.emit = function (event, data) {
  var callbacks = this.events[event];
  if (callbacks) {
    callbacks.forEach(function (callback) {
      callback(data);
    });
  }
};

KeyboardInputManager.prototype.listen = function () {
  var self = this;

  var map = {
    38: 0, // Up
    39: 1, // Right
    40: 2, // Down
    37: 3, // Left
    75: 0, // Vim up
    76: 1, // Vim right
    74: 2, // Vim down
    72: 3, // Vim left
    87: 0, // W
    68: 1, // D
    83: 2, // S
    65: 3  // A
  };

  // Respond to direction keys
  document.addEventListener("keydown", function (event) {
    var modifiers = event.altKey || event.ctrlKey || event.metaKey ||
      event.shiftKey;
    var mapped = map[event.which];

    if (!modifiers) {
      if (mapped !== undefined) {
        event.preventDefault();
        self.emit("move", mapped);
      }
    }

    // R key restarts the game
    if (!modifiers && event.which === 82) {
      self.restart.call(self, event);
    }

    // U key for undo
    if (!modifiers && event.which === 85) {
      self.undo.call(self, event);
    }

    // Ctrl+Z for undo
    if ((event.ctrlKey || event.metaKey) && event.which === 90) {
      event.preventDefault();
      self.undo.call(self, event);
    }

    // S key for save
    if (modifiers && event.which === 83 && event.ctrlKey) {
      event.preventDefault();
      self.save.call(self, event);
    }

    // L key for load
    if (modifiers && event.which === 76 && event.ctrlKey) {
      event.preventDefault();
      self.load.call(self, event);
    }
  });

  // Respond to button presses
  this.bindButtonPress(".retry-button", this.restart);
  this.bindButtonPress(".restart-button", this.restart);
  this.bindButtonPress(".keep-playing-button", this.keepPlaying);
  this.bindButtonPress(".undo-button", this.undo);
  this.bindButtonPress(".save-button", this.save);
  this.bindButtonPress(".load-button", this.load);

  // AI buttons
  this.bindButtonPress(".ai-play-button", this.aiPlay);
  this.bindButtonPress(".ai-step-button", this.aiStep);
  this.bindButtonPress(".ai-simulate-button", this.aiSimulate);
  this.bindButtonPress(".show-score-button", this.showScorePanel);

  // Respond to swipe events
  var touchStartClientX, touchStartClientY;
  var gameContainer = document.getElementsByClassName("game-container")[0];

  gameContainer.addEventListener(this.eventTouchstart, function (event) {
    if ((!window.navigator.msPointerEnabled && event.touches.length > 1) ||
      event.targetTouches.length > 1) {
      return; // Ignore if touching with more than 1 finger
    }

    if (window.navigator.msPointerEnabled) {
      touchStartClientX = event.pageX;
      touchStartClientY = event.pageY;
    } else {
      touchStartClientX = event.touches[0].clientX;
      touchStartClientY = event.touches[0].clientY;
    }

    // 阻止默认行为，防止页面滚动
    event.preventDefault();
    event.stopPropagation();
  }, { passive: false });

  gameContainer.addEventListener(this.eventTouchmove, function (event) {
    // 阻止默认行为，防止页面滚动
    event.preventDefault();
    event.stopPropagation();
  }, { passive: false });

  gameContainer.addEventListener(this.eventTouchend, function (event) {
    if ((!window.navigator.msPointerEnabled && event.touches.length > 0) ||
      event.targetTouches.length > 0) {
      return; // Ignore if still touching with one or more fingers
    }

    var touchEndClientX, touchEndClientY;

    if (window.navigator.msPointerEnabled) {
      touchEndClientX = event.pageX;
      touchEndClientY = event.pageY;
    } else {
      touchEndClientX = event.changedTouches[0].clientX;
      touchEndClientY = event.changedTouches[0].clientY;
    }

    var dx = touchEndClientX - touchStartClientX;
    var absDx = Math.abs(dx);

    var dy = touchEndClientY - touchStartClientY;
    var absDy = Math.abs(dy);

    if (Math.max(absDx, absDy) > 10) {
      // (right : left) : (down : up)
      self.emit("move", absDx > absDy ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0));
    }

    // 阻止默认行为，防止页面滚动
    event.preventDefault();
    event.stopPropagation();
  }, { passive: false });

  // 监听AI事件
  this.on("aiPlay", function () {
    // 只处理游戏管理器的AI播放逻辑，不再触发aiPlay事件
    this.emit("aiPlayExecute");
  }.bind(this));

  this.on("aiStep", function () {
    // 只处理游戏管理器的AI单步逻辑，不再触发aiStep事件
    this.emit("aiStepExecute");
  }.bind(this));

  this.on("aiSimulate", function () {
    // 只处理游戏管理器的AI模拟决策逻辑，不再触发aiSimulate事件
    this.emit("aiSimulateExecute");
  }.bind(this));

  this.on("showScore", function () {
    // 只处理显示评分面板逻辑，不再触发showScore事件
    this.emit("showScoreExecute");
  }.bind(this));
};

KeyboardInputManager.prototype.restart = function (event) {
  event.preventDefault();
  this.emit("restart");
};

KeyboardInputManager.prototype.keepPlaying = function (event) {
  event.preventDefault();
  this.emit("keepPlaying");
};

// 撤销功能
KeyboardInputManager.prototype.undo = function (event) {
  event.preventDefault();
  this.emit("undo");
};

// 存档功能
KeyboardInputManager.prototype.save = function (event) {
  event.preventDefault();
  this.emit("save");
};

// 读档功能
KeyboardInputManager.prototype.load = function (event) {
  event.preventDefault();
  this.emit("load");
};

// AI play button
KeyboardInputManager.prototype.aiPlay = function (event) {
  if (event) {
    event.preventDefault();
  }
  this.emit("aiPlay");
};

// AI step button
KeyboardInputManager.prototype.aiStep = function (event) {
  if (event) {
    event.preventDefault();
  }
  this.emit("aiStep");
};

// AI simulate button
KeyboardInputManager.prototype.aiSimulate = function (event) {
  if (event) {
    event.preventDefault();
  }
  this.emit("aiSimulate");
};

KeyboardInputManager.prototype.bindButtonPress = function (selector, fn) {
  var button = document.querySelector(selector);
  if (button) {
    button.addEventListener("click", fn.bind(this));
    button.addEventListener(this.eventTouchend, fn.bind(this));
  }
};

// Show score panel button
KeyboardInputManager.prototype.showScorePanel = function (event) {
  if (event) {
    event.preventDefault();
  }
  this.emit("showScore");
};
