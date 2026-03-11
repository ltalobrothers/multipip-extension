# 图标文件夹

请在此文件夹中添加以下尺寸的PNG图标文件：

- `icon16.png` - 16x16 像素
- `icon48.png` - 48x48 像素  
- `icon128.png` - 128x128 像素

## 如何创建图标

1. 使用图像编辑软件（如Photoshop、GIMP、Figma等）创建图标
2. 图标应该是正方形的
3. 建议使用透明背景
4. 可以使用在线工具如：
   - https://www.favicon-generator.org/
   - https://realfavicongenerator.net/

## 添加图标后

添加图标文件后，请修改 `manifest.json` 文件，在 `action` 和根级别添加 `icons` 配置：

```json
"action": {
  "default_popup": "popup.html",
  "default_icon": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
},
"icons": {
  "16": "icons/icon16.png",
  "48": "icons/icon48.png",
  "128": "icons/icon128.png"
}
```
