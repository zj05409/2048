// Wait till the browser is ready to render the game (avoids glitches)
window.requestAnimationFrame(function () {
  // 将游戏管理器实例保存到全局变量，这样HTMLActuator和其他组件可以访问
  window.gameManager = new GameManager(4, KeyboardInputManager, HTMLActuator, LocalStorageManager);
});
