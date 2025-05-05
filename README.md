# 2048
A small clone of [1024](https://play.google.com/store/apps/details?id=com.veewo.a1024), based on [Saming's 2048](http://saming.fr/p/2048/) (also a clone). 2048 was indirectly inspired by [Threes](https://asherv.com/threes/).

Made just for fun. [Play it here!](http://gabrielecirulli.github.io/2048/)

The official app can also be found on the [Play Store](https://play.google.com/store/apps/details?id=com.gabrielecirulli.app2048) and [App Store!](https://itunes.apple.com/us/app/2048-by-gabriele-cirulli/id868076805)

### Contributions

[Anna Harren](https://github.com/iirelu/) and [sigod](https://github.com/sigod) are maintainers for this repository.

Other notable contributors:

 - [TimPetricola](https://github.com/TimPetricola) added best score storage
 - [chrisprice](https://github.com/chrisprice) added custom code for swipe handling on mobile
 - [marcingajda](https://github.com/marcingajda) made swipes work on Windows Phone
 - [mgarciaisaia](https://github.com/mgarciaisaia) added support for Android 2.3

Many thanks to [rayhaanj](https://github.com/rayhaanj), [Mechazawa](https://github.com/Mechazawa), [grant](https://github.com/grant), [remram44](https://github.com/remram44) and [ghoullier](https://github.com/ghoullier) for the many other good contributions.

### Screenshot

<p align="center">
  <img src="https://cloud.githubusercontent.com/assets/1175750/8614312/280e5dc2-26f1-11e5-9f1f-5891c3ca8b26.png" alt="Screenshot"/>
</p>

That screenshot is fake, by the way. I never reached 2048 :smile:

## Contributing
Changes and improvements are more than welcome! Feel free to fork and open a pull request. Please make your changes in a specific branch and request to pull into `master`! If you can, please make sure the game fully works before sending the PR, as that will help speed up the process.

You can find the same information in the [contributing guide.](https://github.com/gabrielecirulli/2048/blob/master/CONTRIBUTING.md)

## License
2048 is licensed under the [MIT license.](https://github.com/gabrielecirulli/2048/blob/master/LICENSE.txt)

## Donations
I made this in my spare time, and it's hosted on GitHub (which means I don't have any hosting costs), but if you enjoyed the game and feel like buying me coffee, you can donate at my BTC address: `1Ec6onfsQmoP9kkL3zkpB6c5sA4PVcXU2i`. Thank you very much!

---

# 2048增强版 - AI智能助手版本

## 项目介绍

这是基于原版2048游戏的增强版，由[zj05409](https://github.com/zj05409)开发，添加了多项功能改进，包括AI自动玩、多语言支持、游戏存档等功能，让您的2048游戏体验更加丰富。

## 新增功能

### 1. AI智能辅助

- **AI自动模式**：让AI完全接管游戏，智能判断并自动执行最佳移动
- **AI单步模式**：每次只执行一步AI计算的最佳移动，适合学习策略
- **期望最大值算法**：采用高效的Expectimax算法，能够有效计算不确定性游戏中的最优解
- **智能评估函数**：综合考虑空格数量、单调性、平滑度等多个因素，评估每个可能的移动

### 2. 多语言支持

- 支持中文和英文两种语言
- 可通过界面轻松切换语言
- 所有游戏元素、提示和按钮文本都会随语言切换而改变

### 3. 游戏存档功能

- **保存游戏**：可以随时保存当前游戏状态
- **自定义存档名**：支持为存档添加自定义名称
- **读取存档**：轻松加载之前的游戏进度
- **存档管理**：浏览、加载和删除已有存档

### 4. 游戏记录与撤销

- **撤销功能**：支持撤销上一步操作，最多可撤销10步
- **历史记录**：自动保存游戏历史状态
- **无限挑战**：即使达到2048也可以继续游戏，挑战更高分数

## 技术实现

### AI实现原理

游戏AI基于期望最大化算法(Expectimax)，针对2048游戏特点进行了多项优化：

- **深度优先搜索**：预测多步后的游戏状态并评估最优移动方向
- **评估函数**：综合考虑多个因素，包括：
  - 空格数量（越多越好）
  - 值的单调性（保持数字有序排列）
  - 可合并方块数（越多越好）
  - 大数值方块的位置（偏向角落）
- **高效缓存**：使用哈希表缓存已计算的游戏状态，避免重复计算
- **概率剪枝**：忽略低概率出现的情况，提高搜索效率

### 用户界面

- **响应式设计**：适应不同屏幕尺寸，包括移动设备
- **直观操作**：支持键盘、触摸滑动和按钮操作
- **状态反馈**：清晰显示当前得分、最高分及游戏状态

## 如何使用

1. 访问游戏网页或下载本项目
2. 使用方向键或触摸滑动控制方块移动
3. 使用"AI自动"按钮让AI接管整个游戏
4. 使用"AI单步"按钮让AI执行一步最佳移动
5. 随时可以通过"存档"和"读档"按钮保存和加载游戏

## 开发者信息

- 开发者：[zj05409](https://github.com/zj05409)
- 基于：[Gabriele Cirulli的2048游戏](https://github.com/gabrielecirulli/2048)
- 许可证：MIT License

## 贡献与反馈

欢迎提交Issue或Pull Request来改进这个项目！如有任何建议或发现任何问题，请随时联系。

---

_Enjoy the game and let the AI guide you to 2048 and beyond!_
