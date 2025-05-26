function HTMLActuator() {
  this.tileContainer = document.querySelector(".tile-container");
  this.scoreContainer = document.querySelector(".score-container");
  this.bestContainer = document.querySelector(".best-container");
  this.messageContainer = document.querySelector(".game-message");
  this.previousBoardContainer = document.getElementById(
    "previous-board-container"
  );
  this.realtimeScoreContainer = document.getElementById(
    "realtime-score-container"
  );

  this.score = 0;
}

HTMLActuator.prototype.actuate = function (grid, metadata, skipAnimation) {
  var self = this;

  var renderFunction = function () {
    self.clearContainer(self.tileContainer);

    grid.cells.forEach(function (column) {
      column.forEach(function (cell) {
        if (cell) {
          self.addTile(cell);
        }
      });
    });

    self.updateScore(metadata.score);
    self.updateBestScore(metadata.bestScore);

    if (metadata.terminated) {
      if (metadata.over) {
        self.message(false); // You lose
      } else if (metadata.won) {
        // 检查是否为AI自动运行模式
        var isAIRunning = window.gameManager && window.gameManager.aiIsRunning;

        // 如果是AI运行，则自动继续游戏
        if (isAIRunning) {
          // 继续游戏而不显示胜利消息
          // 直接在这里设置keepPlaying状态
          if (window.gameManager) {
            window.gameManager.keepPlaying = true;
          }
          self.clearMessage(); // 清除任何可能的游戏胜利消息
        } else {
          self.message(true); // You win!
        }
      }
    }
  };

  // 如果跳过动画，直接执行渲染；否则使用requestAnimationFrame
  if (skipAnimation) {
    renderFunction();
  } else {
    window.requestAnimationFrame(renderFunction);
  }
};

// Continues the game (both restart and keep playing)
HTMLActuator.prototype.continueGame = function () {
  this.clearMessage();
};

HTMLActuator.prototype.clearContainer = function (container) {
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }
};

HTMLActuator.prototype.addTile = function (tile) {
  var self = this;

  var wrapper = document.createElement("div");
  var inner = document.createElement("div");
  var position = tile.previousPosition || {x: tile.x, y: tile.y};
  var positionClass = this.positionClass(position);

  // We can't use classlist because it somehow glitches when replacing classes
  var classes = ["tile", "tile-" + tile.value, positionClass];

  if (tile.value > 2048) classes.push("tile-super");

  // 如果瓦片标记为无动画，添加特殊类
  if (tile.noAnimation) {
    classes.push("tile-no-animation");
  }

  this.applyClasses(wrapper, classes);

  inner.classList.add("tile-inner");

  // 支持替换显示内容（用于军衔主题等）
  const tileValue =
    window.TileDisplay && window.TileDisplay.replaceTileValue
      ? window.TileDisplay.replaceTileValue(tile.value)
      : tile.value;

  // 检查返回值是否为HTML内容
  if (typeof tileValue === "string" && tileValue.trim().startsWith("<")) {
    inner.innerHTML = tileValue;
  } else {
    inner.textContent = tileValue;
  }

  if (tile.previousPosition) {
    // Make sure that the tile gets rendered in the previous position first
    window.requestAnimationFrame(function () {
      classes[2] = self.positionClass({x: tile.x, y: tile.y});
      self.applyClasses(wrapper, classes); // Update the position
    });
  } else if (tile.mergedFrom) {
    classes.push("tile-merged");
    this.applyClasses(wrapper, classes);

    // Render the tiles that merged
    tile.mergedFrom.forEach(function (merged) {
      self.addTile(merged);
    });
  } else {
    classes.push("tile-new");
    this.applyClasses(wrapper, classes);
  }

  // Add the inner part of the tile to the wrapper
  wrapper.appendChild(inner);

  // 为瓦片添加点击事件处理
  this.addTileClickHandler(wrapper, tile);

  // Put the tile on the board
  this.tileContainer.appendChild(wrapper);
};

HTMLActuator.prototype.applyClasses = function (element, classes) {
  element.setAttribute("class", classes.join(" "));
};

HTMLActuator.prototype.normalizePosition = function (position) {
  return {x: position.x + 1, y: position.y + 1};
};

HTMLActuator.prototype.positionClass = function (position) {
  position = this.normalizePosition(position);
  return "tile-position-" + position.x + "-" + position.y;
};

HTMLActuator.prototype.updateScore = function (score) {
  this.clearContainer(this.scoreContainer);

  var difference = score - this.score;
  this.score = score;

  this.scoreContainer.textContent = this.score;

  if (difference > 0) {
    var addition = document.createElement("div");
    addition.classList.add("score-addition");
    addition.textContent = "+" + difference;

    this.scoreContainer.appendChild(addition);
  }
};

HTMLActuator.prototype.updateBestScore = function (bestScore) {
  this.bestContainer.textContent = bestScore;
};

HTMLActuator.prototype.message = function (won) {
  var type = won ? "game-won" : "game-over";
  var message = won ? "You win!" : "Game over!";

  this.messageContainer.classList.add(type);
  this.messageContainer.getElementsByTagName("p")[0].textContent = message;
};

HTMLActuator.prototype.clearMessage = function () {
  // IE only takes one value to remove at a time.
  this.messageContainer.classList.remove("game-won");
  this.messageContainer.classList.remove("game-over");
};

// 为瓦片添加点击事件处理
HTMLActuator.prototype.addTileClickHandler = function (tileElement, tile) {
  var self = this;
  var clickCount = 0;
  var clickTimer = null;

  // 添加点击事件
  tileElement.addEventListener("click", function (event) {
    event.preventDefault();
    event.stopPropagation();

    clickCount++;

    if (clickCount === 1) {
      // 第一次点击，设置延迟执行单击事件
      clickTimer = setTimeout(function () {
        // 确认只有一次点击，执行单击逻辑
        if (clickCount === 1) {
          // 通过全局游戏管理器触发单元格点击事件
          if (window.gameManager && window.gameManager.handleCellClick) {
            window.gameManager.handleCellClick({x: tile.x, y: tile.y});
          }
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
      if (window.gameManager && window.gameManager.handleCellDoubleClick) {
        window.gameManager.handleCellDoubleClick({x: tile.x, y: tile.y});
      }

      // 重置计数器
      clickCount = 0;
    }
  });

  // 为移动设备添加触摸事件
  var eventTouchend = window.navigator.msPointerEnabled
    ? "MSPointerUp"
    : "touchend";

  tileElement.addEventListener(eventTouchend, function (event) {
    event.preventDefault();
    event.stopPropagation();

    // 通过全局游戏管理器触发单元格点击事件
    if (window.gameManager && window.gameManager.handleCellClick) {
      window.gameManager.handleCellClick({x: tile.x, y: tile.y});
    }
  });
};

// 显示编辑输入框
HTMLActuator.prototype.showEditInput = function (position, gameManager) {
  var self = this;

  // 如果已经有编辑框在显示，先移除
  var existingInput = document.querySelector(".tile-edit-input");
  if (existingInput) {
    existingInput.remove();
  }

  // 获取当前瓦片的值
  var currentTile = gameManager.grid.cellContent(position);
  var currentValue = currentTile ? currentTile.value : "";

  // 创建输入框
  var input = document.createElement("input");
  input.type = "text";
  input.className = "tile-edit-input";
  input.value = currentValue;

  // 计算输入框位置（基于网格位置）
  var cellSize = 115; // 默认单元格大小
  var cellMargin = 15; // 单元格间距

  // 检查是否是小屏幕
  if (window.innerWidth <= 520) {
    cellSize = 55;
    cellMargin = 10;
  } else if (window.innerWidth <= 320) {
    cellSize = 53;
    cellMargin = 6;
  }

  var left = position.x * (cellSize + cellMargin);
  var top = position.y * (cellSize + cellMargin);

  // 设置输入框样式
  input.style.position = "absolute";
  input.style.left = left + "px";
  input.style.top = top + "px";
  input.style.width = cellSize + "px";
  input.style.height = cellSize + "px";
  input.style.zIndex = "1000";
  input.style.textAlign = "center";
  input.style.fontSize = "24px";
  input.style.fontWeight = "bold";
  input.style.border = "3px solid #8f7a66";
  input.style.borderRadius = "6px";
  input.style.backgroundColor = "#fff";
  input.style.color = "#776e65";
  input.style.outline = "none";
  input.style.boxSizing = "border-box";

  // 移动设备适配
  if (window.innerWidth <= 520) {
    input.style.fontSize = "18px";
  }
  if (window.innerWidth <= 320) {
    input.style.fontSize = "16px";
  }

  // 添加到瓦片容器
  this.tileContainer.appendChild(input);

  // 选中文本并聚焦
  input.select();
  input.focus();

  // 保存输入值的函数
  var saveValue = function () {
    var value = input.value.trim();
    input.remove();

    if (value === "") {
      // 空值，移除瓦片
      gameManager.applyEditValue(position, 0);
      return;
    }

    var numValue = parseInt(value);

    // 验证输入
    if (isNaN(numValue) || numValue < 0) {
      // 获取当前语言
      var currentLang = window.I18n ? window.I18n.getCurrentLanguage() : "zh";
      var message =
        currentLang === "zh"
          ? "请输入有效的数字！"
          : "Please enter a valid number!";
      alert(message);
      return;
    }

    if (numValue > 0 && !gameManager.isPowerOfTwo(numValue)) {
      // 获取当前语言
      var currentLang = window.I18n ? window.I18n.getCurrentLanguage() : "zh";
      var message =
        currentLang === "zh"
          ? "请输入2的幂次方！(如: 2, 4, 8, 16, 32, 64, 128...)"
          : "Please enter a power of 2! (e.g: 2, 4, 8, 16, 32, 64, 128...)";
      alert(message);
      return;
    }

    // 应用值
    gameManager.applyEditValue(position, numValue);
  };

  // 取消编辑的函数
  var cancelEdit = function () {
    input.remove();
  };

  // 键盘事件处理
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      saveValue();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelEdit();
    }
  });

  // 失去焦点时取消编辑
  input.addEventListener("blur", function () {
    // 延迟一点，让用户有机会点击其他地方
    setTimeout(cancelEdit, 100);
  });
};

// 导出HTMLActuator类
export {HTMLActuator};
