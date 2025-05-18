window.fakeStorage = {
  _data: {},

  setItem: function (id, val) {
    return (this._data[id] = String(val));
  },

  getItem: function (id) {
    return this._data.hasOwnProperty(id) ? this._data[id] : null;
  },

  removeItem: function (id) {
    return delete this._data[id];
  },

  clear: function () {
    return (this._data = {});
  },
};

function LocalStorageManager() {
  this.bestScoreKey = "bestScore";
  this.gameStateKey = "gameState";
  this.savedGamesKey = "savedGames";
  this.maxSavedGames = 10; // 最大存档数量

  var supported = this.localStorageSupported();
  this.storage = supported ? window.localStorage : window.fakeStorage;
}

LocalStorageManager.prototype.localStorageSupported = function () {
  var testKey = "test";

  try {
    var storage = window.localStorage;
    storage.setItem(testKey, "1");
    storage.removeItem(testKey);
    return true;
  } catch (error) {
    return false;
  }
};

// Best score getters/setters
LocalStorageManager.prototype.getBestScore = function () {
  return this.storage.getItem(this.bestScoreKey) || 0;
};

LocalStorageManager.prototype.setBestScore = function (score) {
  this.storage.setItem(this.bestScoreKey, score);
};

// Game state getters/setters and clearing
LocalStorageManager.prototype.getGameState = function () {
  var stateJSON = this.storage.getItem(this.gameStateKey);
  return stateJSON ? JSON.parse(stateJSON) : null;
};

LocalStorageManager.prototype.setGameState = function (gameState) {
  this.storage.setItem(this.gameStateKey, JSON.stringify(gameState));
};

LocalStorageManager.prototype.clearGameState = function () {
  this.storage.removeItem(this.gameStateKey);
};

// 存档管理
LocalStorageManager.prototype.getSavedGames = function () {
  var savedJSON = this.storage.getItem(this.savedGamesKey);
  return savedJSON ? JSON.parse(savedJSON) : [];
};

LocalStorageManager.prototype.saveGameWithName = function (gameState, name) {
  var savedGames = this.getSavedGames();
  var timestamp = Date.now();
  var maxScore = this.getMaxScoreFromState(gameState);

  // 检查是否已存在相同名称的存档
  var sameNameIndex = -1;
  for (var i = 0; i < savedGames.length; i++) {
    if (savedGames[i].name === name) {
      sameNameIndex = i;
      break;
    }
  }

  // 如果存在同名存档，则覆盖它
  if (sameNameIndex !== -1) {
    savedGames[sameNameIndex] = {
      id: savedGames[sameNameIndex].id,
      name: name,
      state: gameState,
      timestamp: timestamp,
      maxScore: maxScore,
    };
  } else {
    // 否则添加新存档
    var newSavedGame = {
      id: timestamp,
      name: name,
      state: gameState,
      timestamp: timestamp,
      maxScore: maxScore,
    };

    // 如果超过最大存档数量，则删除最旧的存档
    if (savedGames.length >= this.maxSavedGames) {
      savedGames.sort(function (a, b) {
        return a.timestamp - b.timestamp;
      });
      savedGames.shift(); // 删除最旧的
    }

    savedGames.push(newSavedGame);
  }

  // 保存到本地存储
  this.storage.setItem(this.savedGamesKey, JSON.stringify(savedGames));

  return true;
};

LocalStorageManager.prototype.loadSavedGame = function (id) {
  var savedGames = this.getSavedGames();
  var gameToLoad = null;

  for (var i = 0; i < savedGames.length; i++) {
    if (savedGames[i].id === id) {
      gameToLoad = savedGames[i].state;
      break;
    }
  }

  if (gameToLoad) {
    this.setGameState(gameToLoad);
    return gameToLoad;
  }

  return null;
};

LocalStorageManager.prototype.deleteSavedGame = function (id) {
  var savedGames = this.getSavedGames();
  var newSavedGames = [];

  for (var i = 0; i < savedGames.length; i++) {
    if (savedGames[i].id !== id) {
      newSavedGames.push(savedGames[i]);
    }
  }

  this.storage.setItem(this.savedGamesKey, JSON.stringify(newSavedGames));
  return newSavedGames;
};

LocalStorageManager.prototype.getMaxScoreFromState = function (gameState) {
  if (!gameState || !gameState.grid || !gameState.grid.cells) {
    return 0;
  }

  var cells = gameState.grid.cells;
  var maxTile = 0;

  for (var x = 0; x < cells.length; x++) {
    for (var y = 0; y < cells[x].length; y++) {
      if (cells[x][y] && cells[x][y].value > maxTile) {
        maxTile = cells[x][y].value;
      }
    }
  }

  return maxTile;
};

// 导出LocalStorageManager类
export {LocalStorageManager};
