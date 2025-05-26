// 导入必要的依赖
import {Grid} from "./grid.js";
import {Tile} from "./tile.js";

function GameManager(size, InputManager, Actuator, StorageManager) {
  this.size = size; // Size of the grid
  this.inputManager = new InputManager();
  this.storageManager = new StorageManager();
  this.actuator = new Actuator();

  this.startTiles = 2;

  // AI相关属性
  this.aiIsRunning = false;
  this.aiDelay = 500; // 每步AI移动的延迟时间（毫秒）
  this.aiTimerId = null;

  // 添加评分跟踪
  this.currentScoreDetails = null; // 当前步骤的评分详情
  this.previousScoreDetails = null; // 上一步的评分详情

  // 添加历史记录，用于撤销功能
  this.history = [];
  // 不再限制历史记录数量，支持无限撤销

  // 添加录像相关属性
  this.recordingMode = true; // 默认开启录像功能
  this.initialState = null; // 游戏初始状态
  this.moveHistory = []; // 移动历史记录
  this.replayMode = false; // 是否处于回放模式
  this.replayIndex = 0; // 当前回放到的步骤索引
  this.replayTimerId = null; // 回放定时器ID
  this.replaySpeed = 2; // 默认回放速度（每秒几步）

  this.inputManager.on("move", this.move.bind(this));
  this.inputManager.on("restart", this.restart.bind(this));
  this.inputManager.on("keepPlaying", this.keepPlaying.bind(this));
  this.inputManager.on("undo", this.undo.bind(this)); // 监听撤销事件

  // 监听存档相关事件
  this.inputManager.on("save", this.showSaveDialog.bind(this));
  this.inputManager.on("load", this.showLoadDialog.bind(this));

  // 监听AI事件（使用新的执行事件名称）
  this.inputManager.on("aiPlayExecute", this.aiPlay.bind(this));
  this.inputManager.on("aiStepExecute", this.aiStep.bind(this));
  this.inputManager.on("aiSimulateExecute", this.aiSimulate.bind(this));
  this.inputManager.on("showScoreExecute", this.toggleScorePanel.bind(this));

  // 监听录像相关事件
  this.inputManager.on("exportReplay", this.exportReplay.bind(this));
  this.inputManager.on("importReplay", this.importReplay.bind(this));

  // 监听网格单元格点击事件
  this.inputManager.on("cellClick", this.handleCellClick.bind(this));

  // 监听网格单元格双击事件
  this.inputManager.on(
    "cellDoubleClick",
    this.handleCellDoubleClick.bind(this)
  );

  this.setup();
}

// Restart the game
GameManager.prototype.restart = function () {
  // 自动保存当前游戏（仅当游戏已经开始且有移动记录时）
  if (this.moveHistory && this.moveHistory.length > 0) {
    // var maxTile = this.getMaxTile();
    // var date = new Date();
    // var formattedDate = date.toLocaleDateString() + " " + date.toLocaleTimeString();
    var saveName = "自动保存"; // + formattedDate;
    this.saveCurrentGame(saveName);
  }

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

  // 如果游戏状态不是结束状态，需要清除游戏结束消息
  if (!this.over) {
    this.actuator.continueGame();
  }

  // 更新界面
  this.actuate();

  // 更新评分
  this.evaluateCurrentBoard();
};

// Set up the game
GameManager.prototype.setup = function () {
  var previousState = this.storageManager.getGameState();

  // Reload the game from a previous game if present
  if (previousState) {
    this.grid = new Grid(previousState.grid.size, previousState.grid.cells); // Reload grid
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

  // 如果不是回放模式，重置录像相关状态
  if (!this.replayMode) {
    this.moveHistory = [];
    // 保存游戏初始状态的深拷贝
    this.initialState = JSON.parse(JSON.stringify(this.serialize()));
  }

  // Update the actuator
  this.actuate();

  // 初始化评分
  this.evaluateCurrentBoard();

  // 初始化评分面板和按钮状态
  this.initScorePanelState();
};

// 初始化评分面板和按钮状态
GameManager.prototype.initScorePanelState = function () {
  var container = document.getElementById("realtime-score-container");
  var buttonElement = document.querySelector(".show-score-button");
  var button = buttonElement ? buttonElement.querySelector("span") : null;

  // 默认隐藏评分面板
  if (container) {
    container.style.display = "none";
  }

  // 设置按钮为默认状态
  if (buttonElement) {
    buttonElement.classList.remove("active");
  }

  if (button) {
    var currentLang = window.I18n ? window.I18n.getCurrentLanguage() : "zh";
    button.textContent = currentLang === "zh" ? "显示评分" : "Show Score";
    button.setAttribute("data-i18n-state", "show");
  }
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
GameManager.prototype.actuate = function (skipAnimation) {
  if (this.storageManager.getBestScore() < this.score) {
    this.storageManager.setBestScore(this.score);
  }

  // Clear the state when the game is over (game over only, not win)
  if (this.over) {
    this.storageManager.clearGameState();
  } else {
    this.storageManager.setGameState(this.serialize());
  }

  this.actuator.actuate(
    this.grid,
    {
      score: this.score,
      over: this.over,
      won: this.won,
      bestScore: this.storageManager.getBestScore(),
      terminated: this.isGameTerminated(),
    },
    skipAnimation
  );
};

// Represent the current game as an object
GameManager.prototype.serialize = function () {
  return {
    grid: this.grid.serialize(),
    score: this.score,
    over: this.over,
    won: this.won,
    keepPlaying: this.keepPlaying,
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

  // 如果是回放模式，忽略用户输入的移动
  if (this.replayMode) return;

  // 在移动前保存当前状态到历史记录
  this.saveToHistory();

  // 在录像模式时，记录移动方向
  if (this.recordingMode) {
    this.moveHistory.push(direction);
  }

  var cell, tile;

  var vector = this.getVector(direction);
  var traversals = this.buildTraversals(vector);
  var moved = false;

  // Save the current tile positions and remove merger information
  this.prepareTiles();

  // Traverse the grid in the right direction and move tiles
  traversals.x.forEach(function (x) {
    traversals.y.forEach(function (y) {
      cell = {x: x, y: y};
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

    // 评估当前棋盘并更新实时评分显示
    this.evaluateCurrentBoard();
  }
};

// Get the vector representing the chosen direction
GameManager.prototype.getVector = function (direction) {
  // Vectors representing tile movement
  var map = {
    0: {x: 0, y: -1}, // Up
    1: {x: 1, y: 0}, // Right
    2: {x: 0, y: 1}, // Down
    3: {x: -1, y: 0}, // Left
  };

  return map[direction];
};

// Build a list of positions to traverse in the right order
GameManager.prototype.buildTraversals = function (vector) {
  var traversals = {x: [], y: []};

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
    cell = {x: previous.x + vector.x, y: previous.y + vector.y};
  } while (this.grid.withinBounds(cell) && this.grid.cellAvailable(cell));

  return {
    farthest: previous,
    next: cell, // Used to check if a merge is required
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
      tile = this.grid.cellContent({x: x, y: y});

      if (tile) {
        for (var direction = 0; direction < 4; direction++) {
          var vector = self.getVector(direction);
          var cell = {x: x + vector.x, y: y + vector.y};

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
GameManager.prototype.aiStep = function (isAutoMode) {
  if (this.isGameTerminated()) return;

  // 在AI移动前保存当前状态
  this.saveToHistory();

  var aiBoard = this.getAIBoard();
  var ai = new AI2048();
  var bestMove = ai.getBestMove(aiBoard);

  if (bestMove !== -1) {
    // 获取AI决策详情
    var moveDetails = ai.getLastMoveDetails();

    // 默认隐藏AI决策分析面板
    var container = document.getElementById("ai-decision-container");
    if (container) {
      container.style.display = "none";
    }

    // 将AI的移动方向映射到游戏的移动方向
    // AI: 0=上, 1=下, 2=左, 3=右
    // 游戏: 0=上, 1=右, 2=下, 3=左
    var moveMap = [0, 2, 3, 1]; // 映射关系
    var gameMove = moveMap[bestMove];

    // 执行AI计算出的最佳移动 - 不再调用saveToHistory
    // 因为move方法内已经会调用saveToHistory
    this.move(gameMove);

    // 评估更新将在move方法内自动调用
  }
};

// 渲染棋盘HTML的辅助方法
GameManager.prototype.renderBoardHTML = function (board) {
  if (!board || !board.grid)
    return "<div class='no-board-data'>没有棋盘数据</div>";

  var html = "<div class='board-grid'>";
  for (var row = 0; row < 4; row++) {
    html += "<div class='board-row'>";
    for (var col = 0; col < 4; col++) {
      var value = board.grid[row][col];
      var cellClass = "board-cell" + (value ? " tile-" + value : "");
      html += "<div class='" + cellClass + "'>" + (value || "") + "</div>";
    }
    html += "</div>";
  }
  html += "</div>";
  return html;
};

// 显示AI决策详情
GameManager.prototype.showAIDecisionDetails = function (moveDetails) {
  // 创建或获取AI决策详情容器
  var container = document.getElementById("ai-decision-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "ai-decision-container";
    container.className = "ai-decision-container";

    // 现在将其添加到AI控制按钮后面，而不是游戏容器后面
    var aboveGame = document.querySelector(".above-game");
    if (aboveGame) {
      aboveGame.parentNode.insertBefore(container, aboveGame.nextSibling);
    } else {
      document.body.appendChild(container);
    }
  }

  // 清空容器
  container.innerHTML = "";

  // 获取当前语言
  var currentLang = window.I18n ? window.I18n.getCurrentLanguage() : "zh";
  var translations = {
    title: {
      zh: "AI决策分析",
      en: "AI Decision Analysis",
    },
    bestMove: {
      zh: "最佳移动方向",
      en: "Best Move",
    },
    factors: {
      zh: "评估因素",
      en: "Evaluation Factors",
    },
    weights: {
      zh: "评估权重",
      en: "Evaluation Weights",
    },
    scoreExplanation: {
      zh: "评分说明",
      en: "Score Explanation",
    },
    direction: {
      zh: "方向",
      en: "Direction",
    },
    algorithmScore: {
      zh: "AI决策分数",
      en: "AI Decision Score",
    },
    empty: {
      zh: "空格",
      en: "Empty Cells",
    },
    merges: {
      zh: "可合并",
      en: "Merges",
    },
    monotonicity: {
      zh: "单调性",
      en: "Monotonicity",
    },
    sum: {
      zh: "总和",
      en: "Sum",
    },
    comparison: {
      zh: "方向对比",
      en: "Direction Comparison",
    },
    invalid: {
      zh: "无效移动",
      en: "Invalid Move",
    },
    currentBoard: {
      zh: "当前棋盘",
      en: "Current Board",
    },
    afterMove: {
      zh: "移动后棋盘",
      en: "Board After Move",
    },
    bracketsExplanation: {
      zh: "括号中的数字表示该因素对总分的贡献",
      en: "Numbers in brackets indicate contribution to total score",
    },
    close: {
      zh: "关闭",
      en: "Close",
    },
  };

  // 创建标题和关闭按钮的容器
  var headerContainer = document.createElement("div");
  headerContainer.className = "ai-decision-header";

  // 创建标题
  var title = document.createElement("h3");
  title.textContent = translations.title[currentLang];
  headerContainer.appendChild(title);

  // 创建关闭按钮
  var closeButton = document.createElement("button");
  closeButton.className = "ai-decision-close-button";
  closeButton.textContent = translations.close[currentLang];
  closeButton.addEventListener("click", function () {
    container.style.display = "none";
    // 移除动画类，确保下次显示时动画能重新触发
    container.style.animation = "none";
    setTimeout(function () {
      container.style.animation = "";
    }, 10);
  });
  headerContainer.appendChild(closeButton);

  container.appendChild(headerContainer);

  // 创建最佳移动信息
  var bestMoveDiv = document.createElement("div");
  bestMoveDiv.className = "ai-best-move";
  bestMoveDiv.innerHTML =
    "<strong>" +
    translations.bestMove[currentLang] +
    ":</strong> " +
    moveDetails.bestDirection;
  container.appendChild(bestMoveDiv);

  // 添加括号解释说明
  var bracketsExplanationDiv = document.createElement("div");
  bracketsExplanationDiv.className = "ai-brackets-explanation";
  bracketsExplanationDiv.textContent =
    translations.bracketsExplanation[currentLang];
  container.appendChild(bracketsExplanationDiv);

  // 创建评分说明（如果有）
  if (moveDetails.scoreExplanation) {
    var scoreExplanationDiv = document.createElement("div");
    scoreExplanationDiv.className = "ai-score-explanation";
    scoreExplanationDiv.innerHTML =
      "<strong>" +
      translations.scoreExplanation[currentLang] +
      ":</strong> " +
      moveDetails.scoreExplanation;
    container.appendChild(scoreExplanationDiv);
  }

  // 创建评估因素说明
  var factorsDiv = document.createElement("div");
  factorsDiv.className = "ai-factors";
  factorsDiv.innerHTML =
    "<strong>" + translations.factors[currentLang] + ":</strong>";

  var factorsList = document.createElement("ul");
  for (var factor in moveDetails.factorExplanations) {
    var li = document.createElement("li");
    li.textContent = moveDetails.factorExplanations[factor];
    factorsList.appendChild(li);
  }
  factorsDiv.appendChild(factorsList);
  container.appendChild(factorsDiv);

  // 创建权重说明
  var weightsDiv = document.createElement("div");
  weightsDiv.className = "ai-weights";
  weightsDiv.innerHTML =
    "<strong>" + translations.weights[currentLang] + ":</strong>";

  var weightsList = document.createElement("ul");
  for (var weight in moveDetails.weightExplanations) {
    var li = document.createElement("li");
    li.textContent = moveDetails.weightExplanations[weight];
    weightsList.appendChild(li);
  }
  weightsDiv.appendChild(weightsList);
  container.appendChild(weightsDiv);

  // 创建棋盘状态显示区域
  var boardsDiv = document.createElement("div");
  boardsDiv.className = "ai-boards";
  boardsDiv.innerHTML =
    "<strong>" + translations.currentBoard[currentLang] + ":</strong>";

  // 添加当前棋盘状态视图
  if (moveDetails.currentBoard) {
    var currentBoardDiv = document.createElement("div");
    currentBoardDiv.className = "ai-board current-board";
    currentBoardDiv.innerHTML = this.renderBoardHTML(moveDetails.currentBoard);
    boardsDiv.appendChild(currentBoardDiv);
  }

  container.appendChild(boardsDiv);

  // 创建方向比较表格
  var comparisonDiv = document.createElement("div");
  comparisonDiv.className = "ai-comparison";
  comparisonDiv.innerHTML =
    "<strong>" + translations.comparison[currentLang] + ":</strong>";

  var table = document.createElement("table");
  table.className = "ai-table";

  // 表格头部
  var thead = document.createElement("thead");
  var headerRow = document.createElement("tr");
  var headers = [
    translations.direction[currentLang],
    translations.algorithmScore[currentLang],
    translations.empty[currentLang],
    translations.merges[currentLang],
    translations.monotonicity[currentLang],
    translations.sum[currentLang],
  ];

  headers.forEach(function (headerText) {
    var th = document.createElement("th");
    th.textContent = headerText;
    headerRow.appendChild(th);
  });

  thead.appendChild(headerRow);
  table.appendChild(thead);

  // 表格内容
  var tbody = document.createElement("tbody");

  // 保存this引用，以便在回调中使用
  var self = this;

  moveDetails.moveScores.forEach(function (moveScore) {
    var tr = document.createElement("tr");

    // 如果这是最佳移动，高亮显示
    if (moveScore.move === moveDetails.bestMove) {
      tr.className = "best-move";
    }

    // 方向
    var tdDirection = document.createElement("td");
    tdDirection.textContent = moveScore.direction;
    tr.appendChild(tdDirection);

    // 无效移动
    if (moveScore.valid === false) {
      var tdInvalid = document.createElement("td");
      tdInvalid.colSpan = 5;
      tdInvalid.textContent = translations.invalid[currentLang];
      tr.appendChild(tdInvalid);
    } else {
      // AI决策分数(算法评分)
      var tdAlgorithmScore = document.createElement("td");
      tdAlgorithmScore.textContent = Math.round(moveScore.score);
      tr.appendChild(tdAlgorithmScore);

      // 空格
      var tdEmpty = document.createElement("td");
      tdEmpty.textContent =
        moveScore.details.empty +
        " (" +
        Math.round(moveScore.details.emptyScore) +
        ")";
      tr.appendChild(tdEmpty);

      // 可合并
      var tdMerges = document.createElement("td");
      tdMerges.textContent =
        moveScore.details.merges +
        " (" +
        Math.round(moveScore.details.mergesScore) +
        ")";
      tr.appendChild(tdMerges);

      // 单调性
      var tdMonotonicity = document.createElement("td");
      tdMonotonicity.textContent =
        moveScore.details.monotonicity.toFixed(2) +
        " (" +
        Math.round(moveScore.details.monotonicityScore) +
        ")";
      tr.appendChild(tdMonotonicity);

      // 总和
      var tdSum = document.createElement("td");
      tdSum.textContent =
        moveScore.details.sum.toFixed(2) +
        " (" +
        Math.round(moveScore.details.sumScore) +
        ")";
      tr.appendChild(tdSum);
    }

    tbody.appendChild(tr);

    // 添加移动后的棋盘状态
    if (moveScore.valid !== false && moveScore.boardAfterMove) {
      var boardRow = document.createElement("tr");
      boardRow.className = "board-after-move-row";

      var boardCell = document.createElement("td");
      boardCell.colSpan = 6;
      boardCell.className = "board-after-move-cell";

      var boardTitle = document.createElement("div");
      boardTitle.className = "board-after-move-title";
      boardTitle.textContent =
        translations.afterMove[currentLang] + ": " + moveScore.direction;

      var boardDisplay = document.createElement("div");
      boardDisplay.className = "ai-board board-after-move";
      boardDisplay.innerHTML = self.renderBoardHTML(moveScore.boardAfterMove);

      boardCell.appendChild(boardTitle);
      boardCell.appendChild(boardDisplay);
      boardRow.appendChild(boardCell);
      tbody.appendChild(boardRow);
    }
  });

  table.appendChild(tbody);
  comparisonDiv.appendChild(table);
  container.appendChild(comparisonDiv);
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
        zh: "AI自动",
        en: "AI Auto",
      };
      button.textContent = translations[currentLang];
    } else {
      button.textContent = "AI自动";
    }

    if (this.aiTimerId) {
      clearTimeout(this.aiTimerId);
      this.aiTimerId = null;
    }

    // 隐藏AI决策分析面板
    var container = document.getElementById("ai-decision-container");
    if (container) {
      container.style.display = "none";
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

  // AI执行一步移动，传入true表示这是自动模式
  this.aiStep(true);

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
    name =
      "存档 " + date.toLocaleDateString() + " " + date.toLocaleTimeString();
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
  input.value =
    currentLang === "zh"
      ? "存档 " + date.toLocaleDateString() + " " + date.toLocaleTimeString()
      : "Save " + date.toLocaleDateString() + " " + date.toLocaleTimeString();

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
    existingTitle.textContent =
      currentLang === "zh" ? "已有存档：" : "Existing Saves:";
    dialog.appendChild(existingTitle);

    var saveList = document.createElement("div");
    saveList.className = "save-list";

    savedGames.forEach(function (save) {
      var saveItem = document.createElement("div");
      saveItem.className = "save-item";

      var saveInfo = document.createElement("div");
      saveInfo.className = "save-info";
      saveInfo.textContent =
        save.name + " (" + new Date(save.timestamp).toLocaleString() + ")";

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
    if (e.keyCode === 27) {
      // ESC键
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
    saveInfo.textContent =
      save.name + " (" + maxScoreStr + save.maxScore + ", " + dateStr + ")";

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

      if (
        confirm(
          currentLang === "zh"
            ? "确定要删除这个存档吗？"
            : "Are you sure you want to delete this save?"
        )
      ) {
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
    if (e.keyCode === 27) {
      // ESC键
      document.body.removeChild(overlay);
      document.removeEventListener("keydown", escHandler);
    }
  });
};

// AI模拟决策分析，不实际执行移动
GameManager.prototype.aiSimulate = function () {
  if (this.isGameTerminated()) return;

  // 创建一个Board对象表示当前棋盘
  var aiBoard = this.getAIBoard();
  var ai = new AI2048();

  // 获取最佳移动，但不执行
  var bestMove = ai.getBestMove(aiBoard);

  // 获取并显示AI决策详情
  if (bestMove !== -1) {
    var moveDetails = ai.getLastMoveDetails();
    this.showAIDecisionDetails(moveDetails);

    // 确保AI决策分析面板可见
    var container = document.getElementById("ai-decision-container");
    if (container) {
      container.style.display = "block";

      // 添加滚动功能 - 确保分析面板在视图中可见
      setTimeout(function () {
        container.scrollIntoView({behavior: "smooth", block: "start"});
      }, 100);
    }

    // 模拟不会执行移动，但我们仍然更新评分
    this.evaluateCurrentBoard();
  }
};

// 评估当前棋盘状态并更新评分详情
GameManager.prototype.evaluateCurrentBoard = function () {
  var aiBoard = this.getAIBoard();
  var ai = new AI2048();

  // 保存上一步的评分
  this.previousScoreDetails = this.currentScoreDetails;

  // 获取当前棋盘的评分
  var evalResult = ai.evaluateBoard(aiBoard, true);
  this.currentScoreDetails = evalResult.details;

  // 如果这是第一步，将上一步也设为当前步
  if (!this.previousScoreDetails) {
    this.previousScoreDetails = this.currentScoreDetails;
  }

  // 更新实时评分显示
  this.updateRealTimeScoreDisplay();

  // 更新上一步棋盘显示
  this.updatePreviousBoardDisplay();
};

// 更新上一步棋盘显示
GameManager.prototype.updatePreviousBoardDisplay = function () {
  var container = document.getElementById("previous-board-container");
  if (!container) return;

  // 获取当前语言
  var currentLang = window.I18n ? window.I18n.getCurrentLanguage() : "zh";
  var translations = {
    title: {
      zh: "上一步棋盘",
      en: "Previous Board",
    },
    empty: {
      zh: "没有历史记录",
      en: "No History",
    },
  };

  // 清空容器
  container.innerHTML = "";

  // 创建标题
  var title = document.createElement("h3");
  title.textContent = translations.title[currentLang];
  container.appendChild(title);

  // 如果没有历史记录，显示提示信息
  if (this.history.length === 0) {
    var emptyMessage = document.createElement("div");
    emptyMessage.className = "empty-history-message";
    emptyMessage.textContent = translations.empty[currentLang];
    container.appendChild(emptyMessage);
    return;
  }

  // 获取上一步的棋盘状态
  var previousState = this.history[this.history.length - 1];
  if (!previousState || !previousState.grid || !previousState.grid.cells) {
    var errorMessage = document.createElement("div");
    errorMessage.className = "error-message";
    errorMessage.textContent = translations.empty[currentLang];
    container.appendChild(errorMessage);
    return;
  }

  // 创建临时Grid对象
  var previousGrid = new Grid(
    previousState.grid.size,
    previousState.grid.cells
  );

  // 将Grid转换为Board格式以便使用renderBoardHTML方法
  var previousBoard = new Board();
  previousGrid.eachCell(function (x, y, tile) {
    var value = tile ? tile.value : 0;
    previousBoard.set(y, x, value); // 注意xy坐标映射
  });

  // 渲染棋盘
  var boardHTML = this.renderBoardHTML(previousBoard);
  container.innerHTML += boardHTML;
};

// 更新或创建实时评分显示
GameManager.prototype.updateRealTimeScoreDisplay = function () {
  // 确保有评分数据
  if (!this.currentScoreDetails) return;

  // 获取或创建实时评分容器
  var container = document.getElementById("realtime-score-container");
  if (!container) return;

  // 获取当前语言
  var currentLang = window.I18n ? window.I18n.getCurrentLanguage() : "zh";
  var translations = {
    title: {
      zh: "实时评分分析",
      en: "Real-time Score Analysis",
    },
    factor: {
      zh: "评分因素",
      en: "Factor",
    },
    current: {
      zh: "当前步骤",
      en: "Current",
    },
    previous: {
      zh: "上一步骤",
      en: "Previous",
    },
    change: {
      zh: "变化",
      en: "Change",
    },
    empty: {
      zh: "空格",
      en: "Empty Cells",
    },
    merges: {
      zh: "可合并",
      en: "Merges",
    },
    monotonicity: {
      zh: "单调性",
      en: "Monotonicity",
    },
    sum: {
      zh: "总和",
      en: "Sum",
    },
    total: {
      zh: "总评分",
      en: "Total Score",
    },
    toggle: {
      zh: "显示/隐藏",
      en: "Show/Hide",
    },
    close: {
      zh: "关闭",
      en: "Close",
    },
  };

  // 清空容器
  container.innerHTML = "";

  // 创建标题和切换按钮的容器
  var headerContainer = document.createElement("div");
  headerContainer.className = "realtime-score-header";

  // 创建标题
  var title = document.createElement("h3");
  title.textContent = translations.title[currentLang];
  headerContainer.appendChild(title);

  // 创建关闭按钮
  var closeButton = document.createElement("button");
  closeButton.className = "realtime-score-close-button";
  closeButton.textContent = translations.close[currentLang];
  closeButton.addEventListener("click", function () {
    container.style.display = "none";
    // 移除动画类，确保下次显示时动画能重新触发
    container.style.animation = "none";
    setTimeout(function () {
      container.style.animation = "";
    }, 10);
  });
  headerContainer.appendChild(closeButton);

  container.appendChild(headerContainer);

  // 创建表格
  var table = document.createElement("table");
  table.className = "realtime-score-table";

  // 创建表头
  var thead = document.createElement("thead");
  var headerRow = document.createElement("tr");

  var headers = [
    translations.factor[currentLang],
    translations.current[currentLang],
    translations.previous[currentLang],
    translations.change[currentLang],
  ];

  headers.forEach(function (headerText) {
    var th = document.createElement("th");
    th.textContent = headerText;
    headerRow.appendChild(th);
  });

  thead.appendChild(headerRow);
  table.appendChild(thead);

  // 创建表格内容
  var tbody = document.createElement("tbody");

  // 计算总评分
  var currentTotal =
    this.currentScoreDetails.emptyScore +
    this.currentScoreDetails.mergesScore +
    this.currentScoreDetails.monotonicityScore +
    this.currentScoreDetails.sumScore;

  var previousTotal =
    this.previousScoreDetails.emptyScore +
    this.previousScoreDetails.mergesScore +
    this.previousScoreDetails.monotonicityScore +
    this.previousScoreDetails.sumScore;

  var totalChange = currentTotal - previousTotal;

  // 添加各项评分行
  var factors = [
    {
      name: translations.empty[currentLang],
      current: this.currentScoreDetails.emptyScore,
      previous: this.previousScoreDetails.emptyScore,
      raw: {
        current: this.currentScoreDetails.empty,
        previous: this.previousScoreDetails.empty,
      },
    },
    {
      name: translations.merges[currentLang],
      current: this.currentScoreDetails.mergesScore,
      previous: this.previousScoreDetails.mergesScore,
      raw: {
        current: this.currentScoreDetails.merges,
        previous: this.previousScoreDetails.merges,
      },
    },
    {
      name: translations.monotonicity[currentLang],
      current: this.currentScoreDetails.monotonicityScore,
      previous: this.previousScoreDetails.monotonicityScore,
      raw: {
        current: this.currentScoreDetails.monotonicity,
        previous: this.previousScoreDetails.monotonicity,
      },
    },
    {
      name: translations.sum[currentLang],
      current: this.currentScoreDetails.sumScore,
      previous: this.previousScoreDetails.sumScore,
      raw: {
        current: this.currentScoreDetails.sum,
        previous: this.previousScoreDetails.sum,
      },
    },
    {
      name: translations.total[currentLang],
      current: currentTotal,
      previous: previousTotal,
      isTotal: true,
    },
  ];

  factors.forEach(function (factor) {
    var tr = document.createElement("tr");

    // 如果是总计行，添加特殊类
    if (factor.isTotal) {
      tr.className = "total-row";
    }

    // 因素名称
    var tdName = document.createElement("td");
    tdName.textContent = factor.name;
    tr.appendChild(tdName);

    // 当前步骤值
    var tdCurrent = document.createElement("td");

    // 如果有原始值，显示原始值和评分
    if (factor.raw) {
      tdCurrent.textContent =
        Math.round(factor.raw.current) +
        " (" +
        Math.round(factor.current) +
        ")";
    } else {
      tdCurrent.textContent = Math.round(factor.current);
    }
    tr.appendChild(tdCurrent);

    // 上一步骤值
    var tdPrevious = document.createElement("td");

    // 如果有原始值，显示原始值和评分
    if (factor.raw) {
      tdPrevious.textContent =
        Math.round(factor.raw.previous) +
        " (" +
        Math.round(factor.previous) +
        ")";
    } else {
      tdPrevious.textContent = Math.round(factor.previous);
    }
    tr.appendChild(tdPrevious);

    // 变化
    var change = factor.current - factor.previous;
    var tdChange = document.createElement("td");
    tdChange.textContent = (change > 0 ? "+" : "") + Math.round(change);

    // 根据变化为正还是负添加不同的类
    if (change > 0) {
      tdChange.className = "positive-change";
    } else if (change < 0) {
      tdChange.className = "negative-change";
    }

    tr.appendChild(tdChange);

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  container.appendChild(table);
};

// 显示/隐藏实时评分面板
GameManager.prototype.toggleScorePanel = function () {
  var container = document.getElementById("realtime-score-container");
  if (!container) {
    // 如果面板不存在，先评估一次棋盘，创建面板
    this.evaluateCurrentBoard();
    container = document.getElementById("realtime-score-container");
  }

  // 获取当前语言
  var currentLang = window.I18n ? window.I18n.getCurrentLanguage() : "zh";

  // 获取按钮和按钮文本元素
  var buttonElement = document.querySelector(".show-score-button");
  var button = buttonElement ? buttonElement.querySelector("span") : null;

  if (container) {
    // 切换面板显示状态
    if (container.style.display === "none") {
      container.style.display = "block";
      container.style.animation = "none";

      // 更新按钮文本为"隐藏评分"并修改样式
      if (button) {
        button.textContent = currentLang === "zh" ? "隐藏评分" : "Hide Score";
        button.setAttribute("data-i18n-state", "hide");
      }

      // 添加激活样式
      if (buttonElement) {
        buttonElement.classList.add("active");
      }

      setTimeout(function () {
        container.style.animation = "ai-panel-fade-in 0.5s ease";
        container.scrollIntoView({behavior: "smooth", block: "start"});
      }, 10);
    } else {
      container.style.display = "none";

      // 更新按钮文本为"显示评分"并修改样式
      if (button) {
        button.textContent = currentLang === "zh" ? "显示评分" : "Show Score";
        button.setAttribute("data-i18n-state", "show");
      }

      // 移除激活样式
      if (buttonElement) {
        buttonElement.classList.remove("active");
      }
    }
  }
};

// 导出录像数据
GameManager.prototype.exportReplay = function () {
  if (!this.initialState || this.moveHistory.length === 0) {
    alert(
      window.I18n && window.I18n.getCurrentLanguage() === "en"
        ? "No replay data available!"
        : "没有可用的录像数据！"
    );
    return;
  }

  // 创建录像数据对象
  var replayData = {
    version: "1.0",
    timestamp: new Date().getTime(),
    initialState: this.initialState,
    moves: this.moveHistory,
    score: this.score,
    maxTile: this.getMaxTile(),
  };

  // 将数据转换为JSON字符串
  var jsonData = JSON.stringify(replayData);

  // 创建Blob
  var blob = new Blob([jsonData], {type: "application/json"});

  // 创建下载链接
  var a = document.createElement("a");
  a.download =
    "2048_replay_" + new Date().toISOString().replace(/:/g, "-") + ".json";
  a.href = URL.createObjectURL(blob);
  a.style.display = "none";

  // 添加到DOM并触发点击
  document.body.appendChild(a);
  a.click();

  // 清理
  setTimeout(function () {
    document.body.removeChild(a);
    window.URL.revokeObjectURL(a.href);
  }, 100);
};

// 获取棋盘上的最大方块值
GameManager.prototype.getMaxTile = function () {
  var max = 0;

  this.grid.eachCell(function (x, y, tile) {
    if (tile && tile.value > max) {
      max = tile.value;
    }
  });

  return max;
};

// 导入录像数据
GameManager.prototype.importReplay = function (file) {
  var self = this;

  if (!file) {
    // 创建文件输入元素
    var fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".json,application/json";
    fileInput.style.display = "none";

    // 监听文件选择事件
    fileInput.addEventListener("change", function (e) {
      if (e.target.files.length > 0) {
        self.importReplay(e.target.files[0]);
      }
      // 从DOM移除输入元素
      document.body.removeChild(fileInput);
    });

    // 添加到DOM并触发点击
    document.body.appendChild(fileInput);
    fileInput.click();
    return;
  }

  // 读取文件内容
  var reader = new FileReader();
  reader.onload = function (e) {
    try {
      var replayData = JSON.parse(e.target.result);

      // 验证数据
      if (
        !replayData.initialState ||
        !Array.isArray(replayData.moves) ||
        replayData.moves.length === 0
      ) {
        throw new Error("Invalid replay data");
      }

      // 开始回放
      self.startReplay(replayData);
    } catch (err) {
      alert(
        window.I18n && window.I18n.getCurrentLanguage() === "en"
          ? "Invalid replay file!"
          : "无效的录像文件！"
      );
      console.error("Error importing replay:", err);
    }
  };

  reader.readAsText(file);
};

// 开始回放录像
GameManager.prototype.startReplay = function (replayData) {
  // 设置为回放模式
  this.replayMode = true;
  this.replayIndex = 0;

  // 显示回放控制界面
  this.showReplayControls();

  // 从初始状态开始重新加载游戏
  this.grid = new Grid(
    replayData.initialState.grid.size,
    replayData.initialState.grid.cells
  );
  this.score = replayData.initialState.score;
  this.over = replayData.initialState.over;
  this.won = replayData.initialState.won;
  this.keepPlaying = replayData.initialState.keepPlaying;

  // 保存录像数据
  this.initialState = replayData.initialState;
  this.moveHistory = replayData.moves;

  // 更新界面
  this.actuate();

  // 显示录像信息
  this.showReplayInfo(replayData);
};

// 显示回放信息
GameManager.prototype.showReplayInfo = function (replayData) {
  var currentLang = window.I18n ? window.I18n.getCurrentLanguage() : "zh";
  var container = document.querySelector(".replay-info");

  if (!container) {
    container = document.createElement("div");
    container.className = "replay-info";
    var gameContainer = document.querySelector(".game-container");
    gameContainer.parentNode.insertBefore(container, gameContainer);
  }

  var date = new Date(replayData.timestamp);
  var dateStr = date.toLocaleDateString() + " " + date.toLocaleTimeString();

  container.innerHTML =
    "<div class='replay-header'>" +
    (currentLang === "en" ? "Replay Mode" : "录像回放模式") +
    "</div><div class='replay-details'>" +
    (currentLang === "en" ? "Date: " : "日期：") +
    dateStr +
    "<br>" +
    (currentLang === "en" ? "Moves: " : "总步数：") +
    replayData.moves.length +
    "<br>" +
    (currentLang === "en" ? "Final Score: " : "最终得分：") +
    replayData.score +
    "<br>" +
    (currentLang === "en" ? "Max Tile: " : "最大方块：") +
    replayData.maxTile +
    "</div>";
};

// 显示回放控制界面
GameManager.prototype.showReplayControls = function () {
  var self = this;
  var currentLang = window.I18n ? window.I18n.getCurrentLanguage() : "zh";

  // 创建或获取回放控制容器
  var container = document.querySelector(".replay-controls");
  if (!container) {
    container = document.createElement("div");
    container.className = "replay-controls";

    var gameContainer = document.querySelector(".game-container");
    if (gameContainer) {
      gameContainer.parentNode.insertBefore(
        container,
        gameContainer.nextSibling
      );
    } else {
      document.body.appendChild(container);
    }
  }

  // 清空容器
  container.innerHTML = "";

  // 创建控制按钮
  var controls = [
    {
      id: "replay-prev",
      text: currentLang === "en" ? "Previous" : "上一步",
      handler: function () {
        self.replayPrevMove();
      },
    },
    {
      id: "replay-playpause",
      text: currentLang === "en" ? "Play" : "播放",
      handler: function () {
        self.toggleReplayPlayback();
      },
    },
    {
      id: "replay-next",
      text: currentLang === "en" ? "Next" : "下一步",
      handler: function () {
        self.replayNextMove();
      },
    },
    {
      id: "replay-speed",
      text:
        currentLang === "en"
          ? "Speed: " + self.replaySpeed + "x"
          : "速度: " + self.replaySpeed + "x",
      handler: function () {
        self.cycleReplaySpeed();
      },
    },
    {
      id: "replay-exit",
      text: currentLang === "en" ? "Exit Replay" : "退出回放",
      handler: function () {
        self.exitReplay();
      },
    },
  ];

  controls.forEach(function (control) {
    var button = document.createElement("button");
    button.id = control.id;
    button.className = "replay-button";
    button.textContent = control.text;
    button.addEventListener("click", control.handler);
    container.appendChild(button);
  });

  // 添加进度条
  var progressContainer = document.createElement("div");
  progressContainer.className = "replay-progress-container";

  var progressLabel = document.createElement("div");
  progressLabel.className = "replay-progress-label";
  progressLabel.textContent = "0 / " + this.moveHistory.length;

  var progressBar = document.createElement("div");
  progressBar.className = "replay-progress-bar";

  var progressFill = document.createElement("div");
  progressFill.className = "replay-progress-fill";
  progressFill.style.width = "0%";

  progressBar.appendChild(progressFill);
  progressContainer.appendChild(progressLabel);
  progressContainer.appendChild(progressBar);
  container.appendChild(progressContainer);
};

// 更新回放进度
GameManager.prototype.updateReplayProgress = function () {
  var progressLabel = document.querySelector(".replay-progress-label");
  var progressFill = document.querySelector(".replay-progress-fill");

  if (progressLabel && progressFill && this.moveHistory.length > 0) {
    progressLabel.textContent =
      this.replayIndex + " / " + this.moveHistory.length;
    var percentage = (this.replayIndex / this.moveHistory.length) * 100;
    progressFill.style.width = percentage + "%";
  }
};

// 播放/暂停回放
GameManager.prototype.toggleReplayPlayback = function () {
  var button = document.getElementById("replay-playpause");
  var currentLang = window.I18n ? window.I18n.getCurrentLanguage() : "zh";

  if (this.replayTimerId) {
    // 暂停回放
    clearInterval(this.replayTimerId);
    this.replayTimerId = null;
    if (button) {
      button.textContent = currentLang === "en" ? "Play" : "播放";
    }
  } else {
    // 开始回放
    var self = this;
    var interval = 1000 / this.replaySpeed; // 根据速度计算间隔时间

    this.replayTimerId = setInterval(function () {
      if (self.replayIndex >= self.moveHistory.length) {
        // 已到达录像末尾，停止回放
        self.toggleReplayPlayback();
        return;
      }
      self.replayNextMove();
    }, interval);

    if (button) {
      button.textContent = currentLang === "en" ? "Pause" : "暂停";
    }
  }
};

// 播放下一步
GameManager.prototype.replayNextMove = function () {
  if (this.replayIndex >= this.moveHistory.length) {
    return; // 已到达录像末尾
  }

  // 获取下一步的移动方向
  var direction = this.moveHistory[this.replayIndex++];

  // 执行移动
  this.replayMove(direction);

  // 更新进度
  this.updateReplayProgress();
};

// 返回上一步
GameManager.prototype.replayPrevMove = function () {
  if (this.replayIndex <= 0) {
    return; // 已在录像开头
  }

  // 回到录像开头
  if (this.replayIndex === 1) {
    this.replayIndex = 0;
    // 重置到初始状态
    this.grid = new Grid(
      this.initialState.grid.size,
      this.initialState.grid.cells
    );
    this.score = this.initialState.score;
    this.over = this.initialState.over;
    this.won = this.initialState.won;
    this.keepPlaying = this.initialState.keepPlaying;

    // 更新界面
    this.actuate();
  } else {
    // 需要从头开始重放到上一步
    this.replayIndex -= 1;

    // 重置到初始状态
    this.grid = new Grid(
      this.initialState.grid.size,
      this.initialState.grid.cells
    );
    this.score = this.initialState.score;
    this.over = this.initialState.over;
    this.won = this.initialState.won;
    this.keepPlaying = this.initialState.keepPlaying;

    // 从头播放到上一步
    for (var i = 0; i < this.replayIndex; i++) {
      this.replayMove(this.moveHistory[i], false);
    }

    // 更新界面
    this.actuate();
  }

  // 更新进度
  this.updateReplayProgress();
};

// 执行录像中的移动
GameManager.prototype.replayMove = function (direction, updateUI) {
  updateUI = updateUI !== false; // 默认为true

  var vector = this.getVector(direction);
  var traversals = this.buildTraversals(vector);
  var moved = false;
  var self = this;

  // 保存原始位置并移除合并信息
  this.prepareTiles();

  // 按指定方向移动方块
  traversals.x.forEach(function (x) {
    traversals.y.forEach(function (y) {
      var cell = {x: x, y: y};
      var tile = self.grid.cellContent(cell);

      if (tile) {
        var positions = self.findFarthestPosition(cell, vector);
        var next = self.grid.cellContent(positions.next);

        // 检查是否可以合并
        if (next && next.value === tile.value && !next.mergedFrom) {
          var merged = new Tile(positions.next, tile.value * 2);
          merged.mergedFrom = [tile, next];

          self.grid.insertTile(merged);
          self.grid.removeTile(tile);

          // 更新位置
          tile.updatePosition(positions.next);

          // 更新分数
          self.score += merged.value;

          // 检查是否达到2048
          if (merged.value === 2048) {
            self.won = true;
          }
        } else {
          self.moveTile(tile, positions.farthest);
        }

        if (!self.positionsEqual(cell, tile)) {
          moved = true; // 方块移动了
        }
      }
    });
  });

  if (moved) {
    // 添加新的随机方块
    // 注意：在回放模式下，我们需要确保添加的方块位置和值与原始游戏相同
    // 这里简化处理，添加一个随机方块
    this.addRandomTile();

    // 检查游戏是否结束
    if (!this.movesAvailable()) {
      this.over = true; // 游戏结束
    }

    // 如果需要，更新界面
    if (updateUI) {
      this.actuate();
    }
  }
};

// 调整回放速度
GameManager.prototype.cycleReplaySpeed = function () {
  // 速度选项：0.5, 1, 2, 5, 10
  var speeds = [0.5, 1, 2, 5, 10];
  var currentIndex = speeds.indexOf(this.replaySpeed);

  // 切换到下一个速度
  currentIndex = (currentIndex + 1) % speeds.length;
  this.replaySpeed = speeds[currentIndex];

  // 更新速度按钮文本
  var button = document.getElementById("replay-speed");
  var currentLang = window.I18n ? window.I18n.getCurrentLanguage() : "zh";

  if (button) {
    button.textContent =
      currentLang === "en"
        ? "Speed: " + this.replaySpeed + "x"
        : "速度: " + this.replaySpeed + "x";
  }

  // 如果当前正在播放，需要重新设置计时器
  if (this.replayTimerId) {
    this.toggleReplayPlayback(); // 停止
    this.toggleReplayPlayback(); // 以新速度开始
  }
};

// 退出回放模式
GameManager.prototype.exitReplay = function () {
  // 停止回放
  if (this.replayTimerId) {
    clearInterval(this.replayTimerId);
    this.replayTimerId = null;
  }

  // 设置为非回放模式
  this.replayMode = false;

  // 移除回放控制界面
  var controls = document.querySelector(".replay-controls");
  if (controls) {
    controls.parentNode.removeChild(controls);
  }

  // 移除回放信息
  var info = document.querySelector(".replay-info");
  if (info) {
    info.parentNode.removeChild(info);
  }

  // 重启游戏
  this.restart();
};

// 处理网格单元格点击
GameManager.prototype.handleCellClick = function (position) {
  // 如果游戏结束或者正在回放模式，不处理点击
  if (this.over || this.replayMode) {
    return;
  }

  // 保存当前状态到历史记录（用于撤销功能）
  this.saveToHistory();

  var currentTile = this.grid.cellContent(position);

  if (!currentTile) {
    // 空白格，设置为2
    var newTile = new Tile(position, 2);
    newTile.noAnimation = true; // 标记为无动画
    this.grid.insertTile(newTile);
  } else if (currentTile.value === 2) {
    // 数字为2的方格，变成4
    currentTile.value = 4;
    currentTile.noAnimation = true; // 标记为无动画
  } else if (currentTile.value === 4) {
    // 数字为4的方格，变成空白
    this.grid.removeTile(currentTile);
  }
  // 其他数字不响应点击

  // 为所有现有的瓦片添加无动画标记并清除动画属性（避免重新渲染时的闪烁）
  this.grid.eachCell(function (x, y, tile) {
    if (tile) {
      tile.noAnimation = true;
      // 清除动画相关属性，防止重新播放之前的移动动画
      tile.previousPosition = null;
      tile.mergedFrom = null;
    }
  });

  // 更新界面（跳过动画）
  this.actuate(true);

  // 更新评分
  this.evaluateCurrentBoard();
};

// 处理网格单元格双击 - 进入编辑模式
GameManager.prototype.handleCellDoubleClick = function (position) {
  // 如果游戏结束或者正在回放模式，不处理双击
  if (this.over || this.replayMode) {
    return;
  }

  // 调用HTML渲染器显示编辑输入框
  if (this.actuator.showEditInput) {
    this.actuator.showEditInput(position, this);
  }
};

// 验证输入值是否为2的幂
GameManager.prototype.isPowerOfTwo = function (value) {
  // 必须是正整数且是2的幂
  return value > 0 && (value & (value - 1)) === 0;
};

// 应用编辑值到指定位置
GameManager.prototype.applyEditValue = function (position, value) {
  // 保存当前状态到历史记录（用于撤销功能）
  this.saveToHistory();

  var currentTile = this.grid.cellContent(position);

  if (value === 0 || value === "") {
    // 空值，移除瓦片
    if (currentTile) {
      this.grid.removeTile(currentTile);
    }
  } else {
    // 设置新值
    if (currentTile) {
      // 修改现有瓦片
      currentTile.value = value;
      currentTile.noAnimation = true;
    } else {
      // 创建新瓦片
      var newTile = new Tile(position, value);
      newTile.noAnimation = true;
      this.grid.insertTile(newTile);
    }
  }

  // 为所有现有的瓦片添加无动画标记并清除动画属性
  this.grid.eachCell(function (x, y, tile) {
    if (tile) {
      tile.noAnimation = true;
      tile.previousPosition = null;
      tile.mergedFrom = null;
    }
  });

  // 更新界面（跳过动画）
  this.actuate(true);

  // 更新评分
  this.evaluateCurrentBoard();
};

// 导出GameManager类
export {GameManager};
