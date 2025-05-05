// 国际化功能
(function () {
    // 各语言的翻译文本
    var translations = {
        "en": {
            "join": "Join the numbers and get to the ",
            "tile": " tile!",
            "new_game": "New Game",
            "undo": "Undo",
            "save": "Save",
            "load": "Load",
            "ai_play": "AI Auto",
            "ai_step": "AI Step",
            "keep_going": "Continue",
            "try_again": "Retry",
            "how_to_play": "How to play:",
            "use_arrow": "Use your ",
            "arrow_keys": "arrow keys",
            "to_move": " to move the tiles. When two tiles with the same number touch, they ",
            "merge": "merge into one!",
            "note": "Note:",
            "official": "This site is the official version of 2048. You can play it on your phone via ",
            "phone": " All other apps or sites are derivatives or fakes, and should be used with caution.",
            "created_by": "Created by ",
            "based_on": "Based on ",
            "and": " and conceptually similar to "
        },
        "zh": {
            "join": "将数字合并以得到",
            "tile": "方块!",
            "new_game": "新游戏",
            "undo": "撤销",
            "save": "存档",
            "load": "读档",
            "ai_play": "AI自动",
            "ai_step": "AI单步",
            "keep_going": "继续",
            "try_again": "重试",
            "how_to_play": "玩法说明:",
            "use_arrow": "使用",
            "arrow_keys": "方向键",
            "to_move": "移动方块。当两个相同数字的方块相撞时，它们将",
            "merge": "合并成一个!",
            "note": "备注:",
            "official": "这是2048的官方版本。您可以通过",
            "phone": "在手机上玩。所有其他应用或网站都是衍生品或假冒品，使用时请谨慎。",
            "created_by": "创建者",
            "based_on": "基于",
            "and": "以及在概念上类似于"
        }
    };

    // 当前语言
    var currentLang = "zh"; // 默认中文

    // 尝试从本地存储获取语言设置
    if (window.localStorage) {
        var storedLang = localStorage.getItem("2048_language");
        if (storedLang) {
            currentLang = storedLang;
        }
    }

    // 更新所有文本元素
    function updateLanguage(lang) {
        if (!translations[lang]) {
            console.error("未知语言: " + lang);
            return;
        }

        currentLang = lang;

        // 保存语言偏好到本地存储
        if (window.localStorage) {
            localStorage.setItem("2048_language", lang);
        }

        // 更新语言按钮状态
        var langButtons = document.querySelectorAll(".lang-button");
        for (var i = 0; i < langButtons.length; i++) {
            if (langButtons[i].getAttribute("data-lang") === lang) {
                langButtons[i].classList.add("active");
            } else {
                langButtons[i].classList.remove("active");
            }
        }

        // 更新所有带data-i18n属性的元素
        var elements = document.querySelectorAll("[data-i18n]");
        for (var i = 0; i < elements.length; i++) {
            var key = elements[i].getAttribute("data-i18n");
            if (translations[lang][key]) {
                elements[i].textContent = translations[lang][key];
            }
        }

        // 更新AI自动玩按钮文本（运行中的特殊处理）
        var aiButton = document.querySelector(".ai-play-button span");
        if (aiButton && (aiButton.textContent === "停止AI" || aiButton.textContent === "停止")) {
            aiButton.textContent = lang === "zh" ? "停止" : "Stop";
        }
    }

    // 语言切换处理
    function setupLanguageSwitch() {
        var langButtons = document.querySelectorAll(".lang-button");
        for (var i = 0; i < langButtons.length; i++) {
            langButtons[i].addEventListener("click", function (e) {
                var lang = this.getAttribute("data-lang");
                updateLanguage(lang);
            });
        }
    }

    // 游戏管理器的语言特定方法
    function setupGameManagerLang() {
        if (window.GameManager) {
            var originalAiPlay = GameManager.prototype.aiPlay;

            // 重写AI播放方法，使按钮文本国际化
            GameManager.prototype.aiPlay = function () {
                if (this.isGameTerminated()) return;

                // 切换AI运行状态
                this.aiIsRunning = !this.aiIsRunning;

                // 更新按钮文本
                var button = document.querySelector(".ai-play-button span");
                if (this.aiIsRunning) {
                    button.textContent = currentLang === "zh" ? "停止" : "Stop";
                    this.aiPlayNextStep();
                } else {
                    button.textContent = translations[currentLang]["ai_play"];
                    if (this.aiTimerId) {
                        clearTimeout(this.aiTimerId);
                        this.aiTimerId = null;
                    }
                }
            };
        }
    }

    // 初始化
    function init() {
        // 设置语言切换器
        setupLanguageSwitch();

        // 设置游戏管理器语言扩展
        document.addEventListener('DOMContentLoaded', setupGameManagerLang);

        // 初始化语言
        updateLanguage(currentLang);
    }

    // 将函数暴露到全局作用域
    window.I18n = {
        updateLanguage: updateLanguage,
        getCurrentLanguage: function () { return currentLang; }
    };

    // 自动初始化
    init();
})(); 