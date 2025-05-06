/**
 * 2048 AI算法 JavaScript实现
 * 基于期望最大化算法(Expectimax)
 */

// 核心配置参数
const SEARCH_DEPTH = 2;//原来是5
const CPROB_THRESHOLD = 0.0001;
const MAX_HISTORY = 10; // 最大历史记录数量

// 评分权重参数
const SCORE_EMPTY_WEIGHT = 270.0;
const SCORE_MERGES_WEIGHT = 700.0;
const SCORE_MONOTONICITY_WEIGHT = 47.0;
const SCORE_MONOTONICITY_POWER = 4.0;
const SCORE_SUM_WEIGHT = 11.0;
const SCORE_SUM_POWER = 3.5;
const SCORE_LOST_PENALTY = 200000.0;

/**
 * 表示游戏棋盘的类
 * 使用二维数组而不是位操作，以提高可读性
 */
class Board {
  constructor(grid) {
    this.grid = grid ? grid : Array(4).fill().map(() => Array(4).fill(0));
    this.history = []; // 用于存储历史状态
  }

  /**
   * 创建棋盘的深拷贝
   */
  clone() {
    return new Board(this.grid.map(row => [...row]));
  }

  /**
   * 获取指定位置的值
   */
  get(row, col) {
    return this.grid[row][col];
  }

  /**
   * 设置指定位置的值
   */
  set(row, col, value) {
    this.grid[row][col] = value;
  }

  /**
   * 执行向上移动
   */
  moveUp() {
    let moved = false;
    for (let col = 0; col < 4; col++) {
      const column = [this.grid[0][col], this.grid[1][col], this.grid[2][col], this.grid[3][col]];
      const newColumn = this.moveAndMergeArray(column);
      for (let row = 0; row < 4; row++) {
        if (this.grid[row][col] !== newColumn[row]) {
          moved = true;
          this.grid[row][col] = newColumn[row];
        }
      }
    }
    return moved;
  }

  /**
   * 执行向下移动
   */
  moveDown() {
    let moved = false;
    for (let col = 0; col < 4; col++) {
      const column = [this.grid[0][col], this.grid[1][col], this.grid[2][col], this.grid[3][col]];
      const newColumn = this.moveAndMergeArray(column.reverse()).reverse();
      for (let row = 0; row < 4; row++) {
        if (this.grid[row][col] !== newColumn[row]) {
          moved = true;
          this.grid[row][col] = newColumn[row];
        }
      }
    }
    return moved;
  }

  /**
   * 执行向左移动
   */
  moveLeft() {
    let moved = false;
    for (let row = 0; row < 4; row++) {
      const newRow = this.moveAndMergeArray([...this.grid[row]]);
      for (let col = 0; col < 4; col++) {
        if (this.grid[row][col] !== newRow[col]) {
          moved = true;
          this.grid[row][col] = newRow[col];
        }
      }
    }
    return moved;
  }

  /**
   * 执行向右移动
   */
  moveRight() {
    let moved = false;
    for (let row = 0; row < 4; row++) {
      const newRow = this.moveAndMergeArray([...this.grid[row]].reverse()).reverse();
      for (let col = 0; col < 4; col++) {
        if (this.grid[row][col] !== newRow[col]) {
          moved = true;
          this.grid[row][col] = newRow[col];
        }
      }
    }
    return moved;
  }

  /**
   * 移动并合并一个数组（一行或一列）
   * 实现2048游戏的基本移动规则
   */
  moveAndMergeArray(array) {
    const nonZeroValues = array.filter(val => val !== 0);
    const result = Array(4).fill(0);
    let resultIdx = 0;

    for (let i = 0; i < nonZeroValues.length; i++) {
      if (i < nonZeroValues.length - 1 && nonZeroValues[i] === nonZeroValues[i + 1]) {
        result[resultIdx++] = nonZeroValues[i] * 2;
        i++;
      } else {
        result[resultIdx++] = nonZeroValues[i];
      }
    }

    return result;
  }

  /**
   * 保存当前状态到历史记录
   */
  saveState() {
    const state = this.clone();
    this.history.push(state);

    // 限制历史记录长度
    if (this.history.length > MAX_HISTORY) {
      this.history.shift(); // 移除最老的记录
    }
  }

  /**
   * 撤销到上一步
   * 返回是否成功撤销
   */
  undo() {
    if (this.history.length === 0) {
      return false;
    }

    const previousState = this.history.pop();
    this.grid = previousState.grid;
    return true;
  }

  /**
   * 清空历史记录
   */
  clearHistory() {
    this.history = [];
  }

  /**
   * 获取可撤销的步数
   */
  getUndoCount() {
    return this.history.length;
  }

  /**
   * 执行一个移动
   * move: 0=上, 1=下, 2=左, 3=右
   */
  move(move) {
    // 保存当前状态以便撤销
    this.saveState();

    switch (move) {
      case 0: return this.moveUp();
      case 1: return this.moveDown();
      case 2: return this.moveLeft();
      case 3: return this.moveRight();
    }
    return false;
  }

  /**
   * 计算空格数量
   */
  countEmpty() {
    let count = 0;
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        if (this.grid[row][col] === 0) count++;
      }
    }
    return count;
  }

  /**
   * 计算棋盘上不同数字的数量
   */
  countDistinctTiles() {
    const uniqueTiles = new Set();
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        if (this.grid[row][col] !== 0) {
          uniqueTiles.add(this.grid[row][col]);
        }
      }
    }
    return uniqueTiles.size;
  }

  /**
   * 获取所有空位置
   */
  getEmptyPositions() {
    const empty = [];
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        if (this.grid[row][col] === 0) {
          empty.push({ row, col });
        }
      }
    }
    return empty;
  }

  /**
   * 在随机空位置添加一个新方块（90%几率为2，10%几率为4）
   * 可选参数saveHistory控制是否保存历史状态
   */
  addRandomTile(saveHistory = true) {
    if (saveHistory) {
      this.saveState();
    }

    const emptyPositions = this.getEmptyPositions();
    if (emptyPositions.length === 0) return false;

    const { row, col } = emptyPositions[Math.floor(Math.random() * emptyPositions.length)];
    this.grid[row][col] = Math.random() < 0.9 ? 2 : 4;
    return true;
  }

  /**
   * 检查游戏是否结束
   */
  isGameOver() {
    if (this.countEmpty() > 0) return false;

    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        const value = this.grid[row][col];
        if ((col < 3 && this.grid[row][col + 1] === value) ||
          (row < 3 && this.grid[row + 1][col] === value)) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * 获取棋盘的哈希值（用于缓存）
   */
  hash() {
    return this.grid.flat().join(',');
  }

  /**
   * 打印棋盘（用于调试）
   */
  print() {
    console.log('---------------------');
    for (let row = 0; row < 4; row++) {
      let rowStr = '|';
      for (let col = 0; col < 4; col++) {
        const val = this.grid[row][col];
        rowStr += val ? ` ${val.toString().padStart(4, ' ')} |` : '      |';
      }
      console.log(rowStr);
      console.log('---------------------');
    }
  }
}

/**
 * 2048 AI 算法的主类
 */
class AI2048 {
  constructor(searchDepth = SEARCH_DEPTH) {
    this.searchDepth = searchDepth;
    this.transTable = new Map();
    this.movesEvaluated = 0;
    this.cacheHits = 0;
    this.moveDetails = {}; // 添加存储移动详情的属性
  }

  /**
   * 重置统计信息
   */
  resetStats() {
    this.movesEvaluated = 0;
    this.cacheHits = 0;
    this.transTable.clear();
    this.moveDetails = {}; // 重置移动详情
  }

  /**
   * 为棋盘的一行或一列计算启发式评分
   * 返回详细的评分组成
   */
  scoreLineHeuristic(line, includeDetails = false) {
    let empty = 0;
    let merges = 0;
    let monotonicity_left = 0;
    let monotonicity_right = 0;
    let sum = 0;

    empty = line.filter(v => v === 0).length;

    let prevVal = 0;
    let counter = 0;
    for (let i = 0; i < 4; i++) {
      if (line[i] === 0) continue;

      const rank = Math.log2(line[i]);
      sum += Math.pow(rank, SCORE_SUM_POWER);

      if (prevVal === rank) {
        counter++;
      } else if (counter > 0) {
        merges += 1 + counter;
        counter = 0;
      }

      prevVal = rank;
    }
    if (counter > 0) {
      merges += 1 + counter;
    }

    for (let i = 1; i < 4; i++) {
      if (line[i - 1] === 0 || line[i] === 0) continue;

      const rankPrev = Math.log2(line[i - 1]);
      const rankCurr = Math.log2(line[i]);

      if (rankPrev > rankCurr) {
        monotonicity_left += Math.pow(rankPrev, SCORE_MONOTONICITY_POWER) -
          Math.pow(rankCurr, SCORE_MONOTONICITY_POWER);
      } else {
        monotonicity_right += Math.pow(rankCurr, SCORE_MONOTONICITY_POWER) -
          Math.pow(rankPrev, SCORE_MONOTONICITY_POWER);
      }
    }

    const emptyScore = SCORE_EMPTY_WEIGHT * empty;
    const mergesScore = SCORE_MERGES_WEIGHT * merges;
    const monotonicityScore = -SCORE_MONOTONICITY_WEIGHT * Math.min(monotonicity_left, monotonicity_right);
    const sumScore = -SCORE_SUM_WEIGHT * sum;

    const score = SCORE_LOST_PENALTY + emptyScore + mergesScore + monotonicityScore + sumScore;

    if (includeDetails) {
      return {
        score,
        details: {
          empty,
          emptyScore,
          merges,
          mergesScore,
          monotonicity: Math.min(monotonicity_left, monotonicity_right),
          monotonicityScore,
          sum,
          sumScore
        }
      };
    }

    return score;
  }

  /**
   * 计算棋盘的启发式评分
   * 可选参数includeDetails用于返回详细信息
   */
  evaluateBoard(board, includeDetails = false) {
    let score = 0;
    let details = {
      empty: 0,
      emptyScore: 0,
      merges: 0,
      mergesScore: 0,
      monotonicity: 0,
      monotonicityScore: 0,
      sum: 0,
      sumScore: 0
    };

    for (let row = 0; row < 4; row++) {
      if (includeDetails) {
        const rowResult = this.scoreLineHeuristic(board.grid[row], true);
        score += rowResult.score;
        details.empty += rowResult.details.empty;
        details.emptyScore += rowResult.details.emptyScore;
        details.merges += rowResult.details.merges;
        details.mergesScore += rowResult.details.mergesScore;
        details.monotonicity += rowResult.details.monotonicity;
        details.monotonicityScore += rowResult.details.monotonicityScore;
        details.sum += rowResult.details.sum;
        details.sumScore += rowResult.details.sumScore;
      } else {
        score += this.scoreLineHeuristic(board.grid[row]);
      }
    }

    for (let col = 0; col < 4; col++) {
      const column = [board.grid[0][col], board.grid[1][col], board.grid[2][col], board.grid[3][col]];
      if (includeDetails) {
        const colResult = this.scoreLineHeuristic(column, true);
        score += colResult.score;
        details.empty += colResult.details.empty;
        details.emptyScore += colResult.details.emptyScore;
        details.merges += colResult.details.merges;
        details.mergesScore += colResult.details.mergesScore;
        details.monotonicity += colResult.details.monotonicity;
        details.monotonicityScore += colResult.details.monotonicityScore;
        details.sum += colResult.details.sum;
        details.sumScore += colResult.details.sumScore;
      } else {
        score += this.scoreLineHeuristic(column);
      }
    }

    // 空格数修正：因为我们计算了行和列，所以每个空格被计算了两次
    if (includeDetails) {
      const actualEmpty = board.countEmpty();
      details.empty = actualEmpty; // 修正为实际的空格数
      details.emptyScore = SCORE_EMPTY_WEIGHT * actualEmpty * 2; // *2 因为行列都计算了一次

      return { score, details };
    }

    return score;
  }

  /**
   * 获取最佳移动
   * board: 当前棋盘状态
   * 返回: 最佳移动方向 (0=上, 1=下, 2=左, 3=右)
   */
  getBestMove(board) {
    this.resetStats();

    const distinctTiles = board.countDistinctTiles();
    const depthLimit = Math.max(3, distinctTiles - 2);
    this.searchDepth = Math.min(depthLimit, SEARCH_DEPTH);

    let bestScore = -1;
    let bestMove = -1;
    const moveScores = [];
    const directionNames = ['上', '下', '左', '右'];

    // 记录当前棋盘状态以便显示
    const currentBoard = board.clone();

    // 评估每个方向的移动
    for (let move = 0; move < 4; move++) {
      const newBoard = board.clone();
      if (newBoard.move(move)) {
        // 计算AI算法评分(深度搜索结果)
        const algorithmScore = this.scoreMove(newBoard, 1.0);

        // 计算静态评估分数和详情(显示用)
        const evalResult = this.evaluateBoard(newBoard, true);
        const details = evalResult.details;

        // 记录这个方向的详细信息
        moveScores.push({
          move,
          direction: directionNames[move],
          score: algorithmScore,       // AI决策使用的实际分数(来自深度搜索)
          details,
          boardAfterMove: newBoard.clone(),  // 保存移动后的棋盘状态
          valid: true
        });

        if (algorithmScore > bestScore) {
          bestScore = algorithmScore;
          bestMove = move;
        }

        this.movesEvaluated = 0;
        this.cacheHits = 0;
      } else {
        // 无效移动
        moveScores.push({
          move,
          direction: directionNames[move],
          score: -1,
          valid: false
        });
      }
    }

    // 保存移动详情以便外部访问
    this.moveDetails = {
      bestMove,
      bestDirection: directionNames[bestMove],
      moveScores,
      currentBoard: currentBoard,  // 添加当前棋盘状态
      factorExplanations: {
        empty: "空格数量 - 空格越多越好，给予游戏更多可能性",
        merges: "可合并方块 - 可合并的方块数量越多越好",
        monotonicity: "单调性 - 数值沿某个方向单调递增/递减程度",
        sum: "方块总和 - 大数值方块聚集在边角更好"
      },
      weightExplanations: {
        emptyWeight: `空格权重 (${SCORE_EMPTY_WEIGHT}) - 空格对游戏的影响程度`,
        mergesWeight: `合并权重 (${SCORE_MERGES_WEIGHT}) - 合并对游戏的影响程度`,
        monotonicityWeight: `单调性权重 (${SCORE_MONOTONICITY_WEIGHT}) - 单调性对游戏的影响程度`,
        sumWeight: `总和权重 (${SCORE_SUM_WEIGHT}) - 数值总和对游戏的影响程度`
      },
      scoreExplanation: "括号中的数字表示该因素对总分的具体贡献值。例如，空格(270)表示空格因素为总分贡献了270分。负号表示减分项，如总和(-293)表示方块总和因素减少了293分。"
    };

    return bestMove;
  }

  /**
   * 获取最后一次决策的详细信息
   */
  getLastMoveDetails() {
    return this.moveDetails;
  }

  /**
   * 评估某个移动的分数
   * 这是expectimax算法的入口点
   */
  scoreMove(board, probability) {
    return this.scoreTileChooseNode(board, probability, 0);
  }

  /**
   * 评估随机添加方块的所有可能性
   * 这是expectimax的随机节点
   */
  scoreTileChooseNode(board, probability, depth) {
    if (probability < CPROB_THRESHOLD || depth >= this.searchDepth) {
      return this.evaluateBoard(board);
    }

    const boardHash = board.hash();
    if (this.transTable.has(boardHash)) {
      this.cacheHits++;
      return this.transTable.get(boardHash);
    }

    const emptyPositions = board.getEmptyPositions();
    if (emptyPositions.length === 0) {
      return this.evaluateBoard(board);
    }

    probability /= emptyPositions.length;
    let totalScore = 0;

    for (const { row, col } of emptyPositions) {
      board.set(row, col, 2);
      totalScore += 0.9 * this.scoreMoveNode(board, probability * 0.9, depth);

      board.set(row, col, 4);
      totalScore += 0.1 * this.scoreMoveNode(board, probability * 0.1, depth);

      board.set(row, col, 0);
    }

    const averageScore = totalScore / emptyPositions.length;
    this.transTable.set(boardHash, averageScore);

    return averageScore;
  }

  /**
   * 评估所有可能的移动
   * 这是expectimax的最大节点
   */
  scoreMoveNode(board, probability, depth) {
    depth++;
    this.movesEvaluated++;

    let bestScore = 0;

    for (let move = 0; move < 4; move++) {
      const newBoard = board.clone();
      if (newBoard.move(move)) {
        const score = this.scoreTileChooseNode(newBoard, probability, depth);
        bestScore = Math.max(bestScore, score);
      }
    }

    if (bestScore === 0) {
      return this.evaluateBoard(board);
    }

    return bestScore;
  }
}

// 导出AI类，以便在游戏中使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Board, AI2048 };
}

// 简单的演示函数
function demo() {
  const board = new Board([
    [0, 0, 2, 2],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0]
  ]);

  const ai = new AI2048();
  const bestMove = ai.getBestMove(board);

  console.log(`最佳移动: ${['上', '下', '左', '右'][bestMove]}`);
}

// 如果在浏览器中运行，执行演示
if (typeof window !== 'undefined') {
  window.Board = Board;
  window.AI2048 = AI2048;
  window.demo = demo;
}
