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
    65: 3, // A
  };

  // Respond to direction keys
  document.addEventListener("keydown", function (event) {
    var modifiers =
      event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
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

  // 录像按钮
  this.bindButtonPress(".export-replay-button", this.exportReplay);
  this.bindButtonPress(".import-replay-button", this.importReplay);

  // 网格单元格点击事件
  this.bindGridCellClicks();

  // Respond to swipe events
  var touchStartClientX, touchStartClientY;
  var gameContainer = document.getElementsByClassName("game-container")[0];

  gameContainer.addEventListener(
    this.eventTouchstart,
    function (event) {
      if (
        (!window.navigator.msPointerEnabled && event.touches.length > 1) ||
        event.targetTouches.length > 1
      ) {
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
    },
    {passive: false}
  );

  gameContainer.addEventListener(
    this.eventTouchmove,
    function (event) {
      // 阻止默认行为，防止页面滚动
      event.preventDefault();
      event.stopPropagation();
    },
    {passive: false}
  );

  gameContainer.addEventListener(
    this.eventTouchend,
    function (event) {
      if (
        (!window.navigator.msPointerEnabled && event.touches.length > 0) ||
        event.targetTouches.length > 0
      ) {
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
        self.emit("move", absDx > absDy ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0);
      }

      // 阻止默认行为，防止页面滚动
      event.preventDefault();
      event.stopPropagation();
    },
    {passive: false}
  );

  // 监听AI事件
  this.on(
    "aiPlay",
    function () {
      // 只处理游戏管理器的AI播放逻辑，不再触发aiPlay事件
      this.emit("aiPlayExecute");
    }.bind(this)
  );

  this.on(
    "aiStep",
    function () {
      // 只处理游戏管理器的AI单步逻辑，不再触发aiStep事件
      this.emit("aiStepExecute");
    }.bind(this)
  );

  this.on(
    "aiSimulate",
    function () {
      // 只处理游戏管理器的AI模拟决策逻辑，不再触发aiSimulate事件
      this.emit("aiSimulateExecute");
    }.bind(this)
  );

  this.on(
    "showScore",
    function () {
      // 只处理显示评分面板逻辑，不再触发showScore事件
      this.emit("showScoreExecute");
    }.bind(this)
  );
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

// Show score panel button
KeyboardInputManager.prototype.showScorePanel = function (event) {
  if (event) {
    event.preventDefault();
  }
  this.emit("showScore");
};

// 导出录像
KeyboardInputManager.prototype.exportReplay = function (event) {
  if (event) {
    event.preventDefault();
  }
  this.emit("exportReplay");
};

// 导入录像
KeyboardInputManager.prototype.importReplay = function (event) {
  if (event) {
    event.preventDefault();
  }
  this.emit("importReplay");
};

KeyboardInputManager.prototype.bindButtonPress = function (selector, fn) {
  var button = document.querySelector(selector);
  if (button) {
    // 为需要确认的按钮添加确认对话框
    if (
      selector === ".restart-button" ||
      selector === ".retry-button" ||
      selector === ".ai-play-button" ||
      selector === ".ai-step-button" ||
      selector === ".export-replay-button"
    ) {
      button.addEventListener(
        "click",
        function (event) {
          event.preventDefault();

          // 获取当前语言
          var currentLang = window.I18n
            ? window.I18n.getCurrentLanguage()
            : "zh";

          // 根据按钮类型设置确认信息
          var confirmMessage = "";
          if (selector === ".restart-button" || selector === ".retry-button") {
            confirmMessage =
              currentLang === "zh"
                ? "确定要开始新游戏吗？当前游戏进度将自动保存。"
                : "Start a new game? Current progress will be automatically saved.";
          } else if (selector === ".ai-play-button") {
            // 判断AI是否正在运行
            var aiRunning =
              window.gameManager && window.gameManager.aiIsRunning;
            if (aiRunning) {
              // 如果AI正在运行，直接停止不需要确认
              fn.call(this, event);
              return;
            }
            confirmMessage =
              currentLang === "zh"
                ? "确定要启动AI自动模式吗？"
                : "Start AI auto mode?";
          } else if (selector === ".ai-step-button") {
            confirmMessage =
              currentLang === "zh"
                ? "确定要执行AI单步操作吗？"
                : "Execute a single AI step?";
          } else if (selector === ".export-replay-button") {
            confirmMessage =
              currentLang === "zh"
                ? "确定要导出当前游戏录像吗？"
                : "Export current game replay?";
          }

          if (confirm(confirmMessage)) {
            fn.call(this, event);
          }
        }.bind(this)
      );

      button.addEventListener(
        this.eventTouchend,
        function (event) {
          // 触摸事件的处理与点击相同
          event.preventDefault();

          var currentLang = window.I18n
            ? window.I18n.getCurrentLanguage()
            : "zh";

          var confirmMessage = "";
          if (selector === ".restart-button" || selector === ".retry-button") {
            confirmMessage =
              currentLang === "zh"
                ? "确定要开始新游戏吗？当前游戏进度将自动保存。"
                : "Start a new game? Current progress will be automatically saved.";
          } else if (selector === ".ai-play-button") {
            var aiRunning =
              window.gameManager && window.gameManager.aiIsRunning;
            if (aiRunning) {
              fn.call(this, event);
              return;
            }
            confirmMessage =
              currentLang === "zh"
                ? "确定要启动AI自动模式吗？"
                : "Start AI auto mode?";
          } else if (selector === ".ai-step-button") {
            confirmMessage =
              currentLang === "zh"
                ? "确定要执行AI单步操作吗？"
                : "Execute a single AI step?";
          } else if (selector === ".export-replay-button") {
            confirmMessage =
              currentLang === "zh"
                ? "确定要导出当前游戏录像吗？"
                : "Export current game replay?";
          }

          if (confirm(confirmMessage)) {
            fn.call(this, event);
          }
        }.bind(this)
      );
    } else {
      // 其他按钮保持原样
      button.addEventListener("click", fn.bind(this));
      button.addEventListener(this.eventTouchend, fn.bind(this));
    }
  }
};

// 绑定网格单元格点击事件
KeyboardInputManager.prototype.bindGridCellClicks = function () {
  var self = this;
  var gridCells = document.querySelectorAll(".grid-cell");

  gridCells.forEach(function (cell) {
    var clickCount = 0;
    var clickTimer = null;

    cell.addEventListener("click", function (event) {
      event.preventDefault();

      var x = parseInt(this.getAttribute("data-x"));
      var y = parseInt(this.getAttribute("data-y"));

      clickCount++;

      if (clickCount === 1) {
        // 第一次点击，设置延迟执行单击事件
        clickTimer = setTimeout(function () {
          // 确认只有一次点击，执行单击逻辑
          if (clickCount === 1) {
            self.emit("cellClick", {x: x, y: y});
          }
          // 重置计数器
          clickCount = 0;
        }, 400);
      } else if (clickCount === 2) {
        // 第二次点击，取消单击定时器并执行双击逻辑
        if (clickTimer) {
          clearTimeout(clickTimer);
          clickTimer = null;
        }

        // 执行双击逻辑
        self.emit("cellDoubleClick", {x: x, y: y});

        // 重置计数器
        clickCount = 0;
      }
    });

    // 处理触摸事件
    cell.addEventListener(self.eventTouchend, function (event) {
      event.preventDefault();
      var x = parseInt(this.getAttribute("data-x"));
      var y = parseInt(this.getAttribute("data-y"));
      self.emit("cellClick", {x: x, y: y});
    });
  });
};

// 导出KeyboardInputManager类
export {KeyboardInputManager};
