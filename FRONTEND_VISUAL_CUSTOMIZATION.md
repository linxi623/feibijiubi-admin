# 菲比啾比管理端视觉资源修改指南

本文记录管理端中图片、颜色、空状态、提醒文字和页面局部样式的实际修改位置。

## 1. 全局色彩风格

主要入口：`src/assets/css/global.css`

优先修改：

- `--Pi0` 至 `--Pi10`：粉色品牌色阶。
- `--Lb0` 至 `--Lb10`：蓝色辅助色阶。
- `--Ga0` 至 `--Ga12`：灰阶、背景、文字和边框。
- `--v_brand_pink`、`--v_brand_blue`：主要品牌色。
- `--v_bg1`、`--v_bg2`、`--v_bg3`：页面背景。
- `--v_text1` 至 `--v_text4`：文字层级。
- `--v_line_light`、`--v_line_regular`、`--v_line_bold`：边框和分隔线。

Element Plus 主色映射位于 `src/assets/css/element.css`：

```css
:root {
    --el-color-primary: var(--Pi5);
}
```

分页按钮的颜色也在该文件中。若要统一换色，应先修改 `global.css` 的色阶，再检查 `element.css`。

其他入口：

- `src/assets/css/base.css`：全局字体、背景和 CSS 导入顺序。
- 各 `.vue` 文件底部 `<style>`：页面局部背景、菜单和表格颜色。

## 2. 品牌和页面图片

| 显示场景 | 图片文件 | 使用位置 |
| --- | --- | --- |
| 管理端粉色 Logo | `src/assets/img/feibijiubi-pink.png` | `src/views/IndexVue.vue` |
| 登录页背景 | `src/assets/img/login-bg.jpg` | `src/views/LoginVue.vue` |
| 全局加载动画 | `src/assets/img/loading.gif` | `src/App.vue` |
| 视频列表空状态 | `src/assets/img/silly.png` | `src/views/review/VideoReview.vue` |
| 404 页面 | `src/assets/img/404.png` | `src/views/NotFound.vue` |
| 浏览器图标 | `public/favicon.ico` | 浏览器标签页 |

直接覆盖同名文件时不需要修改代码。使用新文件名时，要同步修改右侧对应 `.vue` 文件。

登录背景通过 `LoginVue.vue` 中的：

```js
image: "url(" + require('@/assets/img/login-bg.jpg') + ")"
```

进行绑定。背景位置、遮罩、粒子效果和登录框尺寸也都在该文件的模板与 `<style>` 中。

## 3. 空状态和提醒图片

视频审核列表没有数据时显示：

- 图片：`src/assets/img/silly.png`
- 文字：`src/views/review/VideoReview.vue` 中的 `没有找到任何数据`

404 页面：

- 图片：`src/assets/img/404.png`
- 页面结构和文字：`src/views/NotFound.vue`

全局加载蒙版：

- 图片：`src/assets/img/loading.gif`
- 蒙版结构、透明度和尺寸：`src/App.vue`

## 4. 提醒文字和操作反馈

管理端消息主要使用 `ElMessage`。查找全部提示：

```powershell
rg -n "ElMessage\." src -g "*.vue" -g "*.js"
```

重点位置：

- 登录校验、管理员权限、登录成功：`src/views/LoginVue.vue`
- 全局请求失败和登录过期：`src/network/request.js`
- 用户信息和权限校验：`src/store/index.js`
- 审核成功、驳回和请求失败：`src/views/review/detail/VideoDetail.vue`
- 左侧菜单未开放功能提示：`src/views/IndexVue.vue`

当前常见文字包括：

- `该功能暂未开放`
- `没有找到任何数据`
- `您不是管理员，无权访问`
- `菲比啾比服务暂时不可用`
- `已通过审核`
- `已驳回`

## 5. 导航、菜单和工作区颜色

管理端主体布局集中在 `src/views/IndexVue.vue`，包括：

- 顶部栏背景和 Logo。
- 左侧菜单背景、文字和选中状态。
- 子菜单悬停颜色。
- 主工作区背景。
- 菜单折叠按钮。

登录页的输入框、按钮、背景遮罩和粒子颜色集中在 `src/views/LoginVue.vue`。

视频审核页面样式：

- 列表：`src/views/review/VideoReview.vue`
- 审核详情：`src/views/review/detail/VideoDetail.vue`

## 6. 表格、分页和 Element Plus 风格

公共 Element Plus 覆盖位于 `src/assets/css/element.css`，当前包含：

- 对话框尺寸和关闭按钮。
- 消息盒子间距。
- 分页按钮背景、边框、悬停和选中颜色。

页面单独的表格、标签页、菜单或按钮样式通常写在对应 `.vue` 文件底部。修改前建议先搜索 Element Plus 类名：

```powershell
rg -n "el-table|el-menu|el-tabs|el-pagination|el-button|el-dialog" src -g "*.vue"
```

## 7. 字体

当前字体文件：

`src/assets/font/HarmonyOS_Sans_SC_Medium.ttf`

声明位置：`src/assets/font/font.css`

全局使用位置：`src/assets/css/base.css`

替换字体可能引起文字宽度、换行和表格高度变化。若只想更换颜色或图片，建议不要同时修改字体。

## 8. 修改后验证

```powershell
npm.cmd run lint
npm.cmd run build
```

建议重点检查登录页、首页导航、左侧菜单、视频审核列表、审核详情、空数据状态、加载蒙版和 404 页面。
