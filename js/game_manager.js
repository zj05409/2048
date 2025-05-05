function GameManager(size, InputManager, Actuator, StorageManager) {
  this.size = size; // Size of the grid
  this.inputManager = new InputManager;
  this.storageManager = new StorageManager;
  this.actuator = new Actuator;

  this.startTiles = 2;

  // AI相关属性
  this.aiIsRunning = false;
  this.aiDelay = 500; // 每步AI移动的延迟时间（毫秒）
  this.aiTimerId = null;

  // 添加历史记录，用于撤销功能
  this.history = [];
  this.maxHistory = 10; // 最多保存10步

  this.inputManager.on("move", this.move.bind(this));
  this.inputManager.on("restart", this.restart.bind(this));
  this.inputManager.on("keepPlaying", this.keepPlaying.bind(this));
  this.inputManager.on("undo", this.undo.bind(this)); // 监听撤销事件

  // 监听存档相关事件
  this.inputManager.on("save", this.showSaveDialog.bind(this));
  this.inputManager.on("load", this.showLoadDialog.bind(this));

  // 监听AI事件
  this.inputManager.on("aiPlay", this.aiPlay.bind(this));
  this.inputManager.on("aiStep", this.aiStep.bind(this));

  this.setup();
}

// Restart the game
GameManager.prototype.restart = function () {
  this.storageManager.clearGameState();
  this.actuator.continueGame(); // Clear the game won/lost message
  this.history = []; // 清空历史记录
  this.setup();
};

// Keep playing after winning (allows going over 2048)
GameManager.prototype.keepPlaying = function () {
  this.keepPlaying = true;
  this.actuator.continueGame(); // Clear the game won/lost message
};

// Return true if the game is lost, or has won and the user hasn't kept playing
GameManager.prototype.isGameTerminated = function () {
  // 如果AI在运行，即使赢了游戏也不终止
  if (this.aiIsRunning && this.won && !this.over) {
    return false;
  }
  return this.over || (this.won && !this.keepPlaying);
};

// 保存当前游戏状态到历史记录
GameManager.prototype.saveToHistory = function () {
  var gameState = this.serialize();

  // 深拷贝以确保历史状态不会被当前状态影响
  var historyCopy = JSON.parse(JSON.stringify(gameState));

  this.history.push(historyCopy);

  // 限制历史记录长度
  if (this.history.length > this.maxHistory) {
    this.history.shift();
  }
};

// 撤销到上一步
GameManager.prototype.undo = function () {
  if (this.history.length === 0) {
    return; // 没有历史记录可撤销
  }

  // 恢复到上一个状态
  var previousState = this.history.pop();

  // 恢复游戏状态
  this.grid = new Grid(previousState.grid.size, previousState.grid.cells);
  this.score = previousState.score;
  this.over = previousState.over;
  this.won = previousState.won;
  this.keepPlaying = previousState.keepPlaying;

  // 更新界面
  this.actuate();
};

// Set up the game
GameManager.prototype.setup = function () {
  var previousState = this.storageManager.getGameState();

  // Reload the game from a previous game if present
  if (previousState) {
    this.grid = new Grid(previousState.grid.size,
      previousState.grid.cells); // Reload grid
    this.score = previousState.score;
    this.over = previousState.over;
    this.won = previousState.won;
    this.keepPlaying = previousState.keepPlaying;
  } else {
    this.grid = new Grid(this.size);
    this.score = 0;
    this.over = false;
    this.won = false;
    this.keepPlaying = false;

    // Add the initial tiles
    this.addStartTiles();
  }

  // Update the actuator
  this.actuate();
};

// Set up the initial tiles to start the game with
GameManager.prototype.addStartTiles = function () {
  for (var i = 0; i < this.startTiles; i++) {
    this.addRandomTile();
  }
};

// Adds a tile in a random position
GameManager.prototype.addRandomTile = function () {
  if (this.grid.cellsAvailable()) {
    var value = Math.random() < 0.9 ? 2 : 4;
    var tile = new Tile(this.grid.randomAvailableCell(), value);

    this.grid.insertTile(tile);
  }
};

// Sends the updated grid to the actuator
GameManager.prototype.actuate = function () {
  if (this.storageManager.getBestScore() < this.score) {
    this.storageManager.setBestScore(this.score);
  }

  // Clear the state when the game is over (game over only, not win)
  if (this.over) {
    this.storageManager.clearGameState();
  } else {
    this.storageManager.setGameState(this.serialize());
  }

  this.actuator.actuate(this.grid, {
    score: this.score,
    over: this.over,
    won: this.won,
    bestScore: this.storageManager.getBestScore(),
    terminated: this.isGameTerminated()
  });

};

// Represent the current game as an object
GameManager.prototype.serialize = function () {
  return {
    grid: this.grid.serialize(),
    score: this.score,
    over: this.over,
    won: this.won,
    keepPlaying: this.keepPlaying
  };
};

// Save all tile positions and remove merger info
GameManager.prototype.prepareTiles = function () {
  this.grid.eachCell(function (x, y, tile) {
    if (tile) {
      tile.mergedFrom = null;
      tile.savePosition();
    }
  });
};

// Move a tile and its representation
GameManager.prototype.moveTile = function (tile, cell) {
  this.grid.cells[tile.x][tile.y] = null;
  this.grid.cells[cell.x][cell.y] = tile;
  tile.updatePosition(cell);
};

// Move tiles on the grid in the specified direction
GameManager.prototype.move = function (direction) {
  // 0: up, 1: right, 2: down, 3: left
  var self = this;

  if (this.isGameTerminated()) return; // Don't do anything if the game's over

  // 在移动前保存当前状态到历史记录
  this.saveToHistory();

  var cell, tile;

  var vector = this.getVector(direction);
  var traversals = this.buildTraversals(vector);
  var moved = false;

  // Save the current tile positions and remove merger information
  this.prepareTiles();

  // Traverse the grid in the right direction and move tiles
  traversals.x.forEach(function (x) {
    traversals.y.forEach(function (y) {
      cell = { x: x, y: y };
      tile = self.grid.cellContent(cell);

      if (tile) {
        var positions = self.findFarthestPosition(cell, vector);
        var next = self.grid.cellContent(positions.next);

        // Only one merger per row traversal?
        if (next && next.value === tile.value && !next.mergedFrom) {
          var merged = new Tile(positions.next, tile.value * 2);
          merged.mergedFrom = [tile, next];

          self.grid.insertTile(merged);
          self.grid.removeTile(tile);

          // Converge the two tiles' positions
          tile.updatePosition(positions.next);

          // Update the score
          self.score += merged.value;

          // The mighty 2048 tile
          if (merged.value === 2048) {
            self.won = true;
            // 如果是AI模式，自动继续游戏
            if (self.aiIsRunning) {
              self.keepPlaying = true;
            }
          }
        } else {
          self.moveTile(tile, positions.farthest);
        }

        if (!self.positionsEqual(cell, tile)) {
          moved = true; // The tile moved from its original cell!
        }
      }
    });
  });

  if (moved) {
    this.addRandomTile();

    if (!this.movesAvailable()) {
      this.over = true; // Game over!
    }

    this.actuate();
  }
};

// Get the vector representing the chosen direction
GameManager.prototype.getVector = function (direction) {
  // Vectors representing tile movement
  var map = {
    0: { x: 0, y: -1 }, // Up
    1: { x: 1, y: 0 },  // Right
    2: { x: 0, y: 1 },  // Down
    3: { x: -1, y: 0 }   // Left
  };

  return map[direction];
};

// Build a list of positions to traverse in the right order
GameManager.prototype.buildTraversals = function (vector) {
  var traversals = { x: [], y: [] };

  for (var pos = 0; pos < this.size; pos++) {
    traversals.x.push(pos);
    traversals.y.push(pos);
  }

  // Always traverse from the farthest cell in the chosen direction
  if (vector.x === 1) traversals.x = traversals.x.reverse();
  if (vector.y === 1) traversals.y = traversals.y.reverse();

  return traversals;
};

GameManager.prototype.findFarthestPosition = function (cell, vector) {
  var previous;

  // Progress towards the vector direction until an obstacle is found
  do {
    previous = cell;
    cell = { x: previous.x + vector.x, y: previous.y + vector.y };
  } while (this.grid.withinBounds(cell) &&
    this.grid.cellAvailable(cell));

  return {
    farthest: previous,
    next: cell // Used to check if a merge is required
  };
};

GameManager.prototype.movesAvailable = function () {
  return this.grid.cellsAvailable() || this.tileMatchesAvailable();
};

// Check for available matches between tiles (more expensive check)
GameManager.prototype.tileMatchesAvailable = function () {
  var self = this;

  var tile;

  for (var x = 0; x < this.size; x++) {
    for (var y = 0; y < this.size; y++) {
      tile = this.grid.cellContent({ x: x, y: y });

      if (tile) {
        for (var direction = 0; direction < 4; direction++) {
          var vector = self.getVector(direction);
          var cell = { x: x + vector.x, y: y + vector.y };

          var other = self.grid.cellContent(cell);

          if (other && other.value === tile.value) {
            return true; // These two tiles can be merged
          }
        }
      }
    }
  }

  return false;
};

GameManager.prototype.positionsEqual = function (first, second) {
  return first.x === second.x && first.y === second.y;
};

// 将游戏网格转换为AI的Board格式
GameManager.prototype.getAIBoard = function () {
  var board = new Board();

  // 游戏中cells[x][y]：x是水平方向（列），y是垂直方向（行）
  // cells[0][0] cells[0][1] cells[0][2] cells[0][3]
  // cells[1][0] cells[1][1] cells[1][2] cells[1][3]
  // cells[2][0] cells[2][1] cells[2][2] cells[2][3]
  // cells[3][0] cells[3][1] cells[3][2] cells[3][3]

  // AI中board.grid[row][col]：row是垂直方向（行），col是水平方向（列）
  // grid[0][0] grid[0][1] grid[0][2] grid[0][3]
  // grid[1][0] grid[1][1] grid[1][2] grid[1][3]
  // grid[2][0] grid[2][1] grid[2][2] grid[2][3]
  // grid[3][0] grid[3][1] grid[3][2] grid[3][3]

  // 因此需要调整映射关系：游戏的x对应AI的col，游戏的y对应AI的row
  this.grid.eachCell(function (x, y, tile) {
    var value = tile ? tile.value : 0;
    board.set(y, x, value); // 正确的映射：y=row, x=col
  });

  return board;
};

// AI执行一步移动
GameManager.prototype.aiStep = function () {
  if (this.isGameTerminated()) return;

  // 在AI移动前保存当前状态
  this.saveToHistory();

  var aiBoard = this.getAIBoard();
  var ai = new AI2048();
  var bestMove = ai.getBestMove(aiBoard);

  if (bestMove !== -1) {
    // 将AI的移动方向映射到游戏的移动方向
    // AI: 0=上, 1=下, 2=左, 3=右
    // 游戏: 0=上, 1=右, 2=下, 3=左
    var moveMap = [0, 2, 3, 1]; // 映射关系
    var gameMove = moveMap[bestMove];

    // 执行AI计算出的最佳移动 - 不再调用saveToHistory
    // 因为move方法内已经会调用saveToHistory
    this.move(gameMove);
  }
};

// AI自动玩游戏
GameManager.prototype.aiPlay = function () {
  if (this.isGameTerminated()) return;

  // 切换AI运行状态
  this.aiIsRunning = !this.aiIsRunning;

  // 获取当前语言
  var currentLang = window.I18n ? window.I18n.getCurrentLanguage() : "zh";

  // 更新按钮文本
  var button = document.querySelector(".ai-play-button span");
  if (this.aiIsRunning) {
    button.textContent = currentLang === "zh" ? "停止" : "Stop";
    this.aiPlayNextStep();
  } else {
    // 使用i18n库的翻译
    if (window.I18n) {
      var translations = {
        "zh": "AI自动",
        "en": "AI Auto"
      };
      button.textContent = translations[currentLang];
    } else {
      button.textContent = "AI自动";
    }

    if (this.aiTimerId) {
      clearTimeout(this.aiTimerId);
      this.aiTimerId = null;
    }
  }
};

// AI执行下一步
GameManager.prototype.aiPlayNextStep = function () {
  // 如果AI运行，但游戏已赢，自动设置keepPlaying为true
  if (this.aiIsRunning && this.won && !this.keepPlaying) {
    this.keepPlaying = true;
  }

  if (!this.aiIsRunning || this.isGameTerminated()) {
    this.aiIsRunning = false;

    // 获取当前语言
    var currentLang = window.I18n ? window.I18n.getCurrentLanguage() : "zh";

    // 根据当前语言设置按钮文本
    var buttonText = currentLang === "zh" ? "AI自动" : "AI Auto";
    document.querySelector(".ai-play-button span").textContent = buttonText;

    return;
  }

  // AI执行一步移动
  this.aiStep();

  // 设置下一步的计时器
  var self = this;
  this.aiTimerId = setTimeout(function () {
    self.aiPlayNextStep();
  }, this.aiDelay);
};

// 添加保存游戏状态的方法
GameManager.prototype.saveCurrentGame = function (name) {
  if (!name || name.trim() === "") {
    // 如果没有提供名称，使用默认名称
    var date = new Date();
    name = "存档 " + date.toLocaleDateString() + " " + date.toLocaleTimeString();
  }

  var gameState = this.serialize();
  return this.storageManager.saveGameWithName(gameState, name);
};

// 加载指定的存档
GameManager.prototype.loadSavedGame = function (id) {
  var savedState = this.storageManager.loadSavedGame(id);

  if (savedState) {
    this.grid = new Grid(savedState.grid.size, savedState.grid.cells);
    this.score = savedState.score;
    this.over = savedState.over;
    this.won = savedState.won;
    this.keepPlaying = savedState.keepPlaying;

    // 清空历史记录
    this.history = [];

    // 更新界面
    this.actuate();
    return true;
  }

  return false;
};

// 获取所有存档
GameManager.prototype.getSavedGames = function () {
  return this.storageManager.getSavedGames();
};

// 删除指定存档
GameManager.prototype.deleteSavedGame = function (id) {
  return this.storageManager.deleteSavedGame(id);
};

// 显示存档对话框
GameManager.prototype.showSaveDialog = function () {
  var self = this;

  // 获取当前语言
  var currentLang = window.I18n ? window.I18n.getCurrentLanguage() : "zh";

  // 创建对话框
  var overlay = document.createElement("div");
  overlay.className = "game-overlay";

  var dialog = document.createElement("div");
  dialog.className = "game-dialog";

  // 对话框标题
  var title = document.createElement("h3");
  title.textContent = currentLang === "zh" ? "保存游戏" : "Save Game";

  // 输入框
  var inputDiv = document.createElement("div");
  inputDiv.className = "input-group";

  var label = document.createElement("label");
  label.htmlFor = "save-name";
  label.textContent = currentLang === "zh" ? "存档名称：" : "Save Name:";

  var input = document.createElement("input");
  input.type = "text";
  input.id = "save-name";
  input.className = "save-input";

  // 默认存档名
  var date = new Date();
  input.value = (currentLang === "zh" ?
    "存档 " + date.toLocaleDateString() + " " + date.toLocaleTimeString() :
    "Save " + date.toLocaleDateString() + " " + date.toLocaleTimeString());

  // 按钮组
  var buttonGroup = document.createElement("div");
  buttonGroup.className = "dialog-buttons";

  var saveButton = document.createElement("button");
  saveButton.className = "dialog-button save-confirm";
  saveButton.textContent = currentLang === "zh" ? "保存" : "Save";

  var cancelButton = document.createElement("button");
  cancelButton.className = "dialog-button save-cancel";
  cancelButton.textContent = currentLang === "zh" ? "取消" : "Cancel";

  // 存档列表
  var savedGames = this.getSavedGames();
  if (savedGames.length > 0) {
    var existingTitle = document.createElement("h4");
    existingTitle.textContent = currentLang === "zh" ? "已有存档：" : "Existing Saves:";
    dialog.appendChild(existingTitle);

    var saveList = document.createElement("div");
    saveList.className = "save-list";

    savedGames.forEach(function (save) {
      var saveItem = document.createElement("div");
      saveItem.className = "save-item";

      var saveInfo = document.createElement("div");
      saveInfo.className = "save-info";
      saveInfo.textContent = save.name + " (" + new Date(save.timestamp).toLocaleString() + ")";

      saveItem.appendChild(saveInfo);
      saveList.appendChild(saveItem);
    });

    dialog.appendChild(saveList);
  }

  // 组装对话框
  inputDiv.appendChild(label);
  inputDiv.appendChild(input);

  buttonGroup.appendChild(saveButton);
  buttonGroup.appendChild(cancelButton);

  dialog.appendChild(title);
  dialog.appendChild(inputDiv);
  dialog.appendChild(buttonGroup);

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  // 设置焦点并选中文本
  input.focus();
  input.select();

  // 事件处理
  saveButton.addEventListener("click", function () {
    var saveName = input.value.trim();
    if (saveName === "") {
      saveName = currentLang === "zh" ? "未命名存档" : "Unnamed Save";
    }

    self.saveCurrentGame(saveName);
    document.body.removeChild(overlay);
  });

  cancelButton.addEventListener("click", function () {
    document.body.removeChild(overlay);
  });

  // 点击背景关闭对话框
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) {
      document.body.removeChild(overlay);
    }
  });

  // 按ESC键关闭对话框
  document.addEventListener("keydown", function escHandler(e) {
    if (e.keyCode === 27) { // ESC键
      document.body.removeChild(overlay);
      document.removeEventListener("keydown", escHandler);
    }
  });
};

// 显示读档对话框
GameManager.prototype.showLoadDialog = function () {
  var self = this;

  // 获取当前语言
  var currentLang = window.I18n ? window.I18n.getCurrentLanguage() : "zh";

  // 获取存档列表
  var savedGames = this.getSavedGames();

  // 如果没有存档，显示提示
  if (savedGames.length === 0) {
    alert(currentLang === "zh" ? "没有可用的存档！" : "No saves available!");
    return;
  }

  // 创建对话框
  var overlay = document.createElement("div");
  overlay.className = "game-overlay";

  var dialog = document.createElement("div");
  dialog.className = "game-dialog";

  // 对话框标题
  var title = document.createElement("h3");
  title.textContent = currentLang === "zh" ? "读取游戏" : "Load Game";
  dialog.appendChild(title);

  // 存档列表
  var saveList = document.createElement("div");
  saveList.className = "save-list";

  savedGames.forEach(function (save) {
    var saveItem = document.createElement("div");
    saveItem.className = "save-item";
    saveItem.setAttribute("data-id", save.id);

    var saveInfo = document.createElement("div");
    saveInfo.className = "save-info";

    // 显示存档名称、最大分数和保存时间
    var dateStr = new Date(save.timestamp).toLocaleString();
    var maxScoreStr = currentLang === "zh" ? "最大方块: " : "Max Tile: ";
    saveInfo.textContent = save.name + " (" + maxScoreStr + save.maxScore + ", " + dateStr + ")";

    var actionButtons = document.createElement("div");
    actionButtons.className = "save-actions";

    var loadButton = document.createElement("button");
    loadButton.className = "load-button";
    loadButton.textContent = currentLang === "zh" ? "读取" : "Load";
    loadButton.setAttribute("data-id", save.id);

    var deleteButton = document.createElement("button");
    deleteButton.className = "delete-button";
    deleteButton.textContent = currentLang === "zh" ? "删除" : "Delete";
    deleteButton.setAttribute("data-id", save.id);

    actionButtons.appendChild(loadButton);
    actionButtons.appendChild(deleteButton);

    saveItem.appendChild(saveInfo);
    saveItem.appendChild(actionButtons);
    saveList.appendChild(saveItem);
  });

  dialog.appendChild(saveList);

  // 取消按钮
  var buttonGroup = document.createElement("div");
  buttonGroup.className = "dialog-buttons";

  var cancelButton = document.createElement("button");
  cancelButton.className = "dialog-button load-cancel";
  cancelButton.textContent = currentLang === "zh" ? "取消" : "Cancel";

  buttonGroup.appendChild(cancelButton);
  dialog.appendChild(buttonGroup);

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  // 事件处理
  saveList.addEventListener("click", function (e) {
    if (e.target.classList.contains("load-button")) {
      var id = parseInt(e.target.getAttribute("data-id"));
      self.loadSavedGame(id);
      document.body.removeChild(overlay);
    } else if (e.target.classList.contains("delete-button")) {
      var id = parseInt(e.target.getAttribute("data-id"));

      if (confirm(currentLang === "zh" ? "确定要删除这个存档吗？" : "Are you sure you want to delete this save?")) {
        self.deleteSavedGame(id);

        // 从DOM中移除对应的存档项
        var saveItem = e.target.closest(".save-item");
        if (saveItem && saveItem.parentNode) {
          saveItem.parentNode.removeChild(saveItem);
        }

        // 如果没有存档了，关闭对话框
        if (self.getSavedGames().length === 0) {
          document.body.removeChild(overlay);
        }
      }
    }
  });

  cancelButton.addEventListener("click", function () {
    document.body.removeChild(overlay);
  });

  // 点击背景关闭对话框
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) {
      document.body.removeChild(overlay);
    }
  });

  // 按ESC键关闭对话框
  document.addEventListener("keydown", function escHandler(e) {
    if (e.keyCode === 27) { // ESC键
      document.body.removeChild(overlay);
      document.removeEventListener("keydown", escHandler);
    }
  });
};
