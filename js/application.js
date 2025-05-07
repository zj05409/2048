// Wait till the browser is ready to render the game (avoids glitches)
window.requestAnimationFrame(function () {
  // 将游戏管理器实例保存到全局变量，这样HTMLActuator和其他组件可以访问
  window.gameManager = new GameManager(4, KeyboardInputManager, HTMLActuator, LocalStorageManager);

  // 如果是移动设备，添加CSS类并设置触摸事件处理
  if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
    document.body.classList.add('mobile-device');

    // 阻止默认的iOS双指缩放
    document.addEventListener('touchmove', function (e) {
      if (e.touches.length > 1) {
        e.preventDefault();
      }
    }, { passive: false });

    // 阻止游戏容器内的触摸事件导致页面滚动
    var gameContainer = document.querySelector('.game-container');
    var gameLayoutContainer = document.querySelector('.game-layout-container');

    // 在游戏容器上阻止触摸事件传播到文档
    gameContainer.addEventListener('touchstart', function (e) {
      e.preventDefault();
    }, { passive: false });

    gameContainer.addEventListener('touchmove', function (e) {
      e.preventDefault();
    }, { passive: false });

    gameContainer.addEventListener('touchend', function (e) {
      e.preventDefault();
    }, { passive: false });

    // 为iOS设备设置固定的body
    if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
      document.body.style.height = '100%';
      document.body.style.overflow = 'hidden';
    }
  }
});
