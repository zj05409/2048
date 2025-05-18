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

// 辈分主题配置
const familyRanks = {
  2: "曾孙",
  4: "孙子",
  8: "儿子",
  16: "自己",
  32: "父亲",
  64: "祖父",
  128: "曾祖",
  256: "高祖",
  512: "天祖",
  1024: "烈祖",
  2048: "太祖",
  4096: "远祖",
  8192: "鼻祖",
  16384: "始祖",
  32768: "人祖",
  65536: "圣祖",
  131072: "神祖",
};

// 后宫主题配置
const haremRanks = {
  2: "侍女",
  4: "宫女",
  8: "才女",
  16: "美姬",
  32: "贵妃",
  64: "皇妃",
  128: "皇后",
  256: "太后",
  512: "女王",
  1024: "女帝",
  2048: "天后",
  4096: "星后",
  8192: "银女王",
  16384: "宇女皇",
  32768: "时空后",
  65536: "维度后",
  131072: "宇主宰",
};

// 主题类型
const ThemeType = {
  NUMBER: "number", // 数字模式
  MILITARY: "military", // 军衔模式
  FAMILY: "family", // 辈分模式
  HAREM: "harem", // 后宫模式
};

// 主题数据
const themes = {
  [ThemeType.NUMBER]: {
    displayName: "数字模式",
    cssClass: "",
    data: null,
  },
  [ThemeType.MILITARY]: {
    displayName: "军衔模式",
    cssClass: "military-theme",
    data: militaryRanks,
  },
  [ThemeType.FAMILY]: {
    displayName: "辈分模式",
    cssClass: "military-theme family-theme", // 复用military-theme的样式
    data: familyRanks,
  },
  [ThemeType.HAREM]: {
    displayName: "后宫模式",
    cssClass: "military-theme harem-theme", // 复用military-theme的样式结构
    data: haremRanks,
  },
};

// 当前激活的主题
let activeTheme = ThemeType.NUMBER;

// 获取当前语言
function getCurrentLanguage() {
  return window.I18n ? window.I18n.getCurrentLanguage() : "zh";
}

// 检查是否应该使用特殊主题
function shouldUseTheme() {
  return activeTheme !== ThemeType.NUMBER && getCurrentLanguage() === "zh";
}

// 获取当前主题数据
function getThemeData() {
  return themes[activeTheme].data;
}

// 替换数字为主题名称（仅用于显示）
function replaceTileValue(value) {
  const themeData = getThemeData();

  if (shouldUseTheme() && themeData && themeData[value]) {
    // 创建扑克牌样式的HTML结构
    const html = `
      <span class="corner-number top-left">${value}</span>
      <span class="rank-name">${themeData[value]}</span>
      <span class="corner-number bottom-right">${value}</span>
    `;
    return html;
  }
  return value;
}

// 应用或移除主题样式
function applyTheme() {
  const gameContainer = document.querySelector(".container");
  if (!gameContainer) return;

  // 移除所有主题类
  Object.values(themes).forEach((theme) => {
    if (theme.cssClass) {
      const classes = theme.cssClass.split(" ");
      classes.forEach((cls) => {
        if (cls) gameContainer.classList.remove(cls);
      });
    }
  });

  // 添加当前主题类
  if (shouldUseTheme()) {
    const currentThemeClasses = themes[activeTheme].cssClass.split(" ");
    currentThemeClasses.forEach((cls) => {
      if (cls) gameContainer.classList.add(cls);
    });
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

      // 使用主题替换数字（当启用特殊主题时）
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

// 为Board.prototype.renderBoardHTML方法添加主题支持
function patchBoardRender() {
  if (typeof Board !== "undefined" && Board.prototype.renderBoardHTML) {
    const originalRenderBoardHTML = Board.prototype.renderBoardHTML;

    Board.prototype.renderBoardHTML = function () {
      let html = '<div class="board-grid">';

      const themeData = getThemeData();

      for (let y = 0; y < 4; y++) {
        html += '<div class="board-row">';
        for (let x = 0; x < 4; x++) {
          const value = this.get(y, x);
          // 对于历史棋盘，为了简单起见，仅显示数字和主题名称，不使用扑克牌风格
          let displayValue = "";
          if (value !== 0) {
            if (shouldUseTheme() && themeData && themeData[value]) {
              displayValue = `${value}<br>${themeData[value]}`;
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

// 切换主题
function toggleTheme() {
  // 获取所有主题类型
  const themeTypes = Object.keys(themes);

  // 找到当前主题的索引
  const currentIndex = themeTypes.indexOf(activeTheme);

  // 切换到下一个主题（循环）
  const nextIndex = (currentIndex + 1) % themeTypes.length;
  activeTheme = themeTypes[nextIndex];

  // 保存设置
  localStorage.setItem("activeTheme", activeTheme);

  // 应用主题
  applyTheme();

  // 刷新游戏显示，但不重新加载页面
  refreshGameDisplay();

  // 返回新主题的显示名称
  return themes[activeTheme].displayName;
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
  themeButton.textContent = themes[activeTheme].displayName;
  themeButton.addEventListener("click", function () {
    const newThemeName = toggleTheme();
    this.textContent = newThemeName;
  });

  container.appendChild(themeButton);
}

// 初始化
function init() {
  // 尝试从localStorage读取主题设置
  const savedTheme = localStorage.getItem("activeTheme");
  if (savedTheme && themes[savedTheme]) {
    activeTheme = savedTheme;
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
    
    /* 辈分模式的特定样式 */
    .family-theme .tile-2 .tile-inner { background: #F8F8D8; }
    .family-theme .tile-4 .tile-inner { background: #F5E8B5; }
    .family-theme .tile-8 .tile-inner { background: #F2D4A2; }
    .family-theme .tile-16 .tile-inner { background: #F0C088; }
    .family-theme .tile-32 .tile-inner { background: #EDAC74; }
    .family-theme .tile-64 .tile-inner { background: #E09856; }
    .family-theme .tile-128 .tile-inner { background: #DC8442; }
    .family-theme .tile-256 .tile-inner { background: #D77035; }
    .family-theme .tile-512 .tile-inner { background: #CC5C28; }
    .family-theme .tile-1024 .tile-inner { background: #BD3D13; }
    .family-theme .tile-2048 .tile-inner { background: #AA2808; }
    .family-theme .tile-super .tile-inner { background: #800000; }
    
    /* 后宫模式的特定样式 */
    .harem-theme .tile-2 .tile-inner { background: #FFECF5; }
    .harem-theme .tile-4 .tile-inner { background: #FFD6E9; }
    .harem-theme .tile-8 .tile-inner { background: #FFC1DD; }
    .harem-theme .tile-16 .tile-inner { background: #FFACD1; }
    .harem-theme .tile-32 .tile-inner { background: #FF97C5; }
    .harem-theme .tile-64 .tile-inner { background: #FF82B9; }
    .harem-theme .tile-128 .tile-inner { background: #FF6EAD; color: white; }
    .harem-theme .tile-256 .tile-inner { background: #FF59A1; color: white; }
    .harem-theme .tile-512 .tile-inner { background: #FF4595; color: white; }
    .harem-theme .tile-1024 .tile-inner { background: #FF3089; color: white; }
    .harem-theme .tile-2048 .tile-inner { background: #FF1C7D; color: white; }
    .harem-theme .tile-super .tile-inner { background: #D4006E; color: white; }
  `;
  document.head.appendChild(style);

  // 添加主题切换按钮
  addThemeToggleButton();

  // 修改HTMLActuator
  patchHTMLActuator();

  // 修改Board渲染方法
  patchBoardRender();

  // 应用主题样式
  applyTheme();
}

// 监听DOM加载完成
document.addEventListener("DOMContentLoaded", init);

// 监听语言切换
document.addEventListener("click", function (e) {
  if (e.target.classList.contains("lang-button")) {
    // 如果切换到英文，设回数字模式
    if (e.target.getAttribute("data-lang") === "en") {
      activeTheme = ThemeType.NUMBER;

      // 保存设置
      localStorage.setItem("activeTheme", activeTheme);

      // 移除主题样式
      applyTheme();

      // 更新按钮文字
      const themeButton = document.querySelector(".theme-button");
      if (themeButton) {
        themeButton.textContent = themes[activeTheme].displayName;
      }

      // 刷新游戏显示
      refreshGameDisplay();
    }
  }
});

// 导出公共接口
export const TileDisplay = {
  toggleTheme,
  getActiveTheme: () => activeTheme,
  replaceTileValue,
};

// 为了兼容非ESM环境，也暴露到全局作用域
window.TileDisplay = {
  toggleTheme,
  getActiveTheme: () => activeTheme,
  replaceTileValue,
};
