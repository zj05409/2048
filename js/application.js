// Wait till the browser is ready to render the game (avoids glitches)
window.requestAnimationFrame(function () {
  // 将游戏管理器实例保存到全局变量，这样HTMLActuator和其他组件可以访问
  window.gameManager = new GameManager(4, KeyboardInputManager, HTMLActuator, LocalStorageManager);

  // 如果是移动设备，添加CSS类
  if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
    document.body.classList.add('mobile-device');

    // 阻止默认的iOS双指缩放
    document.addEventListener('touchmove', function (e) {
      if (e.touches.length > 1) {
        e.preventDefault();
      }
    }, { passive: false });
  }
});
