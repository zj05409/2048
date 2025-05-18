// 军衔主题显示系统

// 军衔主题配置
const militaryRanks = {
  2: "士兵",
  4: "班长",
  8: "排长",
  16: "连长",
  32: "营长",
  64: "团长",
  128: "旅长",
  256: "师长",
  512: "军长",
  1024: "司令",
  2048: "元帅",
  4096: "星际统帅",
  8192: "银河将军",
  16384: "宇宙司令",
  32768: "时空元帅",
  65536: "维度统领",
  131072: "宇宙主宰",
};

// 标记是否启用军衔主题
let militaryThemeEnabled = false;

// 获取当前语言
function getCurrentLanguage() {
  return window.I18n ? window.I18n.getCurrentLanguage() : "zh";
}

// 检查是否应该使用军衔主题
function shouldUseMilitaryTheme() {
  return militaryThemeEnabled && getCurrentLanguage() === "zh";
}

// 替换数字为军衔（仅用于显示）
function replaceTileValue(value) {
  if (shouldUseMilitaryTheme() && militaryRanks[value]) {
    // 创建扑克牌样式的HTML结构
    const html = `
      <span class="corner-number top-left">${value}</span>
      <span class="rank-name">${militaryRanks[value]}</span>
      <span class="corner-number bottom-right">${value}</span>
    `;
    return html;
  }
  return value;
}

// 应用或移除军衔主题样式
function applyMilitaryTheme() {
  const gameContainer = document.querySelector(".container");
  if (!gameContainer) return;

  if (shouldUseMilitaryTheme()) {
    gameContainer.classList.add("military-theme");
  } else {
    gameContainer.classList.remove("military-theme");
  }
}

// 修改HTMLActuator的addTile方法
function patchHTMLActuator() {
  // 确保HTMLActuator已被加载
  if (typeof HTMLActuator !== "undefined") {
    // 保存原始的addTile方法
    const originalAddTile = HTMLActuator.prototype.addTile;

    // 重写addTile方法
    HTMLActuator.prototype.addTile = function (tile) {
      const self = this;

      const wrapper = document.createElement("div");
      const inner = document.createElement("div");
      const position = tile.previousPosition || {x: tile.x, y: tile.y};
      const positionClass = this.positionClass(position);

      // We can't use classlist because it somehow glitches when replacing classes
      const classes = ["tile", "tile-" + tile.value, positionClass];

      if (tile.value > 2048) classes.push("tile-super");

      this.applyClasses(wrapper, classes);

      inner.classList.add("tile-inner");

      // 使用军衔替换数字（当启用军衔主题时）
      const tileContent = replaceTileValue(tile.value);

      // 检查是否返回的是HTML
      if (
        typeof tileContent === "string" &&
        tileContent.trim().startsWith("<")
      ) {
        inner.innerHTML = tileContent;
      } else {
        inner.textContent = tileContent;
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

      // Put the tile on the board
      this.tileContainer.appendChild(wrapper);
    };
  }
}

// 为Board.prototype.renderBoardHTML方法添加军衔主题支持
function patchBoardRender() {
  if (typeof Board !== "undefined" && Board.prototype.renderBoardHTML) {
    const originalRenderBoardHTML = Board.prototype.renderBoardHTML;

    Board.prototype.renderBoardHTML = function () {
      let html = '<div class="board-grid">';

      for (let y = 0; y < 4; y++) {
        html += '<div class="board-row">';
        for (let x = 0; x < 4; x++) {
          const value = this.get(y, x);
          // 对于历史棋盘，为了简单起见，仅显示数字和军衔，不使用扑克牌风格
          let displayValue = "";
          if (value !== 0) {
            if (shouldUseMilitaryTheme() && militaryRanks[value]) {
              displayValue = `${value}<br>${militaryRanks[value]}`;
            } else {
              displayValue = value;
            }
          }

          const cellClass =
            value === 0 ? "board-cell" : "board-cell tile-" + value;
          html += '<div class="' + cellClass + '">' + displayValue + "</div>";
        }
        html += "</div>";
      }

      html += "</div>";
      return html;
    };
  }
}

// 切换军衔主题
function toggleMilitaryTheme() {
  militaryThemeEnabled = !militaryThemeEnabled;

  // 保存设置
  localStorage.setItem("militaryThemeEnabled", militaryThemeEnabled);

  // 应用主题
  applyMilitaryTheme();

  // 刷新游戏显示，但不重新加载页面
  refreshGameDisplay();
}

// 刷新游戏显示
function refreshGameDisplay() {
  // 刷新当前棋盘
  if (window.gameManager) {
    // 获取当前游戏状态
    const grid = window.gameManager.grid;

    // 重新渲染游戏棋盘
    window.gameManager.actuator.actuate(grid, {
      score: window.gameManager.score,
      over: window.gameManager.over,
      won: window.gameManager.won,
      bestScore: window.gameManager.storageManager.getBestScore(),
      terminated: window.gameManager.isGameTerminated(),
    });

    // 刷新历史棋盘显示
    if (typeof window.gameManager.updatePreviousBoardDisplay === "function") {
      window.gameManager.updatePreviousBoardDisplay();
    }

    // 刷新实时评分面板
    if (typeof window.gameManager.updateRealTimeScoreDisplay === "function") {
      window.gameManager.updateRealTimeScoreDisplay();
    }
  }
}

// 添加主题切换按钮
function addThemeToggleButton() {
  const container = document.querySelector(".language-selector");
  if (!container) return;

  // 检查是否已经存在按钮
  const existingButton = container.querySelector(".theme-button");
  if (existingButton) return;

  const themeButton = document.createElement("a");
  themeButton.className = "theme-button";
  themeButton.textContent = militaryThemeEnabled ? "数字模式" : "军衔模式";
  themeButton.addEventListener("click", function () {
    toggleMilitaryTheme();
    this.textContent = militaryThemeEnabled ? "数字模式" : "军衔模式";
  });

  container.appendChild(themeButton);
}

// 初始化
function init() {
  // 尝试从localStorage读取主题设置
  if (localStorage.getItem("militaryThemeEnabled") === "true") {
    militaryThemeEnabled = true;
  }

  // 添加CSS样式
  const style = document.createElement("style");
  style.textContent = `
    .theme-button {
        display: inline-block;
        background: #8f7a66;
        border-radius: 3px;
        padding: 0 10px;
        text-decoration: none;
        color: white;
        height: 30px;
        line-height: 30px;
        margin-left: 10px;
        cursor: pointer;
    }
    .theme-button:hover {
        background: #9f8a76;
    }
  `;
  document.head.appendChild(style);

  // 添加主题切换按钮
  addThemeToggleButton();

  // 修改HTMLActuator
  patchHTMLActuator();

  // 修改Board渲染方法
  patchBoardRender();

  // 应用军衔主题样式
  applyMilitaryTheme();
}

// 监听DOM加载完成
document.addEventListener("DOMContentLoaded", init);

// 监听语言切换
document.addEventListener("click", function (e) {
  if (e.target.classList.contains("lang-button")) {
    // 如果切换到英文，禁用军衔主题
    if (e.target.getAttribute("data-lang") === "en") {
      militaryThemeEnabled = false;

      // 保存设置
      localStorage.setItem("militaryThemeEnabled", militaryThemeEnabled);

      // 移除军衔主题样式
      applyMilitaryTheme();

      // 更新按钮文字
      const themeButton = document.querySelector(".theme-button");
      if (themeButton) {
        themeButton.textContent = "军衔模式";
      }

      // 刷新游戏显示
      refreshGameDisplay();
    }
  }
});

// 导出公共接口
export const TileDisplay = {
  toggleMilitaryTheme,
  isMilitaryThemeEnabled: () => militaryThemeEnabled,
  replaceTileValue,
};

// 为了兼容非ESM环境，也暴露到全局作用域
window.TileDisplay = {
  toggleMilitaryTheme,
  isMilitaryThemeEnabled: () => militaryThemeEnabled,
  replaceTileValue,
};
