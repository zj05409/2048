#include <ctype.h>
#include <math.h>
#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <algorithm>

#include "2048.h"

#include "config.h"
// 根据环境选择合适的哈希表实现
#if defined(HAVE_UNORDERED_MAP)
    #include <unordered_map>
    typedef std::unordered_map<board_t, trans_table_entry_t> trans_table_t;
#elif defined(HAVE_TR1_UNORDERED_MAP)
    #include <tr1/unordered_map>
    typedef std::tr1::unordered_map<board_t, trans_table_entry_t> trans_table_t;
#else
    #include <map>
    typedef std::map<board_t, trans_table_entry_t> trans_table_t;
#endif

/* MSVC兼容性：取消定义max和min宏 */
#if defined(max)
#undef max
#endif

#if defined(min)
#undef min
#endif

// 转置棋盘的行/列:
//   0123       048c
//   4567  -->  159d
//   89ab       26ae
//   cdef       37bf
// 每个数字代表4位(nibble)，整个棋盘用一个64位整数表示
static inline board_t transpose(board_t x)
{
    board_t a1 = x & 0xF0F00F0FF0F00F0FULL;
    board_t a2 = x & 0x0000F0F00000F0F0ULL;
    board_t a3 = x & 0x0F0F00000F0F0000ULL;
    board_t a = a1 | (a2 << 12) | (a3 >> 12);
    board_t b1 = a & 0xFF00FF0000FF00FFULL;
    board_t b2 = a & 0x00FF00FF00000000ULL;
    board_t b3 = a & 0x00000000FF00FF00ULL;
    return b1 | (b2 >> 24) | (b3 << 24);
}

// 计算棋盘上空位置(值为0的格子)的数量
// 前提条件：棋盘不能完全为空
static int count_empty(board_t x)
{
    // 使用位操作高效地计算空位数量
    x |= (x >> 2) & 0x3333333333333333ULL;
    x |= (x >> 1);
    x = ~x & 0x1111111111111111ULL;
    // 此时每个4位(nibble)中的值为:
    //  0 表示原始值非零
    //  1 表示原始值为零
    // 现在计算所有这些位的总和
    x += x >> 32;
    x += x >> 16;
    x += x >>  8;
    x += x >>  4; // 如果有16个空位，这可能会溢出到下一个nibble
    return x & 0xf;
}

/* 我们可以通过使用包含65536个条目的数组一次检索一行状态 */

/* 移动表。每一行或压缩的列都映射到(oldrow^newrow)，假设是行/列0。
 * 
 * 因此，如果没有移动，值为0；否则等于一个可以轻松地
 * 与当前棋盘状态进行异或操作以更新棋盘的值。 */
static row_t row_left_table [65536]; // 向左移动的变化表
static row_t row_right_table[65536]; // 向右移动的变化表
static board_t col_up_table[65536];  // 向上移动的变化表
static board_t col_down_table[65536]; // 向下移动的变化表
static float heur_score_table[65536]; // 启发式评分表
static float score_table[65536]; // 游戏分数表

// 启发式评分参数设置
// 这些参数是AI决策的核心权重，决定了不同因素对最终评分的影响程度
static const float SCORE_LOST_PENALTY = 200000.0f;        // 失败惩罚权重: 基础得分，确保最终分数在合理范围内
static const float SCORE_MONOTONICITY_POWER = 4.0f;       // 单调性的幂次: 用于计算相邻格子间值差的幂函数，放大差异
static const float SCORE_MONOTONICITY_WEIGHT = 47.0f;     // 单调性权重: 控制单调性在总评分中的重要性，值越大则数字排列越重要
static const float SCORE_SUM_POWER = 3.5f;                // 总和的幂次: 用于计算每个格子值的幂函数，放大大数字的影响
static const float SCORE_SUM_WEIGHT = 11.0f;              // 总和权重: 控制总和在评分中的影响程度，较大值使AI倾向保持小数字
static const float SCORE_MERGES_WEIGHT = 700.0f;          // 合并权重: 控制合并机会在评分中的重要性，较大值使合并成为优先策略
static const float SCORE_EMPTY_WEIGHT = 270.0f;           // 空格权重: 控制空格数量在评分中的重要性，较大值使保持空格成为关键目标

void init_tables() {
    for (unsigned row = 0; row < 65536; ++row) {
        unsigned line[4] = {
                (row >>  0) & 0xf, // 提取第一个位置的值 (取最低4位)
                (row >>  4) & 0xf, // 提取第二个位置的值 (取次低4位)
                (row >>  8) & 0xf, // 提取第三个位置的值 (取次高4位)
                (row >> 12) & 0xf  // 提取第四个位置的值 (取最高4位)
        };

        // 计算游戏分数
        float score = 0.0f;
        for (int i = 0; i < 4; ++i) {
            int rank = line[i];
            if (rank >= 2) {
                // 分数是方块值和所有中间合并方块的总和
                // (rank - 1) 是合并次数, (1 << rank) 是方块的值
                // 例如: 若方块值为8(rank=3)，得分为(3-1)*2^3=2*8=16
                score += (rank - 1) * (1 << rank);
            }
        }
        score_table[row] = score;

        // 启发式评分计算
        // 这部分计算的是AI的决策评分，由四个关键要素组成，而非游戏得分
        float sum = 0;         // 所有方块值的加权和，用于评估棋盘的"重量"
        int empty = 0;         // 空格数量，空格越多移动空间越大
        int merges = 0;        // 可合并的方块数，合并可能性越多越好

        // 1. 计算空格数量和可合并方块数
        int prev = 0;          // 记录前一个非零方块的值
        int counter = 0;       // 连续相同值方块的计数器
        for (int i = 0; i < 4; ++i) {
            int rank = line[i];
            // 计算方块值的SCORE_SUM_POWER次方之和
            // 例如：如果rank=3(值为8)，sum += 3^3.5
            sum += pow(rank, SCORE_SUM_POWER); // 累加每个方块值的加权幂

            if (rank == 0) {
                empty++; // 统计空格数：遇到0就累加
            } else {
                if (prev == rank) {
                    counter++; // 统计连续相同值：当前值与前一个值相同时累加
                } else if (counter > 0) {
                    // 当遇到不同值且之前有连续相同值时，记录合并可能性
                    // 例如：[2,2,2,4] 在i=3时，发现值不同，记录前面的连续2
                    // merges += 1 + counter: 1表示合并事件，counter表示连续数量
                    // 所以对[2,2,2,4]，计算为1+2=3个合并可能性
                    merges += 1 + counter; 
                    counter = 0;
                }
                prev = rank; // 更新前一个非零值
            }
        }
        // 处理行末可能的连续相同值
        // 例如：[2,4,4,4]在循环结束后，counter=2，需要加上1+2=3
        if (counter > 0) {
            merges += 1 + counter;
        }

        // 2. 计算单调性(monotonicity)评分
        // 单调性是指数字沿某个方向递增或递减的程度
        // 高单调性意味着大数字排列更有序，有助于合并操作
        float monotonicity_left = 0;  // 左侧单调性：从左向右递增的程度
        float monotonicity_right = 0; // 右侧单调性：从左向右递减的程度

        // 遍历每对相邻的方块计算单调性
        for (int i = 1; i < 4; ++i) {
            if (line[i-1] > line[i]) { 
                // 如果左边的数大于右边的数（递减）
                // 左侧单调性增加，数值为两个数的幂差
                // 差异越大，单调性值越大
                // 例如：[8,4]的递减单调性 = 8^4 - 4^4
                monotonicity_left += pow(line[i-1], SCORE_MONOTONICITY_POWER) - 
                                    pow(line[i], SCORE_MONOTONICITY_POWER);
            } else {
                // 如果左边的数小于等于右边的数（递增）
                // 右侧单调性增加，数值为两个数的幂差
                // 例如：[2,4]的递增单调性 = 4^4 - 2^4
                monotonicity_right += pow(line[i], SCORE_MONOTONICITY_POWER) - 
                                     pow(line[i-1], SCORE_MONOTONICITY_POWER);
            }
        }

        // 3. 最终的启发式分数计算
        // 将四个关键要素加权组合得到最终评分
        // a. SCORE_LOST_PENALTY：基础惩罚值，确保分数在正常范围
        // b. 空格评分：空格越多越好，提供更多操作空间
        // c. 合并评分：合并可能性越多越好，增加游戏进展机会
        // d. 单调性评分：取左右单调性的较小值，鼓励数字形成单调序列
        // e. 总和评分：总和越小越好，避免出现太多大数字导致游戏难度增加
        heur_score_table[row] = SCORE_LOST_PENALTY +
            SCORE_EMPTY_WEIGHT * empty +                                // 空格评分(正向贡献)
            SCORE_MERGES_WEIGHT * merges -                              // 合并评分(正向贡献)
            SCORE_MONOTONICITY_WEIGHT * std::min(monotonicity_left, monotonicity_right) - // 单调性评分(负向贡献)
            SCORE_SUM_WEIGHT * sum;                                     // 总和评分(负向贡献)

        // 执行向左移动的操作
        // 模拟2048游戏的移动规则
        for (int i = 0; i < 3; ++i) {
            int j;
            for (j = i + 1; j < 4; ++j) {
                if (line[j] != 0) break; // 找到右侧第一个非零值
            }
            if (j == 4) break; // 右侧没有更多的方块

            if (line[i] == 0) {
                // 如果当前位置为空，则将右侧非零值移动过来
                line[i] = line[j];
                line[j] = 0;
                i--; // 重新检查当前位置
            } else if (line[i] == line[j]) {
                if(line[i] != 0xf) { // 最大值为2^15，避免溢出
                    // 如果当前位置与右侧值相同，则合并
                    line[i]++;
                }
                line[j] = 0;
            }
        }

        // 计算移动后的行值
        row_t result = (line[0] <<  0) |
                       (line[1] <<  4) |
                       (line[2] <<  8) |
                       (line[3] << 12);
        row_t rev_result = reverse_row(result); // 反转结果用于计算右移
        unsigned rev_row = reverse_row(row);    // 反转原始行用于计算右移

        // 存储不同方向的移动变化
        // 通过异或(^)操作，计算移动前后的差异，用于高效更新棋盘
        row_left_table [    row] =                row  ^                result;
        row_right_table[rev_row] =            rev_row  ^            rev_result;
        col_up_table   [    row] = unpack_col(    row) ^ unpack_col(    result);
        col_down_table [rev_row] = unpack_col(rev_row) ^ unpack_col(rev_result);
    }
}

// 执行向上移动
static inline board_t execute_move_0(board_t board) {
    board_t ret = board;
    board_t t = transpose(board); // 转置棋盘使列变为行
    // 对每一列(转置后的行)应用向上移动
    ret ^= col_up_table[(t >>  0) & ROW_MASK] <<  0;
    ret ^= col_up_table[(t >> 16) & ROW_MASK] <<  4;
    ret ^= col_up_table[(t >> 32) & ROW_MASK] <<  8;
    ret ^= col_up_table[(t >> 48) & ROW_MASK] << 12;
    return ret;
}

// 执行向下移动
static inline board_t execute_move_1(board_t board) {
    board_t ret = board;
    board_t t = transpose(board); // 转置棋盘使列变为行
    // 对每一列(转置后的行)应用向下移动
    ret ^= col_down_table[(t >>  0) & ROW_MASK] <<  0;
    ret ^= col_down_table[(t >> 16) & ROW_MASK] <<  4;
    ret ^= col_down_table[(t >> 32) & ROW_MASK] <<  8;
    ret ^= col_down_table[(t >> 48) & ROW_MASK] << 12;
    return ret;
}

// 执行向左移动
static inline board_t execute_move_2(board_t board) {
    board_t ret = board;
    // 对每一行应用向左移动
    ret ^= board_t(row_left_table[(board >>  0) & ROW_MASK]) <<  0;
    ret ^= board_t(row_left_table[(board >> 16) & ROW_MASK]) << 16;
    ret ^= board_t(row_left_table[(board >> 32) & ROW_MASK]) << 32;
    ret ^= board_t(row_left_table[(board >> 48) & ROW_MASK]) << 48;
    return ret;
}

// 执行向右移动
static inline board_t execute_move_3(board_t board) {
    board_t ret = board;
    // 对每一行应用向右移动
    ret ^= board_t(row_right_table[(board >>  0) & ROW_MASK]) <<  0;
    ret ^= board_t(row_right_table[(board >> 16) & ROW_MASK]) << 16;
    ret ^= board_t(row_right_table[(board >> 32) & ROW_MASK]) << 32;
    ret ^= board_t(row_right_table[(board >> 48) & ROW_MASK]) << 48;
    return ret;
}

/* 执行指定方向的移动 */
board_t execute_move(int move, board_t board) {
    switch(move) {
    case 0: // 上
        return execute_move_0(board);
    case 1: // 下
        return execute_move_1(board);
    case 2: // 左
        return execute_move_2(board);
    case 3: // 右
        return execute_move_3(board);
    default:
        return ~0ULL; // 无效移动返回全1
    }
}

// 获取棋盘上的最大数字等级(2的幂次)
static inline int get_max_rank(board_t board) {
    int maxrank = 0;
    while (board) {
        maxrank = std::max(maxrank, int(board & 0xf));
        board >>= 4;
    }
    return maxrank;
}

// 计算棋盘上不同数字的数量
// 此数量用来动态调整搜索深度：数字越多，游戏状态越复杂，搜索深度越大
static inline int count_distinct_tiles(board_t board) {
    uint16_t bitset = 0;
    while (board) {
        bitset |= 1<<(board & 0xf);
        board >>= 4;
    }

    // 不计算空格
    bitset >>= 1;

    int count = 0;
    while (bitset) {
        bitset &= bitset - 1; // 清除最低位的1
        count++;
    }
    return count;
}

/**
 * Expectimax算法实现及决策过程说明
 * -----------------------------
 * 本AI使用Expectimax算法，该算法适用于既有玩家决策又有随机事件的游戏。
 * 算法核心是通过模拟未来可能的游戏状态来评估当前每一种可能移动的价值。
 * 
 * 计算过程说明:
 * 1. 计算不是在模拟运行几次游戏后进行的，而是在每次决策前实时进行
 * 2. 对于每个可能的移动方向，AI会构建一棵搜索树:
 *    - 最大节点(score_move_node)：代表玩家的移动选择，选择最大化得分的方向
 *    - 随机节点(score_tilechoose_node)：代表游戏随机生成新方块，计算期望得分
 * 3. 搜索深度由棋盘复杂度动态决定，一般为3-5层
 * 4. 每个节点的评估是即时进行的，而不是等到游戏结束后
 * 
 * 算法流程:
 * a. 对每个移动方向，计算移动后的棋盘状态
 * b. 对每个可能的新方块位置和值，计算之后的最优移动
 * c. 递归进行上述步骤，直到达到搜索深度限制
 * d. 使用启发式函数评估叶节点的棋盘状态
 * e. 将评估结果向上传播，计算每个移动的期望得分
 * f. 选择得分最高的移动方向
 */

// 评估状态结构体，用于存储搜索过程中的状态信息
struct eval_state {
    trans_table_t trans_table; // 置换表，缓存之前看到的移动
    int maxdepth;              // 最大搜索深度
    int curdepth;              // 当前搜索深度
    int cachehits;             // 缓存命中次数
    unsigned long moves_evaled; // 评估的移动次数
    int depth_limit;           // 深度限制

    eval_state() : maxdepth(0), curdepth(0), cachehits(0), moves_evaled(0), depth_limit(0) {
    }
};

// 使用启发式函数评估单个棋盘状态
static float score_heur_board(board_t board);
// 实际评分单个棋盘状态(包括从生成的4方块获得的分数)
static float score_board(board_t board);
// 评估所有可能的移动
static float score_move_node(eval_state &state, board_t board, float cprob);
// 评估所有可能的方块选择和放置
static float score_tilechoose_node(eval_state &state, board_t board, float cprob);

// 辅助函数，使用表格评分行或列
static float score_helper(board_t board, const float* table) {
    // 对棋盘的每一行应用评分表，并将结果相加
    // 每次提取16位(4个方块)作为一行
    return table[(board >>  0) & ROW_MASK] +  // 第一行的评分
           table[(board >> 16) & ROW_MASK] +  // 第二行的评分
           table[(board >> 32) & ROW_MASK] +  // 第三行的评分
           table[(board >> 48) & ROW_MASK];   // 第四行的评分
}

// 使用启发式表计算棋盘评分
// 同时考虑行和转置后的行(即原棋盘的列)，实现水平和垂直方向的评估
static float score_heur_board(board_t board) {
    return score_helper(          board , heur_score_table) +  // 行方向的评分
           score_helper(transpose(board), heur_score_table);   // 列方向的评分（通过转置实现）
}

// 计算棋盘的实际游戏得分
static float score_board(board_t board) {
    return score_helper(board, score_table);
}

// 统计与控制参数
// cprob: 累积概率
// 不要递归到累积概率小于此阈值的节点
static const float CPROB_THRESH_BASE = 0.0001f; //, 基础概率阈值，低于此值的节点将不再搜索
static const int CACHE_DEPTH_LIMIT  = 15;       // 缓存深度限制，控制置换表的使用深度

// 评估随机放置方块后的所有可能状态
// 这是expectimax算法的随机节点，处理游戏的随机性(新方块的生成)
static float score_tilechoose_node(eval_state &state, board_t board, float cprob) {
    // 如果概率太小或已达到深度限制，直接返回启发式评分
    // 这是搜索树的剪枝策略，避免低概率分支的过度搜索
    if (cprob < CPROB_THRESH_BASE || state.curdepth >= state.depth_limit) {
        state.maxdepth = std::max(state.curdepth, state.maxdepth);
        return score_heur_board(board); // 返回当前棋盘的启发式评分
    }
    
    // 检查置换表，避免重复计算
    // 置换表是一种记忆化搜索技术，存储已计算过的棋盘状态及其评分
    if (state.curdepth < CACHE_DEPTH_LIMIT) {
        const trans_table_t::iterator &i = state.trans_table.find(board);
        if (i != state.trans_table.end()) {
            trans_table_entry_t entry = i->second;
            /*
            仅当从置换表中的启发式表示节点至少被评估到状态的深度限制时，才返回。
            这将导致略少的缓存命中，但不应对AI的强度产生负面影响。
            */
            if(entry.depth <= state.curdepth) {
                state.cachehits++;
                return entry.heuristic; // 直接返回缓存的评分
            }
        }
    }

    // 计算空格数量并调整概率
    // 空格越多，每个空格被选中的概率越低
    int num_open = count_empty(board);
    cprob /= num_open; // 将当前概率平均分配给每个空格

    // 计算所有可能的新方块位置和值的平均得分
    float res = 0.0f;
    board_t tmp = board;
    board_t tile_2 = 1; // 表示值为2的方块(在内部编码中为1)
    while (tile_2) {
        if ((tmp & 0xf) == 0) { // 如果位置为空
            // 考虑放置2(90%概率)和4(10%概率)的情况
            // 对每种可能性计算后续移动的最佳分数，并按概率加权
            res += score_move_node(state, board |  tile_2      , cprob * 0.9f) * 0.9f; // 放置2的情况
            res += score_move_node(state, board | (tile_2 << 1), cprob * 0.1f) * 0.1f; // 放置4的情况
        }
        tmp >>= 4;     // 检查下一个位置
        tile_2 <<= 4;  // 更新方块位置
    }
    res = res / num_open; // 计算所有可能性的平均得分

    // 将结果存入置换表，以便未来重用
    if (state.curdepth < CACHE_DEPTH_LIMIT) {
        trans_table_entry_t entry = {static_cast<uint8_t>(state.curdepth), res};
        state.trans_table[board] = entry;
    }

    return res;
}

// 评估所有可能的移动
// 这是expectimax算法的最大节点，选择玩家的最佳移动
static float score_move_node(eval_state &state, board_t board, float cprob) {
    float best = 0.0f; // 记录最佳得分
    state.curdepth++; // 增加搜索深度
    
    // 尝试四个方向的移动，选择得分最高的
    for (int move = 0; move < 4; ++move) {
        board_t newboard = execute_move(move, board);
        state.moves_evaled++; // 统计评估的移动次数

        if (board != newboard) { // 如果移动有效(棋盘发生了变化)
            // 计算该移动后的最佳得分，通过递归调用随机节点
            // 这模拟了游戏的随机生成新方块过程
            float score = score_tilechoose_node(state, newboard, cprob);
            best = std::max(best, score); // 更新最佳得分
        }
    }
    state.curdepth--; // 回溯搜索深度

    if (best == 0.0f) {
        // 如果所有移动都无效或得分为0，直接返回当前棋盘的启发式评分
        // 这通常意味着游戏即将结束
        return score_heur_board(board);
    }

    return best;
}

// 评估顶层移动的分数
// 用于确定最佳移动方向，这是AI决策的入口点
static float _score_toplevel_move(eval_state &state, board_t board, int move) {
    //int maxrank = get_max_rank(board);
    board_t newboard = execute_move(move, board);

    if(board == newboard) // 如果移动无效
        return 0;

    // 为有效移动评分，加一个小数以避免浮点比较问题
    // 从当前状态开始进行完整的Expectimax搜索
    return score_tilechoose_node(state, newboard, 1.0f) + 1e-6;
}

// 对外API：评分顶层移动并打印统计信息
float score_toplevel_move(board_t board, int move) {
    float res;
    struct timeval start, finish;
    double elapsed;
    eval_state state;
    
    // 根据棋盘复杂度动态调整深度限制
    // 棋盘上不同数字越多，游戏状态越复杂，需要更深的搜索
    state.depth_limit = std::max(3, count_distinct_tiles(board) - 2);

    // 记录开始时间
    gettimeofday(&start, NULL);
    // 评估这个移动
    res = _score_toplevel_move(state, board, move);
    // 记录结束时间
    gettimeofday(&finish, NULL);

    // 计算耗时
    elapsed = (finish.tv_sec - start.tv_sec);
    elapsed += (finish.tv_usec - start.tv_usec) / 1000000.0;

    // 打印详细的统计信息
    printf("Move %d: result %f: eval'd %ld moves (%d cache hits, %d cache size) in %.2f seconds (maxdepth=%d)\n", move, res,
        state.moves_evaled, state.cachehits, (int)state.trans_table.size(), elapsed, state.maxdepth);

    return res;
}

/**
 * 找到最佳移动的主函数
 * ------------------
 * 这是整个AI决策过程的入口点，每次需要决策时执行一次。
 * 过程说明:
 * 1. AI并不通过实际玩几次游戏来学习，而是使用搜索算法评估每个移动
 * 2. 对四个可能的移动方向分别构建决策树，分析未来可能的游戏状态
 * 3. 每个移动方向的评分是对从当前移动开始的所有可能游戏序列的综合评估
 * 4. 不同于深度学习方法，这种基于搜索的方法不需要预先训练
 * 5. 整个决策过程是确定性的，给定相同的棋盘状态总是产生相同的移动
 * 
 * 时间复杂度分析:
 * - 一个搜索树中的节点数量约为: 4^d * 16 * 2，其中:
 *   - 4^d: d层深度内的移动选择
 *   - 16: 最多16个空位可放置新方块
 *   - 2: 可能的新方块值(2或4)
 * - 实际搜索通过剪枝和缓存大幅减少了计算量
 */
int find_best_move(board_t board) {
    int move;
    float best = 0;
    int bestmove = -1;

    // 打印当前棋盘和评分信息
    print_board(board);
    printf("Current scores: heur %.0f, actual %.0f\n", score_heur_board(board), score_board(board));

    // 评估四个方向的移动，选择得分最高的
    // 每个方向的评分是对从当前移动开始的所有可能游戏序列的综合评估
    for(move=0; move<4; move++) {
        float res = score_toplevel_move(board, move);

        if(res > best) {
            best = res;
            bestmove = move;
        }
    }

    return bestmove; // 返回最佳移动方向
}

// 询问用户输入移动方向
int ask_for_move(board_t board) {
    int move;
    char validstr[5];
    char *validpos = validstr;

    print_board(board);

    // 确定有效的移动方向
    for(move=0; move<4; move++) {
        if(execute_move(move, board) != board)
            *validpos++ = "UDLR"[move];
    }
    *validpos = 0;
    if(validpos == validstr)
        return -1; // 没有有效移动

    // 等待用户输入有效的移动方向
    while(1) {
        char movestr[64];
        const char *allmoves = "UDLR";

        printf("Move [%s]? ", validstr);

        if(!fgets(movestr, sizeof(movestr)-1, stdin))
            return -1;

        if(!strchr(validstr, toupper(movestr[0]))) {
            printf("Invalid move.\n");
            continue;
        }

        return strchr(allmoves, toupper(movestr[0])) - allmoves;
    }
}

/* 游戏逻辑 */
// 随机生成一个方块(90%概率为2，10%概率为4)
static board_t draw_tile() {
    return (unif_random(10) < 9) ? 1 : 2;
}

// 在随机空位置放置一个方块
static board_t insert_tile_rand(board_t board, board_t tile) {
    int index = unif_random(count_empty(board));
    board_t tmp = board;
    while (true) {
        while ((tmp & 0xf) != 0) { // 跳过非空位置
            tmp >>= 4;
            tile <<= 4;
        }
        if (index == 0) break;
        --index;
        tmp >>= 4;
        tile <<= 4;
    }
    return board | tile;
}

// 创建初始棋盘(随机放置两个方块)
static board_t initial_board() {
    board_t board = draw_tile() << (4 * unif_random(16));
    return insert_tile_rand(board, draw_tile());
}

// 主游戏循环
void play_game(get_move_func_t get_move) {
    board_t board = initial_board();
    int moveno = 0;
    int scorepenalty = 0; // 获得免费的4方块的"惩罚"

    while(1) {
        int move;
        board_t newboard;

        // 检查是否有合法移动
        for(move = 0; move < 4; move++) {
            if(execute_move(move, board) != board)
                break;
        }
        if(move == 4)
            break; // 无合法移动，游戏结束

        printf("\nMove #%d, current score=%.0f\n", ++moveno, score_board(board) - scorepenalty);

        // 获取移动方向(AI或用户输入)
        move = get_move(board);
        if(move < 0)
            break;

        // 执行移动
        newboard = execute_move(move, board);
        if(newboard == board) {
            printf("Illegal move!\n");
            moveno--;
            continue;
        }

        // 随机添加新方块
        board_t tile = draw_tile();
        if (tile == 2) scorepenalty += 4; // 如果生成的是4，增加惩罚
        board = insert_tile_rand(newboard, tile);
    }

    print_board(board);
    printf("\nGame over. Your score is %.0f. The highest rank you achieved was %d.\n", score_board(board) - scorepenalty, get_max_rank(board));
}

// 主函数
int main() {
    init_tables(); // 初始化各种查找表
    play_game(find_best_move); // 使用AI玩游戏
}


